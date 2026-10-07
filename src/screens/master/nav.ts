// Общие типы навигации и данных экранов Мастера.

import type { Area, Equipment, Profile, StatusFilter, WorkOrder, Worker } from '../../lib/types'

export type MasterNav =
  | { screen: 'dashboard' }
  | { screen: 'orders'; statusFilter?: StatusFilter }
  // focus: 'history' — открыть наряд сразу на окне истории (§4.3),
  // используется переходами из «Уведомлений» (просроченный наряд).
  | { screen: 'order'; id: string; focus?: 'history' }
  | { screen: 'issue' }
  | { screen: 'workers' }
  | { screen: 'dossier'; workerId: string }
  | { screen: 'equipmentHistory'; workerId: string; equipmentId: string }
  | { screen: 'notifications' }
  // Раздел «Отчёты»: шесть видов отчётов с фильтрами и выгрузкой.
  | { screen: 'reports' }
  // Раздел «ИИ»: чат и голосовой помощник мастера.
  | { screen: 'ai' }

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
