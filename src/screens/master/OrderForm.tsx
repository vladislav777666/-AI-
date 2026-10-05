// Форма наряда (ТЗ §3): общая для «Выдать наряд» и карточки наряда.
// Режим «по очереди большим шрифтом» — постраничный ввод полей.
// Шифр неисправности выбирается из справочника (ТЗ §2.5): выбор
// автоматически подставляет норматив времени — вручную вводить не нужно.

import { useEffect, useMemo, useState } from 'react'
import { searchFaultCode, searchWorker, type WorkerEquipmentContext } from '../../lib/ai'
import * as db from '../../lib/db'
import { fileToCompactDataUrl, speechToTextSupported, startSpeechToText } from '../../lib/photos'
import {
  PRIORITY_LABELS, WORK_TYPE_LABELS,
  type FaultCode, type Priority, type WorkOrder, type WorkType,
} from '../../lib/types'
import { Btn, Field, Select, TextArea, TextInput } from '../../components/ui'
import type { OrderCardData } from './nav'

export interface OrderFormValues {
  workType: WorkType
  description: string
  areaId: string
  equipmentId: string
  workerId: string
  deadline: string
  priority: Priority
  faultCode: string
  normHours: string
  comment: string
  photos: string[]
}

export function emptyValues(): OrderFormValues {
  const day = new Date(Date.now() + 24 * 3600 * 1000)
  return {
    workType: 'unplanned',
    description: '',
    areaId: '',
    equipmentId: '',
    workerId: '',
    deadline: toLocalInput(day),
    priority: 'normal',
    faultCode: '',
    normHours: '',
    comment: '',
    photos: [],
  }
}

export function valuesFromOrder(o: WorkOrder): OrderFormValues {
  return {
    workType: o.workType,
    description: o.description,
    areaId: o.areaId,
    equipmentId: o.equipmentId,
    workerId: o.workerId ?? '',
    deadline: toLocalInput(new Date(o.deadline)),
    priority: o.priority,
    faultCode: o.faultCode ?? '',
    normHours: o.normHours != null ? String(o.normHours) : '',
    comment: o.comment ?? '',
    photos: o.photos,
  }
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const BIG_STEPS = [
  'Описание проблемы и работ',
  'Участок',
  'Оборудование',
  'Шифр неисправности',
  'Исполнитель',
  'Срок исполнения',
  'Приоритет',
] as const

export default function OrderForm({ data, values, onChange, bigFont, showNumber }: {
  data: OrderCardData
  values: OrderFormValues
  onChange: (next: OrderFormValues) => void
  bigFont: boolean
  showNumber?: string | null
}) {
  const { areas, equipment, workers, orders } = data
  const set = <K extends keyof OrderFormValues>(k: K, v: OrderFormValues[K]) =>
    onChange({ ...values, [k]: v })

  const areaEquipment = useMemo(
    () => equipment.filter((e) => e.areaId === values.areaId),
    [equipment, values.areaId],
  )

  const [bigStep, setBigStep] = useState(0)
  const [aiHint, setAiHint] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [faultCodes, setFaultCodes] = useState<FaultCode[]>([])
  const [aiBusy, setAiBusy] = useState<null | 'fault' | 'worker'>(null)
  const stopRef = useState<(() => void) | null>(null)[0]
  void stopRef

  // Справочник шифров неисправности (ТЗ §2.5): через readThrough кэш работает и офлайн.
  useEffect(() => {
    let alive = true
    void db.listFaultCodes().then((r) => alive && setFaultCodes(r)).catch(() => {})
    return () => { alive = false }
  }, [])

  const selectedFault = faultCodes.find((f) => f.code === values.faultCode) ?? null

  // Текущее значение шифра всегда присутствует в списке (напр. старые наряды).
  const faultOptions = useMemo(() => {
    const list = [...faultCodes]
    if (values.faultCode && !list.some((f) => f.code === values.faultCode)) {
      list.push({
        code: values.faultCode, name: values.faultCode, description: '',
        normHours: null, materialNorm: null, workType: null,
      })
    }
    return list
  }, [faultCodes, values.faultCode])

  /** Подсказка шифра через ИИ (NVIDIA NIM) с фоллбэком на эвристику:
   *  модель оценивает задачу по описанию и комментарию. */
  async function aiFaultCode() {
    const task = [values.description, values.comment].filter((s) => s.trim()).join(' ').trim()
    if (!task || aiBusy) return
    setAiBusy('fault')
    try {
      const s = await searchFaultCode(task, faultCodes)
      if (s.code) {
        const f = faultCodes.find((x) => x.code === s.code)
        const next: OrderFormValues = { ...values, faultCode: s.code }
        if (f?.normHours != null) next.normHours = String(f.normHours)
        else if (s.normHours != null) next.normHours = String(s.normHours)
        if (f?.workType) next.workType = f.workType
        onChange(next)
      }
      setAiHint(s.hint)
    } catch (err) {
      setAiHint(err instanceof Error ? err.message : 'ИИ недоступен')
    } finally {
      setAiBusy(null)
    }
  }

  /** Выбор шифра из справочника: автоподстановка норматива и типа работ. */
  function pickFaultCode(code: string) {
    const f = faultCodes.find((x) => x.code === code)
    const next: OrderFormValues = { ...values, faultCode: code }
    if (f) {
      if (f.normHours != null) next.normHours = String(f.normHours)
      if (f.workType) next.workType = f.workType
    }
    onChange(next)
  }

  /** Подсказка исполнителя через ИИ (NVIDIA NIM) с фоллбэком на эвристику.
   *  Для выбранного оборудования учитываем опыт и среднюю оценку
   *  исполнителя именно по нему (желательный критерий, ТЗ §3). */
  async function aiWorkerHint() {
    if (aiBusy) return
    setAiBusy('worker')
    try {
      const equipmentRow = equipment.find((e) => e.id === values.equipmentId) ?? null
      let equipmentContext: WorkerEquipmentContext | null = null
      if (equipmentRow) {
        const rows = await db.equipmentWorkerStats(equipmentRow.id).catch(() => [])
        const stats: WorkerEquipmentContext['stats'] = {}
        for (const r of rows) stats[r.workerId] = { count: r.count, avgScore: r.avgScore }
        equipmentContext = { equipmentName: equipmentRow.name, stats }
      }
      const s = await searchWorker(workers, orders, values.description, equipmentContext)
      if (s) {
        onChange({ ...values, workerId: s.worker.id })
        setAiHint(s.reason)
      }
    } catch (err) {
      setAiHint(err instanceof Error ? err.message : 'ИИ недоступен')
    } finally {
      setAiBusy(null)
    }
  }

  function toggleDictation() {
    if (listening) return
    if (!speechToTextSupported()) {
      setAiHint('Голосовой ввод не поддерживается этим браузером.')
      return
    }
    setListening(true)
    const stop = startSpeechToText(
      (text) => onChange({ ...values, description: (values.description + ' ' + text).trim() }),
      () => setListening(false),
    )
    // Останавливаем распознавание через 8 секунд максимум.
    setTimeout(() => {
      stop()
      setListening(false)
    }, 8000)
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const room = 5 - values.photos.length
    const taken = Array.from(files).slice(0, room)
    const urls = await Promise.all(taken.map(fileToCompactDataUrl))
    onChange({ ...values, photos: [...values.photos, ...urls] })
  }

  const big = bigFont && bigStep < BIG_STEPS.length

  const descriptionBlock = (
    <Field label="Описание проблемы и работ" required>
      <TextArea
        value={values.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder="Что случилось и что требуется сделать"
        className={bigFont ? 'min-h-32 text-2xl' : ''}
      />
      <div className="flex items-center gap-2">
        <Btn variant="ghost" onClick={toggleDictation}>
          {listening ? '● Слушаю…' : '🎙 Надиктовать'}
        </Btn>
        <span className="text-xs text-neutral-400">ИИ переводит голос в текст</span>
      </div>
    </Field>
  )

  const shownNorm =
    values.normHours || (selectedFault?.normHours != null ? String(selectedFault.normHours) : '')
  const faultBlock = (
    <Field label="Шифр неисправности (из справочника)">
      <div className="flex gap-2">
        <Select value={values.faultCode} onChange={(e) => pickFaultCode(e.target.value)} className="flex-1">
          <option value="">— выберите шифр —</option>
          {faultOptions.map((f) => (
            <option key={f.code} value={f.code}>{f.code} — {f.name}</option>
          ))}
        </Select>
        <Btn variant="ghost" onClick={aiFaultCode} disabled={aiBusy !== null} title="Подсказать шифр через ИИ (NVIDIA NIM)">
          {aiBusy === 'fault' ? '⏳' : '🤖'}
        </Btn>
      </div>
      <p className="text-xs text-neutral-500">
        {selectedFault || shownNorm
          ? [
              shownNorm ? `Норматив: ${shownNorm} ч` : null,
              selectedFault?.workType ? WORK_TYPE_LABELS[selectedFault.workType] : null,
              selectedFault?.materialNorm ? `Материалы: ${selectedFault.materialNorm}` : null,
            ].filter(Boolean).join(' · ')
          : 'Выберите шифр из справочника — норматив времени подставится автоматически.'}
      </p>
      <p className="text-xs text-neutral-400">
        М — механические · Э — электрические · Г — гидравлика · П — пневматика · С — смазка.
        Цифры после буквы — номер шифра в справочнике (например, М-02 — механика, люфт вала).
        ИИ подбирает шифр по описанию и комментарию задачи.
      </p>
    </Field>
  )

  if (big) {
    const step = BIG_STEPS[bigStep]
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-neutral-500">Шаг {bigStep + 1} из {BIG_STEPS.length}</p>
        {step === 'Описание проблемы и работ' && descriptionBlock}
        {step === 'Участок' && (
          <Field label="Участок" required>
            <Select
              value={values.areaId}
              onChange={(e) => onChange({ ...values, areaId: e.target.value, equipmentId: '' })}
              className="text-2xl"
            >
              <option value="">— выберите —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        {step === 'Оборудование' && (
          <Field label="Оборудование" required>
            <Select
              value={values.equipmentId}
              onChange={(e) => set('equipmentId', e.target.value)}
              className="text-2xl"
            >
              <option value="">— выберите —</option>
              {areaEquipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
        )}
        {step === 'Шифр неисправности' && <div className="text-xl">{faultBlock}</div>}
        {step === 'Исполнитель' && (
          <Field label="Исполнитель" required>
            <Select value={values.workerId} onChange={(e) => set('workerId', e.target.value)} className="text-2xl">
              <option value="">— выберите —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.fullName} — {w.status === 'free' ? 'свободен' : w.status === 'not_on_shift' ? 'не на смене' : 'занят'}
                </option>
              ))}
            </Select>
            <Btn variant="ghost" onClick={aiWorkerHint} disabled={aiBusy !== null}>
              {aiBusy === 'worker' ? '⏳ Думаю…' : '🤖 Предложить ИИ'}
            </Btn>
          </Field>
        )}
        {step === 'Срок исполнения' && (
          <Field label="Срок исполнения" required>
            <TextInput
              type="datetime-local"
              value={values.deadline}
              onChange={(e) => set('deadline', e.target.value)}
              className="text-2xl"
            />
          </Field>
        )}
        {step === 'Приоритет' && (
          <Field label="Приоритет" required>
            <Select value={values.priority} onChange={(e) => set('priority', e.target.value as Priority)} className="text-2xl">
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </Select>
          </Field>
        )}
        {aiHint && <p className="text-sm text-neutral-600">{aiHint}</p>}
        <div className="flex gap-3">
          {bigStep > 0 && <Btn variant="ghost" onClick={() => setBigStep(bigStep - 1)}>← Назад</Btn>}
          <Btn onClick={() => setBigStep(bigStep + 1)}>Далее →</Btn>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {showNumber && (
        <p className="text-sm text-neutral-500">
          Наряд <span className="font-medium text-neutral-900">{showNumber}</span> · номер и дата выдачи генерируются системой
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Тип работ" required>
          <Select value={values.workType} onChange={(e) => set('workType', e.target.value as WorkType)}>
            {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((t) => (
              <option key={t} value={t}>{WORK_TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Приоритет" required>
          <Select value={values.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {descriptionBlock}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Участок" required>
          <Select
            value={values.areaId}
            onChange={(e) => onChange({ ...values, areaId: e.target.value, equipmentId: '' })}
          >
            <option value="">— выберите —</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Оборудование (фильтруется по участку)" required>
          <Select
            value={values.equipmentId}
            onChange={(e) => set('equipmentId', e.target.value)}
            disabled={!values.areaId}
          >
            <option value="">— выберите —</option>
            {areaEquipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Исполнитель или бригада" required>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={values.workerId} onChange={(e) => set('workerId', e.target.value)} className="flex-1">
            <option value="">— выберите —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.fullName} — {w.status === 'free' ? 'свободен' : w.status === 'not_on_shift' ? 'не на смене' : 'занят'}
              </option>
            ))}
          </Select>
          <Btn variant="ghost" onClick={aiWorkerHint} disabled={aiBusy !== null}>
            {aiBusy === 'worker' ? '⏳ Думаю…' : '🤖 Подсказать ИИ'}
          </Btn>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Срок исполнения" required>
          <TextInput type="datetime-local" value={values.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </Field>
        <div className="sm:col-span-1">{faultBlock}</div>
      </div>

      <Field label={`Фото неисправности (${values.photos.length}/5)`}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void addPhotos(e.target.files)}
          className="text-sm"
        />
        {values.photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {values.photos.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Фото ${i + 1}`} className="h-20 w-20 border border-neutral-300 object-cover" />
                <button
                  type="button"
                  onClick={() => onChange({ ...values, photos: values.photos.filter((_, j) => j !== i) })}
                  className="absolute -right-2 -top-2 h-6 w-6 border border-neutral-900 bg-white text-xs leading-none hover:bg-neutral-900 hover:text-white"
                  aria-label="Удалить фото"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="Комментарий">
        <TextArea value={values.comment} onChange={(e) => set('comment', e.target.value)} placeholder="Подробности" />
      </Field>

      {aiHint && <p className="text-sm text-neutral-600">{aiHint}</p>}
    </div>
  )
}
