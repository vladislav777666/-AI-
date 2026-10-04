// Общие типы навигации и данных экранов Мастера.

import type { Area, Equipment, Profile, StatusFilter, WorkOrder, Worker } from '../../lib/types'

/** Пять модулей раздела «Справочники» (ТЗ §2.1–2.5). */
export type RefBookKey = 'areas' | 'materials' | 'equipment' | 'workers' | 'faultCodes'

export type MasterNav =
  | { screen: 'dashboard' }
  | { screen: 'orders'; statusFilter?: StatusFilter }
  | { screen: 'order'; id: string }
  | { screen: 'issue' }
  | { screen: 'workers' }
  | { screen: 'dossier'; workerId: string }
  | { screen: 'equipmentHistory'; workerId: string; equipmentId: string }
  | { screen: 'notifications' }
  // Справочники (веб-панель администратора, ТЗ §2)
  | { screen: 'refbooks' }
  | { screen: 'refbook'; book: RefBookKey }
  | { screen: 'equipmentOrders'; equipmentId: string }
  | { screen: 'workerOrders'; workerId: string }
  | { screen: 'faultCode'; code: string }

export interface MasterData {
  profile: Profile
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  orders: WorkOrder[]
  refresh: () => Promise<void>
  go: (nav: MasterNav) => void
  back: () => void
}
