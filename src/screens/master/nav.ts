// Общие типы навигации и данных экранов Мастера.

import type { Area, Equipment, Profile, StatusFilter, WorkOrder, Worker } from '../../lib/types'

export type MasterNav =
  | { screen: 'dashboard' }
  | { screen: 'orders'; statusFilter?: StatusFilter }
  | { screen: 'order'; id: string }
  | { screen: 'issue' }
  | { screen: 'workers' }
  | { screen: 'dossier'; workerId: string }
  | { screen: 'equipmentHistory'; workerId: string; equipmentId: string }
  | { screen: 'notifications' }

/** Минимальный набор данных для карточки наряда (ТЗ §3) и её формы.
 *  Общая для Мастера (MasterData) и веб-Администратора (AdminData). */
export interface OrderCardData {
  profile: Profile
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  orders: WorkOrder[]
  refresh: () => Promise<void>
}

export interface MasterData extends OrderCardData {
  go: (nav: MasterNav) => void
  back: () => void
}
