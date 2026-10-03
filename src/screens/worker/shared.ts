// Общие типы контекста кабинета Исполнителя (Frame 17–22).

import type {
  Area, Equipment, FaultCode, Notification, OrderStatus, Profile, WorkOrder, Worker,
} from '../../lib/types'

export type WorkerView =
  | { view: 'home' }
  | { view: 'registry' }
  | { view: 'detail'; id: string }
  | { view: 'close'; id: string }
  | { view: 'closed' }
  | { view: 'closedDetail'; id: string }
  | { view: 'notifs' }

export interface SyncInfo {
  online: boolean
  pending: number
  syncing: boolean
  lastError: string | null
}

export interface WorkerCtx {
  profile: Profile
  me: Worker | null
  orders: WorkOrder[]
  areas: Area[]
  equipment: Equipment[]
  faultCodes: FaultCode[]
  notifications: Notification[]
  unread: number
  loading: boolean
  sync: SyncInfo
  go: (v: WorkerView) => void
  refresh: () => Promise<void>
  refreshNotifs: () => Promise<void>
  markRead: () => Promise<void>
  /** Действие через офлайн-очередь: смена статуса и/или отправка результатов. */
  act: (plan: {
    orderId: string
    status?: OrderStatus
    reason?: string
    patch?: Partial<WorkOrder>
    action?: string
    notify?: { type: string; title: string; message: string }
  }) => Promise<void>
}
