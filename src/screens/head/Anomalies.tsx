// Раздел 3. Аномалии и аналитика.
// Главный экран — сильнейшие аномалии по категориям + текстовая сводка ИИ;
// подкатегории: 3.1 плановые работы, 3.2 бригады, 3.3 участки и оборудование,
// 3.4 по материалам. Общий паттерн: клик по элементу → список нарядов,
// клик по наряду → детальная информация.

import { useEffect, useMemo, useState } from 'react'
import { anomalySummaryLLM } from '../../lib/ai'
import { LLM_MODEL, llmConfigured } from '../../lib/llm'
import {
  brigadeAnomalies, dimensionLabel, equipmentAnomalies, groupMaterials, materialRows,
  periodRange, plannedAnomalies, plannedFollowers, sortOrdersByDate,
  type AnalyticsInput, type MaterialDimension, type MaterialMetric, type MaterialRow,
  type PlannedFollower,
} from '../../lib/analytics'
import type { WorkOrder } from '../../lib/types'
import { Btn, Select } from '../../components/ui'
import {
  BarCard, defaultOrderColumns, fmtDate, fmtDateTime, makeLookup, Note, OrderTable,
  SectionHeader, Toggle, type OrderColumn,
} from './shared'
import type { HeadData, HeadListRequest } from './nav'

type View = 'home' | 'planned' | 'brigades' | 'equipment' | 'materials'

const SUBTABS: Array<{ key: Exclude<View, 'home'>; label: string; hint: string }> = [
  { key: 'planned', label: '3.1. Плановые работы', hint: 'Внеплановые ремонты в течение недели после плановой работы' },
  { key: 'brigades', label: '3.2. Бригады', hint: 'Бригады и внеплановые после их плановых работ' },
  { key: 'equipment', label: '3.3. Участки и оборудование', hint: 'Превышения и понижения по локациям и агрегатам' },
  { key: 'materials', label: '3.4. По материалам', hint: 'Перерасход ТМЦ против материального норматива' },
]

export default function Anomalies({ data, onOpenOrder, onOpenList }: {
  data: HeadData
  onOpenOrder: (id: string) => void
  onOpenList: (req: HeadListRequest) => void
}) {
  const [view, setView] = useState<View>('home')
  const lookup = useMemo(() => makeLookup(data), [data.areas, data.equipment, data.workers])

  const input: AnalyticsInput = useMemo(() => ({
    orders: data.orders, workers: data.workers, areas: data.areas,
    equipment: data.equipment, faultCodes: data.faultCodes, scores: data.scores,
  }), [data.orders, data.workers, data.areas, data.equipment, data.faultCodes, data.scores])

  const planned = useMemo(() => plannedAnomalies(input), [input])
  const followers = useMemo(() => plannedFollowers(input), [input])
  const brigades = useMemo(() => brigadeAnomalies(input), [input])
  const eqStats = useMemo(() => equipmentAnomalies(input, periodRange('all')), [input])
  const materials = useMemo(() => materialRows(input, periodRange('all')), [input])

  // Факты для ИИ-сводки: сильнейшая аномалия каждой категории.
  const facts = useMemo(() => {
    const out: string[] = []
    if (planned[0]) {
      out.push(`Плановая работа «${planned[0].code}» (${planned[0].name}): ${planned[0].count} внеплановых ремонтов в течение недели после завершения.`)
    }
    if (brigades[0]) {
      out.push(`Бригада «${brigades[0].brigade}»: после её плановой работы ${brigades[0].count} внеплановых ремонтов по тому же оборудованию и участку.`)
    }
    if (eqStats.top[0]) {
      out.push(`Оборудование «${eqStats.top[0].equipment.name}»: ${eqStats.top[0].unplanned} внеплановых нарядов при среднем ${eqStats.average.toFixed(1)} на единицу.`)
    }
    const over = [...materials].filter((r) => r.excess > 0).sort((a, b) => b.excess - a.excess)[0]
    if (over) {
      out.push(`Максимальный перерасход ТМЦ: шифр ${over.faultCode} на «${over.equipmentName}» — ${over.actual} при нормативе ${over.norm}.`)
    }
    return out
  }, [planned, brigades, eqStats, materials])

  const [summary, setSummary] = useState<{ text: string; source: 'nim' | 'local' } | null>(null)
  const [sumLoading, setSumLoading] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setSumLoading(true)
    void anomalySummaryLLM(facts)
      .then((s) => { if (alive) setSummary(s) })
      .finally(() => { if (alive) setSumLoading(false) })
    return () => { alive = false }
  }, [facts, reload])

  // ---------- Drill-down: списки нарядов (общий паттерн ТЗ) ----------

  function openPlannedFollowers(list: PlannedFollower[], title: string) {
    const byOrder = new Map(list.map((f) => [f.unplanned.id, f]))
    const columns: OrderColumn[] = [
      {
        head: 'Наряд',
        cell: (o) => (<div><div className="font-medium">{o.number}</div><div className="text-xs text-neutral-500">{fmtDate(o.createdAt)}</div></div>),
      },
      { head: 'Оборудование', cell: (o) => lookup.equipmentName(o.equipmentId) },
      { head: 'Участок', cell: (o) => lookup.areaName(o.areaId) },
      { head: 'Шифр неисправности', cell: (o) => <span className="font-mono">{o.faultCode ?? '—'}</span> },
      { head: 'Плановая работа', cell: (o) => <span className="font-mono">{byOrder.get(o.id)?.planned.faultCode ?? '—'}</span> },
      {
        head: 'Разница в датах',
        cell: (o) => {
          const gap = byOrder.get(o.id)?.gapDays
          return gap == null ? '—' : `${gap.toFixed(1)} дн. после планового`
        },
      },
    ]
    onOpenList({ title, subtitle: 'Внеплановые наряды после плановой работы', orders: list.map((f) => f.unplanned), columns })
  }

  function openMaterialOrders(rows: MaterialRow[], title: string) {
    const byOrder = new Map(rows.map((r) => [r.order.id, r]))
    const columns: OrderColumn[] = [
      {
        head: 'Наряд',
        cell: (o) => (<div><div className="font-medium">{o.number}</div><div className="text-xs text-neutral-500">{fmtDate(o.createdAt)}</div></div>),
      },
      { head: 'Оборудование', cell: (o) => lookup.equipmentName(o.equipmentId) },
      { head: 'Участок', cell: (o) => lookup.areaName(o.areaId) },
      { head: 'Шифр неисправности', cell: (o) => <span className="font-mono">{o.faultCode ?? '—'}</span> },
      { head: 'Норматив', cell: (o) => byOrder.get(o.id)?.norm ?? '—' },
      { head: 'Факт', cell: (o) => byOrder.get(o.id)?.actual ?? '—' },
      {
        head: 'Отклонение',
        cell: (o) => {
          const e = byOrder.get(o.id)?.excess
          if (e == null) return '—'
          return <span className={e > 0 ? 'font-semibold text-red-600' : 'text-green-700'}>{e > 0 ? '+' : ''}{e}</span>
        },
      },
      { head: 'Материалы', cell: (o) => (o.materialsList ?? []).map((m) => `${m.name} × ${m.qty} ${m.unit}`).join(', ') || '—' },
    ]
    onOpenList({ title, subtitle: 'Сравнение материального норматива и реальных затрат', orders: rows.map((r) => r.order), columns })
  }

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title="Аномалии и аналитика"
        subtitle="Глубокий анализ инцидентов · Раздел 3"
        right={<Btn variant="ghost" onClick={() => void data.refresh()}>Обновить</Btn>}
      />

      <div className="flex flex-wrap gap-2">
        <Toggle active={view === 'home'} onClick={() => setView('home')}>Обзор</Toggle>
        {SUBTABS.map((t) => (
          <Toggle key={t.key} active={view === t.key} onClick={() => setView(t.key)}>{t.label}</Toggle>
        ))}
      </div>

      {/* ---------- Главный экран раздела ---------- */}
      {view === 'home' && (
        <>
          <div className="border border-neutral-900 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Текстовая сводка ИИ</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {llmConfigured
                    ? `Источник: NVIDIA NIM · ${LLM_MODEL}`
                    : 'Источник: правила анализа (ключ NIM не задан)'}
                </span>
                <Btn variant="ghost" onClick={() => setReload((n) => n + 1)} disabled={sumLoading}>
                  {sumLoading ? 'ИИ…' : 'Обновить сводку'}
                </Btn>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-800">
              {summary ? summary.text : sumLoading ? 'Формируется…' : 'Нет данных.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">Сильнейшие аномалии по категориям</h3>
            {facts.length === 0 && <p className="text-sm text-neutral-500">Аномалий не выявлено.</p>}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {planned[0] && (
                <BarCard value={planned[0].count} valueSuffix="внепл." label={`3.1 Плановые: ${planned[0].code}`}
                  sublabel={planned[0].name} right="Подробнее →" tone="bad"
                  onClick={() => setView('planned')} />
              )}
              {brigades[0] && (
                <BarCard value={brigades[0].count} valueSuffix="внепл." label={`3.2 Бригада: ${brigades[0].brigade}`}
                  sublabel="внеплановые после плановых работ" right="Подробнее →" tone="bad"
                  onClick={() => setView('brigades')} />
              )}
              {eqStats.top[0] && (
                <BarCard value={eqStats.top[0].unplanned} valueSuffix="нар." label={`3.3 Оборудование: ${eqStats.top[0].equipment.name}`}
                  sublabel={eqStats.top[0].area ? `Участок: ${eqStats.top[0].area.name}` : 'Участок не задан'}
                  right="Подробнее →" tone="bad" onClick={() => setView('equipment')} />
              )}
              <BarCard
                value={[...materials].filter((r) => r.excess > 0).reduce((a, r) => a + r.excess, 0)}
                valueSuffix="ед."
                label="3.4 По материалам"
                sublabel={`превышений норматива: ${materials.filter((r) => r.excess > 0).length}`}
                right="Подробнее →" tone="bad" onClick={() => setView('materials')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SUBTABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setView(t.key)}
                className="border border-neutral-900 bg-white px-6 py-5 text-left transition-colors hover:bg-neutral-900 hover:text-white">
                <div className="text-lg font-medium">{t.label}</div>
                <div className="mt-1 text-sm opacity-70">{t.hint}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------- 3.1 Плановые работы ---------- */}
      {view === 'planned' && (
        <>
          <h3 className="text-lg font-semibold">3.1. Плановые работы</h3>
          <p className="text-xs text-neutral-500">{SUBTABS[0].hint}.</p>

          <div className="flex flex-col gap-2">
            <h4 className="font-semibold">Аномалии (по убыванию)</h4>
            {planned.length === 0 && <p className="text-sm text-neutral-500">Аномалий нет.</p>}
            {planned.map((a) => (
              <BarCard key={a.code} value={a.count} valueSuffix="внепл." label={`Шифр планового: ${a.code}`}
                sublabel={a.name} right="Список внеплановых →" tone={a.count >= 2 ? 'bad' : 'neutral'}
                valueSide="right"
                onClick={() => openPlannedFollowers(a.followers, `Внеплановые после плановой ${a.code}`)} />
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="font-semibold">Список последних внеплановых после плановых</h4>
            {followers.length === 0 && <p className="text-sm text-neutral-500">Связанных нарядов нет.</p>}
            {followers.slice(0, 20).map((f) => (
              <BarCard key={f.unplanned.id} value={f.gapDays.toFixed(1)} valueSuffix="дн."
                label={`Внеплановый ${f.unplanned.faultCode ?? '—'}`}
                sublabel={`после планового ${f.planned.faultCode ?? '—'} · ${lookup.equipmentName(f.unplanned.equipmentId)}`}
                right={fmtDate(f.unplanned.createdAt)}
                onClick={() => openPlannedFollowers([f], `Внеплановый после планового ${f.planned.faultCode ?? '—'}`)} />
            ))}
          </div>

          <Note>
            Аномалия — внеплановый наряд по тому же оборудованию и участку, созданный в течение
            недели после завершения плановой работы. Разница в датах считается от завершения
            планового до создания внепланового.
          </Note>
        </>
      )}

      {/* ---------- 3.2 Бригады ---------- */}
      {view === 'brigades' && (
        <>
          <h3 className="text-lg font-semibold">3.2. Бригады</h3>
          <p className="text-xs text-neutral-500">{SUBTABS[1].hint}.</p>
          {brigades.length === 0 && <p className="text-sm text-neutral-500">Данных нет.</p>}
          <div className="flex flex-col gap-2">
            {brigades.map((b) => (
              <BarCard key={b.brigade} value={b.count} valueSuffix="внепл." label={b.brigade}
                sublabel="внеплановые в течение недели после плановой работы бригады"
                right="Аномальные наряды →" tone={b.count >= 2 ? 'bad' : 'neutral'}
                valueSide="right"
                onClick={() => openPlannedFollowers(b.followers, `Аномальные наряды: ${b.brigade}`)} />
            ))}
          </div>
          <Note>
            Бригада определяется по исполнителю плановой работы. Учитываются внеплановые наряды по
            тому же оборудованию и участку в течение недели после завершения её планового наряда.
          </Note>
        </>
      )}

      {/* ---------- 3.3 Участки и оборудование ---------- */}
      {view === 'equipment' && (
        <EquipmentSection data={data} eq={eqStats} lookup={lookup} onOpenOrder={onOpenOrder} onOpenList={onOpenList} />
      )}

      {/* ---------- 3.4 По материалам ---------- */}
      {view === 'materials' && (
        <MaterialsSection
          data={data}
          rows={materials}
          onOpenOrder={onOpenOrder}
          onOpenMaterialOrders={openMaterialOrders}
        />
      )}
    </section>
  )
}

// ---------- 3.3 Участки и оборудование ----------

function EquipmentSection({ data, eq, lookup, onOpenOrder, onOpenList }: {
  data: HeadData
  eq: ReturnType<typeof equipmentAnomalies>
  lookup: ReturnType<typeof makeLookup>
  onOpenOrder: (id: string) => void
  onOpenList: (req: HeadListRequest) => void
}) {
  const [dir, setDir] = useState<'new' | 'old'>('new')
  const all = useMemo(() => sortOrdersByDate(data.orders, dir), [data.orders, dir])
  const columns = useMemo(() => defaultOrderColumns(lookup), [lookup])

  function openEquipment(name: string, orders: WorkOrder[]) {
    onOpenList({ title: `Наряды: ${name}`, subtitle: 'Оборудование', orders })
  }

  return (
    <>
      <h3 className="text-lg font-semibold">3.3. Участки и оборудование</h3>
      <p className="text-xs text-neutral-500">
        Средний уровень внеплановых нарядов на единицу оборудования — {eq.average.toFixed(1)}.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold">Топ превышений</h4>
          {eq.top.length === 0 && <p className="text-sm text-neutral-500">Превышений нет.</p>}
          {eq.top.map((r) => (
            <BarCard key={r.equipment.id} value={r.unplanned} valueSuffix="внепл."
              label={r.equipment.name}
              sublabel={`${r.area ? r.area.name : 'Участок не задан'} · шифр: ${r.topFault ?? '—'}`}
              right={`+${r.excess.toFixed(1)} к среднему`} tone="bad" valueSide="right"
              onClick={() => openEquipment(r.equipment.name, data.orders.filter((o) => o.equipmentId === r.equipment.id))} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold">Топ понижений</h4>
          {eq.bottom.length === 0 && <p className="text-sm text-neutral-500">Данных нет.</p>}
          {eq.bottom.map((r) => (
            <BarCard key={r.equipment.id} value={r.unplanned} valueSuffix="внепл."
              label={r.equipment.name}
              sublabel={`${r.area ? r.area.name : 'Участок не задан'} · шифр: ${r.topFault ?? '—'}`}
              right={`${r.excess.toFixed(1)} к среднему`} tone={r.excess < 0 ? 'good' : 'neutral'} valueSide="right"
              onClick={() => openEquipment(r.equipment.name, data.orders.filter((o) => o.equipmentId === r.equipment.id))} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Список всех нарядов</h4>
          <div className="flex gap-2">
            <Toggle active={dir === 'new'} onClick={() => setDir('new')}>Новейшие</Toggle>
            <Toggle active={dir === 'old'} onClick={() => setDir('old')}>Старейшие</Toggle>
          </div>
        </div>
        <OrderTable columns={columns} orders={all} onOpen={onOpenOrder} />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="font-semibold">Аномалии</h4>
        {eq.rows.filter((r) => Math.abs(r.excess) >= 0.5).length === 0 && (
          <p className="text-sm text-neutral-500">Отклонений нет.</p>
        )}
        {eq.rows.filter((r) => Math.abs(r.excess) >= 0.5).map((r) => (
          <BarCard key={r.equipment.id} value={`${r.excess > 0 ? '+' : ''}${r.excess.toFixed(1)}`} valueSuffix="к сред."
            label={r.equipment.name}
            sublabel={`${r.area ? r.area.name : 'Участок не задан'} · внеплановых ${r.unplanned}, плановых ${r.planned} · шифр ${r.topFault ?? '—'}`}
            right="Список нарядов →" tone={r.excess > 0 ? 'bad' : 'good'} valueSide="right"
            onClick={() => openEquipment(r.equipment.name, data.orders.filter((o) => o.equipmentId === r.equipment.id))} />
        ))}
      </div>
    </>
  )
}

// ---------- 3.4 По материалам ----------

const DIMENSIONS: MaterialDimension[] = ['material', 'worker', 'fault', 'area', 'equipment']
const METRICS: Array<{ key: MaterialMetric; label: string }> = [
  { key: 'avg', label: 'Среднее' },
  { key: 'max', label: 'Максимальное' },
  { key: 'total', label: 'Общее' },
]

function MaterialsSection({ data, rows, onOpenOrder, onOpenMaterialOrders }: {
  data: HeadData
  rows: MaterialRow[]
  onOpenOrder: (id: string) => void
  onOpenMaterialOrders: (rows: MaterialRow[], title: string) => void
}) {
  const [dim, setDim] = useState<MaterialDimension>('material')
  const [metric, setMetric] = useState<MaterialMetric>('total')
  const [dir, setDir] = useState<'new' | 'old'>('new')
  const [filters, setFilters] = useState({
    workerId: '', faultCode: '', material: '', excess: 'all', areaId: '', equipmentId: '',
  })

  const materialNames = useMemo(
    () => [...new Set(rows.map((r) => r.material).filter((m): m is string => !!m))].sort(),
    [rows],
  )

  const excessFilter = filters.excess || 'all'
  const filtered = useMemo(() => rows.filter((r) =>
    (!filters.workerId || r.workerId === filters.workerId) &&
    (!filters.faultCode || r.faultCode === filters.faultCode) &&
    (!filters.material || r.material === filters.material) &&
    (!filters.areaId || r.areaId === filters.areaId) &&
    (!filters.equipmentId || r.equipmentId === filters.equipmentId) &&
    (excessFilter === 'all' || (excessFilter === 'over' ? r.excess > 0 : r.excess < 0)),
  ), [rows, filters, excessFilter])

  const groups = useMemo(() => groupMaterials(filtered, dim, metric), [filtered, dim, metric])
  const top = groups.filter((g) => g.value > 0)
  // Обратная сортировка (ТЗ 3.4): только реальная экономия против норматива,
  // чтобы не дублировать превышения теми же группами в обратном порядке.
  const bottom = [...groups].filter((g) => g.value < 0).sort((a, b) => a.value - b.value).slice(0, 8)
  const allOrders = useMemo(() => sortOrdersByDate(filtered.map((r) => r.order), dir), [filtered, dir])

  function set<K extends keyof typeof filters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const sql = (label: string, value: string, onChange: (v: string) => void, options: Array<{ id: string; name: string }>) => (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      {label}
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Все</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
    </label>
  )

  return (
    <>
      <h3 className="text-lg font-semibold">3.4. По материалам</h3>
      <p className="text-xs text-neutral-500">
        Перерасход ТМЦ против материального норматива шифра (нормативы ведёт администратор).
      </p>

      <div className="grid grid-cols-2 gap-3 border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-3 lg:grid-cols-6">
        {sql('Исполнитель', filters.workerId, (v) => set('workerId', v),
          data.workers.map((w) => ({ id: w.id, name: w.fullName })))}
        {sql('Шифр', filters.faultCode, (v) => set('faultCode', v),
          data.faultCodes.map((f) => ({ id: f.code, name: f.code })))}
        {sql('Материал', filters.material, (v) => set('material', v),
          materialNames.map((n) => ({ id: n, name: n })))}
        {sql('Превышение', filters.excess, (v) => set('excess', v), [
          { id: 'over', name: 'Только превышения' },
          { id: 'under', name: 'Только экономия' },
        ])}
        {sql('Участок', filters.areaId, (v) => set('areaId', v),
          data.areas.map((a) => ({ id: a.id, name: a.name })))}
        {sql('Оборудование', filters.equipmentId, (v) => set('equipmentId', v),
          data.equipment.map((e) => ({ id: e.id, name: e.name })))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-500">Группировать по:</span>
        {DIMENSIONS.map((d) => (
          <Toggle key={d} active={d === dim} onClick={() => setDim(d)}>{dimensionLabel(d)}</Toggle>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-500">Тип превышения:</span>
        {METRICS.map((m) => (
          <Toggle key={m.key} active={m.key === metric} onClick={() => setMetric(m.key)}>{m.label}</Toggle>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold">Топ превышений</h4>
          {top.length === 0 && <p className="text-sm text-neutral-500">Превышений нет.</p>}
          {top.slice(0, 8).map((g) => (
            <BarCard key={g.key} value={g.value.toFixed(1)} valueSuffix="ед."
              label={g.label} sublabel={g.sublabel} right="Список нарядов →" tone="bad"
              onClick={() => onOpenMaterialOrders(g.rows, `${dimensionLabel(dim)}: ${g.label}`)} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold">Топ понижений</h4>
          {bottom.length === 0 && <p className="text-sm text-neutral-500">Экономии против норматива нет.</p>}
          {bottom.map((g) => (
            <BarCard key={g.key} value={g.value.toFixed(1)} valueSuffix="ед."
              label={g.label} sublabel={g.sublabel} right="Список нарядов →"
              tone={g.value < 0 ? 'good' : 'neutral'}
              onClick={() => onOpenMaterialOrders(g.rows, `${dimensionLabel(dim)}: ${g.label}`)} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">Список всех нарядов <span className="text-sm font-normal text-neutral-500">({filtered.length})</span></h4>
          <div className="flex gap-2">
            <Toggle active={dir === 'new'} onClick={() => setDir('new')}>Новейшие</Toggle>
            <Toggle active={dir === 'old'} onClick={() => setDir('old')}>Старейшие</Toggle>
          </div>
        </div>
        <MaterialsTable rows={filtered} orders={allOrders} onOpenOrder={onOpenOrder} />
      </div>

      <Note>
        Материальный норматив — плановое количество ТМЦ на один наряд (в единицах списания);
        факт — сумма количеств из позиций материалов наряда. Тип превышения меняет и значение, и
        подпись карточки: «Среднее» — среднее по группе, «Максимальное» — наибольшее за один
        наряд, «Общее» — сумма по всем нарядам группы.
      </Note>
    </>
  )
}

function MaterialsTable({ rows, orders, onOpenOrder }: {
  rows: MaterialRow[]
  orders: WorkOrder[]
  onOpenOrder: (id: string) => void
}) {
  const byOrder = new Map(rows.map((r) => [r.order.id, r]))
  return (
    <div className="overflow-x-auto border border-neutral-200">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2 font-medium">Наряд</th>
            <th className="px-3 py-2 font-medium">Оборудование</th>
            <th className="px-3 py-2 font-medium">Участок</th>
            <th className="px-3 py-2 font-medium">Шифр</th>
            <th className="px-3 py-2 text-right font-medium">Норматив</th>
            <th className="px-3 py-2 text-right font-medium">Факт</th>
            <th className="px-3 py-2 text-right font-medium">Отклонение</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const r = byOrder.get(o.id)
            if (!r) return null
            return (
              <tr
                key={o.id}
                onClick={() => onOpenOrder(o.id)}
                className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium">{o.number}</div>
                  <div className="text-xs text-neutral-500">{fmtDateTime(o.createdAt)}</div>
                </td>
                <td className="px-3 py-2.5">{r.equipmentName}</td>
                <td className="px-3 py-2.5">{r.areaName}</td>
                <td className="px-3 py-2.5 font-mono">{r.faultCode ?? '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.norm}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.actual}</td>
                <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${r.excess > 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {r.excess > 0 ? '+' : ''}{r.excess}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
