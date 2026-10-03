// Экран Исполнителя (первая итерация): свои наряды, принятие в работу,
// сдача работ (описание, материалы, фото «после»).

import { useEffect, useState } from 'react'
import { signOut } from '../../lib/auth'
import * as db from '../../lib/db'
import { fileToCompactDataUrl } from '../../lib/photos'
import {
  ORDER_STATUS_LABELS, PRIORITY_LABELS,
  type Profile, type WorkOrder, type Worker,
} from '../../lib/types'
import { Btn, Card, Field, StatusDot, TextArea } from '../../components/ui'

export default function WorkerApp({ profile }: { profile: Profile }) {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [me, setMe] = useState<Worker | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<WorkOrder | null>(null)

  async function refresh() {
    try {
      const [w, o] = await Promise.all([db.listWorkers(), db.listOrders()])
      setMe(w.find((x) => x.userId === profile.id) ?? null)
      setOrders(o)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mine = me ? orders.filter((o) => o.workerId === me.id) : []
  const active = mine.filter((o) => ['issued', 'accepted', 'in_work', 'queued'].includes(o.status))
  const finished = mine.filter((o) => ['completed', 'closed', 'cancelled'].includes(o.status))

  async function act(order: WorkOrder, status: WorkOrder['status']) {
    try {
      await db.setOrderStatus(order.id, status, profile.fullName || 'Исполнитель')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус')
    }
  }

  const actor = profile.fullName || 'Исполнитель'

  return (
    <div className="min-h-svh bg-white text-neutral-900">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 sm:px-6"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <span className="text-sm text-neutral-500">
          Исполнитель · {profile.fullName || 'Исполнитель'}
          {me && ` · ${WORKER_STATUS(me.status)}`}
        </span>
        <button
          type="button"
          onClick={async () => { await signOut(); location.reload() }}
          className="border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-900"
        >
          Выйти
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:px-6">
        {error && <p role="alert" className="mb-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <h2 className="mb-3 text-2xl font-semibold">Мои наряды ({active.length})</h2>
        <div className="flex flex-col gap-2">
          {active.length === 0 && <p className="text-sm text-neutral-500">Активных нарядов нет.</p>}
          {active.map((o) => <WorkerCard key={o.id} order={o} onAct={act} onSubmit={setSubmitting} />)}
        </div>

        <h2 className="mb-3 mt-8 text-2xl font-semibold">Завершённые</h2>
        <div className="flex flex-col gap-2">
          {finished.length === 0 && <p className="text-sm text-neutral-500">Пока ничего.</p>}
          {finished.map((o) => <WorkerCard key={o.id} order={o} onAct={act} onSubmit={setSubmitting} />)}
        </div>
      </main>

      {submitting && (
        <SubmitWorkModal
          order={submitting}
          actor={actor}
          onClose={() => setSubmitting(null)}
          onDone={async () => { setSubmitting(null); await refresh() }}
        />
      )}
    </div>
  )
}

function WORKER_STATUS(status: Worker['status']): string {
  return { free: 'свободен', busy: 'в работе', queue: 'есть очередь', not_on_shift: 'не на смене' }[status]
}

function WorkerCard({ order, onAct, onSubmit }: {
  order: WorkOrder
  onAct: (o: WorkOrder, s: WorkOrder['status']) => Promise<void>
  onSubmit: (o: WorkOrder) => void
}) {
  const colors: Record<string, string> = {
    issued: 'bg-neutral-400', accepted: 'bg-blue-500', in_work: 'bg-yellow-500',
    queued: 'bg-blue-300', completed: 'bg-green-500', cancelled: 'bg-neutral-300',
    suspended: 'bg-orange-400', closed: 'bg-green-700',
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusDot color={colors[order.status]} />
        <span className="font-medium">{order.number}</span>
        <span className="text-sm text-neutral-500">{ORDER_STATUS_LABELS[order.status]}</span>
        <span className="ml-auto text-sm">{PRIORITY_LABELS[order.priority]}</span>
      </div>
      <p className="mt-1 text-sm">{order.description}</p>
      {order.comment && <p className="mt-1 text-xs text-neutral-500">Комментарий: {order.comment}</p>}
      <p className="mt-1 text-xs text-neutral-500">
        Срок: {new Date(order.deadline).toLocaleString('ru-RU')}
        {order.faultCode ? ` · Шифр: ${order.faultCode}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {order.status === 'issued' && (
          <Btn onClick={() => void onAct(order, 'accepted')}>Принять</Btn>
        )}
        {order.status === 'accepted' && (
          <Btn onClick={() => void onAct(order, 'in_work')}>Начать работу</Btn>
        )}
        {order.status === 'in_work' && <Btn onClick={() => onSubmit(order)}>Сдать работу</Btn>}
      </div>
    </Card>
  )
}

function SubmitWorkModal({ order, actor, onClose, onDone }: {
  order: WorkOrder
  actor: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [workDone, setWorkDone] = useState('')
  const [materials, setMaterials] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const room = 5 - photos.length
    const taken = Array.from(files).slice(0, room)
    const urls = await Promise.all(taken.map(fileToCompactDataUrl))
    setPhotos((prev) => [...prev, ...urls])
  }

  async function submit() {
    if (!workDone.trim()) {
      setError('Опишите выполненные работы.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await db.updateOrder(
        order.id,
        { workDone: workDone.trim(), materials: materials.trim() || null, photosAfter: photos },
        actor,
        'Работы сданы',
      )
      await db.setOrderStatus(order.id, 'completed', actor)
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сдать работу')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90svh] w-full max-w-lg overflow-y-auto border border-neutral-900 bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold">Сдача работ · {order.number}</h3>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Выполненные работы" required>
            <TextArea value={workDone} onChange={(e) => setWorkDone(e.target.value)} />
          </Field>
          <Field label="Списанные материалы">
            <TextArea
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              placeholder="Например: подшипник 6204 — 1 шт."
            />
          </Field>
          <Field label={`Фото «после» (${photos.length}/5)`}>
            <input type="file" accept="image/*" multiple onChange={(e) => void addPhotos(e.target.files)} className="text-sm" />
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt={`После ${i + 1}`} className="h-16 w-16 border border-neutral-300 object-cover" />
                ))}
              </div>
            )}
          </Field>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <Btn onClick={submit} disabled={busy}>{busy ? 'Сдаём…' : 'Сдать на приёмку'}</Btn>
            <Btn variant="ghost" onClick={onClose}>Отмена</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

