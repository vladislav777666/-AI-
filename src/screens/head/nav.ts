// Навигация и данные веб-панели руководителя (ТЗ «Веб-панель руководителя»).
// Три основных раздела: Дашборд, Рейтинг, Аномалии и аналитика.

import type { Area, Equipment, FaultCode, Profile, WorkOrder, Worker } from '../../lib/types'
import type { OrderColumn } from './shared'

export type HeadSection = 'dashboard' | 'rating' | 'anomalies'

export const HEAD_SECTIONS: Array<{ key: HeadSection; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Дашборд', icon: '📊' },
  { key: 'rating', label: 'Рейтинг', icon: '🏆' },
  { key: 'anomalies', label: 'Аномалии и аналитика', icon: '🔎' },
]

/** Запрос на показ отфильтрованного списка нарядов (общий паттерн ТЗ:
 *  клик по элементу аналитики открывает список нарядов). */
export interface HeadListRequest {
  title: string
  subtitle?: string
  note?: string
  orders: WorkOrder[]
  /** Свои колонки (например, «разница в датах» или сравнение с нормативом). */
  columns?: OrderColumn[]
}

export interface HeadData {
  profile: Profile
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  orders: WorkOrder[]
  faultCodes: FaultCode[]
  /** Оценки приёмки ИИ по нарядам (orderId → 1..5). */
  scores: Record<string, number>
  refresh: () => Promise<void>
}
