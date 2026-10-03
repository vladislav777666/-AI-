// Исполнители (ТЗ §6): список со статусами, Досье, История работ по оборудованию.

import { useEffect, useMemo, useState } from 'react'
import * as db from '../../lib/db'
import {
  isOverdue, ORDER_STATUS_LABELS, PRIORITY_LABELS, WORKER_STATUS_LABELS,
  type WorkerStatus,
} from '../../lib/types'
import { Card, Screen, Stars, StatusDot } from '../../components/ui'
import type { MasterData } from './nav'

const DOT_COLORS: Record<WorkerStatus, string> = {
  free: 'bg-green-500',
  busy: 'bg-yellow-500',
  queue: 'bg-blue-500',
  not_on_shift: 'bg-neutral-300',
}

const DossierStats = db.workerEquipmentStats
type DossierRow = Awaited<ReturnType<typeof db.workerEquipmentStats>>[number]

export default function Workers({ data, dossierWorkerId, equipmentId }: {
  data: MasterData
  dossierWorkerId?: string
  equipmentId?: string
}) {
  if (dossierWorkerId && equipmentId) {
    return <EquipmentHistory data={data} workerId={dossierWorkerId} equipmentId={equipmentId} />
  }
  if (dossierWorkerId) {
    return <Dossier data={data} workerId={dossierWorkerId} />
  }
  return <WorkerList data={data} />
}

function WorkerList({ data }: { data: MasterData }) {
  const today = new Date().toDateString()

  const stats = useMemo(() => {
    const map = new Map<string, {
      shiftOrders: number
      handed: number
      accepted: number
      waiting: number
      refused: number
      byPriority: Record<string, number>
    }>()
    for (const w of data.workers) {
      map.set(w.id, { shiftOrders: 0, handed: 0, accepted: 0, waiting: 0, refused: 0, byPriority: {} })
    }
    for (const o of data.orders) {
      if (!o.workerId) continue
      const s = map.get(o.workerId)
      if (!s) continue
      if (new Date(o.createdAt).toDateString() === today) s.shiftOrders += 1
      if (['completed', 'closed'].includes(o.status)) s.handed += 1
      if (['accepted', 'in_work'].includes(o.status)) s.accepted += 1
      if (['issued', 'queued'].includes(o.status)) s.waiting += 1
      if (o.status === 'cancelled') s.refused += 1
      s.byPriority[o.priority] = (s.byPriority[o.priority] ?? 0) + 1
    }
    return map
  }, [data.orders, data.workers, today])

  async function cycleStatus(id: string, current: WorkerStatus) {
    const order: WorkerStatus[] = ['free', 'busy', 'queue', 'not_on_shift']
    const next = order[(order.indexOf(current) + 1) % order.length]
    await db.updateWorkerStatus(id, next)
    await data.refresh()
  }

  return (
    <Screen title="Исполнители" subtitle="Цвет — статус: зелёный свободен, жёлтый в работе, синий есть очередь, серый не на смене. Клик по точке — сменить статус.">
      <div className="flex flex-col gap-2">
        {data.workers.map((w) => {
          const s = stats.get(w.id)
          return (
            <Card key={w.id} onClick={() => data.go({ screen: 'dossier', workerId: w.id })}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void cycleStatus(w.id, w.status) }}
                  title="Сменить статус"
                >
                  <StatusDot color={DOT_COLORS[w.status]} />
                </button>
                <span className="font-medium">{w.fullName}</span>
                <span className="text-sm text-neutral-500">{w.specialty}</span>
                <span className="ml-auto"><Stars value={w.rating} /></span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {WORKER_STATUS_LABELS[w.status]} · нарядов за смену: {s?.shiftOrders ?? 0} ·
                {' '}Сдал {s?.handed ?? 0} / Принял {s?.accepted ?? 0} / В ожидании {s?.waiting ?? 0} / Отказал {s?.refused ?? 0} ·
                {' '}{prioritySummary(s?.byPriority)}
              </p>
            </Card>
          )
        })}
        {data.workers.length === 0 && (
          <p className="text-sm text-neutral-500">Исполнителей нет — они появятся после регистрации Worker'ов.</p>
        )}
      </div>
    </Screen>
  )
}

function prioritySummary(byPriority: Record<string, number> | undefined): string {
  if (!byPriority) return ''
  const parts: string[] = []
  if (byPriority.emergency) parts.push(`Аварийные: ${byPriority.emergency}`)
  if (byPriority.high) parts.push(`Высокие: ${byPriority.high}`)
  if (byPriority.normal) parts.push(`Обычные: ${byPriority.normal}`)
  if (byPriority.planned) parts.push(`Плановые: ${byPriority.planned}`)
  return parts.join(', ')
}

function Dossier({ data, workerId }: { data: MasterData; workerId: string }) {
  const [rows, setRows] = useState<DossierRow[] | null>(null)
  const worker = data.workers.find((w) => w.id === workerId)

  useEffect(() => {
    let alive = true
    void DossierStats(workerId).then((r) => alive && setRows(r))
    return () => { alive = false }
  }, [workerId])

  return (
    <Screen title={`Досье: ${worker?.fullName ?? '—'}`} subtitle="Оборудование, с которым работал сотрудник">
      {!rows && <p className="text-sm text-neutral-500">Загрузка…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-neutral-500">Работ пока нет.</p>}
      <div className="flex flex-col gap-2">
        {rows?.map(({ equipment, count, avgScore }) => (
          <Card
            key={equipment.id}
            onClick={() => data.go({ screen: 'equipmentHistory', workerId, equipmentId: equipment.id })}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{equipment.name}</span>
              <span className="text-sm text-neutral-500">работ: {count}</span>
              <span className="ml-auto text-sm">
                Рейтинг: {avgScore != null ? `${avgScore.toFixed(1)}/5` : '—'}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </Screen>
  )
}

function EquipmentHistory({ data, workerId, equipmentId }: {
  data: MasterData
  workerId: string
  equipmentId: string
}) {
  const worker = data.workers.find((w) => w.id === workerId)
  const equipment = data.equipment.find((e) => e.id === equipmentId)
  const orders = data.orders.filter((o) => o.workerId === workerId && o.equipmentId === equipmentId)

  return (
    <Screen
      title={`История работ: ${equipment?.name ?? '—'}`}
      subtitle={`Исполнитель: ${worker?.fullName ?? '—'} · нарядов: ${orders.length}`}
    >
      <div className="flex flex-col gap-2">
        {orders.length === 0 && <p className="text-sm text-neutral-500">Нарядов нет.</p>}
        {orders.map((o) => (
          <Card key={o.id} onClick={() => data.go({ screen: 'order', id: o.id })}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{o.number}</span>
                <span>{ORDER_STATUS_LABELS[o.status]}</span>
                <span className="text-neutral-500">{equipment?.name}</span>
                <span className="text-neutral-500">{data.areas.find((a) => a.id === o.areaId)?.name}</span>
                <span>{PRIORITY_LABELS[o.priority]}</span>
                {isOverdue(o) && <span className="border border-red-600 px-1 text-xs text-red-600">Просрочен</span>}
              </div>
              {o.comment && <p className="mt-1 text-xs text-neutral-500">{o.comment}</p>}
            </Card>
          ))}
      </div>
    </Screen>
  )
}
