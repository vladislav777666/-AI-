// Дашборд Мастера (ТЗ §2): сводная статистика + основное меню.
// Справочники (ТЗ §2) — отдельная веб-роль «Администратор», здесь их нет.

import { isOverdue, type StatusFilter } from '../../lib/types'
import { Screen } from '../../components/ui'
import type { MasterData } from './nav'

export default function Dashboard({ data }: { data: MasterData }) {
  const { orders, equipment, go } = data

  const issued = orders.filter((o) => o.status === 'issued').length
  const done = orders.filter((o) => o.status === 'closed').length
  const overdue = orders.filter((o) => isOverdue(o)).length
  const idleEquipment = new Set(
    orders.filter((o) => o.status === 'issued').map((o) => o.equipmentId),
  ).size

  const stats: Array<{ label: string; value: number; filter: StatusFilter; hint: string }> = [
    { label: 'Выдано', value: issued, filter: 'issued', hint: 'Наряды, ожидающие принятия исполнителем' },
    { label: 'Выполнено', value: done, filter: 'closed', hint: 'Наряды, принятые после приёмки' },
    { label: 'Просрочено', value: overdue, filter: 'overdue', hint: 'Срок истёк, работы не завершены' },
    { label: 'Оборудование в простое', value: idleEquipment, filter: 'issued', hint: 'Наряд создан, но ещё не принят в работу' },
  ]

  const menu: Array<{
    label: string
    screen: 'orders' | 'workers' | 'issue' | 'notifications' | 'reports' | 'ai'
    hint: string
  }> = [
    { label: 'Наряды', screen: 'orders', hint: 'Список нарядов и фильтры по статусам' },
    { label: 'Исполнители', screen: 'workers', hint: 'Персонал, досье и занятость' },
    { label: 'Выдать наряд', screen: 'issue', hint: 'Новый наряд с подсказками ИИ' },
    { label: 'Отчёты', screen: 'reports', hint: 'Шесть видов отчётов, фильтры, выгрузка PDF/Excel' },
    { label: 'ИИ', screen: 'ai', hint: 'Чат и голосовой помощник по данным системы' },
    { label: 'Уведомления', screen: 'notifications', hint: 'События по нарядам' },
  ]

  return (
    <Screen title="Дашборд" subtitle="Сводная статистика и разделы модуля">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.hint}
            onClick={() => go({ screen: 'orders', statusFilter: s.filter })}
            className="border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-900"
          >
            <div className="text-4xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-sm text-neutral-500">{s.label}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {menu.map((m) => (
          <button
            key={m.screen}
            type="button"
            onClick={() => go({ screen: m.screen })}
            className="border border-neutral-900 bg-white px-6 py-5 text-left transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <span className="text-lg font-medium">{m.label}</span>
            <span className="mt-1 block text-sm opacity-70">{m.hint}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-neutral-500">
        Всего нарядов в системе: {orders.length}. Единиц оборудования: {equipment.length}.
      </p>
    </Screen>
  )
}
