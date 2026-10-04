// Кабинет Исполнителя (ТЗ §3, Frame 17): оболочка, навигация, главный экран,
// офлайн-индикатор, системные уведомления (просрочка/срок).

import { useCallback, useEffect, useState } from 'react'
import { signOut } from '../../lib/auth'
import * as db from '../../lib/db'
import { useSync, type SyncOp } from '../../lib/sync'
import {
  isOverdue, ORDER_STATUS_LABELS,
  type Notification, type Profile, type WorkOrder, type Worker,
} from '../../lib/types'
import { formatDuration, isTerminal, PRIORITY_SHORT } from '../../lib/status'
import { BottomNav, Btn, Card, Screen, StatusDot, type NavItem } from '../../components/ui'
import Registry from './Registry'
import OrderDetail from './Detail'
import CloseForm from './CloseForm'
import ClosedOrders from './Closed'
import Notifs from './Notifs'
import type { WorkerCtx, WorkerView } from './shared'

export default function WorkerApp({ profile }: { profile: Profile }) {
  const [view, setView] = useState<WorkerView>({ view: 'home' })
  const [me, setMe] = useState<Worker | null>(null)
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [areas, setAreas] = useState<WorkerCtx['areas']>([])
  const [equipment, setEquipment] = useState<WorkerCtx['equipment']>([])
  const [faultCodes, setFaultCodes] = useState<WorkerCtx['faultCodes']>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(Date.now())

  // Тик для таймеров активной задачи (ТЗ §57).
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 20000)
    return () => window.clearInterval(t)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [w, a, e, o, f] = await Promise.all([
        db.listWorkers(), db.listAreas(), db.listEquipment(), db.listOrders(), db.listFaultCodes(),
      ])
      const worker = w.find((x) => x.userId === profile.id) ?? null
      setMe(worker)
      // RLS уже фильтрует на сервере; в демо — фильтруем сами.
      setOrders(worker ? o.filter((x) => x.workerId === worker.id) : [])
      setAreas(a)
      setEquipment(e)
      setFaultCodes(f)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить наряды. Повторить.')
    } finally {
      setLoading(false)
    }
  }, [profile.id])

  const refreshNotifs = useCallback(async () => {
    try {
      setNotifications(await db.listNotifications(profile.id))
    } catch {
      // уведомления не должны блокировать работу
    }
  }, [profile.id])

  // Восстановление из офлайн-очереди — единый диспетчер db.runQueuedOp
  // (обрабатывает и классические 'status'/'complete', и 'db'-операции).
  const runner = useCallback(
    async (op: SyncOp) => {
      await db.runQueuedOp(op, profile.fullName || 'Исполнитель')
    },
    [profile.fullName],
  )

  const { online, pending, failed, lastError, syncing, submit } = useSync(runner)

  const act = useCallback<WorkerCtx['act']>(async (plan) => {
    if (plan.patch) {
      await submit({ operationType: 'complete', entityId: plan.orderId, payload: { patch: plan.patch, action: plan.action } })
    }
    if (plan.status) {
      await submit({ operationType: 'status', entityId: plan.orderId, payload: { status: plan.status, reason: plan.reason } })
    }
    await refresh()
    // Без гейта по сети: createNotification сам уходит в офлайн-очередь.
    if (plan.notify) {
      await db.notifyOrderEvent(plan.orderId, plan.notify.type, plan.notify.title, plan.notify.message).catch(() => {})
    }
  }, [submit, refresh])

  // Системные уведомления: просрочка и приближение срока (ТЗ §32.3, §33).
  const ensureSystemNotifs = useCallback(async () => {
    const now = Date.now()
    const seen = new Set(notifications.map((n) => `${n.type}:${n.workOrderId}`))
    for (const o of orders) {
      if (isTerminal(o.status) || o.status === 'cancelled') continue
      const dl = new Date(o.deadline).getTime()
      const key = dl < now ? `OVERDUE:${o.id}` : `DEADLINE_APPROACH:${o.id}`
      if (seen.has(key)) continue
      if (dl < now) {
        await db.createNotification({
          userId: profile.id, workOrderId: o.id, type: 'OVERDUE',
          title: `Наряд ${o.number} просрочен`,
          message: `Статус: ${ORDER_STATUS_LABELS[o.status]}. Приоритет: ${PRIORITY_SHORT[o.priority]}. Просрочен на ${formatDuration(now - dl)}.`,
        }).catch(() => {})
      } else if (dl - now < 2 * 3600 * 1000 && ['issued', 'accepted', 'queued', 'in_work', 'rework'].includes(o.status)) {
        await db.createNotification({
          userId: profile.id, workOrderId: o.id, type: 'DEADLINE_APPROACH',
          title: `Срок по наряду ${o.number} скоро`,
          message: `До окончания нормативного срока осталось ${formatDuration(dl - now)}.`,
        }).catch(() => {})
      }
    }
    await refreshNotifs()
  }, [orders, notifications, profile.id, refreshNotifs])

  useEffect(() => {
    void refresh().then(() => refreshNotifs())
  }, [refresh, refreshNotifs])

  // После фоновой синхронизации с БД — перечитываем данные (ТЗ «везде и всегда»).
  useEffect(() => {
    const onSynced = () => { void refresh(); void refreshNotifs() }
    window.addEventListener('db-synced', onSynced)
    return () => window.removeEventListener('db-synced', onSynced)
  }, [refresh, refreshNotifs])

  useEffect(() => {
    if (!loading && orders.length >= 0) void ensureSystemNotifs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, orders.length])

  const markRead = useCallback(async () => {
    await db.markNotificationsRead(profile.id).catch(() => {})
    await refreshNotifs()
  }, [profile.id, refreshNotifs])

  const unread = notifications.filter((n) => !n.isRead).length

  async function logout() {
    await signOut()
    location.reload()
  }

  const ctx: WorkerCtx = {
    profile, me, orders, areas, equipment, faultCodes, notifications, unread, loading,
    sync: { online, pending, syncing, lastError },
    go: setView, refresh, refreshNotifs, markRead, act,
  }

  const navItems: NavItem[] = [
    { key: 'home', label: 'Главная', icon: '🏠' },
    { key: 'registry', label: 'Наряды', icon: '📋' },
    { key: 'closed', label: 'Закрытые', icon: '✅' },
    { key: 'notifs', label: 'Уведомл.', icon: '🔔' },
  ]
  const activeNav =
    view.view === 'detail' || view.view === 'close' ? 'registry'
    : view.view === 'closedDetail' ? 'closed'
    : view.view

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header
        className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 sm:px-6"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Исполнитель · {profile.fullName || 'Исполнитель'}</p>
            <p className="text-xs" aria-live="polite">
              {syncing ? (
                <span className="text-blue-600">↻ Синхронизация...</span>
              ) : !online ? (
                <span className="text-neutral-500">○ Нет сети · изменения будут отправлены автоматически</span>
              ) : pending > 0 ? (
                <span className="text-orange-600">Ожидает синхронизации: {pending} действий</span>
              ) : failed > 0 ? (
                <span className="text-red-600">! Не синхронизировано: {failed} действий</span>
              ) : lastError ? (
                <span className="text-red-600">! Не удалось синхронизировать: {lastError}</span>
              ) : (
                <span className="text-green-600">● Онлайн</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Btn variant="ghost" onClick={() => void logout()}>Выйти</Btn>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error} <button type="button" className="underline" onClick={() => void refresh()}>Повторить</button>
          </p>
        )}
        {loading && <p className="text-sm text-neutral-500">Загрузка…</p>}
        {!loading && view.view === 'home' && <Home ctx={ctx} tick={tick} />}
        {!loading && view.view === 'registry' && <Registry ctx={ctx} />}
        {!loading && view.view === 'detail' && <OrderDetail ctx={ctx} orderId={view.id} />}
        {!loading && view.view === 'close' && <CloseForm ctx={ctx} orderId={view.id} />}
        {!loading && view.view === 'closed' && <ClosedOrders ctx={ctx} />}
        {!loading && view.view === 'closedDetail' && <ClosedOrders ctx={ctx} detailId={view.id} />}
        {!loading && view.view === 'notifs' && <Notifs ctx={ctx} />}
      </main>

      <BottomNav items={navItems} activeKey={activeNav} onSelect={(k) => setView({ view: k } as WorkerView)} />
    </div>
  )
}

// ---------- Frame 17: главный экран ----------

function Home({ ctx, tick }: { ctx: WorkerCtx; tick: number }) {
  const { orders, go, equipment, areas, notifications, unread } = ctx
  const [scores, setScores] = useState<number[]>([])
  const closedAll = orders.filter((o) => o.status === 'closed')
  useEffect(() => {
    let alive = true
    void Promise.all(closedAll.slice(0, 20).map((o) => db.getAcceptance(o.id).catch(() => null))).then((accs) => {
      if (!alive) return
      setScores(accs.filter((a) => a != null).map((a) => a!.aiScore))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedAll.length])

  const active = orders.filter((o) => !['closed', 'cancelled', 'rejected'].includes(o.status))
  const assigned = orders.filter((o) => o.status === 'issued').length
  const queued = orders.filter((o) => o.status === 'queued').length
  const overdue = orders.filter((o) => isOverdue(o)).length
  const inProgress = orders.filter((o) => o.status === 'in_work')
  const closed = orders.filter((o) => o.status === 'closed').sort((a, b) =>
    (a.closedAt ?? '') < (b.closedAt ?? '') ? 1 : -1)

  const eqName = (id: string) => equipment.find((e) => e.id === id)?.name ?? '—'
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '—'
  void areaName

  return (
    <Screen title={`Здравствуйте!`} subtitle={`${ctx.profile.fullName || 'Исполнитель'} · смена активна`}>
      {/* Статистика (ТЗ §3) */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Назначено" value={assigned} />
        <Stat label="В очереди" value={queued} />
        <Stat label="Просрочено" value={overdue} danger={overdue > 0} />
      </div>

      {/* Текущая задача (ТЗ §6, §57) */}
      <Card className="border-neutral-900">
        <h3 className="text-sm font-semibold text-neutral-500">Текущая задача</h3>
        {inProgress.length === 0 && (
          <p className="mt-2 text-sm text-neutral-500">Нет выполняемого наряда. Откройте «Наряды».</p>
        )}
        {inProgress.map((o) => (
          <div key={o.id} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusDot color="bg-yellow-500" />
            <span className="font-medium">Наряд №{o.number}</span>
            <span className="text-sm">{eqName(o.equipmentId)}</span>
            <span className="text-sm text-neutral-500">{PRIORITY_SHORT[o.priority]}</span>
            <span className="text-sm text-neutral-500">
              Срок: {new Date(o.deadline).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-sm">{ORDER_STATUS_LABELS[o.status]}</span>
            <span className="text-sm font-medium text-blue-700">
              {o.startedAt
                ? `В работе: ${formatDuration(tick - new Date(o.startedAt).getTime())}`
                : 'В работе'}
            </span>
            <Btn variant="ghost" className="ml-auto" onClick={() => go({ view: 'detail', id: o.id })}>
              Открыть
            </Btn>
          </div>
        ))}
        {orders.filter((o) => o.status === 'suspended').map((o) => (
          <div key={o.id} className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-orange-700">
            <StatusDot color="bg-orange-400" />
            <span>№{o.number} — Приостановлено{o.pauseReason ? `: ${o.pauseReason}` : ''}</span>
            <span className="text-neutral-500">
              {o.pausedAt ? `с ${new Date(o.pausedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
            <Btn variant="ghost" onClick={() => go({ view: 'detail', id: o.id })}>Открыть</Btn>
          </div>
        ))}
      </Card>

      {/* Три раздела (ТЗ §4) */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => go({ view: 'registry' })}
          className="border border-neutral-900 bg-white p-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
        >
          <p className="text-lg font-semibold">Наряды</p>
          <p className="text-sm opacity-70">{active.length} всего</p>
          <p className="text-sm opacity-70">
            {inProgress.length} выполняется · {overdue} просрочено
          </p>
        </button>

        <button
          type="button"
          onClick={() => go({ view: 'closed' })}
          className="border border-neutral-900 bg-white p-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
        >
          <p className="text-lg font-semibold">Закрытые наряды</p>
          <p className="text-sm opacity-70">{closed.length} закрыто</p>
          <p className="text-sm opacity-70">
            {scores.length > 0
              ? `Последняя оценка: ${scores[0]} · средняя: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}`
              : closed.length > 0
                ? 'Оценка: ожидается'
                : 'Закрытых нарядов пока нет.'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => go({ view: 'notifs' })}
          className="relative border border-neutral-900 bg-white p-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
        >
          <p className="text-lg font-semibold">Уведомления</p>
          <p className="text-sm opacity-70">{unread} непрочитанных из {notifications.length}</p>
          {unread > 0 && <span className="absolute right-4 top-4 h-3 w-3 rounded-full bg-red-600" aria-hidden />}
        </button>
      </div>
    </Screen>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`border p-3 text-center ${danger ? 'border-red-600 bg-red-50' : 'border-neutral-200 bg-white'}`}>
      <div className={`text-3xl font-semibold tabular-nums ${danger ? 'text-red-600' : ''}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{label}</div>
    </div>
  )
}
