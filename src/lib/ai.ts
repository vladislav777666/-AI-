// ИИ-заглушки (моки) первой итерации: шифр неисправности, подсказка
// исполнителя и вердикт при приёмке. Позже заменяются реальной моделью.

import type { AiVerdict, WorkOrder, Worker } from './types'

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

// ---------- Вердикт ИИ при приёмке ----------

export function aiVerdict(order: WorkOrder): AiVerdict {
  const notes: string[] = []
  let score = 3

  // Полнота закрытия.
  const filled = [order.workDone, order.materials, order.faultCode].filter(
    (v) => v && v.trim().length > 0,
  ).length
  const hasAfter = order.photosAfter.length > 0
  score += filled >= 3 ? 1 : filled <= 1 ? -1 : 0
  if (!hasAfter) {
    score -= 1
    notes.push('нет фото «после» — приложите подтверждение результата.')
  }
  if (!order.workDone) notes.push('не заполнено описание выполненных работ.')

  // Соответствие работ проблеме (упрощённо: пересечение слов).
  if (order.workDone) {
    const overlap = words(order.description).filter((w) => words(order.workDone as string).includes(w))
    if (overlap.length >= 2) {
      notes.push(`описание работ соответствует проблеме (совпадения: ${overlap.slice(0, 3).join(', ')}).`)
    } else {
      notes.push('описание работ слабо пересекается с исходной проблемой — проверьте вручную.')
      score -= 1
    }
  }

  // Логичность материалов.
  if (order.materials && order.materials.trim().length > 60) {
    notes.push('списано много материалов — проверьте расход.')
    score -= 1
  } else if (order.materials) {
    notes.push('материалы в разумных пределах.')
  }

  // Время: факт против срока и норматива.
  if (order.completedAt) {
    const done = new Date(order.completedAt)
    const deadline = new Date(order.deadline)
    if (done > deadline) {
      notes.push('работа завершена позже срока.')
      score -= 1
    } else {
      notes.push('срок соблюдён.')
      score += 1
    }
    if (order.normHours && order.startedAt) {
      const factH = (done.getTime() - new Date(order.startedAt).getTime()) / 3_600_000
      if (factH <= order.normHours) notes.push(`уложился в норматив (факт ${factH.toFixed(1)} ч из ${order.normHours} ч).`)
      else {
        notes.push(`превышен норматив: ${factH.toFixed(1)} ч из ${order.normHours} ч.`)
        score -= 1
      }
    }
  }

  score = Math.max(1, Math.min(5, score))
  const head = `Оценка ИИ: ${score}/5.`
  const body = notes.length ? ` ${notes.join(' ')}` : ' Замечаний не найдено.'
  return { score, comment: head + body }
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
}
