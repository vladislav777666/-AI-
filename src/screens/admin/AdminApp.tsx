// Веб-панель администратора (ТЗ §2): отдельная роль, отдельный раздел.
// Не входит в модуль «Мастер» и не доступна из APK: раздел открывается
// только в веб-продакшене (!Capacitor.isNativePlatform()).
// Все действия сохраняются в БД (persist → офлайн-очередь), чтения —
// через кэш (readThrough), как в остальном приложении.

import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { isDemoMode, signOut } from '../../lib/auth'
import * as db from '../../lib/db'
import { ROLE_LABELS, type Area, type Equipment, type Profile, type WorkOrder, type Worker } from '../../lib/types'
import { BottomNav, Screen, type NavItem } from '../../components/ui'
import ReferenceBooks, {
  EquipmentOrders, FaultCodeDetail, RefBooksHub, WorkerOrders,
} from './ReferenceBooks'
import OrdersTable from './OrdersTable'
import OrderDetail from '../master/OrderDetail'
import type { AdminData, AdminNav, RefBookKey } from './nav'
import { useSync, type SyncOp } from '../../lib/sync'

export default function AdminApp({ profile }: { profile: Profile }) {
  const [nav, setNav] = useState<AdminNav>({ screen: 'dashboard' })
  const [, setStack] = useState<AdminNav[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [w, a, e, o] = await Promise.all([
        db.listWorkers(), db.listAreas(), db.listEquipment(), db.listOrders(),
      ])
      setWorkers(w)
      setAreas(a)
      setEquipment(e)
      setOrders(o)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const go = useCallback((next: AdminNav) => {
    setStack((prev) => [...prev, nav])
    setNav(next)
  }, [nav])

  const back = useCallback(() => {
    setStack((prev) => {
      const last = prev[prev.length - 1]
      setNav(last ?? { screen: 'dashboard' })
      return prev.slice(0, -1)
    })
  }, [])

  // Офлайн-очередь: каждое действие администратора сохраняется в БД сразу,
  // при отсутствии сети — уходит в очередь и применяется при её восстановлении.
  const runner = useCallback(
    async (op: SyncOp) => {
      await db.runQueuedOp(op, profile.fullName || 'Администратор')
    },
    [profile.fullName],
  )
  const { online, pending, failed, lastError, syncing } = useSync(runner)

  // После фоновой синхронизации с БД — перечитываем данные.
  useEffect(() => {
    const onSynced = () => { void refresh() }
    window.addEventListener('db-synced', onSynced)
    return () => window.removeEventListener('db-synced', onSynced)
  }, [refresh])

  const data: AdminData = { profile, workers, areas, equipment, orders, refresh, go, back }

  async function logout() {
    await signOut()
    location.reload()
  }

  const isWebPanel = !Capacitor.isNativePlatform()

  if (!isWebPanel) {
    return (
      <div className="min-h-svh bg-white text-neutral-900">
        <Screen
          title={ROLE_LABELS[profile.role]}
          subtitle="Раздел доступен только в веб-продакшене"
        >
          <p className="border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            В мобильном приложении (APK) веб-разделы (руководитель и администратор) скрыты.
            Откройте веб-версию в браузере.
          </p>
        </Screen>
      </div>
    )
  }

  // Переходы из нижней панели (мобильный веб): без накопления стека назад.
  const bottomNavItems: NavItem[] = [
    { key: 'dashboard', label: 'Главная', icon: '🏠' },
    { key: 'areas', label: 'Участки', icon: '📍' },
    { key: 'equipment', label: 'Оборуд.', icon: '⚙️' },
    { key: 'workers', label: 'Сотрудн.', icon: '👷' },
    { key: 'faultCodes', label: 'Шифры', icon: '🔢' },
  ]
  const activeBottomKey =
    nav.screen === 'order' || nav.screen === 'orders' || nav.screen === 'refbooks' ? ''
    : nav.screen === 'equipmentOrders' ? 'equipment'
    : nav.screen === 'workerOrders' ? 'workers'
    : nav.screen === 'faultCode' ? 'faultCodes'
    : nav.screen === 'refbook' ? nav.book
    : 'dashboard'
  function goTop(key: string) {
    setStack([])
    setNav(key === 'dashboard'
      ? { screen: 'dashboard' }
      : { screen: 'refbook', book: key as RefBookKey })
  }

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 sm:px-6"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-3">
          {nav.screen !== 'dashboard' && (
            <button
              type="button"
              onClick={back}
              className="border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900"
            >
              ← Назад
            </button>
          )}
          <div>
            <span className="text-sm text-neutral-500">
              {ROLE_LABELS[profile.role]} · {profile.fullName || ROLE_LABELS[profile.role]}
            </span>
            {!isDemoMode && (
              <p className="text-xs" aria-live="polite">
                {syncing ? (
                  <span className="text-blue-600">↻ Синхронизация…</span>
                ) : !online ? (
                  <span className="text-neutral-500">○ Нет сети · изменения будут отправлены автоматически</span>
                ) : pending > 0 ? (
                  <span className="text-orange-600">Ожидает синхронизации: {pending}</span>
                ) : failed > 0 ? (
                  <span className="text-red-600">! Не синхронизировано: {failed}</span>
                ) : lastError ? (
                  <span className="text-red-600">! Ошибка синхронизации: {lastError}</span>
                ) : (
                  <span className="text-green-600">● Онлайн · данные в БД</span>
                )}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900"
        >
          Выйти
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-6 md:pb-10">
        {error && (
          <p role="alert" className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {nav.screen === 'dashboard' && <AdminDashboard data={data} />}
        {nav.screen === 'refbooks' && <RefBooksHub data={data} />}
        {nav.screen === 'refbook' && <ReferenceBooks data={data} book={nav.book} />}
        {nav.screen === 'orders' && (
          <Screen title="Все наряды" subtitle={`Список нарядов предприятия · всего: ${orders.length}`}>
            <OrdersTable data={data} orders={orders} />
          </Screen>
        )}
        {nav.screen === 'order' && <OrderDetail data={data} orderId={nav.id} />}
        {nav.screen === 'equipmentOrders' && (
          <EquipmentOrders data={data} equipmentId={nav.equipmentId} />
        )}
        {nav.screen === 'workerOrders' && (
          <WorkerOrders data={data} workerId={nav.workerId} />
        )}
        {nav.screen === 'faultCode' && <FaultCodeDetail data={data} code={nav.code} />}
      </main>

      <BottomNav items={bottomNavItems} activeKey={activeBottomKey} onSelect={goTop} />
    </div>
  )
}

// ---------- Дашборд администратора ----------

function AdminDashboard({ data }: { data: AdminData }) {
  const { orders, workers, areas, equipment, go } = data
  const active = orders.filter((o) => !['closed', 'cancelled'].includes(o.status)).length
  const overdue = orders.filter((o) => {
    const t = new Date(o.deadline).getTime()
    return t < Date.now() && !['completed', 'cancelled', 'closed'].includes(o.status)
  }).length

  const stats: Array<{ label: string; value: number; hint: string }> = [
    { label: 'Активных нарядов', value: active, hint: 'Наряды в работе или ожидающие приёмки' },
    { label: 'Просрочено', value: overdue, hint: 'Срок истёк, работы не завершены' },
    { label: 'Сотрудников', value: workers.length, hint: 'Справочник сотрудников (ТЗ §2.4)' },
    { label: 'Единиц оборудования', value: equipment.length, hint: 'Справочник оборудования (ТЗ §2.3)' },
  ]

  const books: Array<{ key: RefBookKey; label: string; hint: string }> = [
    { key: 'areas', label: 'Участки', hint: 'Подразделения, закрепление и привязки (ТЗ §2.1)' },
    { key: 'materials', label: 'Материалы и запчасти', hint: 'Номенклатура и количество (ТЗ §2.2)' },
    { key: 'equipment', label: 'Оборудование', hint: 'Единицы техники и наряды по ним (ТЗ §2.3)' },
    { key: 'workers', label: 'Сотрудники', hint: 'Персонал, разряды, бригады (ТЗ §2.4)' },
    { key: 'faultCodes', label: 'Шифры неисправности', hint: 'Типовые поломки и нормативы (ТЗ §2.5)' },
  ]

  return (
    <Screen
      title="Администрирование"
      subtitle="Справочники предприятия и контроль нарядов (ТЗ §2)"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} title={s.hint} className="border border-neutral-200 bg-white p-4">
            <div className="text-4xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-sm text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {books.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => go({ screen: 'refbook', book: b.key })}
            className="border border-neutral-900 bg-white px-6 py-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <div className="text-lg font-medium">{b.label}</div>
            <div className="mt-1 text-sm opacity-70">{b.hint}</div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => go({ screen: 'orders' })}
          className="border border-neutral-900 bg-white px-6 py-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
        >
          <div className="text-lg font-medium">Все наряды</div>
          <div className="mt-1 text-sm opacity-70">Список нарядов предприятия · {orders.length}</div>
        </button>
      </div>

      <p className="text-sm text-neutral-500">
        Участков: {areas.length}. Данные хранятся в БД и синхронизируются автоматически.
      </p>
    </Screen>
  )
}
