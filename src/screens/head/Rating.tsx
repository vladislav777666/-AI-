// Раздел 2. Рейтинг — оценка эффективности исполнителей.
// Глобальный фильтр периода/смены + пять переключаемых представлений.

import { useMemo, useState } from 'react'
import {
  filterPeriod, fmtNum, fmtPercent, PERIOD_OPTIONS, periodLabel, periodRange,
  workerRatings, type AnalyticsInput, type PeriodKey, type RatingRow,
} from '../../lib/analytics'
import { Note, SectionHeader, Toggle } from './shared'
import type { HeadData, HeadListRequest } from './nav'

type ViewId = 1 | 2 | 3 | 4 | 5

const VIEWS: Array<{ id: ViewId; label: string; hint: string }> = [
  { id: 1, label: '1. Рейтинг (Хёффдинг)', hint: 'По убыванию консервативной оценки' },
  { id: 2, label: '2. В срок', hint: 'Доля нарядов, выполненных в срок' },
  { id: 3, label: '3. Возвраты', hint: 'Доработка или повторная поломка в течение 7 дней' },
  { id: 4, label: '4. Количество и сложность', hint: 'Балл = Σ сложность закрытых нарядов' },
  { id: 5, label: '5. Отказы', hint: 'Отказы от нарядов без уважительной причины' },
]

export default function Rating({ data, onOpenList }: {
  data: HeadData
  onOpenList: (req: HeadListRequest) => void
}) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d')
  const [view, setView] = useState<ViewId>(1)

  const period = useMemo(() => periodRange(periodKey), [periodKey])
  const rows = useMemo(() => {
    const input: AnalyticsInput = {
      orders: data.orders, workers: data.workers, areas: data.areas,
      equipment: data.equipment, faultCodes: data.faultCodes, scores: data.scores,
    }
    return workerRatings(input, period)
  }, [data.orders, data.workers, data.areas, data.equipment, data.faultCodes, data.scores, period])

  const sorted = useMemo(() => {
    const copy = [...rows]
    switch (view) {
      case 1: return copy.sort((a, b) => b.score - a.score)
      case 2: return copy.sort((a, b) => (b.onTimeShare ?? -1) - (a.onTimeShare ?? -1))
      case 3: return copy.sort((a, b) => b.returnShare - a.returnShare)
      case 4: return copy.sort((a, b) => b.complexityScore - a.complexityScore)
      case 5: return copy.sort((a, b) => b.unjustifiedRefusals - a.unjustifiedRefusals || b.refusals - a.refusals)
    }
  }, [rows, view])

  function drill(r: RatingRow) {
    const orders = filterPeriod(data.orders, period).filter((o) => o.workerId === r.worker.id)
    onOpenList({
      title: `Наряды: ${r.worker.fullName}`,
      subtitle: `${r.worker.specialty}${r.worker.brigade ? ` · ${r.worker.brigade}` : ''} · период: ${periodLabel(periodKey)}`,
      note: 'Список нарядов исполнителя за выбранный период. Нажмите на наряд, чтобы открыть детальную информацию.',
      orders,
    })
  }

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title="Рейтинг"
        subtitle="Оценка эффективности подразделений, бригад и исполнителей · Раздел 2"
        right={<Toggle active={false} onClick={() => void data.refresh()}>Обновить</Toggle>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-neutral-500">Период:</span>
        {PERIOD_OPTIONS.map((k) => (
          <Toggle key={k} active={k === periodKey} onClick={() => setPeriodKey(k)}>
            {periodLabel(k)}
          </Toggle>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Toggle key={v.id} active={v.id === view} onClick={() => setView(v.id)}>
            {v.label}
          </Toggle>
        ))}
      </div>

      <p className="text-sm text-neutral-500">{VIEWS.find((v) => v.id === view)?.hint}</p>

      {sorted.length === 0 ? (
        <p className="border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          Исполнителей пока нет.
        </p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2 font-medium">№</th>
                <th className="px-3 py-2 font-medium">Исполнитель</th>
                {view === 1 && (<>
                  <th className="px-3 py-2 text-right font-medium">C (закрыто)</th>
                  <th className="px-3 py-2 text-right font-medium">X (отменено)</th>
                  <th className="px-3 py-2 text-right font-medium">K</th>
                  <th className="px-3 py-2 text-right font-medium">R</th>
                  <th className="px-3 py-2 text-right font-medium">R увер.</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                </>)}
                {view === 2 && (<>
                  <th className="px-3 py-2 text-right font-medium">В срок</th>
                  <th className="px-3 py-2 text-right font-medium">Выполнено в срок / закрыто</th>
                </>)}
                {view === 3 && (<>
                  <th className="px-3 py-2 text-right font-medium">Доля возвратов</th>
                  <th className="px-3 py-2 text-right font-medium">Возвратов / закрыто</th>
                </>)}
                {view === 4 && (<>
                  <th className="px-3 py-2 text-right font-medium">Балл сложности</th>
                  <th className="px-3 py-2 text-right font-medium">Закрыто</th>
                  <th className="px-3 py-2 text-right font-medium">Средняя сложность</th>
                </>)}
                {view === 5 && (<>
                  <th className="px-3 py-2 text-right font-medium">Без причины</th>
                  <th className="px-3 py-2 text-right font-medium">Всего отказов</th>
                </>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={r.worker.id}
                  onClick={() => drill(r)}
                  className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
                >
                  <td className="px-3 py-2.5 tabular-nums text-neutral-400">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.worker.fullName}</div>
                    <div className="text-xs text-neutral-500">
                      {[r.worker.specialty, r.worker.rank, r.worker.brigade].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  {view === 1 && (<>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.closed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.cancelled}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.k.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.avgScore == null ? '—' : r.avgScore.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.rConfidence.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{r.score.toFixed(1)}</td>
                  </>)}
                  {view === 2 && (<>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPercent(r.onTimeShare)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">
                      {r.onTimeShare == null ? '—' : `${Math.round(r.onTimeShare * r.closed)} / ${r.closed}`}
                    </td>
                  </>)}
                  {view === 3 && (<>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPercent(r.returnShare)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">{r.returns} / {r.closed}</td>
                  </>)}
                  {view === 4 && (<>
                    <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{fmtNum(r.complexityScore)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.closed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">
                      {r.closed > 0 ? (r.complexityScore / r.closed).toFixed(2) : '—'}
                    </td>
                  </>)}
                  {view === 5 && (<>
                    <td className="px-3 py-2.5 text-right text-base font-semibold tabular-nums">{r.unjustifiedRefusals}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">{r.refusals}</td>
                  </>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 1 && (
        <Note>
          Консервативная оценка Хёффдинга: K = C/(C+X+U+0,5·J), где C — закрытые наряды,
          X — отменённые, U — отказы без указанной причины, J — отказы с причиной
          (документированный отказ весит вдвое меньше, но тоже снижает надёжность);
          R — средняя оценка закрытых нарядов (1..5), R увер. = Avg − 4·√(ln10 / 2C);
          Score = 100·(0.7·(R увер. − 1)/4 + 0.3·K). Чем больше закрытых нарядов, тем выше нижняя
          граница оценки — редкие оценки не дают завышенного рейтинга.
        </Note>
      )}
      {view === 3 && (
        <Note>
          Возврат — повторное обращение по тому же оборудованию в течение 7 дней (доработка по
          приёмке или повторная поломка). Доля возвратов = возвраты / закрытые наряды.
        </Note>
      )}
      {view === 4 && (
        <Note>
          Сложность берётся из справочника шифров (ведёт администратор: Справочники → Шифры
          неисправности, коэффициент 1..5): общий балл = Σ сложность каждого закрытого наряда.
        </Note>
      )}
      {view === 5 && (
        <Note>
          Отказ без уважительной причины — наряд в статусе «Отклонён», у которого не указана
          причина отказа. Отказы с заполненной причиной учитываются отдельно (всего отказов).
        </Note>
      )}
    </section>
  )
}
