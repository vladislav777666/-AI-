// Навигация и данные веб-панели администратора (ТЗ §2).
// Отдельная роль «Администратор»: интерфейс живёт в собственном разделе,
// а не внутри модуля «Мастер». Доступ — только веб-продакшен (не APK).

import type { Area, Equipment, Profile, WorkOrder, Worker } from '../../lib/types'

/** Пять модулей раздела «Справочники» (ТЗ §2.1–2.5). */
export type RefBookKey = 'areas' | 'materials' | 'equipment' | 'workers' | 'faultCodes'

export type AdminNav =
  | { screen: 'dashboard' }
  | { screen: 'refbooks' }
  | { screen: 'refbook'; book: RefBookKey }
  | { screen: 'orders' }
  | { screen: 'order'; id: string }
  | { screen: 'equipmentOrders'; equipmentId: string }
  | { screen: 'workerOrders'; workerId: string }
  | { screen: 'faultCode'; code: string }

export interface AdminData {
  profile: Profile
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  orders: WorkOrder[]
  refresh: () => Promise<void>
  go: (nav: AdminNav) => void
  back: () => void
}
