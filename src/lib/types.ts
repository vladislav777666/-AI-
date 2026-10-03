// Типы модуля «Мастер» + словари подписей.

export type Role = 'Master' | 'Worker'

export type WorkerStatus = 'free' | 'busy' | 'queue' | 'not_on_shift'

export type OrderStatus =
  | 'issued'      // выдан (не принят исполнителем → «оборудование в простое»)
  | 'accepted'    // принят исполнителем
  | 'in_work'     // в работе
  | 'queued'      // в очереди
  | 'completed'   // сдан исполнителем, ждёт приёмки
  | 'cancelled'   // отменён (не удаляется физически)
  | 'suspended'   // приостановлен
  | 'closed'      // принят мастером (итог)

export type Priority = 'emergency' | 'high' | 'normal' | 'planned'

export type WorkType = 'planned' | 'unplanned'

export type MasterDecision = 'accepted' | 'with_remarks' | 'rework'

export interface Profile {
  id: string
  role: Role
  fullName: string
}

export interface Worker {
  id: string
  userId: string
  fullName: string
  specialty: string
  status: WorkerStatus
  rating: number
}

export interface Area {
  id: string
  name: string
}

export interface Equipment {
  id: string
  areaId: string
  name: string
}

export interface HistoryChange {
  field: string
  from: string | null
  to: string | null
}

export interface HistoryEntry {
  id: string
  orderId: string
  actorName: string
  action: string
  changes: HistoryChange[]
  createdAt: string
}

export interface Acceptance {
  id: string
  orderId: string
  aiScore: number
  aiComment: string
  masterDecision: MasterDecision
  agreedWithAi: boolean
  masterComment: string | null
  createdAt: string
}

export interface WorkOrder {
  id: string
  number: string
  workType: WorkType
  description: string
  areaId: string
  equipmentId: string
  workerId: string | null
  deadline: string
  priority: Priority
  status: OrderStatus
  faultCode: string | null
  photos: string[]
  comment: string | null
  normHours: number | null
  workDone: string | null
  materials: string | null
  photosAfter: string[]
  createdAt: string
  acceptedAt: string | null
  startedAt: string | null
  completedAt: string | null
  closedAt: string | null
}

export interface NewOrderInput {
  workType: WorkType
  description: string
  areaId: string
  equipmentId: string
  workerId: string
  deadline: string
  priority: Priority
  faultCode?: string | null
  normHours?: number | null
  photos: string[]
  comment?: string | null
}

export interface AiVerdict {
  score: number
  comment: string
}

export interface WorkerEquipmentStat {
  equipment: Equipment
  count: number
  avgScore: number | null
}

// ---------- Словари подписей ----------

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  issued: 'Выдан',
  accepted: 'Принят',
  in_work: 'В работе',
  queued: 'В очереди',
  completed: 'Выполнен',
  cancelled: 'Отменён',
  suspended: 'Приостановлен',
  closed: 'Принято',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  emergency: 'Аварийный — срочно в работу',
  high: 'Высокий',
  normal: 'Обычный — в порядке очереди',
  planned: 'Плановый',
}

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  planned: 'Плановый',
  unplanned: 'Внеплановый (аварийный)',
}

export const WORKER_STATUS_LABELS: Record<WorkerStatus, string> = {
  free: 'Свободен',
  busy: 'В работе',
  queue: 'Есть очередь',
  not_on_shift: 'Не на смене',
}

export const DECISION_LABELS: Record<MasterDecision, string> = {
  accepted: 'Принять',
  with_remarks: 'С замечаниями',
  rework: 'На доработку',
}

// Фильтр статусов в списке нарядов (включая вычисляемый «просрочен»).
export type StatusFilter = OrderStatus | 'overdue' | 'all'

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  ...ORDER_STATUS_LABELS,
  overdue: 'Просроченные',
  all: 'Все',
}

/** Просрочен = срок истёк, но работа ещё не завершена и не отменена. */
export function isOverdue(order: WorkOrder, now = new Date()): boolean {
  return (
    new Date(order.deadline) < now &&
    !['completed', 'cancelled', 'closed'].includes(order.status)
  )
}
