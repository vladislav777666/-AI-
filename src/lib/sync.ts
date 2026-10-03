// Офлайн-очередь (ТЗ §36–40): каждое действие Исполнителя кладётся в локальную
// очередь и отправляется при появлении сети. Сервер — источник истины.

import { useCallback, useEffect, useState } from 'react'
import type { OrderStatus, WorkOrder } from './types'

const QUEUE_KEY = 'master-sync-queue-v1'

export interface SyncOp {
  operationId: string
  entityId: string
  operationType: 'status' | 'complete'
  payload: {
    status?: OrderStatus
    reason?: string
    patch?: Partial<WorkOrder>
    action?: string
  }
  localTs: number
  serverTs: number | null
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'
  error?: string
}

export type OpRunner = (op: SyncOp) => Promise<void>

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
 *  операция снимается с очереди. Ошибки сети остаются PENDING до восстановления. */
const VALIDATION_RE = /Недопустим|активная задача|INVALID_TRANSITION/i

export async function flushQueue(runner: OpRunner): Promise<{ synced: number; errors: string[] }> {
  const ops = load().filter((o) => o.status !== 'SYNCED')
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
      op.status = 'PENDING'
    }
    save(load().map((o) => (o.operationId === op.operationId ? op : o)))
  }
  // Убираем успешно отправленные.
  save(load().filter((o) => o.status !== 'SYNCED'))
  return { synced, errors }
}

// ---------- React-хук состояния сети и очереди ----------

export interface SyncState {
  online: boolean
  pending: number
  lastError: string | null
  syncing: boolean
}

export function useSync(runner: OpRunner): SyncState & { submit: (op: Parameters<typeof enqueue>[0]) => Promise<void> } {
  const [state, setState] = useState<SyncState>(() => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: pendingCount(),
    lastError: null,
    syncing: false,
  }))

  const pull = useCallback(() => {
    setState((s) => ({ ...s, online: navigator.onLine, pending: pendingCount() }))
  }, [])

  const runFlush = useCallback(async () => {
    if (!navigator.onLine) return
    setState((s) => ({ ...s, syncing: true }))
    const { errors } = await flushQueue(runner)
    setState((s) => ({
      ...s,
      syncing: false,
      pending: pendingCount(),
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
    if (!navigator.onLine) return // офлайн: остаётся PENDING до появления сети
    setState((s) => ({ ...s, syncing: true }))
    const { errors } = await flushQueue(runner)
    setState((s) => ({
      ...s,
      syncing: false,
      pending: pendingCount(),
      lastError: errors.length ? errors[0] : null,
    }))
    if (errors.length > 0) throw new Error(errors[0])
  }, [pull, runner])

  return { ...state, submit }
}
