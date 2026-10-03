// ИИ-заглушки (моки) первой итерации: шифр неисправности, подсказка
// исполнителя и вердикт при приёмке. Позже заменяются реальной моделью.

import type { AiVerdict, ChecklistItem, WorkOrder, Worker } from './types'

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

// ---------- Вердикт ИИ при приёмке (чек-лист ТЗ §31/§49) ----------

export function aiVerdict(order: WorkOrder): AiVerdict {
  const completed = order.completedAt ? new Date(order.completedAt) : null
  const deadline = new Date(order.deadline)

  // 1. Полнота закрытия.
  const completenessOk = Boolean(
    order.workDone?.trim() && order.faultCode && order.photosAfter.length >= 1,
  )
  const completenessNote = !order.workDone
    ? 'не заполнено описание выполненных работ'
    : !order.faultCode
      ? 'не выбран шифр неисправности'
      : order.photosAfter.length === 0
        ? 'нет фото «после»'
        : 'все обязательные поля заполнены'

  // 2. Соответствие работ проблеме (пересечение слов).
  const overlap = words(order.description).filter((w) => words(order.workDone ?? '').includes(w))
  const problemOk = Boolean(order.workDone) && overlap.length >= 2
  const problemNote = problemOk
    ? `совпадения: ${overlap.slice(0, 3).join(', ')}`
    : 'описание работ слабо пересекается с исходной проблемой'

  // 3. Логичность материалов.
  const matLen = (order.materials ?? '').trim().length
  const materialOk = matLen > 0 && matLen <= 120
  const materialNote = matLen === 0
    ? 'материалы не указаны'
    : matLen > 120
      ? 'списано много материалов — проверьте расход'
      : 'материалы в разумных пределах'

  // 4. Время.
  let timeOk = false
  let timeNote = 'время выполнения не зафиксировано'
  if (completed) {
    const factH = order.startedAt
      ? (completed.getTime() - new Date(order.startedAt).getTime()) / 3_600_000
      : null
    const beforeDeadline = completed <= deadline
    const withinNorm = order.normHours == null || factH == null || factH <= order.normHours
    timeOk = beforeDeadline && withinNorm
    timeNote = [
      beforeDeadline ? 'срок соблюдён' : 'завершено позже срока',
      factH != null && order.normHours != null
        ? `факт ${factH.toFixed(1)} ч из ${order.normHours} ч`
        : null,
    ].filter(Boolean)!.join(', ')
  }

  // 5. Качество по фото (мок: наличие фото после).
  const photoOk = order.photosAfter.length >= 1
  const photoNote = photoOk
    ? `фото «после»: ${order.photosAfter.length} шт.`
    : 'нет фото после выполнения'

  const checklist: ChecklistItem[] = [
    { code: 'COMPLETENESS', label: 'Полнота закрытия', passed: completenessOk, comment: completenessNote },
    { code: 'PROBLEM_MATCH', label: 'Соответствие работ проблеме', passed: problemOk, comment: problemNote },
    { code: 'MATERIAL_LOGIC', label: 'Логичность списанных материалов', passed: materialOk, comment: materialNote },
    { code: 'TIME_NORM', label: 'Соблюдение временного норматива', passed: timeOk, comment: timeNote },
    { code: 'PHOTO_QUALITY', label: 'Качество по фото', passed: photoOk, comment: photoNote },
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
