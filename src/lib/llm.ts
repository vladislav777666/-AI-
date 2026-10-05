// Клиент NVIDIA NIM (OpenAI-совместимый chat/completions) — реальная модель
// вместо ИИ-заглушек: подсказка шифра неисправности, выбор исполнителя,
// вердикт приёмки §3.2.
//
// Конфигурация (Vite подставляет только VITE_-префикс):
//   VITE_NVIDIA_NIM_API_KEY — ключ NIM (без него все вызовы «тихо» падают
//                             в локальные эвристики ai.ts, сеть не трогается);
//   VITE_NIM_MODEL          — модель, можно с префиксом провайдера
//                             litellm «nvidia_nim/» — он отбрасывается;
//   VITE_ENABLE_THINKING    — «true» (по умолчанию) → enable_thinking: true;
//   VITE_NIM_API_URL        — точка вызова; по умолчанию same-origin
//                             «/nim/...» — проксируется Vite (см. vite.config.ts):
//                             шлюз NVIDIA не отдаёт ACAO в preflight, прямые
//                             браузерные вызовы с Authorization блокируются CORS.
//                             Абсолютный URL имеет смысл, только если фронт
//                             обслуживает reverse-proxy, настроенный на CORS.
//
// Ключ попадает в JS-бандл клиента — так же, как anon-ключ Supabase.

const DEFAULT_API_URL = '/nim/v1/chat/completions'
const apiUrl = (import.meta.env.VITE_NIM_API_URL as string | undefined) || DEFAULT_API_URL

const apiKey = import.meta.env.VITE_NVIDIA_NIM_API_KEY as string | undefined
const rawModel = (import.meta.env.VITE_NIM_MODEL as string | undefined) ?? 'nvidia_nim/openai/gpt-oss-20b'
const enableThinking = String(import.meta.env.VITE_ENABLE_THINKING ?? 'true') !== 'false'

/** Имя модели для API: отбрасываем префикс провайдера litellm «nvidia_nim/». */
export const LLM_MODEL = rawModel.replace(/^nvidia_nim\//, '')

/** Ключ задан — ИИ-вызовы разрешены (иначе работают только эвристики). */
export const llmConfigured = Boolean(apiKey)

export interface LlmCallOptions {
  system?: string
  user: string
  /** Просим строгий JSON (response_format json_object) и парсим его же. */
  json?: boolean
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

/** Один чат-вызов к NVIDIA NIM. Бросает ошибку при любой проблеме —
 *  вызывающий код обязан иметь фоллбэк. */
export async function llmChat(opts: LlmCallOptions): Promise<string> {
  if (!apiKey) throw new Error('NVIDIA NIM: ключ не задан (VITE_NVIDIA_NIM_API_KEY)')

  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  messages.push({ role: 'user', content: opts.user })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000)
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 2_000,
        temperature: opts.temperature ?? 0.2,
        enable_thinking: enableThinking,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) throw new Error(`NVIDIA NIM: HTTP ${res.status}`)
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content || !content.trim()) throw new Error('NVIDIA NIM: пустой ответ модели')
    return content
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('NVIDIA NIM: таймаут запроса')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** JSON-вызов: модель отвечает объектом, парсим с защитой от markdown-обёрток. */
export async function llmJson<T>(opts: LlmCallOptions): Promise<T> {
  const text = await llmChat({ ...opts, json: true })
  return parseLlmJson<T>(text)
}

/** Терпимый парсер: убирает ```json-обёртки, берём первый {...}. */
export function parseLlmJson<T>(text: string): T {
  const cleaned = text.replace(/```[a-z]*/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('NVIDIA NIM: в ответе нет JSON')
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}
