// Уведомления (ТЗ §2.2): карточки инцидентов по нарядам и целевые переходы.
//
//   • Просроченный наряд (принят, но срок прошёл) — «Просрочен на: X»:
//     клик открывает наряд сразу на окне истории (§4.3);
//   • Наряд не принят / аварийный наряд не принят — «Приоритет: Y»:
//     клик открывает окно «детали наряда / замена исполнителя». Порог эскалации
//     по PDF §6.1 п.4: не принят за 10 минут (аварийный — за 3 минуты);
//   • Повторная задержка по наряду — «Не принят уже: X», «Приоритет: Y»:
//     клик открывает то же окно; повторные напоминания через заданный
//     интервал (§6.1 п.5): аварийный — 15 мин, высокий — 30, обычный — 60,
//     плановый — 120).
//
// Ниже карточек — лента последних событий по всем нарядам.

import { useEffect, useMemo, useState } from 'react'
import * as db from '../../lib/db'
import {
  isOverdue, PRIORITY_LABELS, WORKER_STATUS_LABELS,
  type Priority, type WorkOrder,
} from '../../lib/types'
import { Btn, Screen, Select } from '../../components/ui'
import type { MasterData } from './nav'

type Entry = Awaited<ReturnType<typeof db.recentHistory>>[number]

/** Порог эскалации «не принят» → мастеру (PDF §6.1 п.4): 10 минут,
 *  аварийный наряд — 3 минуты. */
const ESCALATE_AFTER_MS: Record<Priority, number> = {
  emergency: 3 * 60_000,
  high: 10 * 60_000,
  normal: 10 * 60_000,
  planned: 10 * 60_000,
}

/** Интервал повторных напоминаний после первой эскалации (§6.1 п.5). */
const REPEAT_AFTER_MS: Record<Priority, number> = {
  emergency: 15 * 60_000,
  high: 30 * 60_000,
  normal: 60 * 60_000,
  planned: 120 * 60_000,
}

type IncidentKind = 'overdue' | 'not_accepted' | 'repeat'

interface Incident {
  kind: IncidentKind
  order: WorkOrder
  /** Просрочка (принят) или ожидание принятия, мс. */
  ms: number
}

/** Ожидание/просрочка человеческим языком: «45 мин», «3 ч 20 мин», «2 сут 4 ч». */
function waitLabel(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000))
  if (totalMin < 1) return 'меньше минуты'
  if (totalMin < 60) return `${totalMin} мин`
  const hours = Math.floor(totalMin / 60)
  if (hours < 24) return `${hours} ч ${totalMin % 60} мин`
  return `${Math.floor(hours / 24)} сут ${hours % 24} ч`
}

/** Инциденты по активным нарядам (просроченные — первыми). */
function collectIncidents(orders: WorkOrder[], now: number): Incident[] {
  const out: Incident[] = []
  for (const o of orders) {
    if (['completed', 'cancelled', 'closed'].includes(o.status)) continue
    // Приняли, но срок прошёл.
    if (o.acceptedAt && isOverdue(o, new Date(now))) {
      out.push({ kind: 'overdue', order: o, ms: now - new Date(o.deadline).getTime() })
      continue
    }
    // Назначен, но не принят исполнителем: до порога эскалации (10/3 мин)
    // инцидента нет — как в PDF §6.1 п.4.
    if (o.status === 'issued') {
      const waited = now - new Date(o.createdAt).getTime()
      const escalateAfter = ESCALATE_AFTER_MS[o.priority]
      if (waited < escalateAfter) continue
      out.push({
        kind: waited >= escalateAfter + REPEAT_AFTER_MS[o.priority] ? 'repeat' : 'not_accepted',
        order: o,
        ms: waited,
      })
    }
  }
  const severity = (i: Incident): number =>
    i.kind === 'overdue' ? 0 : i.kind === 'repeat' || i.order.priority === 'emergency' ? 1 : 2
  return out.sort((a, b) => severity(a) - severity(b) || b.ms - a.ms)
}

function incidentLabel(inc: Incident): string {
  if (inc.kind === 'overdue') return 'Просроченный наряд'
  if (inc.kind === 'repeat') return 'Повторная задержка по наряду'
  return inc.order.priority === 'emergency' ? 'Аварийный наряд не принят' : 'Наряд не принят'
}

/** Строки карточки строго по макету уведомлений. */
function incidentLines(inc: Incident): string[] {
  if (inc.kind === 'overdue') return [`Просрочен на: ${waitLabel(inc.ms)}`]
  if (inc.kind === 'repeat') {
    return [
      `Не принят уже: ${waitLabel(inc.ms)}`,
      `Приоритет: ${PRIORITY_LABELS[inc.order.priority]}`,
    ]
  }
  return [`Приоритет: ${PRIORITY_LABELS[inc.order.priority]}`]
}

export default function Notifications({ data }: { data: MasterData }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incident, setIncident] = useState<Incident | null>(null)
  const [reassign, setReassign] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void db
      .recentHistory(50)
      .then((e) => alive && setEntries(e))
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Ошибка загрузки'))
    return () => { alive = false }
  }, [data.orders.length])

  const incidents = useMemo(
    () => collectIncidents(data.orders, Date.now()),
    [data.orders],
  )

  // Кандидаты на замену исполнителя: сначала свободные, затем по рейтингу.
  const candidates = useMemo(() => {
    if (!incident) return []
    const rank: Record<string, number> = { free: 0, queue: 1, busy: 2, not_on_shift: 3 }
    return data.workers
      .filter((w) => w.id !== incident.order.workerId)
      .sort((a, b) => rank[a.status] - rank[b.status] || b.rating - a.rating)
  }, [incident, data.workers])

  function openIncident(inc: Incident) {
    setIncident(inc)
    setReassign('')
    setNotice(null)
  }

  /** Замена исполнителя: переназначаем наряд и уведомляем нового исполнителя. */
  async function applyReassign() {
    if (!incident) return
    const workerId = reassign || candidates[0]?.id
    if (!workerId) {
      setNotice('Нет доступных исполнителей для замены.')
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const actor = data.profile.fullName || 'Мастер'
      await db.updateOrder(incident.order.id, { workerId }, actor, 'Замена исполнителя')
      await db.notifyWorkerEvent(
        incident.order.id,
        'NEW_ORDER',
        `Наряд ${incident.order.number} назначен`,
        'Мастер переназначил наряд — примите его в работу.',
      )
      await data.refresh()
      setIncident(null)
      setReassign('')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Не удалось переназначить наряд')
    } finally {
      setBusy(false)
    }
  }

  const equipmentName = (o: WorkOrder) =>
    data.equipment.find((e) => e.id === o.equipmentId)?.name ?? '—'
  const areaName = (o: WorkOrder) => data.areas.find((a) => a.id === o.areaId)?.name ?? '—'
  const workerName = (id: string | null) =>
    (id && data.workers.find((w) => w.id === id)?.fullName) || '—'

  const tone = (inc: Incident): { border: string; text: string } => {
    if (inc.kind === 'overdue' || inc.order.priority === 'emergency') {
      return { border: 'border-l-red-600', text: 'text-red-700' }
    }
    if (inc.kind === 'repeat') return { border: 'border-l-orange-500', text: 'text-orange-700' }
    return { border: 'border-l-amber-400', text: 'text-amber-700' }
  }

  return (
    <Screen title="Уведомления" subtitle="Инциденты по нарядам и последние события">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {/* ---- Карточки инцидентов ---- */}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Инциденты</h3>
        {incidents.length === 0 && (
          <p className="border border-neutral-200 p-3 text-sm text-neutral-500">
            Инцидентов нет: все наряды приняты и идут в срок.
          </p>
        )}
        {incidents.map((inc) => (
          <button
            key={`${inc.kind}:${inc.order.id}`}
            type="button"
            onClick={() =>
              inc.kind === 'overdue'
                ? data.go({ screen: 'order', id: inc.order.id, focus: 'history' })
                : openIncident(inc)
            }
            className={`border border-l-4 border-neutral-200 p-4 text-left text-sm transition-colors hover:border-neutral-900 ${tone(inc).border}`}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={`text-xs font-medium uppercase tracking-wide ${tone(inc).text}`}>
                {incidentLabel(inc)}
              </span>
              <span className="text-xs text-neutral-400">
                {inc.kind === 'overdue'
                  ? 'Открыть историю наряда →'
                  : 'Детали / замена исполнителя →'}
              </span>
            </span>
            <span className="mt-2 block font-medium">{inc.order.number}</span>
            {incidentLines(inc).map((line) => (
              <span key={line} className="mt-0.5 block text-neutral-700">{line}</span>
            ))}
            <span className="mt-1 block text-xs text-neutral-500">
              {equipmentName(inc.order)} · {areaName(inc.order)} · исполнитель:{' '}
              {workerName(inc.order.workerId)}
            </span>
          </button>
        ))}
      </div>

      {/* ---- Окно инцидента: детали наряда / замена исполнителя ---- */}
      {incident && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIncident(null)}
        >
          <div
            className="w-full max-w-lg border border-neutral-900 bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-semibold">{incidentLabel(incident)}</h4>
            <p className="mt-1 text-sm text-neutral-500">
              {incident.order.number} · детали наряда и замена исполнителя
            </p>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-neutral-500">Приоритет</dt>
              <dd>{PRIORITY_LABELS[incident.order.priority]}</dd>
              <dt className="text-neutral-500">Участок</dt>
              <dd>{areaName(incident.order)}</dd>
              <dt className="text-neutral-500">Оборудование</dt>
              <dd>{equipmentName(incident.order)}</dd>
              <dt className="text-neutral-500">Шифр</dt>
              <dd>{incident.order.faultCode ?? '—'}</dd>
              <dt className="text-neutral-500">Срок</dt>
              <dd>
                {new Date(incident.order.deadline).toLocaleString('ru-RU')}
                {isOverdue(incident.order) && (
                  <span className="ml-2 font-medium text-red-600">ПРОСРОЧЕН</span>
                )}
              </dd>
              <dt className="text-neutral-500">
                {incident.kind === 'overdue' ? 'Просрочен на' : 'Не принят уже'}
              </dt>
              <dd>{waitLabel(incident.ms)}</dd>
              <dt className="text-neutral-500">Исполнитель</dt>
              <dd>{workerName(incident.order.workerId)}</dd>
            </dl>

            <label className="mt-4 flex flex-col gap-1 text-sm text-neutral-500">
              Замена исполнителя
              <Select
                value={reassign || candidates[0]?.id || ''}
                onChange={(e) => setReassign(e.target.value)}
                disabled={candidates.length === 0}
              >
                {candidates.length === 0 && <option value="">Нет доступных исполнителей</option>}
                {candidates.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.fullName} · {WORKER_STATUS_LABELS[w.status]}
                  </option>
                ))}
              </Select>
            </label>

            {notice && <p role="alert" className="mt-3 text-sm text-red-600">{notice}</p>}

            <div className="mt-4 flex flex-wrap gap-3">
              <Btn onClick={applyReassign} disabled={busy || candidates.length === 0}>
                {busy ? 'Назначаем…' : 'Назначить исполнителя'}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  const id = incident.order.id
                  setIncident(null)
                  data.go({ screen: 'order', id })
                }}
              >
                Открыть наряд
              </Btn>
              <Btn variant="ghost" onClick={() => setIncident(null)}>Закрыть</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ---- Лента последних событий по всем нарядам ---- */}
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Последние события</h3>
        {!entries && !error && <p className="text-sm text-neutral-500">Загрузка…</p>}
        {entries && entries.length === 0 && <p className="text-sm text-neutral-500">Событий пока нет.</p>}
        {entries?.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => data.go({ screen: 'order', id: e.orderId, focus: 'history' })}
            className="border border-neutral-200 p-3 text-left text-sm transition-colors hover:border-neutral-900"
          >
            <span className="font-medium">{e.orderNumber}</span> · {e.action}
            <span className="ml-2 text-neutral-500">— {e.actorName}</span>
            <span className="ml-2 text-xs text-neutral-400">
              {new Date(e.createdAt).toLocaleString('ru-RU')}
            </span>
          </button>
        ))}
      </div>
    </Screen>
  )
}
