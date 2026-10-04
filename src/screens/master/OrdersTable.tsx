// Список нарядов по оборудованию / сотруднику (ТЗ §2.3, §2.4).
// Колонки по ТЗ: Статус, Оборудование, Участок, Исполнитель, Приоритет,
// Шифр неисправности. Клик по строке → карточка наряда (ТЗ §3).

import { ORDER_STATUS_LABELS, PRIORITY_LABELS, type WorkOrder } from '../../lib/types'
import { StatusDot } from '../../components/ui'
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
  rejected: 'bg-red-500',
  rework: 'bg-purple-500',
}

const HEAD = ['Статус', 'Оборудование', 'Участок', 'Исполнитель', 'Приоритет', 'Шифр неисправности']

export default function OrdersTable({ data, orders }: { data: MasterData; orders: WorkOrder[] }) {
  const areaName = (id: string) => data.areas.find((a) => a.id === id)?.name ?? '—'
  const equipmentName = (id: string) => data.equipment.find((e) => e.id === id)?.name ?? '—'
  const workerName = (id: string | null) =>
    (id && data.workers.find((w) => w.id === id)?.fullName) || '—'

  if (orders.length === 0) {
    return <p className="text-sm text-neutral-500">Нарядов нет.</p>
  }

  return (
    <div className="overflow-x-auto border border-neutral-200">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            {HEAD.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => data.go({ screen: 'order', id: o.id })}
              className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
            >
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <StatusDot color={STATUS_COLORS[o.status] ?? 'bg-neutral-300'} />
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-400">{o.number}</span>
              </td>
              <td className="px-3 py-2.5">{equipmentName(o.equipmentId)}</td>
              <td className="px-3 py-2.5">{areaName(o.areaId)}</td>
              <td className="px-3 py-2.5">{workerName(o.workerId)}</td>
              <td className="px-3 py-2.5">{PRIORITY_LABELS[o.priority]}</td>
              <td className="px-3 py-2.5">{o.faultCode ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
