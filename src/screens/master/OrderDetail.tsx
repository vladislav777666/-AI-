// Карточка наряда (ТЗ §3): сводка §3.1 со всеми полями, редактирование,
// отмена, приёмка с Вердиктом ИИ (§3.2) и история изменений в формате
// «что было → что стало».

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { aiVerdict, aiVerdictLLM } from '../../lib/ai'
import { LLM_MODEL, llmConfigured } from '../../lib/llm'
import * as db from '../../lib/db'
import {
  DECISION_LABELS, isOverdue, ORDER_STATUS_LABELS, PRIORITY_LABELS, WORK_TYPE_LABELS,
  type AiVerdict, type FaultCode, type HistoryEntry, type MasterDecision,
} from '../../lib/types'
import { Btn, Card, PhotoGallery, Screen, Select, Stars, TextArea } from '../../components/ui'
import OrderForm, { valuesFromOrder, type OrderFormValues } from './OrderForm'
import type { OrderCardData } from './nav'

/** Строка сводки §3.1: подпись + значение в таблице карточки (ТЗ §3). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b border-neutral-100 align-top last:border-0">
      <th
        scope="row"
        className="w-40 bg-neutral-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500"
      >
        {label}
      </th>
      <td className="px-3 py-2 text-sm text-neutral-800">{children}</td>
    </tr>
  )
}

/** Карточка наряда.
 *  readOnly — режим просмотра (веб-руководитель): сводка §3.1, приёмка и
 *  история показываются, но форма редактирования, отмена и сама приёмка
 *  скрыты — правки наряда остаются за Мастером. */
export default function OrderDetail({
  data, orderId, readOnly = false, focusHistory = false,
}: {
  data: OrderCardData
  orderId: string
  readOnly?: boolean
  /** Переход из «Уведомлений» (просроченный наряд): прокрутить к истории. */
  focusHistory?: boolean
}) {
  const order = useMemo(
    () => data.orders.find((o) => o.id === orderId) ?? null,
    [data.orders, orderId],
  )

  const [form, setForm] = useState<OrderFormValues | null>(null)
  const [bigFont, setBigFont] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [selectedEvent, setSelectedEvent] = useState<HistoryEntry | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreeAi, setAgreeAi] = useState<boolean | null>(null)
  const [decision, setDecision] = useState<MasterDecision>('accepted')
  const [masterComment, setMasterComment] = useState('')
  const [acceptanceInfo, setAcceptanceInfo] = useState<Awaited<ReturnType<typeof db.getAcceptance>>>(null)
  const [faultCodes, setFaultCodes] = useState<FaultCode[]>([])
  // Вердикт §3.2: сначала локальная оценка (мгновенно), затем её заменяет
  // ответ модели NVIDIA NIM; при недоступности модели остаётся локальная.
  const [llmVerdict, setLlmVerdict] = useState<AiVerdict | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFailed, setAiFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void db.listFaultCodes().then((r) => alive && setFaultCodes(r)).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (order && !form) setForm(valuesFromOrder(order))
  }, [order, form])

  // Переход из «Уведомлений»: открываем наряд сразу на окне истории.
  useEffect(() => {
    if (!focusHistory) return
    const t = window.setTimeout(() => {
      historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
    return () => window.clearTimeout(t)
  }, [focusHistory, orderId])

  useEffect(() => {
    let alive = true
    void db.getHistory(orderId).then((h) => alive && setHistory(h))
    void db.getAcceptance(orderId).then((a) => alive && setAcceptanceInfo(a))
    return () => { alive = false }
  }, [orderId, order?.status, order?.closedAt])

  // ИИ-вердикт через NVIDIA NIM — по содержимому наряда, не по каждому ререндеру.
  useEffect(() => {
    let alive = true
    if (!order || readOnly || !llmConfigured) {
      setLlmVerdict(null)
      setAiLoading(false)
      setAiFailed(false)
      return
    }
    setLlmVerdict(null)
    setAiFailed(false)
    setAiLoading(true)
    aiVerdictLLM(order, faultCodes)
      .then((v) => { if (alive) setLlmVerdict(v) })
      .catch(() => { if (alive) setAiFailed(true) })
      .finally(() => { if (alive) setAiLoading(false) })
    return () => { alive = false }
  }, [
    order?.id, order?.status, order?.description, order?.workDone,
    order?.materials, order?.photosAfter.length, order?.completedAt, faultCodes, readOnly,
  ])

  if (!order || !form) {
    return <Screen title="Наряд"><p className="text-sm text-neutral-500">Загрузка…</p></Screen>
  }

  // Лента истории (§4.3): от начальной точки «Наряд выдан» к текущему
  // состоянию. Если запись о выдаче не сохранилась (старые данные) —
  // показываем её по времени создания наряда.
  const feed: HistoryEntry[] = [...history].reverse()
  if (!feed.some((h) => h.action === 'Наряд выдан')) {
    feed.unshift({
      id: `start-${order.id}`,
      orderId: order.id,
      actorName: 'Система',
      action: 'Наряд выдан',
      changes: [],
      createdAt: order.createdAt,
    })
  }

  /** Клик по записи: детали открываются справа; на узких экранах
   *  прокручиваем к панели подробностей. */
  function openEventDetails(h: HistoryEntry) {
    setSelectedEvent(h)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 0)
    }
  }

  const actor = data.profile.fullName || 'Мастер'
  const verdict = llmVerdict ?? aiVerdict(order, faultCodes)
  const canAccept = order.status === 'completed'
  const canCancel = !['cancelled', 'closed'].includes(order.status)
  const isEditable = !readOnly && !['cancelled', 'closed'].includes(order.status)

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
        checklist: verdict.checklist,
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
  const workerName = (order.workerId && data.workers.find((w) => w.id === order.workerId)?.fullName) || '—'
  const fault: FaultCode | undefined =
    order.faultCode ? faultCodes.find((f) => f.code === order.faultCode) : undefined

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

      {/* ---- Сводка карточки наряда (ТЗ §3.1): таблица со всеми полями ---- */}
      <Card>
        <h3 className="text-lg font-semibold">Детальная информация (карточка наряда §3.1)</h3>
        <div className="mt-3 overflow-x-auto border border-neutral-200">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <tbody>
              <Row label="Номер"><span className="font-medium">{order.number}</span></Row>
              <Row label="Дата и время выдачи">{new Date(order.createdAt).toLocaleString('ru-RU')}</Row>
              <Row label="Тип работ">{WORK_TYPE_LABELS[order.workType]}</Row>
              <Row label="Приоритет">{PRIORITY_LABELS[order.priority]}</Row>
              <Row label="Описание проблемы и работ">
                <span className="whitespace-pre-wrap">{order.description}</span>
              </Row>
              <Row label="Участок">{areaName}</Row>
              <Row label="Оборудование">{equipmentName}</Row>
              <Row label="Шифр неисправности">
                {order.faultCode
                  ? `${order.faultCode}${fault?.name ? ` — ${fault.name}` : ''}${fault?.normHours != null ? ` · норматив ${fault.normHours} ч` : ''}`
                  : '—'}
              </Row>
              <Row label="Исполнитель">{workerName}</Row>
              <Row label="Срок исполнения">
                {new Date(order.deadline).toLocaleString('ru-RU')}
                {isOverdue(order) && <span className="ml-2 font-medium text-red-600">ПРОСРОЧЕН</span>}
              </Row>
              <Row label="Комментарий">{order.comment || '—'}</Row>
              <Row label="Фото неисправности">
                {order.photos.length > 0
                  ? <PhotoGallery photos={order.photos} label="Фото неисправности" />
                  : <span className="text-neutral-400">нет</span>}
              </Row>
              <Row label="Фото после">
                {order.photosAfter.length > 0
                  ? <PhotoGallery photos={order.photosAfter} label="Фото после" />
                  : <span className="text-neutral-400">нет</span>}
              </Row>
              <Row label="Оценка">
                {acceptanceInfo
                  ? <Stars value={acceptanceInfo.aiScore} />
                  : <span className="text-neutral-400">— приёмка не выполнена</span>}
              </Row>
              <Row label="Комментарий к оценке">{acceptanceInfo?.masterComment || '—'}</Row>
            </tbody>
          </table>
        </div>
      </Card>

      {isEditable ? (
        <OrderForm data={data} values={form} onChange={setForm} bigFont={bigFont} showNumber={order.number} />        ) : (
        <Card>
          <p className="whitespace-pre-wrap text-sm">{order.description}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {readOnly
              ? 'Режим просмотра: правки наряда вносит Мастер.'
              : `Наряд ${order.status === 'cancelled' ? 'отменён' : 'закрыт'} — редактирование недоступно.`}
          </p>
        </Card>
      )}

      {isEditable && (
        <div className="flex flex-wrap gap-3">
          <Btn onClick={saveChanges} disabled={busy}>Сохранить изменения</Btn>
          {canCancel && <Btn variant="danger" onClick={cancelOrder} disabled={busy}>Отменить наряд</Btn>}
        </div>
      )}

      {/* ---- Приёмка работ (ТЗ §5) + блок §3.2 «Оценка и контроль качества» ---- */}
      {!readOnly && order.status === 'completed' && canAccept && (
        <Card className="border-neutral-900">
          <h3 className="text-lg font-semibold">Оценка и контроль качества (§3.2)</h3>
          <p className="mt-1 text-xs text-neutral-500">
            {aiLoading
              ? `⏳ ИИ-модель ${LLM_MODEL} оценивает наряд…`
              : llmVerdict
                ? `Источник: NVIDIA NIM · ${LLM_MODEL}`
                : aiFailed
                  ? 'Модель недоступна — показана локальная оценка'
                  : llmConfigured
                    ? 'Локальная оценка (модель ещё не отвечала)'
                    : `Ключ NVIDIA NIM не задан — локальная оценка`}
          </p>

          {/* Оценка */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-500">Оценка</span>
            <Stars value={verdict.score} />
            <span className="text-sm font-medium">{verdict.score}/5</span>
          </div>

          {/* Комментарий к оценке */}
          <label className="mt-3 flex flex-col gap-1 text-sm text-neutral-500">
            Комментарий к оценке
            <TextArea
              value={masterComment}
              onChange={(e) => setMasterComment(e.target.value)}
              placeholder="Комментарий мастера к результатам проверки"
            />
          </label>

          {/* Таблица автоматизированной/ручной проверки (ТЗ §3.2) */}
          <div className="mt-4 overflow-x-auto border border-neutral-200">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <th className="px-3 py-2 font-medium">Критерий</th>
                  <th className="px-3 py-2 font-medium">Результат</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {verdict.checklist.map((c) => (
                  <tr key={c.code} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{c.label}</span>
                      {c.external && (
                        <span className="ml-2 border border-neutral-400 px-1 py-0.5 text-[10px] uppercase text-neutral-500">
                          внешний модуль 6.3
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 ${c.passed ? 'text-green-700' : 'text-red-600'}`}>
                      {c.passed ? 'Пройден' : 'Не пройден'}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{c.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          {acceptanceInfo.checklist && acceptanceInfo.checklist.length > 0 && (
            <div className="mt-3 overflow-x-auto border border-neutral-200">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                    <th className="px-3 py-2 font-medium">Критерий</th>
                    <th className="px-3 py-2 font-medium">Результат</th>
                    <th className="px-3 py-2 font-medium">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptanceInfo.checklist.map((c) => (
                    <tr key={c.code} className="border-b border-neutral-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{c.label}</span>
                        {c.external && (
                          <span className="ml-2 border border-neutral-400 px-1 py-0.5 text-[10px] uppercase text-neutral-500">
                            внешний модуль 6.3
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 ${c.passed ? 'text-green-700' : 'text-red-600'}`}>
                        {c.passed ? 'Пройден' : 'Не пройден'}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{c.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Работы исполнителя (фото «после» — в сводке §3.1 выше) */}
      {(order.workDone || order.materials) && (
        <Card>
          <h3 className="text-sm font-semibold">Выполненные работы</h3>
          {order.workDone && <p className="mt-1 whitespace-pre-wrap text-sm">{order.workDone}</p>}
          {order.materials && <p className="mt-1 text-sm text-neutral-600">Материалы: {order.materials}</p>}
        </Card>
      )}

      {/* ---- История (ТЗ §4.3): лента событий слева, детали — справа ---- */}
      <div className="flex flex-col gap-3" ref={historyRef} id="order-history">
        <h3 className="text-lg font-semibold">История</h3>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          {/* Лента истории: от «Наряд выдан» к текущему состоянию. */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Лента истории
            </h4>
            <ol className="flex flex-col gap-2">
              {feed.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => openEventDetails(h)}
                    aria-current={selectedEvent?.id === h.id ? 'true' : undefined}
                    className={`flex w-full flex-col gap-1 border p-3 text-left text-sm transition-colors ${
                      selectedEvent?.id === h.id
                        ? 'border-neutral-900 bg-neutral-50'
                        : 'border-neutral-200 hover:border-neutral-900'
                    }`}
                  >
                    <span className="flex w-full flex-wrap items-baseline justify-between gap-2">
                      <span>
                        <span className="font-medium">{h.actorName}</span> — {h.action}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {new Date(h.createdAt).toLocaleString('ru-RU')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {/* Текущее состояние — завершающий этап ленты. */}
              <li className="border border-neutral-900 bg-neutral-900 p-3 text-sm text-white">
                Текущий статус наряда:{' '}
                <span className="font-medium">{ORDER_STATUS_LABELS[order.status]}</span>
              </li>
            </ol>
          </div>

          {/* Детальная информация: открывается по клику на запись. */}
          <aside
            ref={detailRef}
            className="flex flex-col gap-3 border border-neutral-200 bg-neutral-50 p-4 lg:sticky lg:top-24"
          >
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Детальная информация
            </h4>
            {!selectedEvent ? (
              <p className="text-sm text-neutral-500">
                Нажмите на запись в ленте истории, чтобы увидеть время изменения, автора и
                сравнение «что было → что стало».
              </p>
            ) : (
              <>
                <h5 className="text-base font-semibold">{selectedEvent.action}</h5>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-neutral-500">Время изменения</dt>
                  <dd>{new Date(selectedEvent.createdAt).toLocaleString('ru-RU')}</dd>
                  <dt className="text-neutral-500">Кто изменил</dt>
                  <dd>{selectedEvent.actorName}</dd>
                </dl>
                <div>
                  <h6 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Что было → что стало
                  </h6>
                  {selectedEvent.changes.length === 0 ? (
                    <p className="mt-1 text-sm text-neutral-500">
                      Конкретных изменений не зафиксировано.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {selectedEvent.changes.map((c, i) => (
                        <li
                          key={i}
                          className="border-b border-neutral-200 pb-2 text-sm last:border-0 last:pb-0"
                        >
                          <span className="font-medium">{c.field}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-neutral-400">
                              {formatChangeValue(c.field, c.from)}
                            </span>
                            <span aria-hidden>→</span>
                            <span>{formatChangeValue(c.field, c.to)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <Btn variant="ghost" onClick={() => setSelectedEvent(null)}>Закрыть</Btn>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </Screen>
  )
}

function formatValue(v: string | null): string {
  if (v == null) return '—'
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('ru-RU')
  return v
}

/** Значения истории «что было → что стало»: коды статусов/типов/приоритетов
 *  показываем русскими подписями, остальное — как есть. */
function formatChangeValue(field: string, v: string | null): string {
  if (v == null) return '—'
  const f = field.toLowerCase()
  if (/статус|status/.test(f) && v in ORDER_STATUS_LABELS) {
    return ORDER_STATUS_LABELS[v as keyof typeof ORDER_STATUS_LABELS]
  }
  if (/тип работ|worktype/.test(f) && v in WORK_TYPE_LABELS) {
    return WORK_TYPE_LABELS[v as keyof typeof WORK_TYPE_LABELS]
  }
  if (/приоритет|priority/.test(f) && v in PRIORITY_LABELS) {
    return PRIORITY_LABELS[v as keyof typeof PRIORITY_LABELS]
  }
  if (/решение|decision/.test(f) && v in DECISION_LABELS) {
    return DECISION_LABELS[v as keyof typeof DECISION_LABELS]
  }
  return formatValue(v)
}
