// Frame 18: реестр нарядов Исполнителя. Сортировка ТЗ §7 (приоритет убыв,
// затем старые вперёд), фильтры ТЗ §9, карточка ТЗ §8 с индикатором просрочки.

import { useMemo, useState } from 'react'
import {
  isOverdue, ORDER_STATUS_LABELS, PRIORITY_LABELS, WORK_TYPE_LABELS,
  type Priority, type WorkType,
} from '../../lib/types'
import { compareForRegistry, formatDuration, PRIORITY_SHORT, WORKER_ACTIONABLE } from '../../lib/status'
import { Card, Screen, Select, StatusDot } from '../../components/ui'
import type { WorkerCtx } from './shared'

type StatusChip = 'all' | 'assigned' | 'queued' | 'in_work' | 'suspended' | 'overdue' | 'rework'

const CHIPS: Array<{ key: StatusChip; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'assigned', label: 'Назначенные' },
  { key: 'queued', label: 'В очереди' },
  { key: 'in_work', label: 'В работе' },
  { key: 'suspended', label: 'Приостановленные' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'rework', label: 'На доработке' },
]

const DOT: Record<string, string> = {
  issued: 'bg-neutral-400', accepted: 'bg-blue-500', in_work: 'bg-yellow-500',
  queued: 'bg-blue-300', completed: 'bg-green-500', cancelled: 'bg-neutral-300',
  suspended: 'bg-orange-400', closed: 'bg-green-700', rejected: 'bg-red-400',
  rework: 'bg-purple-500',
}

export default function Registry({ ctx }: { ctx: WorkerCtx }) {
  const [chip, setChip] = useState<StatusChip>('all')
  const [priority, setPriority] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [workType, setWorkType] = useState('')

  const filtered = useMemo(() => {
    let list = ctx.orders.filter((o) => o.status !== 'closed' && o.status !== 'cancelled' && o.status !== 'rejected')
    if (chip === 'assigned') list = list.filter((o) => o.status === 'issued')
    else if (chip === 'overdue') list = list.filter((o) => isOverdue(o))
    else if (chip !== 'all') list = list.filter((o) => o.status === chip)
    if (priority) list = list.filter((o) => o.priority === priority)
    if (areaId) list = list.filter((o) => o.areaId === areaId)
    if (equipmentId) list = list.filter((o) => o.equipmentId === equipmentId)
    if (workType) list = list.filter((o) => o.workType === workType)
    return list.sort(compareForRegistry)
  }, [ctx.orders, chip, priority, areaId, equipmentId, workType])

  const eqName = (id: string) => ctx.equipment.find((e) => e.id === id)?.name ?? '—'
  const areaName = (id: string) => ctx.areas.find((a) => a.id === id)?.name ?? '—'

  return (
    <Screen title="Наряды" subtitle={`Сортировка: приоритет, затем старые вперёд · найдено ${filtered.length}`}>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChip(c.key)}
            className={`border px-3 py-2 text-sm transition-colors ${
              chip === c.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-40 text-sm">
          <option value="">Приоритет: все</option>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_SHORT[p]}</option>
          ))}
        </Select>
        <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="max-w-40 text-sm">
          <option value="">Участок: все</option>
          {ctx.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className="max-w-44 text-sm">
          <option value="">Оборудование: все</option>
          {ctx.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <Select value={workType} onChange={(e) => setWorkType(e.target.value as WorkType | '')} className="max-w-44 text-sm">
          <option value="">Тип работ: все</option>
          {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((t) => (
            <option key={t} value={t}>{WORK_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && <p className="text-sm text-neutral-500">У вас нет активных нарядов.</p>}
        {filtered.map((o) => {
          const over = isOverdue(o)
          return (
            <Card key={o.id} onClick={() => ctx.go({ view: 'detail', id: o.id })}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">№{o.number}</span>
                <span className={`border px-2 py-0.5 text-xs font-semibold ${
                  o.priority === 'emergency' ? 'border-red-600 text-red-600'
                  : o.priority === 'high' ? 'border-orange-500 text-orange-600'
                  : 'border-neutral-400 text-neutral-600'}`}>
                  {PRIORITY_SHORT[o.priority]}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium">{o.description}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Оборудование: {eqName(o.equipmentId)} · Участок: {areaName(o.areaId)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Выдан: {new Date(o.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {' · '}Срок: {new Date(o.deadline).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
              {over && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  Просрочен на {formatDuration(Date.now() - new Date(o.deadline).getTime())}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2 text-sm">
                <StatusDot color={DOT[o.status]} />
                <span>{ORDER_STATUS_LABELS[o.status]}</span>
                <span className="text-xs text-neutral-400">
                  {WORKER_ACTIONABLE.includes(o.status) ? 'требует действий' : 'ожидает'}
                </span>
              </div>
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}
