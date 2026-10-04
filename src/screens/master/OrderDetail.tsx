// Карточка наряда (ТЗ §4.2–4.3, §5): редактирование, отмена, приёмка
// с Вердиктом ИИ и история изменений в формате «что было → что стало».

import { useEffect, useMemo, useState } from 'react'
import { aiVerdict } from '../../lib/ai'
import * as db from '../../lib/db'
import {
  DECISION_LABELS, isOverdue, ORDER_STATUS_LABELS,
  type HistoryEntry, type MasterDecision,
} from '../../lib/types'
import { Btn, Card, Screen, Select, Stars, TextArea } from '../../components/ui'
import OrderForm, { valuesFromOrder, type OrderFormValues } from './OrderForm'
import type { MasterData } from './nav'

export default function OrderDetail({ data, orderId }: { data: MasterData; orderId: string }) {
  const order = useMemo(
    () => data.orders.find((o) => o.id === orderId) ?? null,
    [data.orders, orderId],
  )

  const [form, setForm] = useState<OrderFormValues | null>(null)
  const [bigFont, setBigFont] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [openEvent, setOpenEvent] = useState<HistoryEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreeAi, setAgreeAi] = useState<boolean | null>(null)
  const [decision, setDecision] = useState<MasterDecision>('accepted')
  const [masterComment, setMasterComment] = useState('')
  const [acceptanceInfo, setAcceptanceInfo] = useState<Awaited<ReturnType<typeof db.getAcceptance>>>(null)

  useEffect(() => {
    if (order && !form) setForm(valuesFromOrder(order))
  }, [order, form])

  useEffect(() => {
    let alive = true
    void db.getHistory(orderId).then((h) => alive && setHistory(h))
    void db.getAcceptance(orderId).then((a) => alive && setAcceptanceInfo(a))
    return () => { alive = false }
  }, [orderId, order?.status, order?.closedAt])

  if (!order || !form) {
    return <Screen title="Наряд"><p className="text-sm text-neutral-500">Загрузка…</p></Screen>
  }

  const actor = data.profile.fullName || 'Мастер'
  const verdict = aiVerdict(order)
  const canAccept = order.status === 'completed'
  const canCancel = !['cancelled', 'closed'].includes(order.status)
  const isEditable = !['cancelled', 'closed'].includes(order.status)

  async function saveChanges() {
    if (!order) return
    setBusy(true)
    setError(null)
    try {
      await db.updateOrder(
        order.id,
        {
          workType: form!.workType,
          description: form!.description.trim(),
          areaId: form!.areaId,
          equipmentId: form!.equipmentId,
          workerId: form!.workerId || null,
          deadline: new Date(form!.deadline).toISOString(),
          priority: form!.priority,
          faultCode: form!.faultCode.trim() || null,
          normHours: form!.normHours ? Number(form!.normHours) : null,
          comment: form!.comment.trim() || null,
          photos: form!.photos,
        },
        actor,
      )
      await Promise.all([data.refresh(), db.getHistory(order.id).then(setHistory)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder() {
    if (!order || !window.confirm('Отменить наряд? Он останется в базе со статусом «Отменён».')) return
    setBusy(true)
    try {
      await db.setOrderStatus(order.id, 'cancelled', actor)
      await Promise.all([data.refresh(), db.getHistory(order.id).then(setHistory)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отменить наряд')
    } finally {
      setBusy(false)
    }
  }

  async function acceptWork() {
    if (!order) return
    const finalDecision: MasterDecision = agreeAi ? 'accepted' : decision
    setBusy(true)
    setError(null)
    try {
      await db.saveAcceptance(
        order.id,
        {
          aiScore: verdict.score,
          aiComment: verdict.comment,
          masterDecision: finalDecision,
          agreedWithAi: agreeAi ?? true,
        masterComment: masterComment.trim() || null,
        checklist: null,
      },
      actor,
      )
      if (finalDecision === 'rework') {
        await db.setOrderStatus(order.id, 'in_work', actor)
      } else {
        await db.setOrderStatus(order.id, 'closed', actor)
      }
      setAcceptanceInfo(await db.getAcceptance(order.id))
      await Promise.all([data.refresh(), db.getHistory(order.id).then(setHistory)])
      setAgreeAi(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось принять наряд')
    } finally {
      setBusy(false)
    }
  }

  const areaName = data.areas.find((a) => a.id === order.areaId)?.name ?? '—'
  const equipmentName = data.equipment.find((e) => e.id === order.equipmentId)?.name ?? '—'

  return (
    <Screen
      title={`Наряд ${order.number}`}
      subtitle={`${ORDER_STATUS_LABELS[order.status]} · ${equipmentName} · ${areaName}${isOverdue(order) ? ' · ПРОСРОЧЕН' : ''}`}
      actions={
        <Btn variant="ghost" onClick={() => setBigFont(!bigFont)}>
          {bigFont ? 'Обычный вид' : 'Крупный шрифт по очереди'}
        </Btn>
      }
    >
      {error && <p role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {isEditable ? (
        <OrderForm data={data} values={form} onChange={setForm} bigFont={bigFont} showNumber={order.number} />
      ) : (
        <Card>
          <p className="whitespace-pre-wrap text-sm">{order.description}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Наряд {order.status === 'cancelled' ? 'отменён' : 'закрыт'} — редактирование недоступно.
          </p>
        </Card>
      )}

      {isEditable && (
        <div className="flex flex-wrap gap-3">
          <Btn onClick={saveChanges} disabled={busy}>Сохранить изменения</Btn>
          {canCancel && <Btn variant="danger" onClick={cancelOrder} disabled={busy}>Отменить наряд</Btn>}
        </div>
      )}

      {/* ---- Приёмка работ (ТЗ §5) ---- */}
      {order.status === 'completed' && canAccept && (
        <Card className="border-neutral-900">
          <h3 className="text-lg font-semibold">Вердикт ИИ</h3>
          <div className="mt-2 flex items-center gap-3">
            <Stars value={verdict.score} />
            <span className="text-sm font-medium">{verdict.score}/5</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{verdict.comment}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-500">Согласны с вердиктом?</span>
            <Btn onClick={() => setAgreeAi(true)} variant={agreeAi === true ? 'primary' : 'ghost'}>Согласен</Btn>
            <Btn onClick={() => setAgreeAi(false)} variant={agreeAi === false ? 'primary' : 'ghost'}>Не согласен</Btn>
          </div>

          {agreeAi === true && (
            <div className="mt-3">
              <Btn onClick={acceptWork} disabled={busy}>
                {busy ? 'Принимаем…' : 'Принять наряд'}
              </Btn>
            </div>
          )}

          {agreeAi === false && (
            <div className="mt-3 flex flex-col gap-3 border-t border-neutral-200 pt-3">
              <p className="text-sm text-neutral-500">Ручная приёмка:</p>
              <label className="flex flex-col gap-1 text-sm text-neutral-500">
                Решение
                <Select value={decision} onChange={(e) => setDecision(e.target.value as MasterDecision)}>
                  {(Object.keys(DECISION_LABELS) as MasterDecision[]).map((d) => (
                    <option key={d} value={d}>{DECISION_LABELS[d]}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-500">
                Комментарий мастера
                <TextArea value={masterComment} onChange={(e) => setMasterComment(e.target.value)} />
              </label>
              <Btn onClick={acceptWork} disabled={busy}>
                {busy ? 'Сохраняем…' : 'Завершить приёмку'}
              </Btn>
            </div>
          )}
        </Card>
      )}

      {acceptanceInfo && (
        <Card>
          <h3 className="text-sm font-semibold">Приёмка выполнена</h3>
          <p className="mt-1 text-sm text-neutral-600">
            ИИ: {acceptanceInfo.aiScore}/5 · Решение: {DECISION_LABELS[acceptanceInfo.masterDecision]}
            {acceptanceInfo.masterComment ? ` · ${acceptanceInfo.masterComment}` : ''}
          </p>
        </Card>
      )}

      {/* Работы исполнителя */}
      {(order.workDone || order.materials || order.photosAfter.length > 0) && (
        <Card>
          <h3 className="text-sm font-semibold">Выполненные работы</h3>
          {order.workDone && <p className="mt-1 whitespace-pre-wrap text-sm">{order.workDone}</p>}
          {order.materials && <p className="mt-1 text-sm text-neutral-600">Материалы: {order.materials}</p>}
          {order.photosAfter.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {order.photosAfter.map((src, i) => (
                <img key={i} src={src} alt={`После ${i + 1}`} className="h-20 w-20 border border-neutral-300 object-cover" />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Фото неисправности */}
      {order.photos.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold">Фото неисправности</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {order.photos.map((src, i) => (
              <img key={i} src={src} alt={`Фото ${i + 1}`} className="h-20 w-20 border border-neutral-300 object-cover" />
            ))}
          </div>
        </Card>
      )}

      {/* ---- История (ТЗ §4.3) ---- */}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">История</h3>
        {history.length === 0 && <p className="text-sm text-neutral-500">Событий пока нет.</p>}
        {history.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setOpenEvent(h)}
            className="border border-neutral-200 p-3 text-left text-sm transition-colors hover:border-neutral-900"
          >
            <span className="font-medium">{h.actorName}</span> — {h.action}
            <span className="ml-2 text-xs text-neutral-400">
              {new Date(h.createdAt).toLocaleString('ru-RU')}
            </span>
          </button>
        ))}
      </div>

      {openEvent && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenEvent(null)}
        >
          <div className="w-full max-w-md border border-neutral-900 bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">{openEvent.action}</h4>
            <p className="mt-1 text-sm text-neutral-500">
              Кто: {openEvent.actorName} · Когда: {new Date(openEvent.createdAt).toLocaleString('ru-RU')}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {openEvent.changes.map((c, i) => (
                <p key={i} className="text-sm">
                  <b>{c.field}:</b>{' '}
                  <span className="text-neutral-400">{formatValue(c.from)}</span>
                  {' → '}
                  <span>{formatValue(c.to)}</span>
                </p>
              ))}
            </div>
            <div className="mt-4">
              <Btn variant="ghost" onClick={() => setOpenEvent(null)}>Закрыть</Btn>
            </div>
          </div>
        </div>
      )}
    </Screen>
  )
}

function formatValue(v: string | null): string {
  if (v == null) return '—'
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('ru-RU')
  return v
}
