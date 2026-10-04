// ИИ-заглушки (моки) первой итерации: шифр неисправности, подсказка
// исполнителя и вердикт при приёмке. Позже заменяются реальной моделью.

import type { AiVerdict, ChecklistItem, FaultCode, WorkOrder, Worker } from './types'

// ---------- Шифр неисправности: М/Э/Г/П/С + номер ----------

const FAULT_GROUPS: Record<string, string[]> = {
  М: ['механи', 'стук', 'скол', 'зазор', 'шестерн', 'подшипник', 'вал', 'крепл', 'вибрац', 'трещин', 'износ', 'люфт'],
  Э: ['электр', 'провод', 'кабел', 'двигат', 'датчик', 'напряж', 'кз', 'контакт', 'пускат', 'щит'],
  Г: ['гидравл', 'течь', 'утечк', 'давлен', 'насос', 'шланг', 'цилиндр', 'маслостанц'],
  П: ['пневм', 'воздух', 'компресс', 'пневмоцилиндр', 'клапан'],
  С: ['смазк', 'масл', 'консистент', 'шприц', 'лубрикат'],
}

const FAULT_NAMES: Record<string, string> = {
  М: 'механическая неисправность',
  Э: 'электрическая неисправность',
  Г: 'гидравлика',
  П: 'пневматика',
  С: 'смазка',
}

/** Простой мок-классификатор: по ключевым словам в описании. */
export function suggestFaultCode(description: string): { code: string; normHours: number; hint: string } {
  const text = description.toLowerCase()
  let best = 'М'
  let bestHits = 0
  for (const [letter, words] of Object.entries(FAULT_GROUPS)) {
    const hits = words.filter((w) => text.includes(w)).length
    if (hits > bestHits) {
      bestHits = hits
      best = letter
    }
  }
  const num = 1 + (Math.abs(hashCode(text)) % 20)
  const normHours = bestHits > 0 ? 1 + Math.min(4, bestHits) : 2
  return {
    code: `${best}-${String(num).padStart(2, '0')}`,
    normHours,
    hint: `Похоже на ${FAULT_NAMES[best]}. Норматив: ~${normHours} ч.`,
  }
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

// ---------- Подсказка исполнителя ----------

export interface WorkerSuggestion {
  worker: Worker
  reason: string
}

/** Мок ИИ-подсказки: свободный, не на смене отсекается, лучший рейтинг, меньше очереди. */
export function suggestWorker(workers: Worker[], orders: WorkOrder[]): WorkerSuggestion | null {
  const candidates = workers.filter((w) => w.status !== 'not_on_shift')
  if (candidates.length === 0) return null

  let best: Worker | null = null
  let bestScore = -Infinity
  let bestOpen = 0
  for (const w of candidates) {
    const open = orders.filter(
      (o) => o.workerId === w.id && ['issued', 'accepted', 'in_work', 'queued'].includes(o.status),
    ).length
    const score = w.rating * 2 - open + (w.status === 'free' ? 3 : w.status === 'queue' ? 0 : -1)
    if (score > bestScore) {
      bestScore = score
      best = w
      bestOpen = open
    }
  }
  if (!best) return null
  const parts = [
    best.status === 'free' ? 'свободен' : best.status === 'queue' ? 'есть очередь' : 'в работе',
    `рейтинг ${best.rating.toFixed(1)}`,
    bestOpen > 0 ? `нарядов в работе: ${bestOpen}` : 'нет открытых нарядов',
  ]
  return { worker: best, reason: `ИИ-подсказка: ${best.fullName} — ${parts.join(', ')}.` }
}

// ---------- Аудит §3.2 «Оценка и контроль качества» ----------
// Пять критериев ТЗ §3.2: полнота закрытия, соответствие работ проблеме,
// логичность материалов, время, качество по фото (внешний Модуль 6.3).

export function aiVerdict(order: WorkOrder, faultCodes: FaultCode[] = []): AiVerdict {
  const completed = order.completedAt ? new Date(order.completedAt) : null
  const deadline = new Date(order.deadline)
  const fault = faultCodes.find((f) => f.code === order.faultCode) ?? null

  // 1. Полнота закрытия: работы, шифр, материалы и фото «после».
  const hasMaterials = Boolean(
    (order.materials ?? '').trim() || (order.materialsList?.length ?? 0) > 0,
  )
  const completenessOk = Boolean(
    order.workDone?.trim() && order.faultCode && hasMaterials && order.photosAfter.length >= 1,
  )
  const completenessNote = !order.workDone?.trim()
    ? 'не заполнено описание выполненных работ'
    : !order.faultCode
      ? 'не выбран шифр неисправности'
      : !hasMaterials
        ? 'не списаны материалы'
        : order.photosAfter.length === 0
          ? 'нет фото «после»'
          : 'работы, шифр, материалы и фото «после» заполнены'

  // 2. Соответствие работ проблеме (языковая модель: пересечение терминов).
  const overlap = words(order.description).filter((w) => words(order.workDone ?? '').includes(w))
  const problemOk = Boolean(order.workDone) && overlap.length >= 2
  const problemNote = problemOk
    ? `пересечение описаний: ${overlap.slice(0, 3).join(', ')}`
    : 'итоговое описание работ слабо пересекается с первичным описанием проблемы'

  // 3. Логичность материалов: соответствие шифру/типу работ и обычному расходу.
  const materialNoteParts: string[] = []
  let materialOk = hasMaterials
  if (!hasMaterials) {
    materialNoteParts.push('материалы не списаны')
  } else if (fault?.materialNorm) {
    const normWords = words(fault.materialNorm)
    const usedWords = new Set([
      ...words(order.materials ?? ''),
      ...order.materialsList.flatMap((m) => words(m.name)),
    ])
    const hits = normWords.filter((w) => [...usedWords].some((u) => u.includes(w) || w.includes(u)))
    materialOk = hits.length > 0
    materialNoteParts.push(
      hits.length > 0
        ? `шифр ${fault.code}: списано пересекается с нормативом (${hits.slice(0, 3).join(', ')})`
        : `шифр ${fault.code}: списанные материалы не соответствуют материальному нормативу`,
    )
  } else {
    materialNoteParts.push('материальный норматив шифра не задан — проверьте расход вручную')
  }
  const totalQty = (order.materialsList ?? []).reduce((sum, m) => sum + (Number(m.qty) || 0), 0)
  if (totalQty > 100) {
    materialOk = false
    materialNoteParts.push(`суммарное списание ${totalQty} — возможное завышение против обычного расхода`)
  }
  const materialNote = materialNoteParts.join('; ')

  // 4. Время: факт против норматива шифра и планового срока.
  let timeOk = false
  let timeNote = 'время выполнения не зафиксировано'
  const normHours = order.normHours ?? fault?.normHours ?? null
  if (completed) {
    const factH = order.startedAt
      ? (completed.getTime() - new Date(order.startedAt).getTime()) / 3_600_000
      : null
    const beforeDeadline = completed <= deadline
    const withinNorm = normHours == null || factH == null || factH <= normHours
    timeOk = beforeDeadline && withinNorm
    timeNote = [
      beforeDeadline ? 'плановый срок соблюдён' : 'завершено позже планового срока',
      factH != null && normHours != null
        ? `факт ${factH.toFixed(1)} ч из норматива ${normHours} ч`
        : 'фактическое время не зафиксировано',
    ].join(', ')
  }

  // 5. Качество по фото: считает внешний модуль (Модуль 6.3) — заглушка интеграции.
  const photoOk = order.photosAfter.length >= 1
  const photoNote = photoOk
    ? `внешний модуль 6.3: получено фото «после» — ${order.photosAfter.length} шт.`
    : 'внешний модуль 6.3: нет фото «после» для оценки'

  const checklist: ChecklistItem[] = [
    { code: 'COMPLETENESS', label: 'Полнота закрытия', passed: completenessOk, comment: completenessNote },
    { code: 'PROBLEM_MATCH', label: 'Соответствие работ проблеме', passed: problemOk, comment: problemNote },
    { code: 'MATERIAL_LOGIC', label: 'Логичность материалов', passed: materialOk, comment: materialNote },
    { code: 'TIME_NORM', label: 'Время', passed: timeOk, comment: timeNote },
    { code: 'PHOTO_QUALITY', label: 'Качество по фото', passed: photoOk, comment: photoNote, external: true },
  ]

  const passed = checklist.filter((c) => c.passed).length
  const score = Math.max(1, Math.min(5, passed))
  const failed = checklist.filter((c) => !c.passed).map((c) => c.label.toLowerCase())
  const comment =
    `Оценка ИИ: ${score}/5. Пройдено критериев: ${passed}/5.` +
    (failed.length ? ` Требует внимания: ${failed.join(', ')}.` : ' Замечаний не найдено.')
  return { score, comment, checklist }
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
}
