// Отчёты Мастера (кнопка «Отчёты»).
//
// Верхний левый блок — общие правила работы модуля (периоды, фильтры, выгрузка).
// Центральный блок перечисляет виды отчётов, стрелки ведут к блокам с их
// детальным описанием. Общий фильтр: период (смена/сутки/неделя/месяц/свой),
// участок, оборудование, исполнитель, бригада.
//
// Выгрузка без внешних библиотек: Excel — CSV с BOM и разделителем «;»
// (открывается в Excel), PDF — печать браузера («Сохранить как PDF»),
// печатается только блок активного отчёта (см. @media print в index.css).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { aiTextSummary, type AnomalySummary, type SummaryKind } from '../../lib/ai'
import { createAnonymizer } from '../../lib/anonymize'
import { LLM_MODEL, llmConfigured } from '../../lib/llm'
import * as db from '../../lib/db'
import {
  areaAnomalies, brigadeRatings, downtimeReport, filterPeriod, fmtHours, fmtPercent,
  groupMaterials, materialRows, reportRange, REPORT_PERIODS, repeatFailures, shiftReport,
  total, workerRatings,
  type AnalyticsInput, type MaterialDimension, type ReportPeriodKey,
} from '../../lib/analytics'
import type { FaultCode } from '../../lib/types'
import { Btn, Card, Screen, Select, TextInput } from '../../components/ui'
import {
  defaultOrderColumns, fmtDate, fmtDateTime, makeLookup, Note, OrderTable, SectionHeader,
  StatTile, Toggle,
} from '../head/shared'
import type { MasterData } from './nav'

type ReportKey = 'orders' | 'shift' | 'rating' | 'materials' | 'downtime' | 'anomalies'

const REPORTS: Array<{ key: ReportKey; label: string; hint: string }> = [
  { key: 'orders', label: 'По наряду', hint: 'Список всех закрытых нарядов; при клике открывается детальная информация' },
  { key: 'shift', label: 'За смену', hint: 'Статистика нарядов, загрузка персонала, простои и итоговая сводка ИИ' },
  { key: 'rating', label: 'Рейтинг исполнителей и бригад', hint: 'Оценка эффективности — также как у руководителя' },
  { key: 'materials', label: 'Списанные материалы', hint: 'Списания по материалам, участкам, оборудованию и исполнителям, отклонения от нормы' },
  { key: 'downtime', label: 'Простои оборудования', hint: 'Время простоя каждой единицы, причины по шифрам, доля плановых и внеплановых остановок' },
  { key: 'anomalies', label: 'Аномалии и зависимости', hint: 'Топ проблемного оборудования и участков, повторные отказы, выводы и рекомендации ИИ' },
]

/** Подписи к отчётам для выгрузок. */
const REPORT_TITLE: Record<ReportKey, string> = {
  orders: 'Отчёт по закрытым нарядам',
  shift: 'Отчёт за период: статистика нарядов',
  rating: 'Рейтинг исполнителей и бригад',
  materials: 'Отчёт по списанным материалам',
  downtime: 'Отчёт по простоям оборудования',
  anomalies: 'Отчёт по аномалиям и зависимостям',
}

const MATERIAL_DIMENSIONS: Array<{ key: MaterialDimension; label: string }> = [
  { key: 'material', label: 'Материал' },
  { key: 'area', label: 'Участок' },
  { key: 'equipment', label: 'Оборудование' },
  { key: 'worker', label: 'Исполнитель' },
]

export default function Reports({ data }: { data: MasterData }) {
  // По умолчанию — неделя: сразу видно содержательный отчёт, смену мастер
  // выбирает одним нажатием (смена/сутки/неделя/месяц/произвольный период).
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [areaId, setAreaId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [workerId, setWorkerId] = useState('')
  const [brigade, setBrigade] = useState('')
  const [report, setReport] = useState<ReportKey>('orders')
  const [dimension, setDimension] = useState<MaterialDimension>('material')

  // Справочник шифров и оценки ИИ нужны отчётам (сложность, нормативы, рейтинг).
  const [faultCodes, setFaultCodes] = useState<FaultCode[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  useEffect(() => {
    let alive = true
    void db.listFaultCodes().then((r) => alive && setFaultCodes(r)).catch(() => {})
    void db.listAcceptanceScores().then((r) => alive && setScores(r)).catch(() => {})
    return () => { alive = false }
  }, [])

  const period = useMemo(() => reportRange(periodKey, customFrom, customTo), [periodKey, customFrom, customTo])

  const brigades = useMemo(
    () => [...new Set(data.workers.map((w) => (w.brigade ?? '').trim()).filter(Boolean))].sort(),
    [data.workers],
  )
  const workerById = useMemo(() => new Map(data.workers.map((w) => [w.id, w])), [data.workers])
  const lookup = useMemo(
    () => makeLookup({ areas: data.areas, equipment: data.equipment, workers: data.workers }),
    [data.areas, data.equipment, data.workers],
  )

  // Фильтры по участку/оборудованию/исполнителю/бригаде применяются ко всем отчётам.
  const orders = useMemo(() => data.orders.filter((o) => {
    if (areaId && o.areaId !== areaId) return false
    if (equipmentId && o.equipmentId !== equipmentId) return false
    if (workerId && o.workerId !== workerId) return false
    if (brigade && (workerById.get(o.workerId ?? '')?.brigade ?? '').trim() !== brigade) return false
    return true
  }), [data.orders, areaId, equipmentId, workerId, brigade, workerById])

  const workers = useMemo(
    () => (brigade ? data.workers.filter((w) => (w.brigade ?? '').trim() === brigade) : data.workers),
    [data.workers, brigade],
  )

  const input: AnalyticsInput = useMemo(
    () => ({ orders, workers, areas: data.areas, equipment: data.equipment, faultCodes, scores }),
    [orders, workers, data.areas, data.equipment, faultCodes, scores],
  )

  // ---------- Данные отчётов ----------

  const closedOrders = useMemo(
    () => filterPeriod(orders, period)
      .filter((o) => o.status === 'closed')
      .sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime()),
    [orders, period],
  )
  const shift = useMemo(() => shiftReport(input, period), [input, period])
  const execRatings = useMemo(() => workerRatings(input, period), [input, period])
  const brigRatings = useMemo(() => brigadeRatings(input, period), [input, period])
  const materials = useMemo(() => materialRows(input, period), [input, period])
  const materialGroups = useMemo(
    () => groupMaterials(materials, dimension, 'total'),
    [materials, dimension],
  )
  const downtime = useMemo(() => downtimeReport(input, period), [input, period])
  // Для отчёта об аномалиях оборудование пересортировано по числу нарядов.
  const equipmentIssues = useMemo(
    () => [...downtime.rows].sort((a, b) => b.orders - a.orders),
    [downtime],
  )
  const repeats = useMemo(() => repeatFailures(input, period), [input, period])
  const areas = useMemo(() => areaAnomalies(input, period), [input, period])

  const active = REPORTS.find((r) => r.key === report) ?? REPORTS[0]

  // ---------- Выгрузка ----------

  const exportTable = useMemo((): { head: string[]; rows: Array<Array<string | number>> } => {
    switch (report) {
      case 'orders':
        return {
          head: ['Наряд', 'Закрыт', 'Оборудование', 'Участок', 'Исполнитель', 'Шифр', 'Тип работ'],
          rows: closedOrders.map((o) => [
            o.number,
            fmtDateTime(o.closedAt),
            lookup.equipmentName(o.equipmentId),
            lookup.areaName(o.areaId),
            lookup.workerName(o.workerId),
            o.faultCode ?? '—',
            o.workType === 'planned' ? 'Плановый' : 'Внеплановый',
          ]),
        }
      case 'shift':
        return {
          head: ['Показатель', 'Значение'],
          rows: [
            ['Выдано', shift.issued],
            ['Принято в работу', shift.accepted],
            ['Выполнено (закрыто)', shift.closed],
            ['Просрочено', shift.overdue],
            ['Отклонено', shift.rejected],
            ['Сейчас в работе', shift.inWork],
            ['Среднее время реакции, ч', shift.avgReactionHours?.toFixed(1) ?? '—'],
            ['Среднее время выполнения, ч', shift.avgExecutionHours?.toFixed(1) ?? '—'],
            ['Простой оборудования, ч', shift.downtimeHours.toFixed(1)],
            ...shift.staff.map((s) => [
              `Загрузка: ${s.worker.fullName}`,
              `${s.hours.toFixed(1)} ч${s.loadPercent != null ? ` (${s.loadPercent.toFixed(0)}%)` : ''}`,
            ]),
          ],
        }
      case 'rating':
        return {
          head: ['Бригада', 'Исполнителей', 'Закрыто', 'Отменено', 'Средняя оценка', 'K', 'R увер.', 'Score', 'В срок', 'Балл сложности', 'Отказов'],
          rows: brigRatings.map((b) => [
            b.brigade, b.workers, b.closed, b.cancelled,
            b.avgScore?.toFixed(2) ?? '—', b.k.toFixed(2), b.rConfidence.toFixed(2), b.score.toFixed(1),
            fmtPercent(b.onTimeShare), b.complexityScore, b.refusals,
          ]),
        }
      case 'materials':
        return {
          head: [MATERIAL_DIMENSIONS.find((d) => d.key === dimension)?.label ?? 'Группа', 'Нарядов', 'Факт', 'Норматив', 'Отклонение'],
          rows: materialGroups.map((g) => [
            g.label, g.count,
            total(g.rows.map((r) => r.actual)),
            total(g.rows.map((r) => r.norm)),
            g.value.toFixed(1),
          ]),
        }
      case 'downtime':
        return {
          head: ['Оборудование', 'Участок', 'Нарядов', 'Простой, ч', 'Средний, ч', 'Плановых', 'Внеплановых', 'Причины'],
          rows: downtime.rows.map((r) => [
            r.equipment.name, r.area?.name ?? '—', r.orders, r.totalHours.toFixed(1),
            r.avgHours?.toFixed(1) ?? '—', r.planned, r.unplanned,
            r.causes.map((c) => `${c.code} — ${c.count}`).join('; ') || '—',
          ]),
        }
      case 'anomalies':
        return {
          head: ['Категория', 'Объект', 'Показатель'],
          rows: [
            ...equipmentIssues.slice(0, 5).map((r) => ['Оборудование', r.equipment.name, `${r.orders} нар., простой ${r.totalHours.toFixed(1)} ч`] as Array<string | number>),
            ...areas.filter((a) => a.unplanned > 0).map((a) => ['Участок', a.area.name, `${a.unplanned} внеплановых из ${a.orders}`] as Array<string | number>),
            ...repeats.map((r) => ['Повторный отказ', r.equipment.name, `${r.first.number} → ${r.second.number} через ${r.gapDays.toFixed(1)} дн.`] as Array<string | number>),
          ],
        }
    }
  }, [report, closedOrders, lookup, shift, brigRatings, materialGroups, dimension, downtime, equipmentIssues, areas, repeats])

  const canExport = exportTable.rows.length > 0

  const downloadExcel = useCallback(() => {
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""')
      return /[";\r\n]/.test(s) ? `"${s}"` : s
    }
    const csv = [exportTable.head, ...exportTable.rows].map((r) => r.map(esc).join(';')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${REPORT_TITLE[report]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportTable, report])

  return (
    <Screen title="Отчёты" subtitle="Формирование отчётности по нарядам, персоналу, материалам и простоям">
      {/* ---------- Общие правила работы модуля ---------- */}
      <Card>
        <h3 className="font-semibold">Общие правила работы модуля</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-neutral-600">
          <li>• Отчёты формируются за смену, сутки, неделю, месяц или любой произвольный период.</li>
          <li>• Доступна фильтрация по участку, оборудованию, исполнителю и бригаде.</li>
          <li>• Готовые отчёты можно выгрузить в форматах PDF или Excel.</li>
        </ul>
      </Card>

      {/* ---------- Фильтры ---------- */}
      <div className="flex flex-col gap-3 border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500">Период:</span>
          {REPORT_PERIODS.map((p) => (
            <Toggle key={p.key} active={p.key === periodKey} onClick={() => setPeriodKey(p.key)}>
              {p.label}
            </Toggle>
          ))}
        </div>
        {periodKey === 'custom' && (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              С даты
              <TextInput type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              По дату
              <TextInput type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Участок
            <Select value={areaId} onChange={(e) => { setAreaId(e.target.value); setEquipmentId('') }}>
              <option value="">Все участки</option>
              {data.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Оборудование
            <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              <option value="">Всё оборудование</option>
              {data.equipment
                .filter((eq) => !areaId || eq.areaId === areaId)
                .map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Исполнитель
            <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Все исполнители</option>
              {data.workers.map((w) => <option key={w.id} value={w.id}>{w.fullName}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Бригада
            <Select value={brigade} onChange={(e) => setBrigade(e.target.value)}>
              <option value="">Все бригады</option>
              {brigades.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Период: <b>{period.label}</b> · {period.from ? fmtDate(new Date(period.from).toISOString()) : 'без ограничения'}
          {' — '}{fmtDate(new Date(period.to).toISOString())} · нарядов в выборке: {orders.length}
        </p>
      </div>

      {/* ---------- Центральный блок: виды отчётов ---------- */}
      <div className="flex flex-col gap-2">
        <SectionHeader
          title="Виды отчётов"
          subtitle="Выберите отчёт — стрелка ведёт к блоку с детальным описанием"
          right={
            <span className="flex flex-wrap gap-2">
              <Btn variant="ghost" onClick={downloadExcel} disabled={!canExport}>Выгрузить Excel</Btn>
              <Btn variant="ghost" onClick={() => window.print()} disabled={!canExport}>Выгрузить PDF</Btn>
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setReport(r.key)}
              className={`border p-4 text-left transition-colors ${
                r.key === report
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white hover:border-neutral-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.label}</span>
                <span aria-hidden>→</span>
              </div>
              <div className={`mt-1 text-xs ${r.key === report ? 'opacity-80' : 'text-neutral-500'}`}>
                {r.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Детальный блок выбранного отчёта ---------- */}
      <div data-report-print className="flex flex-col gap-4">
        <div className="border-t-2 border-neutral-900 pt-3">
          <SectionHeader
            title={active.label}
            subtitle={active.hint}
            right={<span className="text-xs text-neutral-500">{REPORT_TITLE[report]}</span>}
          />
        </div>

        {report === 'orders' && (
          <>
            <p className="text-sm text-neutral-500">
              Закрытых нарядов за период: {closedOrders.length}. Нажмите на наряд — откроется детальная информация.
            </p>
            <OrderTable
              columns={defaultOrderColumns(lookup)}
              orders={closedOrders}
              onOpen={(id) => data.go({ screen: 'order', id })}
              emptyText="Закрытых нарядов за выбранный период нет."
            />
          </>
        )}

        {report === 'shift' && <ShiftReportBlock data={data} shift={shift} periodLabel={period.label} />}

        {report === 'rating' && (
          <>
            <Note>
              Также как у руководителя: те же формулы (консервативная оценка Хёффдинга, в срок,
              сложность, отказы) — блок дублирует логику кабинета руководителя для мастера.
            </Note>
            <h4 className="font-semibold">Исполнители</h4>
            <DataTable
              head={['Исполнитель', 'Бригада', 'Закрыто', 'Отменено', 'Средняя', 'K', 'R увер.', 'Score', 'В срок', 'Сложность', 'Отказов']}
              rows={execRatings
                .sort((a, b) => b.score - a.score)
                .map((r) => [
                  r.worker.fullName,
                  r.worker.brigade ?? '—',
                  r.closed,
                  r.cancelled,
                  r.avgScore?.toFixed(2) ?? '—',
                  r.k.toFixed(2),
                  r.rConfidence.toFixed(2),
                  <b key="s">{r.score.toFixed(1)}</b>,
                  fmtPercent(r.onTimeShare),
                  r.complexityScore,
                  r.refusals,
                ])}
              onRow={(i) => {
                const w = execRatings[i]?.worker
                if (w) data.go({ screen: 'dossier', workerId: w.id })
              }}
            />
            <h4 className="mt-2 font-semibold">Бригады</h4>
            <DataTable
              head={['Бригада', 'Исполнителей', 'Закрыто', 'Средняя', 'K', 'R увер.', 'Score', 'В срок', 'Сложность', 'Отказов']}
              rows={brigRatings.map((b) => [
                b.brigade, b.workers, b.closed, b.avgScore?.toFixed(2) ?? '—',
                b.k.toFixed(2), b.rConfidence.toFixed(2), <b key="s">{b.score.toFixed(1)}</b>,
                fmtPercent(b.onTimeShare), b.complexityScore, b.refusals,
              ])}
            />
          </>
        )}

        {report === 'materials' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-500">Разрез:</span>
              {MATERIAL_DIMENSIONS.map((d) => (
                <Toggle key={d.key} active={d.key === dimension} onClick={() => setDimension(d.key)}>
                  {d.label}
                </Toggle>
              ))}
            </div>
            <p className="text-sm text-neutral-500">
              Списаний за период: {materials.length} нарядов. Отклонение от нормы считается по
              материальному нормативу шифра (нормативы ведёт администратор).
            </p>
            <DataTable
              head={[MATERIAL_DIMENSIONS.find((d) => d.key === dimension)?.label ?? 'Группа', 'Нарядов', 'Факт', 'Норматив', 'Отклонение']}
              rows={materialGroups.map((g) => {
                const fact = total(g.rows.map((r) => r.actual))
                const norm = total(g.rows.map((r) => r.norm))
                return [
                  g.label, g.count, fact, norm,
                  <span key="e" className={g.value > 0 ? 'font-semibold text-red-600' : 'text-green-700'}>
                    {g.value > 0 ? '+' : ''}{g.value.toFixed(1)}
                  </span>,
                ]
              })}
              onRow={(i) => {
                const group = materialGroups[i]
                const first = group?.rows[0]
                if (first) data.go({ screen: 'order', id: first.order.id })
              }}
            />
          </>
        )}

        {report === 'downtime' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Общий простой" value={downtime.totalHours.toFixed(1)} unit="ч" hint="Сумма по единицам за период" />
              <StatTile label="Доля плановых" value={fmtPercent(downtime.sharePlanned)} hint="Остановки по плановым работам" />
              <StatTile label="Доля внеплановых" value={fmtPercent(downtime.shareUnplanned)} hint="Аварийные остановки" />
              <StatTile label="Единиц в простое" value={downtime.rows.filter((r) => r.currentHours != null).length} hint="Простой идёт прямо сейчас" />
            </div>
            <DataTable
              head={['Оборудование', 'Участок', 'Нарядов', 'Простой', 'Средний', 'Идёт сейчас', 'Плановых', 'Внеплановых', 'Причины по шифрам']}
              rows={downtime.rows.map((r) => [
                r.equipment.name,
                r.area?.name ?? '—',
                r.orders,
                `${r.totalHours.toFixed(1)} ч`,
                fmtHours(r.avgHours),
                r.currentHours == null ? '—' : `${r.currentHours.toFixed(1)} ч`,
                `${r.planned} (${fmtPercent(r.sharePlanned)})`,
                `${r.unplanned} (${fmtPercent(r.shareUnplanned)})`,
                r.causes.slice(0, 3).map((c) => `${c.code} — ${c.count}`).join('; ') || '—',
              ])}
            />
          </>
        )}

        {report === 'anomalies' && (
          <AnomaliesReportBlock
            data={data}
            equipmentIssues={equipmentIssues}
            areas={areas}
            repeats={repeats}
          />
        )}
      </div>

      <p className="text-xs text-neutral-400">
        Выгрузка: Excel — файл CSV (открывается в Excel, разделитель «;», кодировка UTF-8);
        PDF — печать браузера с сохранением в PDF (печатается только блок активного отчёта).
      </p>
    </Screen>
  )
}

// ---------- Отчёт «За смену» ----------

function ShiftReportBlock({ data, shift, periodLabel }: {
  data: MasterData
  shift: ReturnType<typeof shiftReport>
  periodLabel: string
}) {
  // PDF §9: во внешнюю модель уходят псевдонимы, не ФИО.
  const anon = useMemo(() => createAnonymizer(data.workers), [data.workers])
  const facts = useMemo(() => [
    `Выдано нарядов: ${shift.issued}, принято в работу: ${shift.accepted}, закрыто: ${shift.closed}.`,
    `Просрочено: ${shift.overdue}, отклонено исполнителями: ${shift.rejected}, сейчас в работе: ${shift.inWork}.`,
    `Среднее время реакции: ${shift.avgReactionHours?.toFixed(1) ?? '—'} ч, среднее время выполнения: ${shift.avgExecutionHours?.toFixed(1) ?? '—'} ч.`,
    `Простой оборудования за период: ${shift.downtimeHours.toFixed(1)} ч.`,
    ...shift.staff.slice(0, 3).map((s) => `Загрузка: ${anon.alias(s.worker.id)} — ${s.hours.toFixed(1)} ч${s.loadPercent != null ? ` (${s.loadPercent.toFixed(0)}%)` : ''}, закрыто ${s.closed}.`),
  ], [shift, anon])

  const local = `Правила отчёта за ${periodLabel}: выдано ${shift.issued}, закрыто ${shift.closed}, просрочено ${shift.overdue}, отклонено ${shift.rejected}. Простой: ${shift.downtimeHours.toFixed(1)} ч.`
  const { state, busy, reload } = useAiSummary('shift', facts, local, anon.restore)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Выдано" value={shift.issued} hint="Создано за период" />
        <StatTile label="Выполнено" value={shift.closed} hint="Закрыто мастером за период" />
        <StatTile label="Просрочено" value={shift.overdue} hint="Срок истёк, работы не завершены" />
        <StatTile label="Отклонено" value={shift.rejected} hint="Отказы исполнителей" />
      </div>

      <AiBlock
        title="Итоговая сводка ИИ"
        state={state}
        busy={busy}
        onReload={reload}
        source={llmConfigured ? `Источник: NVIDIA NIM · ${LLM_MODEL}` : 'Источник: правила отчёта (ключ NIM не задан)'}
      />

      <h4 className="font-semibold">Загрузка персонала</h4>
      <DataTable
        head={['Исполнитель', 'Бригада', 'Закрыто за период', 'Открытых нарядов', 'Часов в работе', 'Загрузка']}
        rows={shift.staff.map((s) => [
          s.worker.fullName,
          s.worker.brigade ?? '—',
          s.closed,
          s.active,
          s.hours.toFixed(1),
          s.loadPercent == null ? '—' : `${s.loadPercent.toFixed(0)}%`,
        ])}
        onRow={(i) => {
          const w = shift.staff[i]?.worker
          if (w) data.go({ screen: 'dossier', workerId: w.id })
        }}
      />
      <Note>
        Загрузка = часы работы по закрытым за период нарядам / длительность периода.
        «Просрочено» — состояние на момент отчёта, «отклонено» считается по времени создания
        наряда (отдельной метки отказа в системе нет).
      </Note>
    </>
  )
}

// ---------- Отчёт «Аномалии и зависимости» ----------

function AnomaliesReportBlock({ data, equipmentIssues, areas, repeats }: {
  data: MasterData
  equipmentIssues: ReturnType<typeof downtimeReport>['rows']
  areas: ReturnType<typeof areaAnomalies>
  repeats: ReturnType<typeof repeatFailures>
}) {
  const facts = useMemo(() => [
    ...equipmentIssues.slice(0, 3).map((r) => `Проблемное оборудование «${r.equipment.name}»: ${r.orders} нарядов, простой ${r.totalHours.toFixed(1)} ч, внеплановых ${r.unplanned}.`),
    ...areas.filter((a) => a.unplanned > 0).slice(0, 3).map((a) => `Участок «${a.area.name}»: ${a.unplanned} внеплановых из ${a.orders} нарядов, повторов ${a.repeat}.`),
    ...repeats.slice(0, 3).map((r) => `Повторный отказ на «${r.equipment.name}»: ${r.first.number} → ${r.second.number} через ${r.gapDays.toFixed(1)} дн.`),
  ], [equipmentIssues, areas, repeats])

  const local = facts.length === 0
    ? 'Аномалий и повторных отказов за выбранный период не выявлено.'
    : `Выявлено проблем: ${facts.length}. ` + facts.slice(0, 4).join(' ')
  const { state, busy, reload } = useAiSummary('recommendations', facts, local)

  return (
    <>
      <h4 className="font-semibold">Топ проблемного оборудования</h4>
      <DataTable
        head={['Оборудование', 'Участок', 'Нарядов', 'Простой', 'Плановых', 'Внеплановых', 'Частая причина']}
        rows={equipmentIssues.slice(0, 5).map((r) => [
          r.equipment.name,
          r.area?.name ?? '—',
          r.orders,
          `${r.totalHours.toFixed(1)} ч`,
          r.planned,
          <span key="u" className={r.unplanned > 0 ? 'font-semibold text-red-600' : ''}>{r.unplanned}</span>,
          r.causes[0] ? `${r.causes[0].code} — ${r.causes[0].count}` : '—',
        ])}
      />

      <h4 className="mt-2 font-semibold">Топ проблемных участков</h4>
      <DataTable
        head={['Участок', 'Нарядов', 'Внеплановых', 'Единиц оборудования', 'Повторных отказов', 'Простой']}
        rows={areas.map((a) => [
          a.area.name, a.orders, a.unplanned, a.equipment, a.repeat, `${a.downtimeHours.toFixed(1)} ч`,
        ])}
      />

      <h4 className="mt-2 font-semibold">Повторные отказы (≤ 7 дней)</h4>
      <DataTable
        head={['Оборудование', 'Участок', 'Первый наряд', 'Повторный наряд', 'Интервал']}
        rows={repeats.map((r) => [
          r.equipment.name,
          r.area?.name ?? '—',
          `${r.first.number} (${fmtDate(r.first.createdAt)})`,
          `${r.second.number} (${fmtDate(r.second.createdAt)})`,
          `${r.gapDays.toFixed(1)} дн.`,
        ])}
        onRow={(i) => {
          const r = repeats[i]
          if (r) data.go({ screen: 'order', id: r.second.id })
        }}
      />

      <AiBlock
        title="Выводы и рекомендации ИИ"
        state={state}
        busy={busy}
        onReload={reload}
        source={llmConfigured ? `Источник: NVIDIA NIM · ${LLM_MODEL}` : 'Источник: правила анализа (ключ NIM не задан)'}
      />
    </>
  )
}

// ---------- Общие блоки ----------

/** ИИ-сводка: считается по фактам, обновляется кнопкой. */
function useAiSummary(kind: SummaryKind, facts: string[], local: string, restore?: (text: string) => string) {
  const key = facts.join('\u0000')
  const [state, setState] = useState<AnomalySummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setBusy(true)
    void aiTextSummary(kind, facts, local, restore)
      .then((s) => { if (alive) setState(s) })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
    // key — содержимое фактов, локальный текст — строки: замыкание не пересоздаётся
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, local, tick])
  return { state, busy, reload: () => setTick((n) => n + 1) }
}

function AiBlock({ title, state, busy, onReload, source }: {
  title: string
  state: AnomalySummary | null
  busy: boolean
  onReload: () => void
  source: string
}) {
  return (
    <div className="border border-neutral-900 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{title}</h4>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{source}</span>
          <Btn variant="ghost" onClick={onReload} disabled={busy}>{busy ? 'ИИ…' : 'Обновить'}</Btn>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-neutral-800">
        {state ? state.text : busy ? 'Формируется…' : 'Нет данных.'}
      </p>
    </div>
  )
}

function DataTable({ head, rows, onRow }: {
  head: string[]
  rows: ReactNode[][]
  onRow?: (index: number) => void
}) {
  if (rows.length === 0) {
    return <p className="border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">Данных за выбранный период нет.</p>
  }
  return (
    <div className="overflow-x-auto border border-neutral-200">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            {head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              onClick={onRow ? () => onRow(i) : undefined}
              className={`border-b border-neutral-100 last:border-0 ${onRow ? 'cursor-pointer transition-colors hover:bg-neutral-50' : ''}`}
            >
              {r.map((c, j) => <td key={j} className="px-3 py-2.5 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
