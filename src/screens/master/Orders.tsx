// Список нарядов (ТЗ §4.1): гибкая фильтрация всплывающими списками.

import { useMemo, useState } from 'react'
import {
  isOverdue, ORDER_STATUS_LABELS, PRIORITY_LABELS, STATUS_FILTER_LABELS,
  type Priority, type StatusFilter, type WorkOrder,
} from '../../lib/types'
import { Card, Screen, Select, StatusDot, TextInput } from '../../components/ui'
import type { MasterData } from './nav'

const STATUS_COLORS: Record<string, string> = {
  issued: 'bg-neutral-400',
  accepted: 'bg-blue-500',
  in_work: 'bg-yellow-500',
  queued: 'bg-blue-300',
  completed: 'bg-green-500',
  cancelled: 'bg-neutral-300',
  suspended: 'bg-orange-400',
  closed: 'bg-green-700',
}

/** Доска нарядов по статусам (PDF §5.2 п.2): ровно 6 колонок канбана.
 *  Просроченные — отдельная колонка (дублей со статусными не делаем):
 *  остальные статусы (отклонён, приостановлен, доработка, закрыт, отменён)
 *  видны в списке. */
const BOARD_COLUMNS: Array<{
  key: string
  title: string
  match: (o: WorkOrder, overdue: boolean) => boolean
}> = [
  { key: 'issued', title: 'Выданные', match: (o, od) => o.status === 'issued' && !od },
  { key: 'accepted', title: 'Принятые', match: (o, od) => o.status === 'accepted' && !od },
  { key: 'in_work', title: 'В работе', match: (o, od) => o.status === 'in_work' && !od },
  { key: 'queued', title: 'В очереди', match: (o, od) => o.status === 'queued' && !od },
  { key: 'completed', title: 'Выполненные', match: (o, od) => o.status === 'completed' && !od },
  { key: 'overdue', title: 'Просроченные', match: (_o, od) => od },
]

export default function Orders({ data, presetStatus = 'all' }: {
  data: MasterData
  presetStatus?: StatusFilter
}) {
  const [status, setStatus] = useState<StatusFilter>(presetStatus)
  const [areaId, setAreaId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [priority, setPriority] = useState('')
  const [code, setCode] = useState('')
  const [view, setView] = useState<'list' | 'board'>('list')

  const filtered = useMemo(() => {
    return data.orders.filter((o) => {
      if (status !== 'all') {
        if (status === 'overdue' ? !isOverdue(o) : o.status !== status) return false
      }
      if (areaId && o.areaId !== areaId) return false
      if (workerId && o.workerId !== workerId) return false
      if (equipmentId && o.equipmentId !== equipmentId) return false
      if (priority && o.priority !== priority) return false
      if (code && !(o.faultCode ?? '').toLowerCase().includes(code.toLowerCase())) return false
      return true
    })
  }, [data.orders, status, areaId, workerId, equipmentId, priority, code])

  const areaName = (id: string) => data.areas.find((a) => a.id === id)?.name ?? '—'
  const equipmentName = (id: string) => data.equipment.find((e) => e.id === id)?.name ?? '—'
  const workerName = (id: string | null) =>
    id ? data.workers.find((w) => w.id === id)?.fullName ?? '—' : '—'

  const filterPanel = (
    <div className="flex flex-wrap items-end gap-2 border border-neutral-200 p-3">
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Статус
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="max-w-48">
          {(['all', ...Object.keys(ORDER_STATUS_LABELS), 'overdue'] as StatusFilter[]).map((s) => (
            <option key={s} value={s}>{STATUS_FILTER_LABELS[s]}</option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Участок
        <Select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="max-w-44">
          <option value="">Все</option>
          {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Исполнитель
        <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="max-w-44">
          <option value="">Все</option>
          {data.workers.map((w) => <option key={w.id} value={w.id}>{w.fullName}</option>)}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Оборудование
        <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className="max-w-44">
          <option value="">Все</option>
          {data.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Приоритет
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-44">
          <option value="">Все</option>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Шифр
        <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="M-02" className="max-w-28" />
      </label>
      <button
        type="button"
        onClick={() => { setStatus('all'); setAreaId(''); setWorkerId(''); setEquipmentId(''); setPriority(''); setCode('') }}
        className="border border-neutral-300 px-3 py-2 text-xs hover:border-neutral-900"
      >
        Сбросить
      </button>
    </div>
  )

  return (
    <Screen title="Наряды" subtitle={`Найдено: ${filtered.length} из ${data.orders.length}`}>
      <div className="flex gap-2" role="group" aria-label="Вид нарядов">
        {([
          { key: 'list', label: 'Список' },
          { key: 'board', label: 'Доска (канбан)' },
        ] as const).map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => setView(v.key)}
            className={`border px-3 py-1.5 text-sm font-medium transition-colors ${
              view === v.key
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 hover:border-neutral-900'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'board' ? (
        <>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {BOARD_COLUMNS.map((col) => {
              const items = filtered.filter((o) => col.match(o, isOverdue(o)))
              return (
                <div key={col.key} className="min-w-44 flex-1 border border-neutral-200 bg-neutral-50 p-2">
                  <p className="mb-2 flex items-baseline gap-1 text-xs font-semibold uppercase text-neutral-500">
                    {col.title}
                    <span className="font-normal normal-case text-neutral-400">{items.length}</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {items.length === 0 && (
                      <p className="text-xs text-neutral-400">Пусто</p>
                    )}
                    {items.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => data.go({ screen: 'order', id: o.id })}
                        className="border border-neutral-200 bg-white p-2 text-left transition-colors hover:border-neutral-900"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <StatusDot color={STATUS_COLORS[o.status]} />
                          {o.number}
                        </span>
                        <p className="mt-1 truncate text-xs text-neutral-500">{equipmentName(o.equipmentId)}</p>
                        <p className="truncate text-xs text-neutral-500">{workerName(o.workerId)}</p>
                        <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
                          <span className="border border-neutral-300 px-1">{PRIORITY_LABELS[o.priority]}</span>
                          {isOverdue(o) && (
                            <span className="border border-red-600 px-1 text-red-600">Просрочен</span>
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-neutral-500">
            Отклонённые, приостановленные и наряды на доработке — в списке; закрытые — в отчётах.
          </p>
        </>
      ) : (
        <>
      <details className="group">
        <summary className="cursor-pointer border border-neutral-900 px-4 py-2 text-sm font-medium hover:bg-neutral-900 hover:text-white">
          Фильтры
        </summary>
        <div className="mt-2">{filterPanel}</div>
      </details>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && <p className="text-sm text-neutral-500">Нарядов не найдено.</p>}
        {filtered.map((o) => (
          <Card key={o.id} onClick={() => data.go({ screen: 'order', id: o.id })}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusDot color={STATUS_COLORS[o.status]} />
              <span className="font-medium">{o.number}</span>
              <span className="text-sm text-neutral-500">{equipmentName(o.equipmentId)} · {areaName(o.areaId)}</span>
              {isOverdue(o) && (
                <span className="border border-red-600 px-1.5 py-0.5 text-xs text-red-600">Просрочен</span>
              )}
              <span className="ml-auto text-sm text-neutral-500">{ORDER_STATUS_LABELS[o.status]}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm">{o.description}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
              <span>
                {workerName(o.workerId)} · {PRIORITY_LABELS[o.priority]}
                {o.faultCode ? ` · ${o.faultCode}` : ''}
              </span>
              {presetStatus === 'issued' && (
                <span className="border border-neutral-900 bg-neutral-900 px-2 py-1 text-white">
                  Открыть наряд →
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>
        </>
      )}
    </Screen>
  )
}
