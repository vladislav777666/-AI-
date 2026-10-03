// Единый слой данных. Если ключи Supabase заданы — работаем с Supabase,
// иначе — с localStorage-демо (см. demo.ts). Интерфейс один и тот же.

import { isSupabaseConfigured, supabase } from './supabase'
import * as demo from './demo'
import type {
  Acceptance, Area, ChecklistItem, Equipment, FaultCode, HistoryChange, HistoryEntry,
  NewOrderInput, Notification, Profile, WorkOrder, Worker, WorkerStatus,
} from './types'
import type { Acceptance as DbAcceptance } from './types'

// ---------- Профиль ----------

export async function getProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured || !supabase) return demo.demoGetProfile()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, role: data.role, fullName: data.full_name ?? '' }
}

// ---------- Исполнители ----------

export async function listWorkers(): Promise<Worker[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListWorkers()
  const { data, error } = await supabase
    .from('workers')
    .select('id, user_id, full_name, specialty, status, rating')
    .order('full_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((w) => ({
    id: w.id, userId: w.user_id, fullName: w.full_name, specialty: w.specialty,
    status: w.status, rating: Number(w.rating),
  }))
}

export async function updateWorkerStatus(workerId: string, status: WorkerStatus): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateWorkerStatus(workerId, status)
  const { error } = await supabase.from('workers').update({ status }).eq('id', workerId)
  if (error) throw new Error(error.message)
}

// ---------- Справочники ----------

export async function listAreas(): Promise<Area[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListAreas()
  const { data, error } = await supabase.from('areas').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listEquipment(): Promise<Equipment[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListEquipment()
  const { data, error } = await supabase
    .from('equipment').select('id, area_id, name').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({ id: e.id, areaId: e.area_id, name: e.name }))
}

// ---------- Наряды ----------

export async function listOrders(): Promise<WorkOrder[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListOrders()
  const { data, error } = await supabase
    .from('work_orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapOrder)
}

function mapOrder(r: Record<string, unknown>): WorkOrder {
  return {
    id: r.id as string,
    number: r.number as string,
    workType: r.work_type as WorkOrder['workType'],
    description: r.description as string,
    areaId: r.area_id as string,
    equipmentId: r.equipment_id as string,
    workerId: (r.worker_id as string | null) ?? null,
    deadline: r.deadline as string,
    priority: r.priority as WorkOrder['priority'],
    status: r.status as WorkOrder['status'],
    faultCode: (r.fault_code as string | null) ?? null,
    photos: (r.photos as string[] | null) ?? [],
    comment: (r.comment as string | null) ?? null,
    normHours: r.norm_hours != null ? Number(r.norm_hours) : null,
    workDone: (r.work_done as string | null) ?? null,
    workerComment: (r.worker_comment as string | null) ?? null,
    materials: (r.materials as string | null) ?? null,
    materialsList: (r.materials_list as WorkOrder['materialsList'] | null) ?? [],
    photosAfter: (r.photos_after as string[] | null) ?? [],
    pauseReason: (r.pause_reason as string | null) ?? null,
    rejectReason: (r.reject_reason as string | null) ?? null,
    pausedAt: (r.paused_at as string | null) ?? null,
    createdAt: r.created_at as string,
    createdBy: (r.created_by as string | null) ?? null,
    acceptedAt: (r.accepted_at as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
  }
}

export async function createOrder(input: NewOrderInput, actorName: string): Promise<WorkOrder> {
  let order: WorkOrder
  if (!isSupabaseConfigured || !supabase) {
    order = demo.demoCreateOrder(input, actorName)
  } else {
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('work_orders')
      .insert({
      work_type: input.workType,
      description: input.description,
      area_id: input.areaId,
      equipment_id: input.equipmentId,
      worker_id: input.workerId,
      deadline: input.deadline,
      priority: input.priority,
      fault_code: input.faultCode ?? null,
      norm_hours: input.normHours ?? null,
      photos: input.photos,
      comment: input.comment ?? null,
      created_by: userData.user?.id ?? null,
    })
    .select('*')
    .single()
    if (error) throw new Error(error.message)
    order = mapOrder(data)
  }
  try {
    const target = await workerUserId(input.workerId)
    if (target) {
      await createNotification({
        userId: target,
        workOrderId: order.id,
        type: 'NEW_ORDER',
        title: 'Новый наряд',
        message: `Вам назначен наряд ${order.number}. Срок: ${new Date(order.deadline).toLocaleString('ru-RU')}.`,
      })
    }
  } catch {
    // уведомление не должно ломать создание наряда
  }
  return order
}

/** Справочник шифров неисправностей (ТЗ §19). */
export async function listFaultCodes(): Promise<FaultCode[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListFaultCodes()
  const { data, error } = await supabase
    .from('fault_codes')
    .select('code, name, description')
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Обновление наряда с записью в историю только изменённых полей.
 * status здесь не меняем — для него setOrderStatus (триггер пишет историю сам).
 */
export async function updateOrder(
  id: string,
  patch: Partial<Omit<WorkOrder, 'status' | 'id' | 'number' | 'createdAt'>>,
  actorName: string,
  action = 'Изменение наряда',
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoUpdateOrder(id, patch as Partial<WorkOrder>, actorName, action)
  }
  const before = await getOrderSupabase(id)
  const col: Record<string, string> = {
    description: 'description', workType: 'work_type', areaId: 'area_id',
    equipmentId: 'equipment_id', workerId: 'worker_id', deadline: 'deadline',
    priority: 'priority', faultCode: 'fault_code', comment: 'comment',
    normHours: 'norm_hours', workDone: 'work_done', materials: 'materials',
    materialsList: 'materials_list', workerComment: 'worker_comment',
  }
  const update: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(col)) {
    if (key in patch) update[column] = (patch as Record<string, unknown>)[key]
  }
  if ('photos' in patch) update.photos = patch.photos
  if ('photosAfter' in patch) update.photos_after = patch.photosAfter

  const labels: Record<string, string> = {
    description: 'Описание', workType: 'Тип работ', areaId: 'Участок',
    equipmentId: 'Оборудование', workerId: 'Исполнитель', deadline: 'Срок',
    priority: 'Приоритет', faultCode: 'Шифр', comment: 'Комментарий',
    normHours: 'Норматив, ч', photos: 'Фото', photosAfter: 'Фото «после»',
    materialsList: 'Материалы (позиции)', workerComment: 'Комментарий исполнителя',
  }
  const changes: HistoryChange[] = []
  if (before) {
    for (const key of Object.keys(update)) {
      const camel = Object.keys(col).find((k) => col[k] === key)
      const fieldKey = camel ?? key
      const from = (before as unknown as Record<string, unknown>)[fieldKey] ?? null
      const to = (patch as Record<string, unknown>)[fieldKey] ?? null
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.push({ field: labels[fieldKey] ?? key, from: stringify(from), to: stringify(to) })
      }
    }
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('work_orders').update(update).eq('id', id)
    if (error) throw new Error(error.message)
  }
  if (changes.length > 0) {
    await insertHistory(id, actorName, action, changes)
  }
}

function stringify(v: unknown): string | null {
  if (v == null) return null
  if (Array.isArray(v)) return `${v.length} шт.`
  return String(v)
}

async function getOrderSupabase(id: string): Promise<WorkOrder | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('work_orders').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapOrder(data) : null
}

export async function getOrder(id: string): Promise<WorkOrder | null> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoListOrders().find((o) => o.id === id) ?? null
  }
  return getOrderSupabase(id)
}

const STATUS_TS: Partial<Record<WorkOrder['status'], keyof WorkOrder>> = {
  accepted: 'acceptedAt',
  in_work: 'startedAt',
  completed: 'completedAt',
  closed: 'closedAt',
}

/** Смена статуса (+метки времени, причины). Историю пишет триггер/демо-лог. */
export async function setOrderStatus(
  id: string,
  status: WorkOrder['status'],
  actorName: string,
  opts?: { reason?: string },
): Promise<void> {
  // Правило одной активной задачи (ТЗ §6).
  if (status === 'in_work') {
    const all = await listOrders()
    const target = all.find((o) => o.id === id)
    if (target && all.some((o) => o.id !== id && o.workerId === target.workerId && o.status === 'in_work')) {
      throw new Error('Одна активная задача: сначала приостановите или завершите текущий наряд (ТЗ §6).')
    }
  }

  const tsField = STATUS_TS[status]
  const patch: Partial<WorkOrder> = { status }
  if (tsField) (patch as Record<string, unknown>)[tsField] = new Date().toISOString()
  if (status === 'suspended') {
    patch.pausedAt = new Date().toISOString()
    patch.pauseReason = opts?.reason ?? null
  }
  if (status === 'in_work') {
    patch.pausedAt = null
    patch.pauseReason = null
  }
  if (status === 'rejected') patch.rejectReason = opts?.reason ?? null

  if (!isSupabaseConfigured || !supabase) {
    const action =
      status === 'suspended' ? `Приостановлен: ${opts?.reason ?? 'причина не указана'}`
      : status === 'rejected' ? `Отклонён: ${opts?.reason ?? 'причина не указана'}`
      : 'Статус наряда'
    return demo.demoUpdateOrder(id, patch, actorName, action)
  }

  const update: Record<string, unknown> = { status }
  const tsColumn: Partial<Record<WorkOrder['status'], string>> = {
    accepted: 'accepted_at', in_work: 'started_at', completed: 'completed_at', closed: 'closed_at',
  }
  const col = tsColumn[status]
  if (col) update[col] = new Date().toISOString()
  if (status === 'suspended') {
    update.paused_at = new Date().toISOString()
    update.pause_reason = opts?.reason ?? null
  }
  if (status === 'in_work') {
    update.paused_at = null
    update.pause_reason = null
  }
  if (status === 'rejected') update.reject_reason = opts?.reason ?? null

  const { error } = await supabase.from('work_orders').update(update).eq('id', id)
  if (error) {
    if (error.message.includes('INVALID_TRANSITION')) {
      throw new Error('Недопустимый переход статуса — наряд изменён на сервере. Обновите данные.')
    }
    throw new Error(error.message)
  }
}

// ---------- История ----------

async function insertHistory(
  orderId: string, actorName: string, action: string, changes: HistoryChange[],
): Promise<void> {
  if (!supabase) return
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('work_order_history').insert({
    order_id: orderId, actor_id: userData.user?.id ?? null,
    actor_name: actorName, action, changes,
  })
  if (error) throw new Error(error.message)
}

export async function getHistory(orderId: string): Promise<HistoryEntry[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoGetHistory(orderId)
  const { data, error } = await supabase
    .from('work_order_history')
    .select('id, order_id, actor_name, action, changes, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapHistory)
}

export async function recentHistory(limit: number): Promise<Array<HistoryEntry & { orderNumber: string }>> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoRecentHistory(limit).map((h) => ({
      ...h,
      orderNumber: demo.demoListOrders().find((o) => o.id === h.orderId)?.number ?? '—',
    }))
  }
  const { data, error } = await supabase
    .from('work_order_history')
    .select('id, order_id, actor_name, action, changes, created_at, work_orders(number)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const mapped = mapHistory(row)
    const wo = (row as { work_orders?: { number?: string }[] | null }).work_orders
    return { ...mapped, orderNumber: wo?.[0]?.number ?? '—' }
  })
}

function mapHistory(row: Record<string, unknown>): HistoryEntry {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    actorName: (row.actor_name as string) ?? 'Система',
    action: row.action as string,
    changes: (row.changes as HistoryChange[] | null) ?? [],
    createdAt: row.created_at as string,
  }
}

// ---------- Приёмка ----------

export async function getAcceptance(orderId: string): Promise<Acceptance | null> {
  if (!isSupabaseConfigured || !supabase) return demo.demoGetAcceptance(orderId)
  const { data, error } = await supabase
    .from('work_order_acceptance')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    aiScore: Number(r.ai_score),
    aiComment: (r.ai_comment as string) ?? '',
    masterDecision: r.master_decision as DbAcceptance['masterDecision'],
    agreedWithAi: Boolean(r.agreed_with_ai),
    masterComment: (r.master_comment as string | null) ?? null,
    checklist: (r.checklist as ChecklistItem[] | null) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function saveAcceptance(
  orderId: string,
  data: {
    aiScore: number
    aiComment: string
    masterDecision: Acceptance['masterDecision']
    agreedWithAi: boolean
    masterComment: string | null
    checklist: ChecklistItem[] | null
  },
  actorName: string,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoSaveAcceptance(orderId, data, actorName)
  }
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('work_order_acceptance').upsert({
    order_id: orderId,
    ai_score: data.aiScore,
    ai_comment: data.aiComment,
    master_decision: data.masterDecision,
    agreed_with_ai: data.agreedWithAi,
    master_comment: data.masterComment,
    checklist: data.checklist,
    decided_by: userData.user?.id ?? null,
  })
  if (error) throw new Error(error.message)
  await insertHistory(orderId, actorName, 'Приёмка работ', [
    { field: 'Решение', from: null, to: data.masterDecision },
  ])
}

// ---------- Досье исполнителя ----------

export async function workerEquipmentStats(workerId: string): Promise<Array<{ equipment: Equipment; count: number; avgScore: number | null }>> {
  if (!isSupabaseConfigured || !supabase) return demo.demoWorkerEquipmentStats(workerId)
  const [orders, equipment] = await Promise.all([listOrders(), listEquipment()])
  const mine = orders.filter((o) => o.workerId === workerId && o.status !== 'cancelled')
  const acceptances = new Map<string, number>()
  for (const o of mine) {
    const acc = await getAcceptance(o.id)
    if (acc) acceptances.set(o.id, acc.aiScore)
  }
  const byEquipment = new Map<string, { count: number; scores: number[] }>()
  for (const o of mine) {
    const acc = byEquipment.get(o.equipmentId) ?? { count: 0, scores: [] }
    acc.count += 1
    const score = acceptances.get(o.id)
    if (score != null) acc.scores.push(score)
    byEquipment.set(o.equipmentId, acc)
  }
  const result: Array<{ equipment: Equipment; count: number; avgScore: number | null }> = []
  for (const [eqId, acc] of byEquipment) {
    const equipmentRow = equipment.find((e) => e.id === eqId)
    if (!equipmentRow) continue
    result.push({
      equipment: equipmentRow,
      count: acc.count,
      avgScore: acc.scores.length ? acc.scores.reduce((a, b) => a + b, 0) / acc.scores.length : null,
    })
  }
  return result.sort((a, b) => b.count - a.count)
}

// ---------- Уведомления (ТЗ §32, §50) ----------

async function workerUserId(workerId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoListWorkers().find((w) => w.id === workerId)?.userId ?? null
  }
  const { data, error } = await supabase.from('workers').select('user_id').eq('id', workerId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.user_id ?? null
}

export async function createNotification(n: {
  userId: string
  workOrderId: string | null
  type: string
  title: string
  message: string
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoCreateNotification(n)
  const { error } = await supabase.from('notifications').insert({
    user_id: n.userId, work_order_id: n.workOrderId,
    type: n.type, title: n.title, message: n.message,
  })
  if (error) throw new Error(error.message)
}

/** Уведомить Мастера-создателя наряда о событии (от исполнителя). */
export async function notifyOrderEvent(orderId: string, type: string, title: string, message: string): Promise<void> {
  const order = await getOrder(orderId)
  if (!order?.createdBy) return
  await createNotification({ userId: order.createdBy, workOrderId: orderId, type, title, message })
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  if (!isSupabaseConfigured || !supabase) return demo.demoListNotifications(userId)
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, work_order_id, type, title, message, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    workOrderId: (r.work_order_id as string | null) ?? null,
    type: r.type as string,
    title: r.title as string,
    message: r.message as string,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at as string,
  }))
}

export async function markNotificationsRead(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoMarkNotificationsRead(userId)
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw new Error(error.message)
}

/** Уведомить Исполнителя наряда о событии (от мастера). */
export async function notifyWorkerEvent(orderId: string, type: string, title: string, message: string): Promise<void> {
  const order = await getOrder(orderId)
  if (!order?.workerId) return
  const userId = await workerUserId(order.workerId)
  if (userId) await createNotification({ userId, workOrderId: orderId, type, title, message })
}
