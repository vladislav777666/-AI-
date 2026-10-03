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
