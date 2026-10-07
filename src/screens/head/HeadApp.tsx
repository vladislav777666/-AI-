// Веб-панель руководителя (ТЗ «Веб-панель руководителя»): три основных
// раздела с переключением через главное навигационное меню — Дашборд,
// Рейтинг, Аномалии и аналитика. Доступ — только веб-продакшен (не APK).
//
// Общий паттерн ТЗ: клик по элементу фильтра или аналитики открывает
// отфильтрованный список нарядов, клик по наряду — детальную информацию.
// Веб-руководитель и веб-администратор — РАЗНЫЕ должности (уточнение
// заказчика): руководитель работает только с аналитикой и просмотром
// нарядов, а справочники §2 и любые правки — задача администратора
// (screens/admin). Поэтому кнопки «Справочники» и админских экранов
// в панели руководителя нет.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { isDemoMode, signOut } from '../../lib/auth'
import * as db from '../../lib/db'
import {
  ROLE_LABELS,
  type Area, type Equipment, type FaultCode, type Profile, type WorkOrder, type Worker,
} from '../../lib/types'
import { Btn, Screen } from '../../components/ui'
import { useSync, type SyncOp } from '../../lib/sync'
import Dashboard from './Dashboard'
import Rating from './Rating'
import Anomalies from './Anomalies'
import OrderDetail from '../master/OrderDetail'
import { HEAD_SECTIONS, type HeadData, type HeadListRequest, type HeadSection } from './nav'
import {
  defaultOrderColumns, makeLookup, Note, OrderTable, SectionHeader, Toggle,
} from './shared'

export default function HeadApp({ profile }: { profile: Profile }) {
  const [section, setSection] = useState<HeadSection>('dashboard')
  const [listReq, setListReq] = useState<HeadListRequest | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)

  const [workers, setWorkers] = useState<Worker[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [faultCodes, setFaultCodes] = useState<FaultCode[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [w, a, e, o, f, s] = await Promise.all([
        db.listWorkers(), db.listAreas(), db.listEquipment(), db.listOrders(),
        db.listFaultCodes(), db.listAcceptanceScores(),
      ])
      setWorkers(w); setAreas(a); setEquipment(e); setOrders(o); setFaultCodes(f); setScores(s)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки данных')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // После фоновой синхронизации с БД — перечитываем данные.
  useEffect(() => {
    const onSynced = () => { void refresh() }
    window.addEventListener('db-synced', onSynced)
    return () => window.removeEventListener('db-synced', onSynced)
  }, [refresh])

  const runner = useCallback(
    async (op: SyncOp) => { await db.runQueuedOp(op, profile.fullName || 'Руководитель') },
    [profile.fullName],
  )
  const { online, pending, failed, lastError, syncing } = useSync(runner)

  const data: HeadData = useMemo(
    () => ({ profile, workers, areas, equipment, orders, faultCodes, scores, refresh }),
    [profile, workers, areas, equipment, orders, faultCodes, scores, refresh],
  )

  const lookup = useMemo(() => makeLookup({ areas, equipment, workers }), [areas, equipment, workers])

  async function logout() {
    await signOut()
    location.reload()
  }

  if (Capacitor.isNativePlatform()) {
    return (
      <div className="min-h-svh bg-white text-neutral-900">
        <Screen title={ROLE_LABELS[profile.role]} subtitle="Раздел доступен только в веб-продакшене">
          <p className="border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            В мобильном приложении (APK) веб-разделы (руководитель и администратор) скрыты.
            Откройте веб-версию в браузере.
          </p>
        </Screen>
      </div>
    )
  }

  const selectedOrder = orderId ? orders.find((o) => o.id === orderId) ?? null : null
  const backVisible = Boolean(selectedOrder || listReq)

  function back() {
    if (selectedOrder) { setOrderId(null); return }
    if (listReq) { setListReq(null); return }
  }

  function openList(req: HeadListRequest) {
    setListReq(req)
    window.scrollTo({ top: 0 })
  }

  function goSection(next: HeadSection) {
    setSection(next)
    setListReq(null)
    setOrderId(null)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header
        className="sticky top-0 z-10 border-b border-neutral-200 bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {backVisible && (
              <button
                type="button"
                onClick={back}
                className="shrink-0 border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900"
              >
                ← Назад
              </button>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm text-neutral-500">
                {ROLE_LABELS[profile.role]} · {profile.fullName || ROLE_LABELS[profile.role]}
              </div>
              {!isDemoMode && (
                <p className="text-xs" aria-live="polite">
                  {syncing ? (
                    <span className="text-blue-600">↻ Синхронизация…</span>
                  ) : !online ? (
                    <span className="text-neutral-500">○ Нет сети · данные из кэша</span>
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
          <div className="flex shrink-0 items-center gap-2">
            <Btn variant="ghost" onClick={logout}>Выйти</Btn>
          </div>
        </div>

        {/* Главное навигационное меню: три раздела панели. */}
        <nav className="mx-auto flex w-full max-w-[1600px] gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
          {HEAD_SECTIONS.map((s) => (
            <Toggle
              key={s.key}
              active={!listReq && !selectedOrder && section === s.key}
              onClick={() => goSection(s.key)}
            >
              <span aria-hidden className="mr-1">{s.icon}</span>{s.label}
            </Toggle>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {selectedOrder ? (
          <OrderDetail data={data} orderId={selectedOrder.id} readOnly />
        ) : listReq ? (
          <section className="flex flex-col gap-4">
            <SectionHeader
              title={listReq.title}
              subtitle={`${listReq.subtitle ? `${listReq.subtitle} · ` : ''}нарядов: ${listReq.orders.length}`}
              right={<Btn variant="ghost" onClick={() => setListReq(null)}>Закрыть список</Btn>}
            />
            {listReq.note && <Note>{listReq.note}</Note>}
            <OrderTable
              columns={listReq.columns ?? defaultOrderColumns(lookup)}
              orders={listReq.orders}
              onOpen={setOrderId}
            />
          </section>
        ) : section === 'dashboard' ? (
          <Dashboard data={data} onOpenList={openList} onGoSection={goSection} />
        ) : section === 'rating' ? (
          <Rating data={data} onOpenList={openList} />
        ) : (
          <Anomalies data={data} onOpenOrder={setOrderId} onOpenList={openList} />
        )}

        {!selectedOrder && !listReq && (
          <p className="mt-8 text-xs text-neutral-400">
            Данные: нарядов — {orders.length}, исполнителей — {workers.length}, оборудования — {equipment.length}.
          </p>
        )}
      </main>
    </div>
  )
}
