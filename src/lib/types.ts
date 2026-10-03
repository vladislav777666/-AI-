// Типы модуля «Мастер» + словари подписей.

export type Role = 'Master' | 'Worker'

export type WorkerStatus = 'free' | 'busy' | 'queue' | 'not_on_shift'

export type OrderStatus =
  | 'issued'      // = ASSIGNED: выдан (не принят исполнителем)
  | 'accepted'    // = ACCEPTED: принят исполнителем
  | 'in_work'     // = IN_PROGRESS: в работе
  | 'queued'      // = QUEUED: в очереди
  | 'completed'   // = ON_ACCEPTANCE: сдан исполнителем, ждёт приёмки
  | 'cancelled'   // отменён (не удаляется физически)
  | 'suspended'   // = PAUSED: приостановлен
  | 'closed'      // = CLOSED: принят мастером (итог)
  | 'rejected'    // = REJECTED: отклонён исполнителем
  | 'rework'      // = REWORK: возвращён мастером на доработку

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

export interface MaterialItem {
  name: string
  qty: number
  unit: string
}

export interface ChecklistItem {
  code: string
  label: string
  passed: boolean
  comment: string | null
}

export interface FaultCode {
  code: string
  name: string
  description: string
}

export interface Notification {
  id: string
  userId: string
  workOrderId: string | null
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
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
  checklist: ChecklistItem[] | null
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
  workerComment: string | null
  materials: string | null
  materialsList: MaterialItem[]
  photosAfter: string[]
  pauseReason: string | null
  rejectReason: string | null
  pausedAt: string | null
  createdBy: string | null
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
  checklist: ChecklistItem[]
}

export interface WorkerEquipmentStat {
  equipment: Equipment
  count: number
  avgScore: number | null
}

// ---------- Словари подписей ----------

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  issued: 'Назначен',
  accepted: 'Принят',
  in_work: 'В работе',
  queued: 'В очереди',
  completed: 'На приёмке',
  cancelled: 'Отменён',
  suspended: 'Приостановлен',
  closed: 'Закрыт',
  rejected: 'Отклонён',
  rework: 'На доработке',
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
