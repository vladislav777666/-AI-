// Раздел «ИИ» у Мастера: чат и голосовой помощник.
//
// Концепт: мастер задаёт вопрос в свободной форме, помощник отвечает по
// текущим данным системы (персонал, наряды, сроки, оборудование, отчёты).
// Ответы даёт модель NVIDIA NIM по снимку данных; без ключа или при ошибке
// сети работают локальные правила — они же мгновенный фоллбэк.
//
// Примеры типичных запросов: «Кто сейчас свободен из электриков?»,
// «Что просрочено на смене?», «Сформируй отчёт за неделю по участку…».

import { useEffect, useMemo, useRef, useState } from 'react'
import { assistantAnswerLLM } from '../../lib/ai'
import { LLM_MODEL, llmConfigured } from '../../lib/llm'
import { speechToTextSupported, startSpeechToText } from '../../lib/photos'
import {
  WORKER_STATUS_LABELS,
  isOverdue,
  type WorkOrder,
  type Worker,
} from '../../lib/types'
import { Btn, Screen, TextInput } from '../../components/ui'
import { Note } from '../head/shared'
import type { MasterData } from './nav'

interface Msg {
  id: number
  role: 'user' | 'ai'
  text: string
  source?: 'nim' | 'local'
  /** Почему ответ собран правилами, хотя ключ модели задан (модель недоступна). */
  reason?: string
}

const EXAMPLES = [
  'Кто сейчас свободен из электриков?',
  'Что просрочено на смене?',
  'Сформируй отчёт за неделю по участку обогащения',
]

export default function AiChat({ data }: { data: MasterData }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextId = useRef(1)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const context = useMemo(() => buildContext(data), [data])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setError(null)
    setText('')
    const userMsg: Msg = { id: nextId.current++, role: 'user', text: q }
    setMessages((m) => [...m, userMsg])
    setBusy(true)
    try {
      const answer = await assistantAnswerLLM(q, context)
      setMessages((m) => [...m, { id: nextId.current++, role: 'ai', text: answer, source: 'nim' }])
    } catch (err) {
      // Ключа нет или модель недоступна — отвечают локальные правила; причину
      // показываем в пометке ответа, а не техническим баннером.
      const local = localAnswer(q, data)
      const reason = err instanceof Error && llmConfigured
        ? `Модель недоступна: ${err.message}`
        : undefined
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: 'ai', text: local.text, source: 'local', reason },
      ])
    } finally {
      setBusy(false)
    }
  }

  function toggleDictation() {
    if (listening) return
    if (!speechToTextSupported()) {
      setError('Голосовой ввод не поддерживается этим браузером.')
      return
    }
    setListening(true)
    const stop = startSpeechToText(
      (recognized) => setText((t) => `${t} ${recognized}`.trim()),
      () => setListening(false),
    )
    setTimeout(() => { stop(); setListening(false) }, 8000)
  }

  return (
    <Screen title="ИИ-помощник" subtitle="Чат и голосовой помощник по данным предприятия">
      <div className="border border-neutral-200 bg-white p-4">
        <h3 className="font-semibold">Что это</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Помощник отвечает на вопросы мастера в свободной форме по текущим данным системы:
          занятость персонала, сроки нарядов, оборудование и отчётность. Можно написать вопрос
          текстом или надиктовать голосом. Ответы формирует модель NVIDIA NIM по снимку данных;
          без ключа или при недоступности модели работают локальные правила — тогда ответ помечается
          как «правила».
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => void ask(e)}
              disabled={busy}
              className="border border-neutral-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              «{e}»
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-700">{error}</p>
      )}

      <div className="flex min-h-[40svh] flex-col gap-3 border border-neutral-200 bg-white p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Задайте вопрос или выберите пример выше. Помощник видит: исполнителей и их занятость,
            сроки и статусы нарядов, участки и оборудование.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-line px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'border border-neutral-900 bg-neutral-900 text-white'
                  : 'border border-neutral-200 bg-neutral-50 text-neutral-900'
              }`}
            >
              {m.text}
              {m.role === 'ai' && m.source && (
                <div className="mt-1 text-xs text-neutral-400">
                  {m.source === 'nim'
                    ? `NVIDIA NIM · ${LLM_MODEL}`
                    : `Локальные правила${m.reason ? ` · ${m.reason}` : ''}`}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-neutral-500">ИИ формирует ответ…</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void ask(text) }}
      >
        <TextInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: кто свободен из механиков?"
          className="min-w-48 flex-1"
        />
        <Btn variant="ghost" onClick={toggleDictation}>
          {listening ? '● Слушаю…' : '🎙 Надиктовать'}
        </Btn>
        <Btn onClick={() => void ask(text)} disabled={busy || !text.trim()}>Спросить</Btn>
      </form>

      <Note>
        Примеры типичных запросов: проверка занятости и распределение персонала, контроль
        текущих задач и оперативных срывов, быстрый поиск и генерация аналитики по подразделению.
        Ответы строятся только по данным системы — если сведений не хватает, помощник об этом скажет.
      </Note>
    </Screen>
  )
}

// ---------- Снимок данных для модели ----------

/** Компактный текстовый снимок состояния: его получает модель и правила. */
export function buildContext(data: MasterData): string {
  const now = new Date()
  const open = data.orders.filter((o) => !['closed', 'cancelled'].includes(o.status))
  const overdue = data.orders.filter((o) => isOverdue(o))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const closedToday = data.orders.filter((o) => o.closedAt && new Date(o.closedAt) >= today)

  const workers = data.workers.map((w) => {
    const mine = data.orders.filter((o) => o.workerId === w.id)
    const activeCount = mine.filter((o) => ['issued', 'accepted', 'in_work', 'queued', 'suspended', 'rework'].includes(o.status)).length
    return `${w.fullName} — ${w.specialty}${w.rank ? `, ${w.rank}` : ''}` +
      `${w.brigade ? `, ${w.brigade}` : ''}; статус: ${WORKER_STATUS_LABELS[w.status]}` +
      `; рейтинг: ${w.rating}; открытых нарядов: ${activeCount}` +
      `${w.areaId ? `; участок: ${areaName(data, w.areaId)}` : ''}`
  })

  const orderLine = (o: WorkOrder) =>
    `${o.number} — ${o.status}; ${o.workType === 'planned' ? 'плановый' : 'внеплановый'}; ` +
    `оборудование: ${equipmentName(data, o.equipmentId)}; участок: ${areaName(data, o.areaId)}; ` +
    `исполнитель: ${workerName(data, o.workerId)}; срок: ${new Date(o.deadline).toLocaleString('ru-RU')}` +
    `${o.faultCode ? `; шифр: ${o.faultCode}` : ''}`

  const byEquipment = new Map<string, number>()
  for (const o of data.orders) byEquipment.set(o.equipmentId, (byEquipment.get(o.equipmentId) ?? 0) + 1)

  return [
    `Дата и время: ${now.toLocaleString('ru-RU')}.`,
    `Всего нарядов: ${data.orders.length}; открыто: ${open.length}; просрочено: ${overdue.length}; закрыто сегодня: ${closedToday.length}.`,
    `Участки: ${data.areas.map((a) => a.name).join(', ') || '—'}.`,
    `Оборудование: ${data.equipment.map((e) => `${e.name} (${areaName(data, e.areaId)}, нарядов: ${byEquipment.get(e.id) ?? 0})`).join('; ') || '—'}.`,
    `Персонал:\n${workers.map((w) => `- ${w}`).join('\n') || '- нет'}`,
    `Открытые наряды:\n${open.slice(0, 40).map((o) => `- ${orderLine(o)}`).join('\n') || '- нет'}`,
    `Просроченные наряды:\n${overdue.slice(0, 20).map((o) => `- ${orderLine(o)}`).join('\n') || '- нет'}`,
    `Справочник шифров: М — механика, Э — электрика, Г — гидравлика, П — пневматика, С — смазка.`,
  ].join('\n')
}

function areaName(data: MasterData, id: string | null): string {
  return (id && data.areas.find((a) => a.id === id)?.name) || '—'
}
function equipmentName(data: MasterData, id: string): string {
  return data.equipment.find((e) => e.id === id)?.name ?? '—'
}
function workerName(data: MasterData, id: string | null): string {
  return (id && data.workers.find((w) => w.id === id)?.fullName) || '—'
}

// ---------- Локальные правила (фоллбэк без модели) ----------

/** Специальности для поиска «кто свободен из …». */
const TRADES: Array<{ match: string[]; label: string }> = [
  { match: ['электрик', 'электромонт', 'электро'], label: 'электрики' },
  { match: ['механик', 'слесар'], label: 'механики' },
  { match: ['электромеханик'], label: 'электромеханики' },
  { match: ['наладчик'], label: 'наладчики' },
  { match: ['сварщик'], label: 'сварщики' },
]

function freeWorkers(data: MasterData, trade: string | null): Worker[] {
  const free = data.workers.filter((w) => w.status === 'free')
  if (!trade) return free
  return free.filter((w) =>
    w.specialty.toLowerCase().includes(trade) || (w.fullName + w.specialty).toLowerCase().includes(trade),
  )
}

/**
 * Локальный ответ по правилам: разбор типичных запросов мастера. Работает
 * без ключа NIM и остаётся быстрым фоллбэком при ошибке модели.
 */
export function localAnswer(question: string, data: MasterData): { text: string } {
  const q = question.toLowerCase()

  // 1. «Кто сейчас свободен из …?»
  if (/свобод/.test(q)) {
    const trade = TRADES.find((t) => t.match.some((m) => q.includes(m)))
    const list = freeWorkers(data, trade ? trade.match[0] : null)
    if (list.length === 0) {
      return { text: `Свободных${trade ? ` ${trade.label}` : ''} сейчас нет: все заняты или не на смене. Список статусов — в разделе «Исполнители».` }
    }
    return {
      text: `Свободн${list.length === 1 ? 'ый' : 'ые'}${trade ? ` ${trade.label}` : ''}: ` +
        list.map((w) => `${w.fullName} (${w.specialty}${w.brigade ? `, ${w.brigade}` : ''}, рейтинг ${w.rating})`).join('; ') +
        `. Можно выдавать наряд: раздел «Выдать наряд».`,
    }
  }

  // 2. «Что просрочено на смене?»
  if (/просроч/.test(q)) {
    const overdue = data.orders.filter((o) => isOverdue(o))
    if (overdue.length === 0) return { text: 'Просроченных нарядов нет.' }
    return {
      text: `Просрочено нарядов: ${overdue.length}.\n` +
        overdue.map((o) => `• ${o.number} — ${equipmentName(data, o.equipmentId)}, ` +
          `исполнитель: ${workerName(data, o.workerId)}, срок: ${new Date(o.deadline).toLocaleString('ru-RU')}`).join('\n'),
    }
  }

  // 3. «Сформируй отчёт за <период> по участку …»
  if (/(отч[её]т|сформир|покажи|статистик)/.test(q)) {
    const days = /недел/.test(q) ? 7 : /(месяц|30)/.test(q) ? 30 : /(сутк|день|дня)/.test(q) ? 1 : 0
    const since = days === 0
      ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
      : Date.now() - days * 86_400_000
    const area = data.areas.find((a) => q.includes(a.name.toLowerCase()))
    const brigade = [...new Set(data.workers.map((w) => (w.brigade ?? '').trim()).filter(Boolean))]
      .find((b) => q.includes(b.toLowerCase()))
    const worker = data.workers.find((w) => q.includes(w.fullName.toLowerCase().split(' ')[0]))
    const scoped = data.orders.filter((o) => {
      if (new Date(o.createdAt).getTime() < since) return false
      if (area && o.areaId !== area.id) return false
      if (brigade && (data.workers.find((w) => w.id === o.workerId)?.brigade ?? '') !== brigade) return false
      if (worker && o.workerId !== worker.id) return false
      return true
    })
    const label = days === 0 ? 'смену' : days === 1 ? 'сутки' : days === 7 ? 'неделю' : 'месяц'
    const scope = [area ? `участок «${area.name}»` : null, brigade ? `бригада «${brigade}»` : null,
      worker ? `исполнитель ${worker.fullName}` : null].filter(Boolean).join(', ') || 'всё предприятие'
    if (scoped.length === 0) {
      return { text: `За ${label} по фильтру (${scope}) нарядов нет.` }
    }
    const closed = scoped.filter((o) => o.status === 'closed').length
    const overdue = scoped.filter((o) => isOverdue(o)).length
    const rejected = scoped.filter((o) => o.status === 'rejected').length
    const unplanned = scoped.filter((o) => o.workType === 'unplanned').length
    return {
      text: `Отчёт за ${label} (${scope}): нарядов ${scoped.length}, закрыто ${closed}, ` +
        `внеплановых ${unplanned}, просрочено ${overdue}, отклонено ${rejected}.\n` +
        `Подробные срезы — в разделе «Отчёты» (фильтры участка, оборудования, исполнителя и бригады, ` +
        `выгрузка в PDF и Excel).`,
    }
  }

  // 4. «Кто занят / у кого больше всего нарядов»
  if (/(занят|загруж|работает)/.test(q)) {
    const busy = data.workers
      .map((w) => ({ w, n: data.orders.filter((o) => o.workerId === w.id && ['in_work', 'accepted', 'rework'].includes(o.status)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
    if (busy.length === 0) return { text: 'Сейчас никто не в работе.' }
    return { text: 'Заняты: ' + busy.map((x) => `${x.w.fullName} — ${x.n} нар. (${x.w.status === 'busy' ? 'в работе' : WORKER_STATUS_LABELS[x.w.status]})`).join('; ') + '.' }
  }

  // 5. «Проблемное оборудование»
  if (/(оборудован|част|проблем)/.test(q)) {
    const counts = new Map<string, number>()
    for (const o of data.orders) counts.set(o.equipmentId, (counts.get(o.equipmentId) ?? 0) + 1)
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => `${equipmentName(data, id)} — ${n} нар.`)
    if (top.length === 0) return { text: 'Нарядов по оборудованию пока нет.' }
    return { text: `Чаще всего обращаются: ${top.join('; ')}. Детальный разбор — в «Отчётах» → «Аномалии и зависимости» и в панели руководителя.` }
  }

  return {
    text: 'Пока понимаю типовые запросы: кто свободен из электриков/механиков, что просрочено ' +
      'на смене, сформируй отчёт за неделю (месяц, сутки) по участку или бригаде, кто сейчас занят, ' +
      'какое оборудование проблемное. Для свободной формулировки нужен ключ NVIDIA NIM ' +
      '(VITE_NVIDIA_NIM_API_KEY) — тогда отвечает модель.',
  }
}
