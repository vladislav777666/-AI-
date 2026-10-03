// Frame 21: архив закрытых нарядов (сортировка по дате закрытия новыми вперёд).
// Frame 22: детализация — параметры, фото до/после, оценка, комментарий, чек-лист.

import { useEffect, useState } from 'react'
import * as db from '../../lib/db'
import {
  ORDER_STATUS_LABELS, PRIORITY_LABELS, WORK_TYPE_LABELS,
  type Acceptance, type WorkOrder,
} from '../../lib/types'
import { Card, PhotoGallery, Screen, Stars } from '../../components/ui'
import type { WorkerCtx } from './shared'

export default function ClosedOrders({ ctx, detailId }: { ctx: WorkerCtx; detailId?: string }) {
  const closed = ctx.orders
    .filter((o) => o.status === 'closed')
    .sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt))

  if (detailId) {
    const order = closed.find((o) => o.id === detailId) ?? ctx.orders.find((o) => o.id === detailId) ?? null
    return <ClosedDetail ctx={ctx} order={order} />
  }

  const eqName = (id: string) => ctx.equipment.find((e) => e.id === id)?.name ?? '—'
  const areaName = (id: string) => ctx.areas.find((a) => a.id === id)?.name ?? '—'

  return (
    <Screen title="Закрытые наряды" subtitle="Сортировка: от новых к старым">
      {closed.length === 0 && <p className="text-sm text-neutral-500">Закрытых нарядов пока нет.</p>}
      <div className="flex flex-col gap-2">
        {closed.map((o) => (
          <ClosedCard key={o.id} ctx={ctx} order={o} eqName={eqName(o.equipmentId)} areaName={areaName(o.areaId)} />
        ))}
      </div>
    </Screen>
  )
}

function useAcceptance(orderId: string): Acceptance | null {
  const [acc, setAcc] = useState<Acceptance | null>(null)
  useEffect(() => {
    void db.getAcceptance(orderId).then(setAcc).catch(() => {})
  }, [orderId])
  return acc
}

function ClosedCard({ ctx, order, eqName, areaName }: {
  ctx: WorkerCtx
  order: WorkOrder
  eqName: string
  areaName: string
}) {
  const acc = useAcceptance(order.id)
  const received = new Date(order.acceptedAt ?? order.startedAt ?? order.createdAt)
  const closedAt = new Date(order.closedAt ?? order.createdAt)
  const durationMs = closedAt.getTime() - received.getTime()

  return (
    <Card onClick={() => ctx.go({ view: 'closedDetail', id: order.id })}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{eqName}</span>
        <span className="text-sm text-neutral-500">{areaName}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Наряд №{order.number}
        {order.faultCode ? ` · Шифр: ${order.faultCode}` : ''}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Получен: {received.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {' · '}Закрыт: {closedAt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {' · '}Выполнение: {Math.max(0, Math.floor(durationMs / 60000))} мин
      </p>
      <p className="mt-1 text-sm">
        Оценка:{' '}
        {acc ? <Stars value={acc.aiScore} /> : <span className="text-neutral-500">ожидается</span>}
      </p>
    </Card>
  )
}

function ClosedDetail({ ctx, order }: { ctx: WorkerCtx; order: WorkOrder | null }) {
  const [acc, setAcc] = useState<Acceptance | null>(null)

  useEffect(() => {
    if (order) void db.getAcceptance(order.id).then(setAcc).catch(() => {})
  }, [order])

  if (!order) {
    return <Screen title="Закрытый наряд"><p className="text-sm text-neutral-500">Наряд не найден.</p></Screen>
  }

  const eqName = ctx.equipment.find((e) => e.id === order.equipmentId)?.name ?? '—'
  const areaName = ctx.areas.find((a) => a.id === order.areaId)?.name ?? '—'

  return (
    <Screen title={`Наряд №${order.number}`} subtitle={ORDER_STATUS_LABELS[order.status]}>
      {/* Параметры (§29.1) */}
      <Card>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k="Дата выдачи" v={new Date(order.createdAt).toLocaleString('ru-RU')} />
          <Row k="Тип работ" v={WORK_TYPE_LABELS[order.workType]} />
          <Row k="Участок" v={areaName} />
          <Row k="Оборудование" v={eqName} />
          <Row k="Срок исполнения" v={new Date(order.deadline).toLocaleString('ru-RU')} />
          <Row k="Приоритет" v={PRIORITY_LABELS[order.priority]} />
          <Row k="Закрыт" v={(order.closedAt ? new Date(order.closedAt) : new Date(order.createdAt)).toLocaleString('ru-RU')} />
          <Row k="Шифр" v={order.faultCode ?? '—'} />
          <div className="sm:col-span-2">
            <dt className="text-xs text-neutral-500">Описание проблемы</dt>
            <dd className="whitespace-pre-wrap">{order.description}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-neutral-500">Выполненные работы</dt>
            <dd className="whitespace-pre-wrap">{order.workDone ?? '—'}</dd>
          </div>
          {order.materials && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Материалы</dt>
              <dd>{order.materials}</dd>
            </div>
          )}
          {order.workerComment && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Комментарий исполнителя</dt>
              <dd className="whitespace-pre-wrap">{order.workerComment}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Фото до / после (§30) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold">До</h3>
          <PhotoGallery photos={order.photos} label="Фото неисправности" />
          {order.photos.length === 0 && <p className="text-sm text-neutral-500">Нет фото.</p>}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">После</h3>
          <PhotoGallery photos={order.photosAfter} label="Фото после" />
          {order.photosAfter.length === 0 && <p className="text-sm text-neutral-500">Нет фото.</p>}
        </Card>
      </div>

      {/* Результаты приёмки (§31) */}
      <Card className="border-neutral-900">
        <h3 className="text-lg font-semibold">Результаты приёмки</h3>
        {!acc && <p className="mt-1 text-sm text-neutral-500">Оценка еще не выставлена.</p>}
        {acc && (
          <>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm font-medium">Итоговая оценка:</span>
              <Stars value={acc.aiScore} />
            </div>
            {acc.masterComment && (
              <p className="mt-2 text-sm text-neutral-700">Комментарий Мастера: {acc.masterComment}</p>
            )}
            {acc.checklist && acc.checklist.length > 0 && (
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-xs text-neutral-500">
                    <th className="py-1.5 pr-2">Критерий</th>
                    <th className="py-1.5 pr-2">Результат</th>
                    <th className="py-1.5">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {acc.checklist.map((c) => (
                    <tr key={c.code} className="border-b border-neutral-100 align-top">
                      <td className="py-1.5 pr-2">{c.label}</td>
                      <td className={`py-1.5 pr-2 font-medium ${c.passed ? 'text-green-700' : 'text-red-600'}`}>
                        {c.passed ? 'Пройден' : 'Не пройден'}
                      </td>
                      <td className="py-1.5 text-xs text-neutral-500">{c.comment ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!acc.checklist && (
              <p className="mt-2 text-xs text-neutral-400">Чек-лист не сохранён (запись сделана до обновления).</p>
            )}
          </>
        )}
      </Card>
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
