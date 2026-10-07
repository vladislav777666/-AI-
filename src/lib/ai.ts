// ИИ-модуль: подсказка шифра неисправности, выбор исполнителя и вердикт
// приёмки §3.2. При заданном ключе NVIDIA NIM (VITE_NVIDIA_NIM_API_KEY)
// ответы даёт реальная модель (см. llm.ts); без ключа или при ошибке сети
// работают локальные эвристики ниже — они же мгновенный фоллбэк.

import { createAnonymizer } from './anonymize'
import { LLM_MODEL, llmChat, llmConfigured, llmJson } from './llm'
import {
  WORKER_STATUS_LABELS,
  type AiVerdict, type ChecklistItem, type FaultCode, type WorkOrder, type Worker,
} from './types'

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

/** Локальная эвристика по ключевым словам — фоллбэк, когда модель недоступна. */
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

/** Опыт бригады по выбранному оборудованию — «желательный» критерий
 *  подсказки исполнителя (ТЗ §3: рейтинг по этому типу оборудования). */
export interface WorkerEquipmentContext {
  equipmentName: string
  /** workerId → количество нарядов и средняя оценка ИИ по этому оборудованию. */
  stats: Record<string, { count: number; avgScore: number | null }>
}

/** Локальная эвристика исполнителя (фоллбэк): свободный, не на смене
 *  отсекается, лучший рейтинг, меньше очереди; при выбранном оборудовании
 *  добавляется опыт и средняя оценка именно по нему. */
export function suggestWorker(
  workers: Worker[],
  orders: WorkOrder[],
  equipment?: WorkerEquipmentContext | null,
): WorkerSuggestion | null {
  const candidates = workers.filter((w) => w.status !== 'not_on_shift')
  if (candidates.length === 0) return null

  let best: Worker | null = null
  let bestScore = -Infinity
  let bestOpen = 0
  let bestEq: { count: number; avgScore: number | null } | null = null
  for (const w of candidates) {
    const open = orders.filter(
      (o) => o.workerId === w.id && ['issued', 'accepted', 'in_work', 'queued'].includes(o.status),
    ).length
    const eq = equipment?.stats[w.id] ?? null
    // Опыт по оборудованию — небольшой бонус: он желателен, но не решает сам по себе.
    const equipmentBonus = eq
      ? 0.8 + Math.min(1.2, eq.count * 0.3) + (eq.avgScore != null ? (eq.avgScore - 4) * 0.5 : 0)
      : 0
    const score =
      w.rating * 2 - open +
      (w.status === 'free' ? 3 : w.status === 'queue' ? 0 : -1) +
      equipmentBonus
    if (score > bestScore) {
      bestScore = score
      best = w
      bestOpen = open
      bestEq = eq
    }
  }
  if (!best) return null
  const parts = [
    best.status === 'free' ? 'свободен' : best.status === 'queue' ? 'есть очередь' : 'в работе',
    `рейтинг ${best.rating.toFixed(1)}`,
    bestOpen > 0 ? `нарядов в работе: ${bestOpen}` : 'нет открытых нарядов',
  ]
  if (equipment) {
    parts.push(
      bestEq
        ? `по «${equipment.equipmentName}»: ${bestEq.count} нар.` +
            (bestEq.avgScore != null ? `, средняя оценка ${bestEq.avgScore.toFixed(1)}` : '')
        : `по «${equipment.equipmentName}» опыта ещё нет`,
    )
  }
  return { worker: best, reason: `Подсказка: ${best.fullName} — ${parts.join(', ')}.` }
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

// ---------- NVIDIA NIM: вызовы реальной модели ----------
// Выше — локальные эвристики (фоллбэк), ниже — обёртки над моделью.
// Все функции НЕ бросают исключений на уровне сети: при недоступности
// модели они возвращают результат эвристики с source: 'local'.

export interface FaultSuggestion {
  code: string | null
  normHours: number | null
  hint: string
  source: 'nim' | 'local'
}

/** Фоллбэк подсказки шифра: эвристика + привязка к реальному коду справочника. */
function localFaultSuggestion(description: string, faultCodes: FaultCode[]): FaultSuggestion {
  const s = suggestFaultCode(description)
  const fromCatalog = faultCodes.find((f) => f.code.startsWith(`${s.code[0]}-`))
  if (fromCatalog) {
    return {
      code: fromCatalog.code,
      normHours: fromCatalog.normHours ?? s.normHours,
      hint: `Подсказка по ключевым словам: ${fromCatalog.code} — ${fromCatalog.name}.`,
      source: 'local',
    }
  }
  return { code: s.code, normHours: s.normHours, hint: s.hint, source: 'local' }
}

/**
 * Подсказка шифра неисправности: модель выбирает ОДИН код строго из
 * справочника (ТЗ §2.5). Без ключа или при ошибке сети — локальная эвристика.
 */
export async function searchFaultCode(
  description: string,
  faultCodes: FaultCode[],
): Promise<FaultSuggestion> {
  if (llmConfigured && description.trim() && faultCodes.length > 0) {
    try {
      const catalog = faultCodes
        .map((f) => `${f.code} — ${f.name}${f.normHours != null ? ` (норматив ${f.normHours} ч)` : ''}`)
        .join('\n')
      const res = await llmJson<{ code?: unknown; reason?: unknown }>({
        system:
          'Ты — опытный механик производственного участка. По описанию проблемы выбери ОДИН ' +
          'наиболее подходящий шифр неисправности СТРОГО из переданного справочника — ' +
          'придумывать новые коды нельзя. Отвечай только JSON вида ' +
          '{"code":"М-01","reason":"почему подходит"} — без markdown.',
        user: `Описание проблемы:\n${description.trim()}\n\nСправочник шифров:\n${catalog}`,
        maxTokens: 2_000,
        temperature: 0.1,
      })
      const code = typeof res.code === 'string' ? res.code.trim() : ''
      const match = faultCodes.find((f) => f.code === code)
      if (match) {
        const reason = typeof res.reason === 'string' ? res.reason.replace(/\s*\n+\s*/g, ' ').trim() : ''
        return {
          code: match.code,
          normHours: match.normHours,
          hint: `ИИ (${LLM_MODEL}): ${match.code} — ${match.name}.${reason ? ` ${reason}` : ''}`,
          source: 'nim',
        }
      }
    } catch {
      // модель недоступна — откат на эвристику
    }
  }
  return localFaultSuggestion(description, faultCodes)
}

/**
 * ИИ-подсказка исполнителя: модель выбирает одного из бригады по задаче,
 * статусу и нагрузке. При недоступности модели — локальная эвристика.
 */
export async function searchWorker(
  workers: Worker[],
  orders: WorkOrder[],
  task?: string,
  equipment?: WorkerEquipmentContext | null,
): Promise<WorkerSuggestion | null> {
  if (llmConfigured && workers.length > 0) {
    try {
      // PDF §9: во внешнюю модель уходят только псевдонимы, ФИО восстанавливаем
      // в ответе модели локально (см. anonymize.ts).
      const anon = createAnonymizer(workers)
      const roster = workers
        .map((w) => {
          const open = orders.filter(
            (o) => o.workerId === w.id && ['issued', 'accepted', 'in_work', 'queued'].includes(o.status),
          ).length
          const eq = equipment?.stats[w.id]
          const bits = [
            w.specialty,
            w.rank ?? null,
            w.brigade ? `бригада ${w.brigade}` : null,
            `статус: ${WORKER_STATUS_LABELS[w.status]}`,
            `рейтинг ${w.rating}`,
            `открытых нарядов: ${open}`,
            equipment
              ? eq
                ? `по оборудованию «${equipment.equipmentName}»: ${eq.count} нар., ` +
                  `средняя оценка ${eq.avgScore != null ? eq.avgScore.toFixed(1) : 'не выставлена'}`
                : `по оборудованию «${equipment.equipmentName}» опыта нет`
              : null,
          ]
            .filter(Boolean)
            .join(', ')
          return `${w.id} — ${anon.alias(w.id)} (${bits})`
        })
        .join('\n')
      const res = await llmJson<{ workerId?: unknown; reason?: unknown }>({
        system:
          'Ты — диспетчер производства. По задаче и списку бригады выбери ОДИН наиболее ' +
          'подходящий исполнитель: специальность должна подходить задаче, «не на смене» — брать нельзя, ' +
          'учитывай рейтинг и открытые наряды' +
          (equipment
            ? `, а также опыт и среднюю оценку по оборудованию «${equipment.equipmentName}» ` +
              '(желательный критерий, не обязательный)'
            : '') +
          '. Отвечай только JSON вида ' +
          '{"workerId":"...","reason":"почему он"} — без markdown.',
        user: `Задача:\n${(task ?? '').trim() || '(описание не задано)'}\n\nБригада:\n${roster}`,
        maxTokens: 1_500,
        temperature: 0.1,
      })
      const id = typeof res.workerId === 'string' ? res.workerId.trim() : ''
      const worker = workers.find((w) => w.id === id && w.status !== 'not_on_shift')
      if (worker) {
        const reason = typeof res.reason === 'string'
          ? res.reason.replace(/\s*\n+\s*/g, ' ').replace(/[.\s]+$/, '').trim()
          : ''
        return {
          worker,
          reason: `ИИ (${LLM_MODEL}): ${anon.restore(reason) || worker.fullName}.`,
        }
      }
    } catch {
      // модель недоступна — откат на эвристику
    }
  }
  return suggestWorker(workers, orders, equipment)
}

/**
 * Вердикт §3.2 силами модели: пять критериев ТЗ оценивает языковая модель
 * (включая соответствие работ проблеме — сравнение описаний). Присланный JSON
 * переопределяет passed/comment, счёт считается как локально (пройдено
 * критериев, 1..5). Бросает исключение, если ключ не задан или модель
 * недоступна — вызывающий код показывает локальный aiVerdict.
 */
export async function aiVerdictLLM(order: WorkOrder, faultCodes: FaultCode[] = []): Promise<AiVerdict> {
  if (!llmConfigured) throw new Error('NVIDIA NIM: ключ не задан')

  const fault = faultCodes.find((f) => f.code === order.faultCode) ?? null
  const photoMeta = (list: string[]) =>
    list.map((src) => `${Math.round((src.length * 0.75) / 1024)} КБ`)
  const context = {
    номер: order.number,
    тип_работ: order.workType === 'planned' ? 'плановый' : 'внеплановый',
    приоритет: order.priority,
    описание_проблемы_и_работ: order.description,
    выполненные_работы: order.workDone ?? null,
    комментарий_исполнителя: order.workerComment ?? null,
    списанные_материалы: order.materials ?? null,
    позиции_материалов: (order.materialsList ?? []).map((m) => `${m.name} × ${m.qty} ${m.unit}`),
    шифр_неисправности: fault
      ? {
          код: fault.code,
          название: fault.name,
          материальный_норматив: fault.materialNorm,
          норматив_ч: fault.normHours,
        }
      : order.faultCode,
    норматив_наряда_ч: order.normHours,
    срок_исполнения: order.deadline,
    начало: order.startedAt,
    завершение: order.completedAt,
    фото_до_шт: order.photos.length,
    фото_после_шт: order.photosAfter.length,
    фото_после_размеры_КБ: photoMeta(order.photosAfter),
    комментарий_мастера: order.comment ?? null,
  }

  const res = await llmJson<{
    criteria?: Partial<Record<string, { passed?: unknown; comment?: unknown }>>
    summary?: unknown
  }>({
    system:
      'Ты — ИИ-инспектор качества ремонтных работ (ТЗ §3.2, оценка и контроль качества). ' +
      'Оцени наряд по пяти критериям и строго верни JSON вида ' +
      '{"criteria":{"COMPLETENESS":{"passed":true,"comment":"..."},' +
      '"PROBLEM_MATCH":{"passed":true,"comment":"..."},' +
      '"MATERIAL_LOGIC":{"passed":true,"comment":"..."},' +
      '"TIME_NORM":{"passed":true,"comment":"..."},' +
      '"PHOTO_QUALITY":{"passed":true,"comment":"..."}},"summary":"..."}. ' +
      'Критерии: COMPLETENESS — заполнены ли выполненные работы, шифр, материалы и фото «после»; ' +
      'PROBLEM_MATCH — сравни описание проблемы и описание выполненных работ: работы должны реально ' +
      'закрывать заявленную проблему; MATERIAL_LOGIC — списанные материалы соответствуют типу работ ' +
      'и шифру неисправности, нет ли завышения против обычного расхода и норматива; ' +
      'TIME_NORM — фактическое время против норматива шифра и планового срока; ' +
      'PHOTO_QUALITY — достаточность фото «после» (ты не видишь изображения — суди по их количеству ' +
      'и размерам файлов). passed — строго boolean; comment — по-русски, 1–2 предложения, без markdown; ' +
      'summary — итог одной фразой по-русски.',
    user: `Наряд для оценки:\n${JSON.stringify(context, null, 2)}`,
    maxTokens: 4_000,
    temperature: 0.1,
    timeoutMs: 60_000,
  })

  // База — локальная оценка: она покрывает критерии, которые модель
  // не прислала, и задаёт структуру чек-листа ТЗ.
  const base = aiVerdict(order, faultCodes)
  const criteria = res.criteria ?? {}
  const clean = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.trim() ? v.replace(/\s*\n+\s*/g, ' ').trim() : fallback
  const checklist: ChecklistItem[] = base.checklist.map((c) => {
    const r = criteria[c.code]
    return {
      ...c,
      passed: r && typeof r.passed === 'boolean' ? r.passed : c.passed,
      comment: clean(r?.comment, c.comment ?? ''),
    }
  })

  const passedCount = checklist.filter((c) => c.passed).length
  const score = Math.max(1, Math.min(5, passedCount))
  const failed = checklist.filter((c) => !c.passed).map((c) => c.label.toLowerCase())
  const summary = clean(res.summary, '')
  const comment =
    `Оценка ИИ (${LLM_MODEL}): ${score}/5. Пройдено критериев: ${passedCount}/5. ` +
    (summary || (failed.length ? `Требует внимания: ${failed.join(', ')}.` : 'Замечаний не найдено.'))
  return { score, comment, checklist }
}

// ---------- ИИ-сводка аномалий (Веб-панель руководителя, Раздел 3) ----------

export interface AnomalySummary {
  text: string
  source: 'nim' | 'local'
}

/** Вид ИИ-сводки: аномалии (панель руководителя), смена и рекомендации
 *  (отчёты Мастера). */
export type SummaryKind = 'anomalies' | 'shift' | 'recommendations'

const SUMMARY_SYSTEM: Record<SummaryKind, string> = {
  anomalies:
    'Ты — аналитик по надёжности оборудования. По переданным фактам-аномалиям ' +
    '(плановые работы и внеплановые после них, бригады, участки и оборудование, ' +
    'перерасход материалов) напиши краткую сводку по-русски: 2–4 предложения, ' +
    'выдели самые серьёзные проблемы и возможные общие причины. Без markdown и ' +
    'без списков. Отвечай только JSON вида {"summary":"..."}.',
  shift:
    'Ты — старший мастер производства. По переданным фактам за смену (выдано, ' +
    'выполнено, просрочено, отклонено, загрузка персонала, простои) напиши итоговую ' +
    'сводку по-русски: 2–4 предложения — что прошло хорошо, что требует внимания ' +
    'и на что обратить внимание в первую очередь. Без markdown и без списков. ' +
    'Отвечай только JSON вида {"summary":"..."}.',
  recommendations:
    'Ты — инженер по надёжности. По переданным фактам (топ проблемного ' +
    'оборудования и участков, повторные отказы) дай выводы и конкретные ' +
    'рекомендации по-русски: 3–5 предложений с приоритетами. Опирайся только на ' +
    'переданные факты, не выдумывай данные. Без markdown и без списков. ' +
    'Отвечай только JSON вида {"summary":"..."}.',
}

/**
 * Универсальная текстовая сводка от модели: `facts` — готовые строки-факты,
 * `local` — заранее собранный текстовый фоллбэк (используется, если ключ не
 * задан, фактов нет или модель недоступна).
 */
export async function aiTextSummary(
  kind: SummaryKind,
  facts: string[],
  local: string,
  restore?: (text: string) => string,
): Promise<AnomalySummary> {
  if (!llmConfigured || facts.length === 0) return { text: local, source: 'local' }
  try {
    const res = await llmJson<{ summary?: unknown }>({
      system: SUMMARY_SYSTEM[kind],
      user: `Факты:\n${facts.map((f) => `- ${f}`).join('\n')}`,
      maxTokens: kind === 'recommendations' ? 2_000 : 1_500,
      temperature: 0.3,
      timeoutMs: 45_000,
    })
    const text = typeof res.summary === 'string'
      ? res.summary.replace(/\s*\n+\s*/g, ' ').trim()
      : ''
    // restore возвращает настоящие ФИО в ответе модели: в промпт они не уходили
    // (PDF §9) — внешней модели переданы только псевдонимы.
    if (text) return { text: `ИИ (${LLM_MODEL}): ${restore ? restore(text) : text}`, source: 'nim' }
  } catch {
    // модель недоступна — отдаём локальную сводку
  }
  return { text: local, source: 'local' }
}

/**
 * Текстовая сводка аномалий, сгенерированная ИИ (Раздел 3 ТЗ «Веб-панель
 * руководителя»). Без ключа/сети или при ошибке модели — локальная сводка
 * из тех же фактов.
 */
export async function anomalySummaryLLM(facts: string[]): Promise<AnomalySummary> {
  const local = facts.length === 0
    ? 'Аномалий за выбранный период не выявлено: плановые работы не сопровождались ' +
      'внеплановыми в течение недели, перерасхода ТМЦ нет.'
    : `Правила анализа выявили аномалии (${facts.length}). ` + facts.slice(0, 6).join(' ')
  return aiTextSummary('anomalies', facts, local)
}

/**
 * Свободный ИИ-ассистент мастера (раздел «ИИ»): отвечает на вопрос в свободной
 * форме по переданному снимку данных. Бросает исключение, если ключ не задан
 * или модель недоступна — вызывающий код показывает локальный ответ.
 */
export async function assistantAnswerLLM(question: string, context: string): Promise<string> {
  if (!llmConfigured) throw new Error('ИИ-помощник недоступен: ключ NVIDIA NIM не задан')
  const text = await llmChat({
    system:
      'Ты — ИИ-помощник мастера производственного участка (система «Наряды»). ' +
      'Отвечай по-русски, кратко и по делу (2–5 предложений или короткий список). ' +
      'Опирайся ТОЛЬКО на переданный снимок данных; если данных не хватает — скажи, ' +
      'чего именно не хватает, и не выдумывай значения. Не используй markdown-таблицы.',
    user: `Снимок данных системы:\n${context}\n\nВопрос мастера: ${question}`,
    maxTokens: 1_500,
    temperature: 0.2,
    timeoutMs: 45_000,
  })
  return text.replace(/\s*\n{2,}\s*/g, '\n').trim()
}
