// Единый слой данных. Если ключи Supabase заданы — работаем с Supabase,
// иначе — с localStorage-демо (см. demo.ts). Интерфейс один и тот же.
//
// Персистентность («везде и всегда»):
//  - все ЗАПИСИ (Мастер, Исполнитель, веб-админ) идут через persist():
//    при отсутствии сети операция уходит в офлайн-очередь и применяется
//    к БД при появлении сети (db.runQueuedOp);
//  - все ЧТЕНИЯ идут через readThrough(): кэш последнего успешного ответа
//    отдаётся, пока сеть недоступна;
//  - демо-режим (без ключей) не трогает очередь и кэш.

import { cacheGet, persist, readThrough, uid } from './offline'
import { isSupabaseConfigured, supabase } from './supabase'
import * as demo from './demo'
import { isNetworkError, type DbFnName, type SyncOp } from './sync'
import type {
  Acceptance, Area, ChecklistItem, Equipment, FaultCode, HistoryChange, HistoryEntry,
  Material, NewOrderInput, Notification, Profile, WorkOrder, Worker, WorkerStatus,
  WorkType,
} from './types'
import type { Acceptance as DbAcceptance } from './types'

// ---------- Профиль ----------

export async function getProfile(): Promise<Profile | null> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoGetProfile()
  return readThrough('profile', async () => {
    const { data: userData } = await sb.auth.getUser()
    if (!userData.user) return null
    const { data, error } = await sb
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { id: data.id, role: data.role, fullName: data.full_name ?? '' }
  })
}

// ---------- Исполнители ----------

export async function listWorkers(): Promise<Worker[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListWorkers()
  return readThrough('workers', async () => {
    const { data, error } = await sb
      .from('workers')
      .select('id, user_id, full_name, specialty, status, rating, rank, brigade, area_id')
      .order('full_name')
    if (error) throw new Error(error.message)
    return (data ?? []).map((w) => ({
      id: w.id, userId: w.user_id, fullName: w.full_name, specialty: w.specialty,
      rank: w.rank, brigade: w.brigade, areaId: w.area_id,
      status: w.status, rating: Number(w.rating),
    }))
  })
}

/** Карточка сотрудника (ТЗ §2.4): Имя, специальность и разряд, бригада, участок. */
export interface WorkerCardInput {
  fullName: string
  specialty: string
  rank: string | null
  brigade: string | null
  areaId: string | null
}

/** Добавление сотрудника администратором — до регистрации аккаунта (ТЗ §2.4). */
export async function createWorker(input: WorkerCardInput): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoCreateWorker(input)
  const id = uid()
  return persist(
    { fn: 'createWorker', args: [input, id] },
    () => createWorkerDirect(input, id),
    () => undefined,
  )
}

async function createWorkerDirect(input: WorkerCardInput, id: string): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('workers').upsert({
    id,
    full_name: input.fullName,
    specialty: input.specialty,
    rank: input.rank,
    brigade: input.brigade,
    area_id: input.areaId,
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/** Редактирование карточки сотрудника (ТЗ §2.4). */
export async function updateWorker(workerId: string, patch: Partial<WorkerCardInput>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateWorker(workerId, patch)
  return persist(
    { fn: 'updateWorker', args: [workerId, patch] },
    () => updateWorkerDirect(workerId, patch),
    () => undefined,
  )
}

async function updateWorkerDirect(workerId: string, patch: Partial<WorkerCardInput>): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const col: Record<keyof WorkerCardInput, string> = {
    fullName: 'full_name', specialty: 'specialty', rank: 'rank',
    brigade: 'brigade', areaId: 'area_id',
  }
  const update: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(col)) {
    if (key in patch) update[column] = (patch as Record<string, unknown>)[key]
  }
  if (Object.keys(update).length === 0) return
  const { error } = await sb.from('workers').update(update).eq('id', workerId)
  if (error) throw new Error(error.message)
}

export async function updateWorkerStatus(workerId: string, status: WorkerStatus): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateWorkerStatus(workerId, status)
  return persist(
    { fn: 'updateWorkerStatus', args: [workerId, status] },
    () => updateWorkerStatusDirect(workerId, status),
    () => undefined,
  )
}

async function updateWorkerStatusDirect(workerId: string, status: WorkerStatus): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('workers').update({ status }).eq('id', workerId)
  if (error) throw new Error(error.message)
}

// ---------- Справочники ----------

export async function listAreas(): Promise<Area[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListAreas()
  return readThrough('areas', async () => {
    const { data, error } = await sb.from('areas').select('id, name').order('name')
    if (error) throw new Error(error.message)
    return data ?? []
  })
}

/** Добавление участка (ТЗ §2.1) — id генерируется клиентски, возврат записи для привязок. */
export async function createArea(name: string): Promise<Area> {
  if (!isSupabaseConfigured || !supabase) return demo.demoCreateArea(name)
  const id = uid()
  return persist(
    { fn: 'createArea', args: [name, id] },
    () => createAreaDirect(name, id),
    () => ({ id, name }),
  )
}

async function createAreaDirect(name: string, id: string): Promise<Area> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { data, error } = await sb.from('areas')
    .upsert({ id, name }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id, name')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? { id, name }
}

/** Переименование участка (ТЗ §2.1). */
export async function updateArea(id: string, name: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateArea(id, name)
  return persist(
    { fn: 'updateArea', args: [id, name] },
    () => updateAreaDirect(id, name),
    () => undefined,
  )
}

async function updateAreaDirect(id: string, name: string): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('areas').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listEquipment(): Promise<Equipment[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListEquipment()
  return readThrough('equipment', async () => {
    const { data, error } = await sb
      .from('equipment').select('id, area_id, name').order('name')
    if (error) throw new Error(error.message)
    return (data ?? []).map((e) => ({ id: e.id, areaId: e.area_id ?? null, name: e.name }))
  })
}

/** Добавление оборудования: Название + Участок (ТЗ §2.3). */
export async function createEquipment(name: string, areaId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoCreateEquipment(name, areaId)
  const id = uid()
  return persist(
    { fn: 'createEquipment', args: [name, areaId, id] },
    () => createEquipmentDirect(name, areaId, id),
    () => undefined,
  )
}

async function createEquipmentDirect(name: string, areaId: string, id: string): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('equipment')
    .upsert({ id, name, area_id: areaId }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/**
 * Закрепление оборудования за участком (ТЗ §2.1); areaId = null открепляет его.
 * Открепление требует миграцию 0009 (в 0002 area_id был NOT NULL).
 */
export async function updateEquipment(id: string, areaId: string | null): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateEquipment(id, areaId)
  return persist(
    { fn: 'updateEquipment', args: [id, areaId] },
    () => updateEquipmentDirect(id, areaId),
    () => undefined,
  )
}

async function updateEquipmentDirect(id: string, areaId: string | null): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('equipment').update({ area_id: areaId }).eq('id', id)
  if (!error) return
  // 23502: схема ещё не знает состояния «без участка» — нужна миграция 0009.
  if (areaId === null && error.code === '23502') {
    throw new Error('Открепить оборудование нельзя: примените миграцию 0009_equipment_area_nullable.sql')
  }
  throw new Error(error.message)
}

// ---------- Материалы и запчасти (ТЗ §2.2) ----------

export async function listMaterials(): Promise<Material[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListMaterials()
  return readThrough('materials', async () => {
    const { data, error } = await sb
      .from('materials')
      .select('id, name, qty, unit, area_id')
      .order('name')
    if (error) throw new Error(error.message)
    return (data ?? []).map((m) => ({
      id: m.id, name: m.name, qty: Number(m.qty), unit: m.unit, areaId: m.area_id,
    }))
  })
}

/** Создание/обновление позиции справочника материалов (ТЗ §2.2). */
export async function saveMaterial(input: {
  id?: string
  name: string
  qty: number
  unit: string
  areaId: string | null
}): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoSaveMaterial(input)
  const isUpdate = Boolean(input.id)
  const row = { name: input.name, qty: input.qty, unit: input.unit, areaId: input.areaId, id: input.id ?? uid() }
  return persist(
    { fn: 'saveMaterial', args: [row, isUpdate] },
    () => saveMaterialDirect(row, isUpdate),
    () => undefined,
  )
}

async function saveMaterialDirect(row: {
  id: string; name: string; qty: number; unit: string; areaId: string | null
}, isUpdate: boolean): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const value = { name: row.name, qty: row.qty, unit: row.unit, area_id: row.areaId }
  if (isUpdate) {
    const { error } = await sb.from('materials').update(value).eq('id', row.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await sb.from('materials')
      .upsert({ id: row.id, ...value }, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoDeleteMaterial(id)
  return persist(
    { fn: 'deleteMaterial', args: [id] },
    () => deleteMaterialDirect(id),
    () => undefined,
  )
}

async function deleteMaterialDirect(id: string): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('materials').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- Наряды ----------

export async function listOrders(): Promise<WorkOrder[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListOrders()
  return readThrough('orders', async () => {
    const { data, error } = await sb
      .from('work_orders')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(mapOrder)
  })
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

/** Клиентский номер для офлайн-выдачи (серверный seq недоступен без сети). */
function genOrderNumber(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const day = `${String(now.getFullYear()).slice(2)}${p(now.getMonth() + 1)}${p(now.getDate())}`
  return `Н-${day}-${String(now.getTime() % 1_000_000).padStart(6, '0')}`
}

function optimisticOrder(input: NewOrderInput, id: string, number: string): WorkOrder {
  const now = new Date().toISOString()
  return {
    id,
    number,
    workType: input.workType,
    description: input.description,
    areaId: input.areaId,
    equipmentId: input.equipmentId,
    workerId: input.workerId,
    deadline: input.deadline,
    priority: input.priority,
    status: 'issued',
    faultCode: input.faultCode ?? null,
    photos: input.photos,
    comment: input.comment ?? null,
    normHours: input.normHours ?? null,
    workDone: null,
    workerComment: null,
    materials: null,
    materialsList: [],
    photosAfter: [],
    pauseReason: null,
    rejectReason: null,
    pausedAt: null,
    createdBy: null,
    createdAt: now,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    closedAt: null,
  }
}

export async function createOrder(
  input: NewOrderInput,
  actorName: string,
  opts?: { id?: string; number?: string },
): Promise<WorkOrder> {
  if (!isSupabaseConfigured || !supabase) {
    const order = demo.demoCreateOrder(input, actorName)
    try {
      const target = await workerUserId(input.workerId)
      if (target) await notifyNewOrder(target, order)
    } catch {
      // уведомление не должно ломать создание наряда
    }
    return order
  }
  const id = opts?.id ?? uid()
  const number = opts?.number ?? ''
  return persist(
    { fn: 'createOrder', args: [input, actorName, { id, number }] },
    () => createOrderDirect(input, actorName, id, number),
    () => optimisticOrder(input, id, number || genOrderNumber()),
  )
}

async function createOrderDirect(
  input: NewOrderInput,
  actorName: string,
  id: string,
  number: string,
): Promise<WorkOrder> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { data: userData } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('work_orders')
    .upsert({
      id,
      number,
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
    }, { onConflict: 'id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  // Повтор после успешного применения (очередь) вернёт null — берём строку из БД.
  const order = data ? mapOrder(data) : await getOrderSupabase(id)
  if (!order) throw new Error('Наряд не записан в БД (конфликт номера) — повторите выдачу')
  void actorName
  try {
    const target = await workerUserId(input.workerId)
    if (target) await notifyNewOrder(target, order)
  } catch {
    // уведомление не должно ломать создание наряда
  }
  return order
}

async function notifyNewOrder(userId: string, order: WorkOrder): Promise<void> {
  await createNotification({
    userId,
    workOrderId: order.id,
    type: 'NEW_ORDER',
    title: 'Новый наряд',
    message: `Вам назначен наряд ${order.number}. Срок: ${new Date(order.deadline).toLocaleString('ru-RU')}.`,
  })
}

/** Справочник шифров неисправностей (ТЗ §19, §2.5). */
export async function listFaultCodes(): Promise<FaultCode[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListFaultCodes()
  return readThrough('faultCodes', async () => {
    const { data, error } = await sb
      .from('fault_codes')
      .select('code, name, description, norm_hours, material_norm, work_type, complexity, material_norm_qty')
      .eq('active', true)
      .order('sort_order')
    if (error) throw new Error(error.message)
    return (data ?? []).map((f) => ({
      code: f.code, name: f.name, description: f.description,
      normHours: f.norm_hours != null ? Number(f.norm_hours) : null,
      materialNorm: f.material_norm,
      workType: (f.work_type as WorkType | null) ?? null,
      complexity: f.complexity != null ? Number(f.complexity) : null,
      materialNormQty: f.material_norm_qty != null ? Number(f.material_norm_qty) : null,
    }))
  })
}

/** Добавление шифра неисправности (ТЗ §2.5). */
export async function createFaultCode(input: FaultCode): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoCreateFaultCode(input)
  return persist(
    { fn: 'createFaultCode', args: [input] },
    () => createFaultCodeDirect(input),
    () => undefined,
  )
}

async function createFaultCodeDirect(input: FaultCode): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('fault_codes').upsert({
    code: input.code,
    name: input.name,
    description: input.description,
    norm_hours: input.normHours,
    material_norm: input.materialNorm,
    work_type: input.workType,
    complexity: input.complexity ?? null,
    material_norm_qty: input.materialNormQty ?? null,
  }, { onConflict: 'code', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/** Редактирование карточки шифра (ТЗ §2.5). */
export async function updateFaultCode(code: string, patch: Partial<FaultCode>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoUpdateFaultCode(code, patch)
  return persist(
    { fn: 'updateFaultCode', args: [code, patch] },
    () => updateFaultCodeDirect(code, patch),
    () => undefined,
  )
}

async function updateFaultCodeDirect(code: string, patch: Partial<FaultCode>): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const update: Record<string, unknown> = {}
  if ('name' in patch) update.name = patch.name
  if ('description' in patch) update.description = patch.description
  if ('normHours' in patch) update.norm_hours = patch.normHours
  if ('materialNorm' in patch) update.material_norm = patch.materialNorm
  if ('workType' in patch) update.work_type = patch.workType
  if ('complexity' in patch) update.complexity = patch.complexity
  if ('materialNormQty' in patch) update.material_norm_qty = patch.materialNormQty
  if (Object.keys(update).length === 0) return
  const { error } = await sb.from('fault_codes').update(update).eq('code', code)
  if (error) throw new Error(error.message)
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
  return persist(
    { fn: 'updateOrder', args: [id, patch, actorName, action] },
    () => updateOrderDirect(id, patch as Partial<WorkOrder>, actorName, action),
    () => undefined,
  )
}

async function updateOrderDirect(
  id: string,
  patch: Partial<WorkOrder>,
  actorName: string,
  action: string,
): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
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
  const diffs: Array<{ key: string; from: unknown; to: unknown }> = []
  if (before) {
    for (const key of Object.keys(update)) {
      const camel = Object.keys(col).find((k) => col[k] === key)
      const fieldKey = camel ?? key
      const from = (before as unknown as Record<string, unknown>)[fieldKey] ?? null
      const to = (patch as Record<string, unknown>)[fieldKey] ?? null
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        diffs.push({ key: fieldKey, from, to })
      }
    }
  }

  // Идентификаторы участка/оборудования/исполнителя в истории показываем
  // именами, а не UUID. Справочники читаем только если такие поля изменились;
  // ошибка чтения (офлайн) не ломает саму запись — значения остаются как есть.
  const names: Record<string, Map<string, string>> = {}
  if (diffs.some((d) => ['workerId', 'areaId', 'equipmentId'].includes(d.key))) {
    try {
      const [ws, ar, eq] = await Promise.all([listWorkers(), listAreas(), listEquipment()])
      names.workerId = new Map(ws.map((w) => [w.id, w.fullName]))
      names.areaId = new Map(ar.map((a) => [a.id, a.name]))
      names.equipmentId = new Map(eq.map((e) => [e.id, e.name]))
    } catch {
      // Не удалось прочитать справочники — показываем идентификаторы.
    }
  }
  const changes: HistoryChange[] = diffs.map((d) => ({
    field: labels[d.key] ?? d.key,
    from: stringify(names[d.key]?.get(String(d.from)) ?? d.from),
    to: stringify(names[d.key]?.get(String(d.to)) ?? d.to),
  }))

  if (Object.keys(update).length > 0) {
    const { error } = await sb.from('work_orders').update(update).eq('id', id)
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
  const sb = supabase
  if (!sb) return null
  const { data, error } = await sb.from('work_orders').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapOrder(data) : null
}

export async function getOrder(id: string): Promise<WorkOrder | null> {
  if (!isSupabaseConfigured || !supabase) {
    return demo.demoListOrders().find((o) => o.id === id) ?? null
  }
  try {
    return await getOrderSupabase(id)
  } catch (err) {
    // Офлайн: отдаём наряд из кэша списка.
    if (isNetworkError(err)) {
      const cached = cacheGet<WorkOrder[]>('orders')
      const hit = cached?.find((o) => o.id === id) ?? null
      if (hit) return hit
    }
    throw err
  }
}

const STATUS_TS: Partial<Record<WorkOrder['status'], keyof WorkOrder>> = {
  accepted: 'acceptedAt',
  in_work: 'startedAt',
  completed: 'completedAt',
  closed: 'closedAt',
}

/** Правило одной активной задачи (ТЗ §6). */
async function assertSingleActive(id: string): Promise<void> {
  const all = await listOrders()
  const target = all.find((o) => o.id === id)
  if (target && all.some((o) => o.id !== id && o.workerId === target.workerId && o.status === 'in_work')) {
    throw new Error('Одна активная задача: сначала приостановите или завершите текущий наряд (ТЗ §6).')
  }
}

function statusPatch(status: WorkOrder['status'], opts?: { reason?: string }): Partial<WorkOrder> {
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
  return patch
}

/** Смена статуса (+метки времени, причины). Историю пишет триггер/демо-лог. */
export async function setOrderStatus(
  id: string,
  status: WorkOrder['status'],
  actorName: string,
  opts?: { reason?: string },
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    return setOrderStatusDemo(id, status, actorName, opts)
  }
  return persist(
    { fn: 'setOrderStatus', args: [id, status, actorName, opts ?? null] },
    () => setOrderStatusDirect(id, status, actorName, opts),
    () => undefined,
  )
}

async function setOrderStatusDemo(
  id: string,
  status: WorkOrder['status'],
  actorName: string,
  opts?: { reason?: string },
): Promise<void> {
  await assertSingleActive(id)
  const patch = statusPatch(status, opts)
  const action =
    status === 'suspended' ? `Приостановлен: ${opts?.reason ?? 'причина не указана'}`
    : status === 'rejected' ? `Отклонён: ${opts?.reason ?? 'причина не указана'}`
    : 'Статус наряда'
  return demo.demoUpdateOrder(id, patch, actorName, action)
}

async function setOrderStatusDirect(
  id: string,
  status: WorkOrder['status'],
  actorName: string,
  opts?: { reason?: string },
): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  void actorName
  // Правило одной активной задачи — и при выдаче, и при повторе из очереди.
  await assertSingleActive(id)

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

  const { error } = await sb.from('work_orders').update(update).eq('id', id)
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
  const sb = supabase
  if (!sb) return
  const { data: userData } = await sb.auth.getUser()
  const { error } = await sb.from('work_order_history').insert({
    order_id: orderId, actor_id: userData.user?.id ?? null,
    actor_name: actorName, action, changes,
  })
  if (error) throw new Error(error.message)
}

export async function getHistory(orderId: string): Promise<HistoryEntry[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoGetHistory(orderId)
  return readThrough(`history:${orderId}`, async () => {
    const { data, error } = await sb
      .from('work_order_history')
      .select('id, order_id, actor_name, action, changes, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(mapHistory)
  })
}

export async function recentHistory(limit: number): Promise<Array<HistoryEntry & { orderNumber: string }>> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) {
    return demo.demoRecentHistory(limit).map((h) => ({
      ...h,
      orderNumber: demo.demoListOrders().find((o) => o.id === h.orderId)?.number ?? '—',
    }))
  }
  return readThrough(`historyRecent:${limit}`, async () => {
    const { data, error } = await sb
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

/** Оценки приёмки ИИ по всем нарядам (orderId → балл 1..5) — для аналитики
 *  веб-панели руководителя: одним запросом, без N+1 на список нарядов. */
export async function listAcceptanceScores(): Promise<Record<string, number>> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoAcceptanceScores()
  return readThrough('acceptanceScores', async () => {
    const { data, error } = await sb
      .from('work_order_acceptance')
      .select('order_id, ai_score')
    if (error) throw new Error(error.message)
    const out: Record<string, number> = {}
    for (const r of data ?? []) {
      out[(r as { order_id: string }).order_id] = Number((r as { ai_score: number }).ai_score)
    }
    return out
  })
}

export async function getAcceptance(orderId: string): Promise<Acceptance | null> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoGetAcceptance(orderId)
  return readThrough(`acceptance:${orderId}`, async () => {
    const { data, error } = await sb
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
  })
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
  return persist(
    { fn: 'saveAcceptance', args: [orderId, data, actorName] },
    () => saveAcceptanceDirect(orderId, data, actorName),
    () => undefined,
  )
}

async function saveAcceptanceDirect(
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
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { data: userData } = await sb.auth.getUser()
  const { error } = await sb.from('work_order_acceptance').upsert({
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

/** Опыт бригады по конкретному оборудованию: сколько нарядов выполнил
 *  каждый исполнитель и средняя оценка ИИ по этому оборудованию.
 *  Используется ИИ-подсказкой исполнителя на форме наряда (ТЗ §3). */
export async function equipmentWorkerStats(equipmentId: string): Promise<Array<{
  workerId: string
  count: number
  avgScore: number | null
}>> {
  if (!equipmentId) return []
  const orders = await listOrders()
  const relevant = orders.filter(
    (o) => o.equipmentId === equipmentId && o.workerId && o.status !== 'cancelled',
  )
  const byWorker = new Map<string, { count: number; scores: number[] }>()
  for (const o of relevant) {
    const acc = await getAcceptance(o.id)
    const row = byWorker.get(o.workerId!) ?? { count: 0, scores: [] }
    row.count += 1
    if (acc) row.scores.push(acc.aiScore)
    byWorker.set(o.workerId!, row)
  }
  return [...byWorker].map(([workerId, row]) => ({
    workerId,
    count: row.count,
    avgScore: row.scores.length
      ? row.scores.reduce((a, b) => a + b, 0) / row.scores.length
      : null,
  }))
}

// ---------- Уведомления (ТЗ §32, §50) ----------

async function workerUserId(workerId: string | null): Promise<string | null> {
  if (!workerId) return null
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
  const id = uid()
  return persist(
    { fn: 'createNotification', args: [n, id] },
    () => createNotificationDirect(n, id),
    () => undefined,
  )
}

async function createNotificationDirect(
  n: { userId: string; workOrderId: string | null; type: string; title: string; message: string },
  id: string,
): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('notifications').upsert({
    id,
    user_id: n.userId,
    work_order_id: n.workOrderId,
    type: n.type,
    title: n.title,
    message: n.message,
  }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  const sb = supabase
  if (!isSupabaseConfigured || !sb) return demo.demoListNotifications(userId)
  return readThrough(`notifications:${userId}`, async () => {
    const { data, error } = await sb
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
  })
}

export async function markNotificationsRead(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return demo.demoMarkNotificationsRead(userId)
  return persist(
    { fn: 'markNotificationsRead', args: [userId] },
    () => markNotificationsReadDirect(userId),
    () => undefined,
  )
}

async function markNotificationsReadDirect(userId: string): Promise<void> {
  const sb = supabase
  if (!sb) throw new Error('Supabase не настроен')
  const { error } = await sb.from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw new Error(error.message)
}

/** Уведомить Мастера-создателя наряда о событии (от исполнителя). */
export async function notifyOrderEvent(orderId: string, type: string, title: string, message: string): Promise<void> {
  const order = await getOrder(orderId)
  if (!order?.createdBy) return
  await createNotification({ userId: order.createdBy, workOrderId: orderId, type, title, message })
}

/** Уведомить Исполнителя наряда о событии (от мастера). */
export async function notifyWorkerEvent(orderId: string, type: string, title: string, message: string): Promise<void> {
  const order = await getOrder(orderId)
  if (!order?.workerId) return
  const userId = await workerUserId(order.workerId)
  if (userId) await createNotification({ userId, workOrderId: orderId, type, title, message })
}

// ---------- Восстановление из офлайн-очереди ----------

/** Прямые (без persist) реализации — их же дёргает очередь при появлении сети. */
const DB_OPS: Record<DbFnName, (...args: any[]) => Promise<unknown>> = {
  createOrder: (input: NewOrderInput, actorName: string, opts: { id: string; number: string }) =>
    createOrderDirect(input, actorName, opts.id, opts.number),
  updateOrder: (id: string, patch: Partial<WorkOrder>, actor: string, action?: string) =>
    updateOrderDirect(id, patch, actor, action ?? 'Изменение наряда'),
  setOrderStatus: (id: string, status: WorkOrder['status'], actor: string, opts?: { reason?: string } | null) =>
    setOrderStatusDirect(id, status, actor, opts ?? undefined),
  saveAcceptance: (orderId: string, data: Parameters<typeof saveAcceptanceDirect>[1], actor: string) =>
    saveAcceptanceDirect(orderId, data, actor),
  createArea: (name: string, id: string) => createAreaDirect(name, id),
  updateArea: (id: string, name: string) => updateAreaDirect(id, name),
  createEquipment: (name: string, areaId: string, id: string) => createEquipmentDirect(name, areaId, id),
  updateEquipment: (id: string, areaId: string | null) => updateEquipmentDirect(id, areaId),
  createWorker: (input: WorkerCardInput, id: string) => createWorkerDirect(input, id),
  updateWorker: (id: string, patch: Partial<WorkerCardInput>) => updateWorkerDirect(id, patch),
  updateWorkerStatus: (id: string, status: WorkerStatus) => updateWorkerStatusDirect(id, status),
  saveMaterial: (row: Parameters<typeof saveMaterialDirect>[0], isUpdate: boolean) =>
    saveMaterialDirect(row, isUpdate),
  deleteMaterial: (id: string) => deleteMaterialDirect(id),
  createFaultCode: (input: FaultCode) => createFaultCodeDirect(input),
  updateFaultCode: (code: string, patch: Partial<FaultCode>) => updateFaultCodeDirect(code, patch),
  createNotification: (
    n: Parameters<typeof createNotificationDirect>[0],
    id: string,
  ) => createNotificationDirect(n, id),
  markNotificationsRead: (userId: string) => markNotificationsReadDirect(userId),
}

/**
 * Применение операции из офлайн-очереди к БД (вызывает sync.flushQueue).
 * Обрабатывает как универсальные 'db'-операции, так и классические
 * 'status'/'complete' кабинета Исполнителя.
 */
export async function runQueuedOp(op: SyncOp, defaultActor = 'Система'): Promise<void> {
  const ready = Boolean(isSupabaseConfigured && supabase)
  if (op.operationType === 'db' && op.payload.db) {
    if (!ready) return // в демо db-операции не накапливаются
    const { fn, args } = op.payload.db
    const runner = DB_OPS[fn]
    if (!runner) throw new Error(`Неизвестная операция очереди: ${fn}`)
    await runner(...args)
    return
  }
  const actor = op.payload.actor ?? defaultActor
  if (op.operationType === 'status' && op.payload.status) {
    if (!ready) {
      return setOrderStatusDemo(
        op.entityId, op.payload.status, actor,
        op.payload.reason ? { reason: op.payload.reason } : undefined,
      )
    }
    await setOrderStatusDirect(
      op.entityId, op.payload.status, actor,
      op.payload.reason ? { reason: op.payload.reason } : undefined,
    )
  } else if (op.operationType === 'complete' && op.payload.patch) {
    const action = op.payload.action ?? 'Работы сданы'
    if (!ready) {
      demo.demoUpdateOrder(op.entityId, op.payload.patch, actor, action)
      return
    }
    await updateOrderDirect(op.entityId, op.payload.patch, actor, action)
  }
}
