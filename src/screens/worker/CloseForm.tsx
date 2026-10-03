// Frame 20: форма закрытия наряда. Голос (§17–18), шифр из справочника (§19),
// материалы с дедупом (§20), фото «после» с валидацией (§21–22), комментарий
// (§23), подтверждение (§24), защита от повторной отправки (§25).

import { useMemo, useState } from 'react'
import { fileToCompactDataUrl, speechToTextSupported, startSpeechToText } from '../../lib/photos'
import { WORK_TYPE_LABELS, type MaterialItem } from '../../lib/types'
import { Btn, Card, Field, Screen, Select, TextArea, TextInput } from '../../components/ui'
import type { WorkerCtx } from './shared'

interface FormState {
  workDone: string
  faultCode: string
  materials: MaterialItem[]
  photosAfter: string[]
  workerComment: string
}

const MAX_PHOTOS = 8
const UNPLANNED_PHOTO_ERROR =
  'Для внепланового наряда необходимо добавить хотя бы одну фотографию после выполнения работ.'

export default function CloseForm({ ctx, orderId }: { ctx: WorkerCtx; orderId: string }) {
  const order = ctx.orders.find((o) => o.id === orderId) ?? null
  const [form, setForm] = useState<FormState>(() => ({
    workDone: order?.workDone ?? '',
    faultCode: order?.faultCode ?? '',
    materials: order?.materialsList ?? [],
    photosAfter: order?.photosAfter ?? [],
    workerComment: order?.workerComment ?? '',
  }))
  const [codeQuery, setCodeQuery] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [listening, setListening] = useState(false)

  // Новая позиция материала.
  const [matName, setMatName] = useState('')
  const [matQty, setMatQty] = useState('')
  const [matUnit, setMatUnit] = useState('шт.')

  const filteredCodes = useMemo(() => {
    const q = codeQuery.trim().toLowerCase()
    if (!q) return ctx.faultCodes
    return ctx.faultCodes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    )
  }, [ctx.faultCodes, codeQuery])

  if (!order) {
    return <Screen title="Закрытие наряда"><p className="text-sm text-neutral-500">Наряд не найден.</p></Screen>
  }

  function addMaterial() {
    const name = matName.trim()
    const qty = Number(matQty.replace(',', '.'))
    if (!name) return setErrors(['Укажите материал или запчасть.'])
    if (!qty || qty <= 0) return setErrors(['Количество должно быть больше 0.'])
    // Дедуп (§20): совпадение по названию → суммируем количество.
    const existing = form.materials.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())
    if (existing) {
      setForm((f) => ({
        ...f,
        materials: f.materials.map((m) => (m === existing ? { ...m, qty: m.qty + qty } : m)),
      }))
    } else {
      setForm((f) => ({ ...f, materials: [...f.materials, { name, qty, unit: matUnit }] }))
    }
    setMatName('')
    setMatQty('')
    setErrors([])
  }

  function validate(): string[] {
    const errs: string[] = []
    if (!form.workDone.trim()) errs.push('Заполните «Выполненные работы».')
    if (!form.faultCode) errs.push('Выберите шифр неисправности из справочника.')
    if (order!.workType === 'unplanned' && form.photosAfter.length === 0) errs.push(UNPLANNED_PHOTO_ERROR)
    return errs
  }

  async function pickPhotos(files: FileList | null) {
    if (!files) return
    const room = MAX_PHOTOS - form.photosAfter.length
    const taken = Array.from(files).slice(0, Math.max(0, room))
    const urls = await Promise.all(taken.map(fileToCompactDataUrl))
    setForm((f) => ({ ...f, photosAfter: [...f.photosAfter, ...urls] }))
  }

  function toggleDictation() {
    if (listening) return
    if (!speechToTextSupported()) {
      setErrors(['Голосовой ввод не поддерживается этим устройством — введите текст вручную.'])
      return
    }
    setListening(true)
    const stop = startSpeechToText(
      (text) => setForm((f) => ({ ...f, workDone: (f.workDone + ' ' + text).trim() })),
      () => setListening(false),
    )
    setTimeout(() => { stop(); setListening(false) }, 8000)
  }

  async function submit() {
    const errs = validate()
    setErrors(errs)
    if (errs.length > 0) return
    setConfirming(false)
    setBusy(true)
    try {
      const materialsText = form.materials.map((m) => `${m.name} — ${m.qty} ${m.unit}`).join(', ')
      await ctx.act({
        orderId: order!.id,
        patch: {
          workDone: form.workDone.trim(),
          faultCode: form.faultCode,
          materialsList: form.materials,
          materials: materialsText || null,
          photosAfter: form.photosAfter,
          workerComment: form.workerComment.trim() || null,
        },
        action: 'Работы сданы',
        status: 'completed',
        notify: {
          type: 'ACCEPTANCE',
          title: `Наряд ${order!.number} на приёмке`,
          message: 'Исполнитель отправил работы на приёмку.',
        },
      })
      setSubmitted(true)
      ctx.go({ view: 'registry' })
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Не удалось отправить наряд'])
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <Screen title="Отправлено">
        <Card className="border-green-600 bg-green-50">
          <p className="text-sm text-green-800">Наряд отправлен на приёмку. Повторная отправка заблокирована.</p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen
      title="Исполнено"
      subtitle={`Наряд №${order.number} · ${WORK_TYPE_LABELS[order.workType]}${
        order.workType === 'unplanned' ? ' · фото «после» обязательно' : ''
      }`}
    >
      {errors.length > 0 && (
        <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <Field label="Выполненные работы" required>
        <TextArea
          value={form.workDone}
          onChange={(e) => setForm((f) => ({ ...f, workDone: e.target.value }))}
          placeholder={'Выполнена замена подшипника.\nПроведена проверка вибрации.'}
          className="min-h-32"
        />
        <div className="flex items-center gap-2">
          <Btn variant="ghost" onClick={toggleDictation}>{listening ? '● Слушаю…' : '🎙 Надиктовать'}</Btn>
          <span className="text-xs text-neutral-400">распознанный текст можно редактировать</span>
        </div>
      </Field>

      <Field label="Шифр неисправности (только из справочника)" required>
        <TextInput
          value={codeQuery || form.faultCode}
          onChange={(e) => {
            setCodeQuery(e.target.value)
            setForm((f) => ({ ...f, faultCode: '' }))
          }}
          placeholder="Поиск по коду, названию или ключевому слову"
        />
        <div className="max-h-44 overflow-y-auto border border-neutral-200">
          {(form.faultCode ? ctx.faultCodes.filter((c) => c.code === form.faultCode) : filteredCodes).map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, faultCode: c.code }))
                setCodeQuery('')
              }}
              className={`block w-full border-b border-neutral-100 px-3 py-2.5 text-left text-sm hover:bg-neutral-50 ${
                form.faultCode === c.code ? 'bg-neutral-900 text-white hover:bg-neutral-900' : ''
              }`}
            >
              <b>{c.code}</b> — {c.name}
            </button>
          ))}
          {filteredCodes.length === 0 && <p className="px-3 py-2 text-sm text-neutral-500">Ничего не найдено.</p>}
        </div>
        {form.faultCode && <p className="text-sm text-green-700">Выбрано: {form.faultCode}</p>}
      </Field>

      <Field label="Списанные материалы и запчасти">
        <div className="flex flex-wrap items-end gap-2">
          <TextInput
            value={matName}
            onChange={(e) => setMatName(e.target.value)}
            placeholder="Подшипник 6205"
            className="min-w-40 flex-1"
          />
          <TextInput
            type="number"
            min="0"
            step="0.1"
            value={matQty}
            onChange={(e) => setMatQty(e.target.value)}
            placeholder="Кол-во"
            className="max-w-24"
          />
          <Select value={matUnit} onChange={(e) => setMatUnit(e.target.value)} className="max-w-24">
            {['шт.', 'кг', 'м', 'л'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Btn variant="ghost" onClick={addMaterial}>+ Позиция</Btn>
        </div>
        {form.materials.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {form.materials.map((m, i) => (
              <li key={i} className="flex items-center justify-between border border-neutral-200 px-3 py-2 text-sm">
                <span>{m.name} — <b>{m.qty} {m.unit}</b></span>
                <button
                  type="button"
                  className="ml-3 text-red-600"
                  onClick={() => setForm((f) => ({ ...f, materials: f.materials.filter((_, j) => j !== i) }))}
                  aria-label="Удалить позицию"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.materials.length > 0 && (
          <p className="mt-1 text-xs text-neutral-500">Позиций: {form.materials.length} (дубликаты суммируются)</p>
        )}
      </Field>

      <Field label={`Фото после выполнения (${form.photosAfter.length}/${MAX_PHOTOS})${order.workType === 'unplanned' ? ' *' : ''}`}>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-12 cursor-pointer items-center border border-neutral-300 px-4 text-sm hover:border-neutral-900">
            📷 Камера
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => void pickPhotos(e.target.files)} />
          </label>
          <label className="flex min-h-12 cursor-pointer items-center border border-neutral-300 px-4 text-sm hover:border-neutral-900">
            🖼 Галерея
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void pickPhotos(e.target.files)} />
          </label>
        </div>
        {form.photosAfter.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {form.photosAfter.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`После ${i + 1}`} className="h-20 w-20 border border-neutral-300 object-cover" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, photosAfter: f.photosAfter.filter((_, j) => j !== i) }))}
                  className="absolute -right-2 -top-2 h-6 w-6 border border-neutral-900 bg-white text-xs leading-none hover:bg-neutral-900 hover:text-white"
                  aria-label="Удалить фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <span className="text-xs text-neutral-400">JPG/JPEG, PNG, WebP · сжимается автоматически</span>
      </Field>

      <Field label="Комментарий исполнителя">
        <TextArea
          value={form.workerComment}
          onChange={(e) => setForm((f) => ({ ...f, workerComment: e.target.value }))}
          placeholder="Особенности ремонта, остаточные дефекты, рекомендации"
        />
      </Field>

      <Btn
        className="min-h-14 w-full text-base"
        disabled={busy}
        onClick={() => {
          const errs = validate()
          setErrors(errs)
          if (errs.length === 0) setConfirming(true)
        }}
      >
        {busy ? 'Отправка…' : 'Отправить на приёмку'}
      </Btn>

      {confirming && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-md border border-neutral-900 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Вы собираетесь отправить наряд на приёмку.</h3>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              <li>Выполненные работы: {form.workDone.trim() ? 'заполнено' : '—'}</li>
              <li>Шифр неисправности: {form.faultCode || 'не выбран'}</li>
              <li>Материалы: {form.materials.length} позиц.</li>
              <li>Фото после: {form.photosAfter.length}</li>
              <li>Комментарий: {form.workerComment.trim() ? 'заполнен' : '—'}</li>
            </ul>
            <div className="mt-4 flex gap-3">
              <Btn className="min-h-14" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Отправляем…' : 'Отправить на приёмку'}
              </Btn>
              <Btn variant="ghost" className="min-h-14" disabled={busy} onClick={() => setConfirming(false)}>
                Отмена
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Screen>
  )
}
