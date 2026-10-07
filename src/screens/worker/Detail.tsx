// Frame 19: детали наряда. Информация (§10), фото-галерея (§11), кнопки
// действий по статусам (§12–14), модалки причин, возврат на доработку (§34–35).

import { useEffect, useState } from 'react'
import * as db from '../../lib/db'
import {
  ORDER_STATUS_LABELS, PRIORITY_LABELS, WORK_TYPE_LABELS,
  type Acceptance, type HistoryEntry, type OrderStatus,
} from '../../lib/types'
import {
  canTransition, OTHER_PAUSE_REASON, OTHER_REASON,
  PAUSE_REASONS, REJECT_REASONS,
} from '../../lib/status'
import { Btn, Card, PhotoGallery, Screen, Select, TextArea } from '../../components/ui'
import type { WorkerCtx } from './shared'

const TOUCH = 'min-h-14 px-6 py-4 text-base'

export default function OrderDetail({ ctx, orderId }: { ctx: WorkerCtx; orderId: string }) {
  const order = ctx.orders.find((o) => o.id === orderId) ?? null
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<'reject' | 'pause' | null>(null)
  const [acceptance, setAcceptance] = useState<Acceptance | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void db.getAcceptance(orderId).then(setAcceptance).catch(() => {})
    void db.getHistory(orderId).then(setHistory).catch(() => {})
  }, [orderId, order?.status])

  if (!order) {
    return <Screen title="Наряд"><p className="text-sm text-neutral-500">Наряд не найден.</p></Screen>
  }

  const eqName = ctx.equipment.find((e) => e.id === order.equipmentId)?.name ?? '—'
  const areaName = ctx.areas.find((a) => a.id === order.areaId)?.name ?? '—'

  async function doAct(status: OrderStatus, reason?: string) {
    setBusy(true)
    setError(null)
    try {
      await ctx.act({
        orderId: order!.id,
        status,
        reason,
        notify:
          status === 'rejected'
            ? { type: 'REJECTED', title: `Наряд ${order!.number} отклонён`, message: `Исполнитель отклонил наряд: ${reason ?? ''}` }
            : status === 'completed'
              ? { type: 'ACCEPTANCE', title: `Наряд ${order!.number}: проверка ИИ`, message: 'Исполнитель отправил работы: наряд принят на проверку ИИ.' }
              : undefined,
      })
      setModal(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  const canGo = (to: OrderStatus) => canTransition(order.status, to) && !busy

  return (
    <Screen title={`Наряд №${order.number}`} subtitle={WORK_TYPE_LABELS[order.workType]}>
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Возврат на доработку (§34) */}
      {order.status === 'rework' && (
        <Card className="border-purple-500 bg-purple-50">
          <p className="font-semibold text-purple-800">Наряд возвращён на доработку</p>
          {acceptance?.masterComment && <p className="mt-1 text-sm">Комментарий Мастера: {acceptance.masterComment}</p>}
          {history.find((h) => h.action.includes('доработк')) && (
            <p className="mt-1 text-xs text-neutral-500">
              Дата возврата: {new Date(history.find((h) => h.action.includes('доработк'))!.createdAt).toLocaleString('ru-RU')}
            </p>
          )}
          <p className="mt-1 text-sm text-neutral-600">Внесите изменения в результаты и отправьте повторно.</p>
        </Card>
      )}

      {order.status === 'suspended' && (
        <Card className="border-orange-500 bg-orange-50">
          <p className="font-semibold text-orange-800">Приостановлено: {order.pauseReason ?? 'причина не указана'}</p>
          {order.pausedAt && (
            <p className="text-xs text-neutral-500">
              с {new Date(order.pausedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </p>
          )}
        </Card>
      )}

      {order.status === 'rejected' && order.rejectReason && (
        <Card className="border-red-300 bg-red-50">
          <p className="text-sm text-red-700">Отклонён: {order.rejectReason}</p>
        </Card>
      )}

      {/* Информация о наряде (§10.1) */}
      <Card>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Номер" v={order.number} />
          <Row k="Дата и время выдачи" v={new Date(order.createdAt).toLocaleString('ru-RU')} />
          <Row k="Тип работ" v={WORK_TYPE_LABELS[order.workType]} />
          <Row k="Приоритет" v={PRIORITY_LABELS[order.priority]} />
          <Row k="Участок" v={areaName} />
          <Row k="Оборудование" v={eqName} />
          <Row k="Срок исполнения" v={new Date(order.deadline).toLocaleString('ru-RU')} />
          <Row k="Статус" v={ORDER_STATUS_LABELS[order.status]} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-neutral-500">Проблема / требуемые работы</dt>
            <dd className="whitespace-pre-wrap">{order.description}</dd>
          </div>
          {order.faultCode && <Row k="Шифр неисправности" v={order.faultCode} />}
          {order.normHours != null && <Row k="Норматив" v={`${order.normHours} ч`} />}
          {order.comment && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Комментарий Мастера</dt>
              <dd className="whitespace-pre-wrap">{order.comment}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Фото неисправности (§11) — только просмотр, без удаления */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold">Фото неисправности</h3>
        <PhotoGallery photos={order.photos} label="Фото неисправности" />
        {order.photos.length === 0 && <p className="text-sm text-neutral-500">Фотографий нет.</p>}
      </Card>

      {/* Результаты, если уже сданы */}
      {order.workDone && (
        <Card>
          <h3 className="text-sm font-semibold">Выполненные работы (отправлены)</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{order.workDone}</p>
          {order.materials && <p className="mt-1 text-sm text-neutral-600">Материалы: {order.materials}</p>}
          <PhotoGallery photos={order.photosAfter} label="Фото после" />
        </Card>
      )}

      {/* Действия по статусам (§12–14, §35) */}
      <div className="flex flex-col gap-3">
        {order.status === 'issued' && (
          <>
            <TouchBtn disabled={!canGo('accepted')} busy={busy} onClick={() => void doAct('accepted')}>
              Принять в работу
            </TouchBtn>
            <TouchBtn variant="ghost" disabled={!canGo('queued')} busy={busy} onClick={() => void doAct('queued')}>
              Поставить в очередь
            </TouchBtn>
            <TouchBtn variant="danger" disabled={busy} onClick={() => setModal('reject')}>
              Отклонить
            </TouchBtn>
          </>
        )}

        {order.status === 'accepted' && (
          <>
            <TouchBtn disabled={!canGo('in_work')} busy={busy} onClick={() => void doAct('in_work')}>
              Начать исполнение
            </TouchBtn>
            <TouchBtn variant="ghost" disabled={!canGo('queued')} busy={busy} onClick={() => void doAct('queued')}>
              Поставить в очередь
            </TouchBtn>
          </>
        )}

        {order.status === 'queued' && (
          <TouchBtn disabled={!canGo('in_work')} busy={busy} onClick={() => void doAct('in_work')}>
            Начать исполнение
          </TouchBtn>
        )}

        {order.status === 'in_work' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <TouchBtn variant="ghost" disabled={!canGo('suspended')} busy={busy} onClick={() => setModal('pause')}>
              Приостановить
            </TouchBtn>
            <TouchBtn disabled={busy} onClick={() => ctx.go({ view: 'close', id: order.id })}>
              Исполнено
            </TouchBtn>
          </div>
        )}

        {order.status === 'suspended' && (
          <TouchBtn disabled={!canGo('in_work')} busy={busy} onClick={() => void doAct('in_work')}>
            Продолжить исполнение
          </TouchBtn>
        )}

        {order.status === 'rework' && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <TouchBtn disabled={!canGo('in_work')} busy={busy} onClick={() => void doAct('in_work')}>
              Начать исполнение
            </TouchBtn>
            <TouchBtn variant="ghost" disabled={busy} onClick={() => ctx.go({ view: 'close', id: order.id })}>
              Изменить результат и отправить
            </TouchBtn>
          </div>
        )}

        {order.status === 'completed' && (
          <Card className="border-green-600 bg-green-50">
            <p className="text-sm font-medium text-green-800">
              Проверка ИИ: наряд ожидает решения Мастера по итогам проверки. Изменение данных недоступно.
            </p>
          </Card>
        )}

        {order.status === 'closed' && (
          <TouchBtn variant="ghost" onClick={() => ctx.go({ view: 'closedDetail', id: order.id })}>
            Открыть закрытый наряд (оценка, чек-лист)
          </TouchBtn>
        )}
      </div>

      {modal === 'reject' && (
        <ReasonModal
          title="Причина отклонения"
          reasons={REJECT_REASONS}
          otherLabel={OTHER_REASON}
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => void doAct('rejected', reason)}
        />
      )}
      {modal === 'pause' && (
        <ReasonModal
          title="Причина приостановки"
          reasons={PAUSE_REASONS}
          otherLabel={OTHER_PAUSE_REASON}
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => void doAct('suspended', reason)}
        />
      )}
    </Screen>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function TouchBtn({ children, variant, disabled, busy, onClick }: {
  children: React.ReactNode
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <Btn variant={variant} disabled={disabled || busy} onClick={onClick} className={TOUCH}>
      {busy ? 'Секунду…' : children}
    </Btn>
  )
}

/** Модалка причины (§12.3, §14): обязательный выбор, для «иная» — текст. */
function ReasonModal({ title, reasons, otherLabel, busy, onCancel, onConfirm }: {
  title: string
  reasons: readonly string[]
  otherLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function confirm() {
    if (!reason) {
      setErr('Выберите причину.')
      return
    }
    if (reason === otherLabel && !text.trim()) {
      setErr('Опишите причину подробнее.')
      return
    }
    setErr(null)
    onConfirm(reason === otherLabel ? `${otherLabel}: ${text.trim()}` : reason)
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md border border-neutral-900 bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-neutral-500">Поле обязательно</p>
        <div className="mt-3 flex flex-col gap-2">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
            <option value="">— выберите причину —</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          {reason === otherLabel && (
            <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Подробное описание" />
          )}
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="mt-4 flex gap-3">
          <TouchBtn busy={busy} onClick={confirm}>Подтвердить</TouchBtn>
          <TouchBtn variant="ghost" disabled={busy} onClick={onCancel}>Отмена</TouchBtn>
        </div>
      </div>
    </div>
  )
}
