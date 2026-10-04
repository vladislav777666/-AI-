// Оболочка модуля «Мастер»: загрузка данных + переключение экранов.

import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { isDemoMode, signOut } from '../../lib/auth'
import * as db from '../../lib/db'
import type { Area, Equipment, Profile, WorkOrder, Worker } from '../../lib/types'
import Dashboard from './Dashboard'
import IssueOrder from './IssueOrder'
import OrderDetail from './OrderDetail'
import Orders from './Orders'
import Workers from './Workers'
import Notifications from './Notifications'
import ReferenceBooks, {
  EquipmentOrders, FaultCodeDetail, RefBooksHub, WorkerOrders,
} from './ReferenceBooks'
import type { MasterData, MasterNav } from './nav'
import { useSync, type SyncOp } from '../../lib/sync'
import { BottomNav, type NavItem } from '../../components/ui'

/** Экраны раздела «Справочники» — только веб-панель администратора (не в APK). */
const REFBOOK_SCREENS: MasterNav['screen'][] = [
  'refbooks', 'refbook', 'equipmentOrders', 'workerOrders', 'faultCode',
]

export default function MasterApp({ profile }: { profile: Profile }) {
  const [nav, setNav] = useState<MasterNav>({ screen: 'dashboard' })
  const [, setStack] = useState<MasterNav[]>([])
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

  const go = useCallback((next: MasterNav) => {
    setStack((prev) => [...prev, nav])
    setNav(next)
  }, [nav])

  // Офлайн-очередь: каждое действие Мастера/админа сохраняется в БД
  // сразу, а при отсутствии сети уходит при восстановлении связи.
  const runner = useCallback(
    async (op: SyncOp) => {
      await db.runQueuedOp(op, profile.fullName || 'Мастер')
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

  const back = useCallback(() => {
    setStack((prev) => {
      const last = prev[prev.length - 1]
      setNav(last ?? { screen: 'dashboard' })
      return prev.slice(0, -1)
    })
  }, [])

  const data: MasterData = { profile, workers, areas, equipment, orders, refresh, go, back }

  const isWebPanel = !Capacitor.isNativePlatform()
  const onRefBook = REFBOOK_SCREENS.includes(nav.screen)

  async function logout() {
    await signOut()
    location.reload()
  }

  // Переходы из нижней панели (телефон): без накопления стека назад.
  const bottomNavItems: NavItem[] = [
    { key: 'dashboard', label: 'Главная', icon: '🏠' },
    { key: 'orders', label: 'Наряды', icon: '📋' },
    { key: 'issue', label: 'Выдать', icon: '➕' },
    { key: 'workers', label: 'Исполнит.', icon: '👷' },
    { key: 'notifications', label: 'Уведомл.', icon: '🔔' },
  ]
  const activeBottomKey =
    nav.screen === 'order' ? 'orders'
    : nav.screen === 'dossier' || nav.screen === 'equipmentHistory' ? 'workers'
    : REFBOOK_SCREENS.includes(nav.screen) ? ''
    : nav.screen
  function goTop(key: string) {
    setStack([])
    setNav({ screen: key } as MasterNav)
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
              Мастер · {profile.fullName || 'Мастер'}
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
        {nav.screen === 'dashboard' && <Dashboard data={data} />}
        {nav.screen === 'orders' && <Orders data={data} presetStatus={nav.statusFilter ?? 'all'} />}
        {nav.screen === 'order' && <OrderDetail data={data} orderId={nav.id} />}
        {nav.screen === 'issue' && <IssueOrder data={data} />}
        {nav.screen === 'workers' && <Workers data={data} />}
        {nav.screen === 'dossier' && <Workers data={data} dossierWorkerId={nav.workerId} />}
        {nav.screen === 'equipmentHistory' && (
          <Workers data={data} dossierWorkerId={nav.workerId} equipmentId={nav.equipmentId} />
        )}
        {nav.screen === 'notifications' && <Notifications data={data} />}

        {/* Справочники (ТЗ §2) — только веб-панель администратора */}
        {onRefBook && !isWebPanel && (
          <p className="border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            Раздел «Справочники» доступен только в веб-панели администратора.
          </p>
        )}
        {isWebPanel && nav.screen === 'refbooks' && <RefBooksHub data={data} />}
        {isWebPanel && nav.screen === 'refbook' && (
          <ReferenceBooks data={data} book={nav.book} />
        )}
        {isWebPanel && nav.screen === 'equipmentOrders' && (
          <EquipmentOrders data={data} equipmentId={nav.equipmentId} />
        )}
        {isWebPanel && nav.screen === 'workerOrders' && (
          <WorkerOrders data={data} workerId={nav.workerId} />
        )}
        {isWebPanel && nav.screen === 'faultCode' && (
          <FaultCodeDetail data={data} code={nav.code} />
        )}
      </main>

      <BottomNav items={bottomNavItems} activeKey={activeBottomKey} onSelect={goTop} />
    </div>
  )
}
