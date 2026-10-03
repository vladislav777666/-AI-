// Схема БД модуля «Исполнитель» (PostgreSQL / Supabase).
// Только контракты маппинга и UMD-подключения; таблицы и триггеры живут в
// миграциях субъекта: 0001_auth_by_role.sql, 0002_master_module.sql,
// 0003_worker_cabinet.sql.

import type {
  ChecklistItem,
  MaterialItem,
  Profile,
  WorkOrder,
  WorkerStatus,
} from '../types'

// ---------- Схема БД (доменные типы для маппинга) ----------
export type DbProfile = Pick<Profile, 'id' | 'role' | 'fullName'>

export interface DbWorker {
  id: string
  userId: string
  fullName: string
  specialty: string
  status: WorkerStatus
  rating: number
}

export interface DbArea {
  id: string
  name: string
}

export interface DbEquipment {
  id: string
  areaId: string
  name: string
}

export interface DbFaultCode {
  code: string
  name: string
  description: string
  active: boolean
  sortOrder: number
}

export interface DbWorkOrder {
  id: string
  number: string
  workType: WorkOrder['workType']
  description: string
  areaId: string
  equipmentId: string
  workerId: string | null
  deadline: string
  priority: WorkOrder['priority']
  status: WorkOrder['status']
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
  createdAt: string
  createdBy: string | null
  acceptedAt: string | null
  startedAt: string | null
  completedAt: string | null
  closedAt: string | null
}

export interface DbHistoryEntry {
  id: string
  orderId: string
  actorName: string
  action: string
  changes: unknown[]
  event_type?: string
  reason?: string
  createdAt: string
}

export interface DbNotification {
  id: string
  userId: string
  workOrderId: string | null
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  readAt?: string | null
}

export interface DbAcceptance {
  id: string
  orderId: string
  aiScore: number
  aiComment: string
  masterDecision: 'accepted' | 'with_remarks' | 'rework'
  agreedWithAi: boolean
  masterComment: string | null
  checklist: ChecklistItem[] | null
  decidedBy: string | null
  createdAt: string
}

export interface DbMaterialItem extends MaterialItem {
  id: string
}

// ---------- SQL-объекты, хранящиеся в миграциях субъекта ----------
export const dbObjects = {
  profiles: 'public.profiles',
  workers: 'public.workers',
  areas: 'public.areas',
  equipment: 'public.equipment',
  workOrders: 'public.work_orders',
  workOrderHistory: 'public.work_order_history',
  workOrderAcceptance: 'public.work_order_acceptance',
  faultCodes: 'public.fault_codes',
  notifications: 'public.notifications',
  functions: {
    workOrdersGuard: 'public.work_orders_guard',
    workOrdersHistoryTriggerFn: 'public.work_orders_history_trg_fn',
  },
  triggers: {
    workOrdersGuardTrigger: 'public.work_orders_guard_trg',
    workOrdersHistoryTrigger: 'public.work_orders_history_trg',
  },
  indexes: ['public.notifications_user_idx'],
  policies: {
    faultCodesRead: 'fault_codes: read all',
    notificationsReadOwn: 'notifications: read own',
    notificationsInsert: 'notifications: insert',
    notificationsMarkRead: 'notifications: mark read',
  },
}

// ---------- Миграции субъекта ----------
export const migrations = [
  '0001_auth_by_role.sql',
  '0002_master_module.sql',
  '0003_worker_cabinet.sql',
] as const

// ---------- Утилиты маппинга ----------
export function mapOrder(row: Record<string, unknown>): DbWorkOrder {
  return {
    id: row.id as string,
    number: row.number as string,
    workType: row.work_type as DbWorkOrder['workType'],
    description: row.description as string,
    areaId: row.area_id as string,
    equipmentId: row.equipment_id as string,
    workerId: (row.worker_id as string | null) ?? null,
    deadline: row.deadline as string,
    priority: row.priority as DbWorkOrder['priority'],
    status: row.status as DbWorkOrder['status'],
    faultCode: (row.fault_code as string | null) ?? null,
    photos: (row.photos as string[] | null) ?? [],
    comment: (row.comment as string | null) ?? null,
    normHours: row.norm_hours != null ? Number(row.norm_hours) : null,
    workDone: (row.work_done as string | null) ?? null,
    workerComment: (row.worker_comment as string | null) ?? null,
    materials: (row.materials as string | null) ?? null,
    materialsList: (row.materials_list as DbMaterialItem[] | null) ?? [],
    photosAfter: (row.photos_after as string[] | null) ?? [],
    pauseReason: (row.pause_reason as string | null) ?? null,
    rejectReason: (row.reject_reason as string | null) ?? null,
    pausedAt: (row.paused_at as string | null) ?? null,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
  }
}

export function mapHistory(row: Record<string, unknown>): DbHistoryEntry {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    actorName: (row.actor_name as string) ?? 'Система',
    action: row.action as string,
    changes: (row.changes as unknown[]) ?? [],
    event_type: (row.event_type as string | undefined) ?? undefined,
    reason: (row.reason as string | undefined) ?? undefined,
    createdAt: row.created_at as string,
  }
}

// ---------- Переподключение на стороне клиента ----------

/** Конфигурация Supabase-субъекта, читаемая непосредственно из переменных
 *  окружения клиента (используется в src/lib/supabase.ts). */
export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** Проверка того, что субъект настроен. */
export function isSupabaseConfigured(config: SupabaseConfig): boolean {
  return Boolean(config.url && config.anonKey)
}

// ---------- Типовые индексы ----------
export const indexes = {
  notificationsUserIdCreatedAtDesc: 'notifications (user_id, created_at desc)',
  workOrdersWorkerStatus: 'work_orders (worker_id, status)',
  workOrdersWorkerDeadline: 'work_orders (worker_id, deadline)',
}

// ---------- Ошибки БД (для демо/продакшена) ----------
export class DbError extends Error {
  public code: string
  public details?: unknown

  constructor(
    message: string,
    code: string,
    details?: unknown,
  ) {
    super(message)
    this.code = code
    this.details = details
    this.name = 'DbError'
  }
}

export function parseDbError(error: unknown): DbError {
  if (error && typeof error === 'object' && 'message' in error) {
    return new DbError(error.message as string, 'UNKNOWN')
  }
  return new DbError(String(error), 'UNKNOWN')
}
