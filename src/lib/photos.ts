// Загрузка фото: сжимаем через canvas до 1024px по большей стороне,
// конвертируем в JPEG data URL — чтобы JSONB в Supabase не раздувался.

const MAX_SIDE = 1024
const QUALITY = 0.7

export async function fileToCompactDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file)
  try {
    const img = await loadImage(raw)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', QUALITY)
  } catch {
    return raw // если картинка не декодировалась — оставляем как есть
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось декодировать изображение'))
    img.src = src
  })
}

/** Голосовой ввод (Web Speech API) — мок «ИИ превращает голос в текст». */
export function speechToTextSupported(): boolean {
  return typeof window !== 'undefined' && 'webkitSpeechRecognition' in window
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function startSpeechToText(onResult: (text: string) => void, onError: () => void): () => void {
  const Ctor = (window as unknown as {
    webkitSpeechRecognition: new () => SpeechRecognitionLike
  }).webkitSpeechRecognition
  const rec = new Ctor()
  rec.lang = 'ru-RU'
  rec.interimResults = false
  rec.onresult = (e) => {
    let text = ''
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + ' '
    onResult(text.trim())
  }
  rec.onerror = onError
  rec.onend = onError
  rec.start()
  return () => rec.stop()
}
