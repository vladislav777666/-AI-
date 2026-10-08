// Аналитика веб-панели руководителя.
//
// Три раздела ТЗ:
//   1. Дашборд: активные наряды, просрочки, время реакции/выполнения,
//      простой оборудования, топ проблемного оборудования, лучшие исполнители.
//   2. Рейтинг: консервативная оценка Хёффдинга и четыре дополнительных
//      представления (в срок, возвраты, количество и сложность, отказы).
//   3. Аномалии: плановые работы → внеплановые «хвосты», бригады, участки и
//      оборудование, перерасход материалов.
//
// Все функции чистые: принимают загруженные данные и период, ничего не пишут.

import {
  DEFAULT_COMPLEXITY,
  type Area,
  type Equipment,
  type FaultCode,
  type WorkOrder,
  type Worker,
} from './types'

export const HOUR = 3_600_000
export const DAY = 86_400_000
/** Окно «повторного обращения» / «хвоста» после планового ремонта, дней. */
export const WINDOW_DAYS = 7

export interface AnalyticsInput {
  orders: WorkOrder[]
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  faultCodes: FaultCode[]
  /** Оценки приёмки ИИ по нарядам (orderId → 1..5). */
  scores: Record<string, number>
}

// ---------- Общие предикаты ----------

export function isClosed(o: WorkOrder): boolean {
  return o.status === 'closed'
}
export function isCancelled(o: WorkOrder): boolean {
  return o.status === 'cancelled'
}
/** Активная задача: ещё не закрыта, не отменена и не отклонена. */
export function isActive(o: WorkOrder): boolean {
  return !['closed', 'cancelled', 'rejected'].includes(o.status)
}
export function isOverdue(o: WorkOrder, now = Date.now()): boolean {
  return new Date(o.deadline).getTime() < now && !['completed', 'cancelled', 'closed'].includes(o.status)
}
/** Момент фактического ввода оборудования в эксплуатацию после ремонта. */
export function fixedAt(o: WorkOrder): number | null {
  const t = o.closedAt ?? o.completedAt
  return t ? new Date(t).getTime() : null
}
export function avg(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
}
export function total(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

// ---------- Глобальный фильтр периода / смены (Раздел 2) ----------

export type PeriodKey = 'shift' | '7d' | '30d' | '90d' | 'all'

export interface Period {
  key: string
  label: string
  /** Начало периода, мс. null — без ограничения снизу. */
  from: number | null
  to: number
}

const PERIOD_META: Array<{ key: PeriodKey; label: string; days: number | null }> = [
  { key: 'shift', label: 'Смена (сегодня)', days: 0 },
  { key: '7d', label: '7 дней', days: 7 },
  { key: '30d', label: '30 дней', days: 30 },
  { key: '90d', label: 'Квартал (90 дней)', days: 90 },
  { key: 'all', label: 'Всё время', days: null },
]

export const PERIOD_OPTIONS: PeriodKey[] = PERIOD_META.map((p) => p.key)

export function periodLabel(key: PeriodKey): string {
  return PERIOD_META.find((p) => p.key === key)?.label ?? key
}

export function periodRange(key: PeriodKey, now = Date.now()): Period {
  const meta = PERIOD_META.find((p) => p.key === key) ?? PERIOD_META[PERIOD_META.length - 1]
  if (meta.days == null) return { key, label: meta.label, from: null, to: now }
  if (meta.days === 0) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return { key, label: meta.label, from: d.getTime(), to: now }
  }
  return { key, label: meta.label, from: now - meta.days * DAY, to: now }
}

/** Наряд попадает в период по моменту создания (заказ фиксирует поломку). */
export function inPeriod(o: WorkOrder, p: Period): boolean {
  if (p.from == null) return true
  const t = new Date(o.createdAt).getTime()
  return t >= p.from && t <= p.to
}
export function filterPeriod(orders: WorkOrder[], p: Period): WorkOrder[] {
  return p.from == null ? orders : orders.filter((o) => inPeriod(o, p))
}

// ---------- Периоды отчётов Мастера (смена / сутки / неделя / месяц / свой) ----------

export type ReportPeriodKey = 'shift' | 'day' | 'week' | 'month' | 'custom'

export const REPORT_PERIODS: Array<{ key: ReportPeriodKey; label: string }> = [
  { key: 'shift', label: 'Смена' },
  { key: 'day', label: 'Сутки' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'custom', label: 'Произвольный период' },
]

/** Диапазон отчёта. Для «произвольного» даты — из полей yyyy-mm-dd (включительно). */
export function reportRange(
  key: ReportPeriodKey,
  customFrom = '',
  customTo = '',
  now = Date.now(),
): Period {
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 59, 999); return d.getTime() }
  switch (key) {
    case 'shift':
      return { key, label: 'Смена', from: startOfDay(now), to: now }
    case 'day':
      return { key, label: 'Сутки', from: now - DAY, to: now }
    case 'week':
      return { key, label: 'Неделя', from: now - 7 * DAY, to: now }
    case 'month':
      return { key, label: 'Месяц', from: now - 30 * DAY, to: now }
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(customFrom).getTime()) : null
      const to = customTo ? endOfDay(new Date(customTo).getTime()) : now
      return { key, label: 'Произвольный период', from, to }
    }
  }
}

/** Период попадания события (не создания) в диапазон отчёта. */
export function tsInPeriod(iso: string | null | undefined, p: Period): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return (p.from == null || t >= p.from) && t <= p.to
}

/** Длительность периода в часах (null — без нижней границы). */
export function periodHours(p: Period): number | null {
  return p.from == null ? null : (p.to - p.from) / HOUR
}

// ---------- Раздел 1. Дашборд ----------

export interface EquipmentRank {
  equipment: Equipment
  area: Area | null
  count: number
}

export interface DashboardMetrics {
  activeCount: number
  overdueCount: number
  avgReactionHours: number | null
  avgExecutionHours: number | null
  avgDowntimeHours: number | null
  totalDowntimeHours: number
  topEquipment: EquipmentRank[]
  topWorkers: Array<{ worker: Worker; score: number; closed: number }>
}

export function dashboardMetrics(input: AnalyticsInput, now = Date.now()): DashboardMetrics {
  const { orders, equipment, areas } = input

  const reactions = orders
    .filter((o) => o.startedAt)
    .map((o) => (new Date(o.startedAt!).getTime() - new Date(o.createdAt).getTime()) / HOUR)
    .filter((h) => h >= 0)

  const executions = orders
    .filter((o) => o.startedAt && o.completedAt)
    .map((o) => (new Date(o.completedAt!).getTime() - new Date(o.startedAt!).getTime()) / HOUR)
    .filter((h) => h >= 0)

  const downtimes = orders
    .map((o) => {
      const fixed = fixedAt(o)
      return fixed == null ? null : (fixed - new Date(o.createdAt).getTime()) / HOUR
    })
    .filter((h): h is number => h != null && h >= 0)

  const byEq = new Map<string, number>()
  for (const o of orders) byEq.set(o.equipmentId, (byEq.get(o.equipmentId) ?? 0) + 1)
  const topEquipment: EquipmentRank[] = [...byEq]
    .map(([id, count]) => {
      const eq = equipment.find((e) => e.id === id)
      if (!eq) return null
      return { equipment: eq, area: areas.find((a) => a.id === eq.areaId) ?? null, count }
    })
    .filter((x): x is EquipmentRank => x != null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const topWorkers = workerRatings(input, periodRange('all', now), now)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => ({ worker: r.worker, score: r.score, closed: r.closed }))

  return {
    activeCount: orders.filter(isActive).length,
    overdueCount: orders.filter((o) => isOverdue(o, now)).length,
    avgReactionHours: avg(reactions),
    avgExecutionHours: avg(executions),
    avgDowntimeHours: avg(downtimes),
    totalDowntimeHours: total(downtimes),
    topEquipment,
    topWorkers,
  }
}

// ---------- Раздел 2. Рейтинг ----------

export interface RatingRow {
  worker: Worker
  /** C — закрытые наряды. */
  closed: number
  /** X — отменённые наряды. */
  cancelled: number
  /** R — средняя оценка закрытых нарядов (1..5). */
  avgScore: number | null
  /** Коэффициент надёжности K = C / (C + X + U + 0,5·J) — см. hoffdingScore. */
  k: number
  /** R_confidence = Avg − 4·√(ln10 / 2C). */
  rConfidence: number
  /** Score = 100·(0.7·(R_conf−1)/4 + 0.3·K). */
  score: number
  /** Доля закрытых в срок (View 2). */
  onTimeShare: number | null
  /** Доля возвратов (View 3): доработка или повтор в течение 7 дней. */
  returnShare: number
  returns: number
  /** Количество и сложность закрытых нарядов (View 4). */
  complexityScore: number
  /** Отказы от нарядов (View 5). */
  refusals: number
  unjustifiedRefusals: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Составляющие надёжности исполнителя для коэффициента K. */
export interface ReliabilityInput {
  /** Закрытые наряды — единственный канал, засчитываемый в плюс. */
  closed: number
  /** Отменённые наряды. */
  cancelled: number
  /** Отказы с указанной причиной: согласованы, но работа не выполнена. */
  justifiedRefusals: number
  /** Отказы без указанной причины: причина не документирована вообще. */
  unjustifiedRefusals: number
}

/** Вес уважительного отказа: причина документирована, но наряд не выполнен. */
export const JUSTIFIED_REFUSAL_WEIGHT = 0.5

/**
 * Консервативная оценка Хёффдинга (Раздел 2, п.1):
 *   K = C / (C + X + U + 0,5·J); R_confidence = Avg − 4·√(ln10 / 2C);
 *   Score = 100·(0.7·(R_conf − 1)/4 + 0.3·K).
 *
 * K — коэффициент надёжности: какая доля выданного доведена до закрытия.
 * Раньше K = C/(C+X) реагировал ТОЛЬКО на отмены, поэтому при отсутствии
 * отмен он всегда равнялся 1.00 и ничего не показывал. Теперь у потери
 * два канала:
 *   X — отменённые наряды (полный вес);
 *   U — отказы без указанной причины (полный вес — причина не документирована);
 *   J — отказы с указанной причиной (половина веса: отказ согласован, но
 *       работа всё равно не сделана — исполнитель отклонил назначенное).
 * Так исполнитель, который отклоняет больше половины выданного, получает
 * честно низкий K независимо от того, оформил он причины или нет.
 *
 * При отсутствии нарядов вовсе (C + X + U + J = 0) доверия нет: K = 0.
 * При C = 0 нижняя граница Хёффдинга недостижима — берём худшую (1).
 */
export function hoffdingScore(
  reliability: ReliabilityInput,
  avgScore: number | null,
): {
  k: number; rConfidence: number; score: number
} {
  const { closed, cancelled, justifiedRefusals, unjustifiedRefusals } = reliability
  const losses =
    cancelled + unjustifiedRefusals + JUSTIFIED_REFUSAL_WEIGHT * justifiedRefusals
  const denom = closed + losses
  const k = denom > 0 ? closed / denom : 0
  const rConfidence = closed > 0 && avgScore != null
    ? clamp(avgScore - 4 * Math.sqrt(Math.log(10) / (2 * closed)), 1, 5)
    : 1
  const score = clamp(100 * (0.7 * ((rConfidence - 1) / 4) + 0.3 * k), 0, 100)
  return { k, rConfidence, score }
}

/** Наряды, являющиеся повторным обращением по тому же оборудованию в ≤7 дней. */
export function repeatOrderIds(orders: WorkOrder[]): Set<string> {
  const byEq = new Map<string, WorkOrder[]>()
  for (const o of orders) {
    const list = byEq.get(o.equipmentId) ?? []
    list.push(o)
    byEq.set(o.equipmentId, list)
  }
  const out = new Set<string>()
  for (const list of byEq.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    for (let i = 1; i < sorted.length; i++) {
      const t = new Date(sorted[i].createdAt).getTime()
      for (let j = i - 1; j >= 0; j--) {
        const gap = t - new Date(sorted[j].createdAt).getTime()
        if (gap > WINDOW_DAYS * DAY) break
        if (['closed', 'completed', 'rework'].includes(sorted[j].status)) {
          out.add(sorted[i].id)
          break
        }
      }
    }
  }
  return out
}

export function workerRatings(input: AnalyticsInput, period: Period, now = Date.now()): RatingRow[] {
  const { workers, scores } = input
  const orders = filterPeriod(input.orders, period)
  const repeats = repeatOrderIds(input.orders)
  const complexityOf = new Map(input.faultCodes.map((f) => [f.code, f.complexity ?? DEFAULT_COMPLEXITY]))

  const rows: RatingRow[] = workers.map((worker) => {
    const mine = orders.filter((o) => o.workerId === worker.id)
    const closedOrders = mine.filter(isClosed)
    const cancelled = mine.filter(isCancelled).length
    const closed = closedOrders.length

    const closedScores = closedOrders
      .map((o) => scores[o.id])
      .filter((s): s is number => typeof s === 'number')
    const avgScore = closedScores.length > 0
      ? total(closedScores) / closedScores.length
      : (closed > 0 ? worker.rating : null)

    // Отказы — второй канал потерь в K (см. hoffdingScore),
    // поэтому считаем их до расчёта балла.
    const rejected = mine.filter((o) => o.status === 'rejected')
    const unjustifiedRefusals = rejected.filter((o) => !(o.rejectReason ?? '').trim()).length

    const { k, rConfidence, score } = hoffdingScore(
      {
        closed,
        cancelled,
        justifiedRefusals: rejected.length - unjustifiedRefusals,
        unjustifiedRefusals,
      },
      avgScore,
    )

    const onTime = closedOrders.filter((o) => {
      const done = new Date(o.closedAt ?? o.completedAt ?? o.createdAt).getTime()
      return done <= new Date(o.deadline).getTime()
    }).length
    const onTimeShare = closed > 0 ? onTime / closed : null

    const returns = closedOrders.filter((o) => repeats.has(o.id)).length
    const returnShare = closed > 0 ? returns / closed : 0

    const complexityScore = total(
      closedOrders.map((o) => (o.faultCode ? complexityOf.get(o.faultCode) ?? DEFAULT_COMPLEXITY : DEFAULT_COMPLEXITY)),
    )

    return {
      worker, closed, cancelled, avgScore, k, rConfidence, score,
      onTimeShare, returnShare, returns, complexityScore,
      refusals: rejected.length, unjustifiedRefusals,
    }
  })
  void now
  return rows
}

// ---------- Раздел 3. Аномалии и аналитика ----------

export interface PlannedFollower {
  /** Внеплановый наряд, случившийся после планового. */
  unplanned: WorkOrder
  /** Плановый наряд, за которым последовала поломка. */
  planned: WorkOrder
  /** Разница дат: сколько дней прошло от завершения планового до внепланового. */
  gapDays: number
}

/** Внеплановые в течение недели после завершения планового по тому же
 *  оборудованию И участку (Разделы 3.1 и 3.2). */
export function plannedFollowers(input: AnalyticsInput): PlannedFollower[] {
  const planned = input.orders.filter(
    (o) => o.workType === 'planned' && (o.closedAt || o.completedAt),
  )
  const unplanned = input.orders.filter((o) => o.workType === 'unplanned')
  const out: PlannedFollower[] = []
  for (const p of planned) {
    const done = new Date(p.closedAt ?? p.completedAt!).getTime()
    for (const u of unplanned) {
      if (u.equipmentId !== p.equipmentId || u.areaId !== p.areaId) continue
      const t = new Date(u.createdAt).getTime()
      if (t < done || t > done + WINDOW_DAYS * DAY) continue
      out.push({ unplanned: u, planned: p, gapDays: (t - done) / DAY })
    }
  }
  return out.sort(
    (a, b) => new Date(b.unplanned.createdAt).getTime() - new Date(a.unplanned.createdAt).getTime(),
  )
}

export interface PlannedAnomaly {
  code: string
  name: string
  count: number
  followers: PlannedFollower[]
}

/** 3.1 Аномалии: шифр плановой работы ↔ число внеплановых после неё. */
export function plannedAnomalies(input: AnalyticsInput): PlannedAnomaly[] {
  const byCode = new Map<string, PlannedFollower[]>()
  for (const f of plannedFollowers(input)) {
    const code = f.planned.faultCode ?? '—'
    const list = byCode.get(code) ?? []
    list.push(f)
    byCode.set(code, list)
  }
  return [...byCode]
    .map(([code, followers]) => ({
      code,
      name: input.faultCodes.find((c) => c.code === code)?.name ?? code,
      count: followers.length,
      followers,
    }))
    .sort((a, b) => b.count - a.count)
}

/** 3.2 Бригада ↔ число внеплановых после её плановой работы. */
export interface BrigadeAnomaly {
  brigade: string
  count: number
  followers: PlannedFollower[]
}

export function brigadeAnomalies(input: AnalyticsInput): BrigadeAnomaly[] {
  const workerById = new Map(input.workers.map((w) => [w.id, w]))
  const byBrigade = new Map<string, PlannedFollower[]>()
  for (const f of plannedFollowers(input)) {
    const w = f.planned.workerId ? workerById.get(f.planned.workerId) : undefined
    const brigade = (w?.brigade ?? '').trim() || w?.fullName || 'Без бригады'
    const list = byBrigade.get(brigade) ?? []
    list.push(f)
    byBrigade.set(brigade, list)
  }
  return [...byBrigade]
    .map(([brigade, followers]) => ({ brigade, count: followers.length, followers }))
    .sort((a, b) => b.count - a.count)
}

/** 3.3 Участки и оборудование: превышения/понижения по внеплановым нарядам. */
export interface EquipmentAnomalyRow {
  equipment: Equipment
  area: Area | null
  unplanned: number
  planned: number
  /** Самая частая внеплановая неисправность. */
  topFault: string | null
  /** Превышение над средним числом внеплановых на единицу оборудования. */
  excess: number
}

export function equipmentAnomalies(
  input: AnalyticsInput,
  period: Period,
): { rows: EquipmentAnomalyRow[]; average: number; top: EquipmentAnomalyRow[]; bottom: EquipmentAnomalyRow[] } {
  const orders = filterPeriod(input.orders, period).filter((o) => o.status !== 'cancelled')
  const rows: EquipmentAnomalyRow[] = input.equipment.map((eq) => {
    const mine = orders.filter((o) => o.equipmentId === eq.id)
    const unplanned = mine.filter((o) => o.workType === 'unplanned')
    const planned = mine.filter((o) => o.workType === 'planned').length
    const byFault = new Map<string, number>()
    for (const o of unplanned) {
      const code = o.faultCode ?? '—'
      byFault.set(code, (byFault.get(code) ?? 0) + 1)
    }
    const topFault = [...byFault].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      equipment: eq,
      area: input.areas.find((a) => a.id === eq.areaId) ?? null,
      unplanned: unplanned.length,
      planned,
      topFault,
      excess: 0,
    }
  })
  const average = avg(rows.map((r) => r.unplanned)) ?? 0
  for (const r of rows) r.excess = r.unplanned - average
  const sorted = [...rows].sort((a, b) => b.excess - a.excess)
  const top = sorted.filter((r) => r.excess > 0).slice(0, 5)
  // Обратная сортировка (ТЗ 3.3): самые «благополучные» единицы, кроме
  // уже показанных в превышениях (иначе при малом парке списки совпадают).
  const topIds = new Set(top.map((r) => r.equipment.id))
  const ascending = [...rows].sort((a, b) => a.excess - b.excess)
  const bottom = ascending.filter((r) => !topIds.has(r.equipment.id)).slice(0, 5)
  return {
    rows: sorted,
    average,
    top,
    bottom: bottom.length > 0 ? bottom : ascending.slice(0, 5),
  }
}

/** 3.4 По материалам: факт против норматива шифра. */
export interface MaterialRow {
  order: WorkOrder
  workerId: string | null
  workerName: string
  areaId: string
  areaName: string
  equipmentId: string
  equipmentName: string
  faultCode: string | null
  /** Основной материал (первая позиция списания). */
  material: string | null
  actual: number
  norm: number
  excess: number
}

export function materialRows(input: AnalyticsInput, period: Period): MaterialRow[] {
  const workerById = new Map(input.workers.map((w) => [w.id, w]))
  const areaById = new Map(input.areas.map((a) => [a.id, a]))
  const eqById = new Map(input.equipment.map((e) => [e.id, e]))
  const codeById = new Map(input.faultCodes.map((f) => [f.code, f]))

  return filterPeriod(input.orders, period)
    .filter((o) => o.faultCode && o.status !== 'cancelled')
    // Сравниваем только наряды с зафиксированным списанием: отсутствие
    // материалов — это не экономия, а незаполненные данные.
    .filter((o) => (o.materialsList?.length ?? 0) > 0)
    .map((o): MaterialRow | null => {
      const norm = codeById.get(o.faultCode!)?.materialNormQty ?? null
      if (norm == null) return null
      const items = o.materialsList ?? []
      const actual = total(items.map((m) => Number(m.qty) || 0))
      const w = o.workerId ? workerById.get(o.workerId) : undefined
      return {
        order: o,
        workerId: o.workerId,
        workerName: w?.fullName ?? '—',
        areaId: o.areaId,
        areaName: areaById.get(o.areaId)?.name ?? '—',
        equipmentId: o.equipmentId,
        equipmentName: eqById.get(o.equipmentId)?.name ?? '—',
        faultCode: o.faultCode,
        material: items[0]?.name ?? null,
        actual,
        norm,
        excess: actual - norm,
      }
    })
    .filter((r): r is MaterialRow => r != null)
}

export type MaterialDimension = 'material' | 'worker' | 'fault' | 'area' | 'equipment'
export type MaterialMetric = 'avg' | 'max' | 'total'

export interface MaterialGroup {
  key: string
  label: string
  sublabel: string
  value: number
  count: number
  rows: MaterialRow[]
  maxRow: MaterialRow
}

export function dimensionLabel(dim: MaterialDimension): string {
  return {
    material: 'Материал',
    worker: 'Исполнитель',
    fault: 'Шифр',
    area: 'Участок',
    equipment: 'Оборудование',
  }[dim]
}

function dimensionKey(dim: MaterialDimension, r: MaterialRow): string {
  switch (dim) {
    case 'material': return r.material ?? 'Без материала'
    case 'worker': return r.workerName
    case 'fault': return r.faultCode ?? '—'
    case 'area': return r.areaName
    case 'equipment': return r.equipmentName
  }
}

/**
 * Группировка перерасхода (Раздел 3.4). Тип превышения задаёт и значение,
 * и подпись карточки:
 *   avg   — среднее превышение: подпись = материал/шифр/и т.п.;
 *   max   — максимальное за один наряд: подпись + шифр + номер наряда;
 *   total — сумма по группе: подпись + шифр + число нарядов.
 */
export function groupMaterials(
  rows: MaterialRow[],
  dim: MaterialDimension,
  metric: MaterialMetric,
): MaterialGroup[] {
  const map = new Map<string, MaterialRow[]>()
  for (const r of rows) {
    const key = dimensionKey(dim, r)
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }
  const groups: MaterialGroup[] = []
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => b.excess - a.excess)
    const maxRow = sorted[0]
    const value = metric === 'avg'
      ? total(list.map((r) => r.excess)) / list.length
      : metric === 'max'
        ? maxRow.excess
        : total(list.map((r) => r.excess))
    const fault = maxRow.faultCode ? `шифр ${maxRow.faultCode}` : 'шифр не указан'
    const sublabel = metric === 'avg'
      ? (dim === 'material' ? `${list.length} нар.` : '')
      : metric === 'max'
        ? `${fault} · наряд ${maxRow.order.number}`
        : `${fault} · нарядов: ${list.length}`
    groups.push({ key, label: key, sublabel, value, count: list.length, rows: sorted, maxRow })
  }
  return groups.sort((a, b) => b.value - a.value)
}

/** Список нарядов с сортировкой по новизне (Разделы 3.3 и 3.4). */
export function sortOrdersByDate(orders: WorkOrder[], dir: 'new' | 'old'): WorkOrder[] {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime()
    const tb = new Date(b.createdAt).getTime()
    return dir === 'new' ? tb - ta : ta - tb
  })
}

// ---------- Отчёты Мастера (кнопка «Отчёты») ----------

/** Рейтинг бригад (отчёт «Рейтинг исполнителей и бригад»): та же логика,
 *  что в панели руководителя, но агрегированная по бригаде. */
export interface BrigadeRating {
  brigade: string
  workers: number
  closed: number
  cancelled: number
  avgScore: number | null
  k: number
  rConfidence: number
  score: number
  onTimeShare: number | null
  complexityScore: number
  refusals: number
  unjustifiedRefusals: number
}

export function brigadeRatings(
  input: AnalyticsInput,
  period: Period,
  now = Date.now(),
): BrigadeRating[] {
  const byBrigade = new Map<string, RatingRow[]>()
  for (const row of workerRatings(input, period, now)) {
    const key = (row.worker.brigade ?? '').trim() || 'Без бригады'
    const list = byBrigade.get(key) ?? []
    list.push(row)
    byBrigade.set(key, list)
  }
  const out: BrigadeRating[] = []
  for (const [brigade, list] of byBrigade) {
    const closed = total(list.map((r) => r.closed))
    const cancelled = total(list.map((r) => r.cancelled))
    const scored = list.filter((r) => r.avgScore != null && r.closed > 0)
    const scoredClosed = total(scored.map((r) => r.closed))
    const avgScore = scoredClosed > 0
      ? total(scored.map((r) => (r.avgScore ?? 0) * r.closed)) / scoredClosed
      : null
    const refusals = total(list.map((r) => r.refusals))
    const unjustifiedRefusals = total(list.map((r) => r.unjustifiedRefusals))
    const { k, rConfidence, score } = hoffdingScore(
      {
        closed,
        cancelled,
        justifiedRefusals: refusals - unjustifiedRefusals,
        unjustifiedRefusals,
      },
      avgScore,
    )
    const onTime = total(list.map((r) =>
      r.onTimeShare == null ? 0 : Math.round(r.onTimeShare * r.closed),
    ))
    out.push({
      brigade,
      workers: list.length,
      closed,
      cancelled,
      avgScore,
      k,
      rConfidence,
      score,
      onTimeShare: closed > 0 ? onTime / closed : null,
      complexityScore: total(list.map((r) => r.complexityScore)),
      refusals,
      unjustifiedRefusals,
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Загрузка персонала в отчёте «За смену». */
export interface StaffLoadRow {
  worker: Worker
  closed: number
  active: number
  hours: number
  loadPercent: number | null
}

export interface ShiftReport {
  /** Выдано нарядов за период (по времени создания). */
  issued: number
  /** Принято исполнителями за период. */
  accepted: number
  /** Закрыто (принято мастером) за период. */
  closed: number
  /** Отклонено (по времени создания наряда — отдельной метки отказа нет). */
  rejected: number
  /** Просрочено сейчас (на момент отчёта). */
  overdue: number
  /** Сейчас в работе. */
  inWork: number
  avgReactionHours: number | null
  avgExecutionHours: number | null
  downtimeHours: number
  staff: StaffLoadRow[]
}

export function shiftReport(input: AnalyticsInput, period: Period, now = Date.now()): ShiftReport {
  const { orders, workers } = input
  const span = periodHours(period)

  const issuedOrders = orders.filter((o) => inPeriod(o, period))
  const accepted = orders.filter((o) => tsInPeriod(o.acceptedAt, period)).length
  const closedOrders = orders.filter((o) => tsInPeriod(o.closedAt, period))
  const rejected = issuedOrders.filter((o) => o.status === 'rejected').length

  const reactions = accepted > 0
    ? orders
        .filter((o) => tsInPeriod(o.acceptedAt, period) && o.startedAt)
        .map((o) => (new Date(o.startedAt!).getTime() - new Date(o.createdAt).getTime()) / HOUR)
        .filter((h) => h >= 0)
    : []
  const executions = closedOrders
    .filter((o) => o.startedAt && o.completedAt)
    .map((o) => (new Date(o.completedAt!).getTime() - new Date(o.startedAt!).getTime()) / HOUR)
    .filter((h) => h >= 0)

  const downtimeHours = total(
    closedOrders
      .map((o) => (new Date(o.closedAt!).getTime() - new Date(o.createdAt).getTime()) / HOUR)
      .filter((h) => h >= 0),
  )

  const staff: StaffLoadRow[] = workers.map((worker) => {
    const mine = orders.filter((o) => o.workerId === worker.id)
    const hours = total(
      mine
        .filter((o) => o.startedAt && o.completedAt && tsInPeriod(o.completedAt, period))
        .map((o) => (new Date(o.completedAt!).getTime() - new Date(o.startedAt!).getTime()) / HOUR)
        .filter((h) => h >= 0),
    )
    return {
      worker,
      closed: closedOrders.filter((o) => o.workerId === worker.id).length,
      active: mine.filter((o) => ['issued', 'accepted', 'in_work', 'queued', 'suspended', 'rework'].includes(o.status)).length,
      hours,
      loadPercent: span && span > 0 ? (hours / span) * 100 : null,
    }
  }).sort((a, b) => b.hours - a.hours)

  return {
    issued: issuedOrders.length,
    accepted,
    closed: closedOrders.length,
    rejected,
    overdue: orders.filter((o) => isOverdue(o, now)).length,
    inWork: orders.filter((o) => ['accepted', 'in_work', 'suspended', 'rework'].includes(o.status)).length,
    avgReactionHours: avg(reactions),
    avgExecutionHours: avg(executions),
    downtimeHours,
    staff,
  }
}

/** Отчёт «Простои оборудования»: время, причины по шифрам, доля план/внеплан. */
export interface DowntimeCause {
  code: string
  name: string
  count: number
  hours: number
}

export interface DowntimeRow {
  equipment: Equipment
  area: Area | null
  orders: number
  totalHours: number
  avgHours: number | null
  /** Текущий (незакрытый) простой, ч. */
  currentHours: number | null
  planned: number
  unplanned: number
  sharePlanned: number
  shareUnplanned: number
  causes: DowntimeCause[]
}

export interface DowntimeReport {
  rows: DowntimeRow[]
  totalHours: number
  sharePlanned: number
  shareUnplanned: number
}

export function downtimeReport(
  input: AnalyticsInput,
  period: Period,
  now = Date.now(),
): DowntimeReport {
  const { orders, equipment, areas, faultCodes } = input
  const nameOf = new Map(faultCodes.map((f) => [f.code, f.name]))
  const relevant = orders.filter((o) => inPeriod(o, period) && o.status !== 'cancelled')
  const rows: DowntimeRow[] = equipment.map((eq) => {
    const mine = relevant.filter((o) => o.equipmentId === eq.id)
    const perOrder = mine.map((o) => {
      const end = fixedAt(o) ?? now
      return { order: o, hours: Math.max(0, (end - new Date(o.createdAt).getTime()) / HOUR) }
    })
    const totalHours = total(perOrder.map((x) => x.hours))
    const planned = perOrder.filter((x) => x.order.workType === 'planned')
    const unplanned = perOrder.filter((x) => x.order.workType === 'unplanned')
    const plannedHours = total(planned.map((x) => x.hours))
    const unplannedHours = total(unplanned.map((x) => x.hours))
    const byFault = new Map<string, { count: number; hours: number }>()
    for (const x of perOrder) {
      const code = x.order.faultCode ?? '—'
      const acc = byFault.get(code) ?? { count: 0, hours: 0 }
      acc.count += 1
      acc.hours += x.hours
      byFault.set(code, acc)
    }
    const current = mine.filter((o) => fixedAt(o) == null)
    return {
      equipment: eq,
      area: areas.find((a) => a.id === eq.areaId) ?? null,
      orders: mine.length,
      totalHours,
      avgHours: avg(perOrder.map((x) => x.hours)),
      currentHours: current.length > 0
        ? total(current.map((o) => Math.max(0, (now - new Date(o.createdAt).getTime()) / HOUR)))
        : null,
      planned: planned.length,
      unplanned: unplanned.length,
      sharePlanned: totalHours > 0 ? plannedHours / totalHours : 0,
      shareUnplanned: totalHours > 0 ? unplannedHours / totalHours : 0,
      causes: [...byFault]
        .map(([code, acc]) => ({ code, name: nameOf.get(code) ?? code, count: acc.count, hours: acc.hours }))
        .sort((a, b) => b.hours - a.hours),
    }
  }).sort((a, b) => b.totalHours - a.totalHours)

  const totalHours = total(rows.map((r) => r.totalHours))
  const plannedHours = total(rows.map((r) => r.totalHours * r.sharePlanned))
  const unplannedHours = total(rows.map((r) => r.totalHours * r.shareUnplanned))
  return {
    rows,
    totalHours,
    sharePlanned: totalHours > 0 ? plannedHours / totalHours : 0,
    shareUnplanned: totalHours > 0 ? unplannedHours / totalHours : 0,
  }
}

/** Повторные отказы: следующее обращение по тому же оборудованию ≤7 дней. */
export interface RepeatCase {
  equipment: Equipment
  area: Area | null
  first: WorkOrder
  second: WorkOrder
  gapDays: number
}

export function repeatFailures(input: AnalyticsInput, period: Period): RepeatCase[] {
  const byEq = new Map<string, WorkOrder[]>()
  for (const o of input.orders) {
    if (o.status === 'cancelled') continue
    const list = byEq.get(o.equipmentId) ?? []
    list.push(o)
    byEq.set(o.equipmentId, list)
  }
  const out: RepeatCase[] = []
  for (const [eqId, list] of byEq) {
    const eq = input.equipment.find((e) => e.id === eqId)
    if (!eq) continue
    const sorted = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    for (let i = 1; i < sorted.length; i++) {
      const second = sorted[i]
      if (!inPeriod(second, period)) continue
      for (let j = i - 1; j >= 0; j--) {
        const first = sorted[j]
        const gap = new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
        if (gap > WINDOW_DAYS * DAY) break
        if (['closed', 'completed', 'rework'].includes(first.status)) {
          out.push({
            equipment: eq,
            area: input.areas.find((a) => a.id === eq.areaId) ?? null,
            first,
            second,
            gapDays: gap / DAY,
          })
          break
        }
      }
    }
  }
  return out.sort(
    (a, b) => new Date(b.second.createdAt).getTime() - new Date(a.second.createdAt).getTime(),
  )
}

/** Участки: объём работ, внеплановые, повторы (отчёт «Аномалии»). */
export interface AreaAnomalyRow {
  area: Area
  orders: number
  unplanned: number
  equipment: number
  repeat: number
  downtimeHours: number
}

export function areaAnomalies(input: AnalyticsInput, period: Period): AreaAnomalyRow[] {
  const orders = input.orders.filter((o) => inPeriod(o, period) && o.status !== 'cancelled')
  const repeats = repeatFailures(input, period)
  return input.areas
    .map((area) => {
      const mine = orders.filter((o) => o.areaId === area.id)
      const downtime = total(mine.map((o) => {
        const end = fixedAt(o)
        return end == null ? 0 : Math.max(0, (end - new Date(o.createdAt).getTime()) / HOUR)
      }))
      return {
        area,
        orders: mine.length,
        unplanned: mine.filter((o) => o.workType === 'unplanned').length,
        equipment: input.equipment.filter((e) => e.areaId === area.id).length,
        repeat: repeats.filter((r) => r.area?.id === area.id).length,
        downtimeHours: downtime,
      }
    })
    .sort((a, b) => b.unplanned - a.unplanned)
}

// ---------- Форматирование ----------

export function fmtHours(h: number | null): string {
  if (h == null) return '—'
  if (h < 24) return `${h.toFixed(1)} ч`
  return `${(h / 24).toFixed(1)} сут`
}

export function fmtPercent(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
