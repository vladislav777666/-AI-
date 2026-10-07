// Общие блоки веб-панели руководителя: заголовок раздела, плитка метрики,
// список-карточка и таблица нарядов с произвольными колонками.
// Стиль — минимализм проекта (Tailwind 4, чёрно-белая палитра).

import type { ReactNode } from 'react'
import {
  ORDER_STATUS_LABELS,
  type Area, type Equipment, type Worker, type WorkOrder,
} from '../../lib/types'
import { StatusDot } from '../../components/ui'

export const STATUS_COLORS: Record<string, string> = {
  issued: 'bg-neutral-400',
  accepted: 'bg-blue-500',
  in_work: 'bg-yellow-500',
  queued: 'bg-blue-300',
  completed: 'bg-green-500',
  cancelled: 'bg-neutral-300',
  suspended: 'bg-orange-400',
  closed: 'bg-green-700',
  rejected: 'bg-red-500',
  rework: 'bg-purple-500',
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

/** Заголовок раздела/блока. */
export function SectionHeader({ title, subtitle, right }: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/** Плитка ключевой метрики (Раздел 1). */
export function StatTile({ label, value, unit, hint, onClick }: {
  label: string
  value: string | number
  unit?: string
  hint?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tabular-nums sm:text-5xl">{value}</span>
        {unit && <span className="text-lg text-neutral-500">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-xs text-neutral-500">{hint}</div>}
    </>
  )
  const cls = 'border border-neutral-200 bg-white p-4 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:border-neutral-900`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

/**
 * Карточка-строка списка: подпись и значение (слева или справа — по ТЗ
 * раздела: 3.1–3.3 — подпись слева, число справа; 3.4 — превышение слева),
 * справа может быть подсказка.
 */
export function BarCard({ value, valueSuffix, label, sublabel, right, onClick, tone = 'neutral', valueSide = 'left' }: {
  value: string | number
  valueSuffix?: string
  label: string
  sublabel?: string
  right?: string
  onClick?: () => void
  tone?: 'neutral' | 'bad' | 'good'
  valueSide?: 'left' | 'right'
}) {
  const toneCls =
    tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700' : 'text-neutral-900'
  const valueEl = (
    <div className={`w-24 shrink-0 text-right text-2xl font-semibold tabular-nums ${toneCls}`}>
      {value}
      {valueSuffix && <span className="ml-1 text-sm font-normal text-neutral-500">{valueSuffix}</span>}
    </div>
  )
  const labelEl = (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{label}</div>
      {sublabel && <div className="truncate text-xs text-neutral-500">{sublabel}</div>}
    </div>
  )
  const inner = (
    <div className="flex items-center gap-4">
      {valueSide === 'left' ? <>{valueEl}{labelEl}</> : <>{labelEl}{valueEl}</>}
      {right && <div className="shrink-0 text-xs text-neutral-400">{right}</div>}
    </div>
  )
  const cls = 'w-full border border-neutral-200 bg-white p-3 text-left'
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:border-neutral-900`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export interface OrderColumn {
  head: string
  cell: (o: WorkOrder) => ReactNode
}

export function statusCell(o: WorkOrder): ReactNode {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <StatusDot color={STATUS_COLORS[o.status] ?? 'bg-neutral-300'} />
      {ORDER_STATUS_LABELS[o.status]}
    </span>
  )
}

/** Таблица нарядов: клик по строке открывает детальную информацию. */
export function OrderTable({ columns, orders, onOpen, emptyText = 'Нарядов нет.' }: {
  columns: OrderColumn[]
  orders: WorkOrder[]
  onOpen: (id: string) => void
  emptyText?: string
}) {
  if (orders.length === 0) {
    return <p className="border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">{emptyText}</p>
  }
  return (
    <div className="overflow-x-auto border border-neutral-200">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            {columns.map((c) => (
              <th key={c.head} className="px-3 py-2 font-medium">{c.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => onOpen(o.id)}
              className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
            >
              {columns.map((c) => (
                <td key={c.head} className="px-3 py-2.5 align-top">{c.cell(o)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Кнопка-переключатель (период, представление, метрика). */
export function Toggle({ active, children, onClick }: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`border px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-neutral-900 bg-neutral-900 text-white'
          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-900'
      }`}
    >
      {children}
    </button>
  )
}

/** Пояснение к формализации метрики. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
      {children}
    </p>
  )
}

/** Словари имён для колонок списков нарядов. */
export interface NameLookup {
  areaName: (id: string) => string
  equipmentName: (id: string) => string
  workerName: (id: string | null) => string
}

export function makeLookup(data: {
  areas: Area[]
  equipment: Equipment[]
  workers: Worker[]
}): NameLookup {
  return {
    areaName: (id) => data.areas.find((a) => a.id === id)?.name ?? '—',
    equipmentName: (id) => data.equipment.find((e) => e.id === id)?.name ?? '—',
    workerName: (id) => (id && data.workers.find((w) => w.id === id)?.fullName) || '—',
  }
}

/** Стандартные колонки списка нарядов (общий паттерн ТЗ). */
export function defaultOrderColumns(l: NameLookup): OrderColumn[] {
  return [
    {
      head: 'Наряд',
      cell: (o) => (
        <div>
          <div className="font-medium">{o.number}</div>
          <div className="text-xs text-neutral-500">{ORDER_STATUS_LABELS[o.status]}</div>
        </div>
      ),
    },
    { head: 'Оборудование', cell: (o) => l.equipmentName(o.equipmentId) },
    { head: 'Участок', cell: (o) => l.areaName(o.areaId) },
    { head: 'Исполнитель', cell: (o) => l.workerName(o.workerId) },
    { head: 'Шифр', cell: (o) => <span className="font-mono">{o.faultCode ?? '—'}</span> },
    { head: 'Тип', cell: (o) => (o.workType === 'planned' ? 'Плановый' : 'Внеплановый') },
    { head: 'Создан', cell: (o) => fmtDateTime(o.createdAt) },
    { head: 'Срок', cell: (o) => fmtDate(o.deadline) },
  ]
}
