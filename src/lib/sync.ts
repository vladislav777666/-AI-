// Офлайн-очередь (ТЗ §36–40): каждое действие роли (Мастер, Исполнитель,
// веб-админ) кладётся в локальную очередь и отправляется в Supabase при
// появлении сети. Сервер — источник истины.
//
// Два типа операций:
//  - 'status' | 'complete' — классические операции Исполнителя (payload);
//  - 'db' — универсальная операция БД: функция db.ts + аргументы,
//    воспроизводится через db.runQueuedOp.

import { useCallback, useEffect, useState } from 'react'
import type { OrderStatus, WorkOrder } from './types'

const QUEUE_KEY = 'master-sync-queue-v1'

/** Имена мутирующих функций db.ts, воспроизводимых из очереди. */
export type DbFnName =
  | 'createOrder'
  | 'updateOrder'
  | 'setOrderStatus'
  | 'saveAcceptance'
  | 'createArea'
  | 'updateArea'
  | 'createEquipment'
  | 'updateEquipment'
  | 'createWorker'
  | 'updateWorker'
  | 'updateWorkerStatus'
  | 'saveMaterial'
  | 'deleteMaterial'
  | 'createFaultCode'
  | 'updateFaultCode'
  | 'createNotification'
  | 'markNotificationsRead'

export interface SyncOp {
  operationId: string
  entityId: string
  operationType: 'status' | 'complete' | 'db'
  payload: {
    status?: OrderStatus
    reason?: string
    patch?: Partial<WorkOrder>
    action?: string
    actor?: string
    db?: { fn: DbFnName; args: unknown[] }
  }
  localTs: number
  serverTs: number | null
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'
  error?: string
}

export type OpRunner = (op: SyncOp) => Promise<void>

/** Сетевая ошибка (очередь продолжает ждать) vs ошибка сервера (нужно вмешательство). */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return /Failed to fetch|NetworkError|network request failed|Load failed|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION|ECONN|EAI_AGAIN|fetch failed|AbortError|aborted|timed?\s*out|socket hang up/i.test(msg)
}

function load(): SyncOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as SyncOp[]
  } catch {
    return []
  }
}

function save(ops: SyncOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(ops))
  } catch {
    // переполнение — работаем в памяти
  }
}

export function enqueue(op: Omit<SyncOp, 'operationId' | 'localTs' | 'serverTs' | 'status'>): SyncOp {
  const full: SyncOp = {
    ...op,
    operationId: crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}-${Math.random()}`,
    localTs: Date.now(),
    serverTs: null,
    status: 'PENDING',
  }
  const ops = load()
  ops.push(full)
  save(ops)
  return full
}

export function getQueue(): SyncOp[] {
  return load()
}

export function pendingCount(): number {
  return load().filter((o) => o.status === 'PENDING' || o.status === 'SYNCING').length
}

/** Ошибки валидации (недопустимый переход, конфликт активной задачи) не ретраятся:
 *  операция снимается с очереди. Ошибки сети остаются PENDING до восстановления.
 *  Прочие ошибки сервера — FAILED: не ретраятся, требуют внимания. */
const VALIDATION_RE = /Недопустим|активная задача|INVALID_TRANSITION/i

let inFlight: Promise<{ synced: number; errors: string[] }> | null = null

/** Отправка очереди. Параллельные вызовы делят один прогон (нет двойного применения). */
export function flushQueue(runner: OpRunner): Promise<{ synced: number; errors: string[] }> {
  if (inFlight) return inFlight
  inFlight = doFlush(runner).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doFlush(runner: OpRunner): Promise<{ synced: number; errors: string[] }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, errors: [] }
  }
  const ops = load().filter((o) => o.status === 'PENDING' || o.status === 'SYNCING')
  let synced = 0
  const errors: string[] = []
  for (const op of ops) {
    op.status = 'SYNCING'
    save(load().map((o) => (o.operationId === op.operationId ? op : o)))
    try {
      await runner(op)
      op.status = 'SYNCED'
      op.serverTs = Date.now()
      op.error = undefined
      synced += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      op.error = msg
      errors.push(msg)
      if (VALIDATION_RE.test(msg)) {
        save(load().filter((o) => o.operationId !== op.operationId))
        continue
      }
      op.status = isNetworkError(err) ? 'PENDING' : 'FAILED'
    }
    save(load().map((o) => (o.operationId === op.operationId ? op : o)))
  }
  // Убираем успешно отправленные.
  save(load().filter((o) => o.status !== 'SYNCED'))
  if (synced > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('db-synced', { detail: { synced } }))
  }
  return { synced, errors }
}

// ---------- React-хук состояния сети и очереди ----------

export interface SyncState {
  online: boolean
  pending: number
  failed: number
  lastError: string | null
  syncing: boolean
}

export function useSync(runner: OpRunner): SyncState & { submit: (op: Parameters<typeof enqueue>[0]) => Promise<void> } {
  const [state, setState] = useState<SyncState>(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    pending: pendingCount(),
    failed: 0,
    lastError: null,
    syncing: false,
  }))

  const pull = useCallback(() => {
    setState((s) => ({
      ...s,
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      pending: pendingCount(),
      failed: load().filter((o) => o.status === 'FAILED').length,
    }))
  }, [])

  const runFlush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    setState((s) => ({ ...s, syncing: true }))
    const { errors } = await flushQueue(runner)
    setState((s) => ({
      ...s,
      syncing: false,
      pending: pendingCount(),
      failed: load().filter((o) => o.status === 'FAILED').length,
      lastError: errors.length ? errors[0] : null,
    }))
  }, [runner])

  useEffect(() => {
    const on = () => { pull(); void runFlush() }
    const off = () => pull()
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const timer = window.setInterval(() => void runFlush(), 15000)
    pull()
    void runFlush()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.clearInterval(timer)
    }
  }, [pull, runFlush])

  const submit = useCallback(async (op: Parameters<typeof enqueue>[0]) => {
    enqueue(op)
    pull()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return // офлайн: остаётся PENDING до появления сети
    setState((s) => ({ ...s, syncing: true }))
    const { errors } = await flushQueue(runner)
    setState((s) => ({
      ...s,
      syncing: false,
      pending: pendingCount(),
      failed: load().filter((o) => o.status === 'FAILED').length,
      lastError: errors.length ? errors[0] : null,
    }))
    if (errors.length > 0) throw new Error(errors[0])
  }, [pull, runner])

  return { ...state, submit }
}
