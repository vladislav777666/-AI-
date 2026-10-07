// Раздел 1. Дашборд — экран реального времени: ключевые показатели,
// топ проблемного оборудования и лучшие исполнители (Раздел 2).

import { useMemo } from 'react'
import { dashboardMetrics, fmtHours, type AnalyticsInput } from '../../lib/analytics'
import { Btn } from '../../components/ui'
import { BarCard, Note, SectionHeader, StatTile } from './shared'
import type { HeadData, HeadListRequest, HeadSection } from './nav'

/** PDF §6.1 п.5: «при длительной просрочке — уведомление руководителю».
 *  Конкретный порог в ТЗ не задан — принято 24 часа (оценка в отчёте). */
const LONG_OVERDUE_HOURS = 24

export default function Dashboard({ data, onOpenList, onGoSection }: {
  data: HeadData
  onOpenList: (req: HeadListRequest) => void
  onGoSection: (s: HeadSection) => void
}) {
  const metrics = useMemo(
    () => {
      const input: AnalyticsInput = {
        orders: data.orders, workers: data.workers, areas: data.areas,
        equipment: data.equipment, faultCodes: data.faultCodes, scores: data.scores,
      }
      return dashboardMetrics(input)
    },
    [data.orders, data.workers, data.areas, data.equipment, data.faultCodes, data.scores],
  )

  const overdueOrders = data.orders.filter((o) =>
    new Date(o.deadline).getTime() < Date.now() && !['completed', 'cancelled', 'closed'].includes(o.status),
  )
  const activeOrders = data.orders.filter((o) => !['closed', 'cancelled', 'rejected'].includes(o.status))
  // Длительная просрочка (ТЗ §6.1 п.5): то, что руководитель должен увидеть отдельно.
  const longOverdue = overdueOrders.filter(
    (o) => Date.now() - new Date(o.deadline).getTime() > LONG_OVERDUE_HOURS * 3_600_000,
  )

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title="Дашборд"
        subtitle={`Оперативный обзор в реальном времени · всего нарядов: ${data.orders.length}`}
        right={<Btn variant="ghost" onClick={() => void data.refresh()}>Обновить</Btn>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile
          label="Наряды в работе"
          value={metrics.activeCount}
          hint="Активные задачи: выданы, приняты или в работе"
          onClick={() => onOpenList({ title: 'Наряды в работе', subtitle: 'Активные задачи', orders: activeOrders })}
        />
        <StatTile
          label="Просрочки"
          value={metrics.overdueCount}
          hint="Срок истёк, работы не завершены"
          onClick={() => onOpenList({ title: 'Просроченные наряды', subtitle: 'Срок истёк, работы не завершены', orders: overdueOrders })}
        />
        <StatTile
          label="Длительная просрочка"
          value={longOverdue.length}
          hint={`ТЗ §6.1 п.5: срок нарушен более чем на ${LONG_OVERDUE_HOURS} ч — уведомление руководителю`}
          onClick={() => onOpenList({
            title: 'Длительная просрочка',
            subtitle: `Нарушение срока более чем на ${LONG_OVERDUE_HOURS} ч — требует внимания руководителя (ТЗ §6.1 п.5)`,
            orders: longOverdue,
          })}
        />
        <StatTile
          label="Среднее время реакции"
          value={metrics.avgReactionHours == null ? '—' : metrics.avgReactionHours.toFixed(1)}
          unit={metrics.avgReactionHours == null ? undefined : 'ч'}
          hint="От создания заявки до старта работ"
        />
        <StatTile
          label="Среднее время выполнения"
          value={metrics.avgExecutionHours == null ? '—' : metrics.avgExecutionHours.toFixed(1)}
          unit={metrics.avgExecutionHours == null ? undefined : 'ч'}
          hint="От старта работ до завершения"
        />
        <StatTile
          label="Простой оборудования"
          value={metrics.avgDowntimeHours == null ? '—' : (metrics.avgDowntimeHours / 24).toFixed(1)}
          unit={metrics.avgDowntimeHours == null ? undefined : 'сут'}
          hint={`От фиксации поломки до ввода в эксплуатацию · суммарно ${fmtHours(metrics.totalDowntimeHours)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Топ-5 проблемного оборудования</h3>
          <p className="text-xs text-neutral-500">Узлы и машины с наибольшим числом инцидентов.</p>
          {metrics.topEquipment.length === 0 && (
            <p className="text-sm text-neutral-500">Нарядов пока нет.</p>
          )}
          <div className="flex flex-col gap-2">
            {metrics.topEquipment.map((r) => {
              const orders = data.orders.filter((o) => o.equipmentId === r.equipment.id)
              return (
                <BarCard
                  key={r.equipment.id}
                  value={r.count}
                  valueSuffix="нар."
                  label={r.equipment.name}
                  sublabel={r.area ? `Участок: ${r.area.name}` : 'Участок не задан'}
                  right="Список нарядов →"
                  tone={r.count >= 5 ? 'bad' : 'neutral'}
                  onClick={() => onOpenList({
                    title: `Наряды: ${r.equipment.name}`,
                    subtitle: r.area ? `Оборудование · участок ${r.area.name}` : 'Оборудование',
                    orders,
                  })}
                />
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Лучшие исполнители</h3>
          <p className="text-xs text-neutral-500">Лидеры рейтинга (Раздел 2, оценка Хёффдинга).</p>
          {metrics.topWorkers.length === 0 && (
            <p className="text-sm text-neutral-500">Исполнителей пока нет.</p>
          )}
          <div className="flex flex-col gap-2">
            {metrics.topWorkers.map((r, i) => (
              <BarCard
                key={r.worker.id}
                value={r.score.toFixed(0)}
                valueSuffix="балл"
                label={`${i + 1}. ${r.worker.fullName}`}
                sublabel={`${r.worker.specialty}${r.worker.brigade ? ` · ${r.worker.brigade}` : ''} · закрыто: ${r.closed}`}
                right="Рейтинг →"
                tone="good"
                onClick={() => onGoSection('rating')}
              />
            ))}
          </div>
        </div>
      </div>

      <Note>
        Простой оборудования считается как разница между временем фиксации поломки (созданием
        заявки) и фактическим временем ввода в эксплуатацию (закрытие или сдача наряда).
        Средние значения считаются по всем нарядам с зафиксированными метками времени.
        Текущий простой в работе (сумма по всем ремонтам): {fmtHours(metrics.totalDowntimeHours)}.
      </Note>
    </section>
  )
}
