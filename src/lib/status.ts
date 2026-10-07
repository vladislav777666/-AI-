// Машина состояний наряда, справочники причин, веса приоритетов, типы уведомлений.
// Хранение статусов — существующие значения (issued и т.д.); исходники ТЗ
// (ASSIGNED и др.) сохранены как event_type в аудите.

import type { OrderStatus, Priority } from './types'

// ---------- Маппинг исходных статусов ТЗ → хранение ----------

export const STATUS_ALIASES: Record<OrderStatus, string> = {
  issued: 'ASSIGNED',
  accepted: 'ACCEPTED',
  queued: 'QUEUED',
  in_work: 'IN_PROGRESS',
  suspended: 'PAUSED',
  completed: 'ON_ACCEPTANCE',
  closed: 'CLOSED',
  rejected: 'REJECTED',
  rework: 'REWORK',
  cancelled: 'CANCELLED',
}

// ---------- Разрешённые переходы (ТЗ §5, сервер дублирует в 0003) ----------

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  issued: ['accepted', 'queued', 'rejected', 'cancelled'],
  accepted: ['in_work', 'queued', 'rejected', 'cancelled'],
  queued: ['in_work', 'rejected', 'cancelled'],
  in_work: ['suspended', 'completed', 'cancelled'],
  suspended: ['in_work', 'cancelled'],
  completed: ['closed', 'rework'],
  rework: ['in_work', 'completed', 'cancelled'],
  rejected: ['issued', 'cancelled'],
  closed: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Недопустимый переход статуса: ${from} → ${to}`)
  }
}

/** Терминальные — карточка только на просмотр. */
export function isTerminal(status: OrderStatus): boolean {
  return status === 'closed' || status === 'cancelled' || status === 'rejected'
}

/** Ожидают действий Исполнителя. */
export const WORKER_ACTIONABLE: OrderStatus[] = ['issued', 'accepted', 'queued', 'in_work', 'suspended', 'rework']

// ---------- Приоритеты (ТЗ §7): CRITICAL/HIGH/MEDIUM/LOW, вес только для сортировки ----------

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  emergency: 4, // CRITICAL
  high: 3,
  normal: 2,
  planned: 1,
}

export const PRIORITY_SHORT: Record<Priority, string> = {
  emergency: 'АВАРИЙНЫЙ',
  high: 'ВЫСОКИЙ',
  normal: 'ОБЫЧНЫЙ',
  planned: 'ПЛАННЫЙ',
}

/** Сортировка ТЗ §7: по приоритету убыв, затем старые вперёд. */
export function compareForRegistry(a: { priority: Priority; createdAt: string }, b: { priority: Priority; createdAt: string }): number {
  const w = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  if (w !== 0) return w
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

// ---------- Справочники причин (ТЗ §12.3, §14) ----------

export const REJECT_REASONS = [
  'Нет материалов',
  'Нет допуска',
  'Занят аварийным обслуживанием',
  'Нет доступа',
  'Неисправность требует другой квалификации',
  'Отсутствует необходимое оборудование',
  'Иная причина',
] as const

export const PAUSE_REASONS = [
  'Ждёт запчасти',
  'Ждёт материала',
  'Ждёт остановки оборудования',
  'Ждёт допуска',
  'Нет доступа',
  'Ожидание другого сотрудника',
  'Аварийная ситуация',
  'Другая причина',
] as const

export const OTHER_REASON = 'Иная причина'
export const OTHER_PAUSE_REASON = 'Другая причина'

// ---------- Уведомления (ТЗ §32, §43) ----------

export type NotificationType =
  | 'NEW_ORDER'
  | 'PRIORITY_CHANGED'
  | 'DEADLINE_APPROACH'
  | 'OVERDUE'
  | 'REWORK'
  | 'ACCEPTANCE'
  | 'RATED'
  | 'STATUS_CHANGED'
  | 'REJECTED'
  | 'SYSTEM'

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  NEW_ORDER: 'Новый наряд',
  PRIORITY_CHANGED: 'Изменение приоритета',
  DEADLINE_APPROACH: 'Приближение срока',
  OVERDUE: 'Просрочка',
  REWORK: 'Возврат на доработку',
  ACCEPTANCE: 'Проверка ИИ',
  RATED: 'Выставлена оценка',
  STATUS_CHANGED: 'Изменение статуса',
  REJECTED: 'Наряд отклонён',
  SYSTEM: 'Системное',
}

// ---------- Отображение времени ----------

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h} ч ${m} мин`
}

export function overdueDuration(deadline: string, now = new Date()): number {
  return now.getTime() - new Date(deadline).getTime()
}

// ---------- Правило одной активной задачи (ТЗ §6) ----------

export function activeTaskConflict(orders: Array<{ id: string; status: OrderStatus }>, exceptId?: string): boolean {
  return orders.some((o) => o.status === 'in_work' && o.id !== exceptId)
}
