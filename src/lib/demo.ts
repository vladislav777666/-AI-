// Демо-бэкенд: когда ключи Supabase не заданы, приложение работает на
// localStorage-хранилище с сеялкой данных. Тот же контракт, что и у db.ts.

import type {
  Acceptance, Area, ChecklistItem, Equipment, FaultCode, HistoryChange, HistoryEntry,
  Material, NewOrderInput, Notification, Profile, WorkOrder, Worker, WorkerStatus,
} from './types'

const KEY = 'master-module-demo-v1'

interface DemoStore {
  profile: Profile | null
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  materials: Material[]
  faultCodes: FaultCode[]
  orders: WorkOrder[]
  history: HistoryEntry[]
  acceptance: Acceptance[]
  notifications: Notification[]
  counter: number
}

function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`
}

function seed(): DemoStore {
  const areas: Area[] = [
    { id: uid(), name: 'Участок №1' },
    { id: uid(), name: 'Участок №2' },
  ]
  const equipment: Equipment[] = [
    { id: uid(), areaId: areas[0].id, name: 'Станок ЧПУ-1' },
    { id: uid(), areaId: areas[0].id, name: 'Пресс гидравлический' },
    { id: uid(), areaId: areas[1].id, name: 'Компрессор ВП-2' },
    { id: uid(), areaId: areas[1].id, name: 'Конвейер ленточный' },
  ]
  const workers: Worker[] = [
    { id: uid(), userId: 'demo-worker-1', fullName: 'Типо Исполнитель', specialty: 'Слесарь', rank: '4 разряд', brigade: 'Бригада №1', areaId: areas[0].id, status: 'free', rating: 4.6 },
    { id: uid(), userId: 'demo-worker-2', fullName: 'Иванов И.И.', specialty: 'Электрик', rank: '5 разряд', brigade: 'Бригада №2', areaId: areas[0].id, status: 'busy', rating: 4.2 },
    { id: uid(), userId: 'demo-worker-3', fullName: 'Петров П.П.', specialty: 'Механик', rank: '3 разряд', brigade: 'Бригада №2', areaId: areas[1].id, status: 'not_on_shift', rating: 3.9 },
  ]
  // Справочник материалов (ТЗ §2.2): название, количество, участок.
  const materials: Material[] = [
    { id: uid(), name: 'Подшипник 6205', qty: 24, unit: 'шт', areaId: areas[0].id },
    { id: uid(), name: 'Масло индустриальное И-ГМ-40', qty: 60, unit: 'л', areaId: areas[1].id },
    { id: uid(), name: 'Кабель ПВС 3×1.5', qty: 120, unit: 'м', areaId: areas[0].id },
    { id: uid(), name: 'Пневмоцилиндр SC32×100', qty: 3, unit: 'шт', areaId: areas[1].id },
  ]
  return {
    profile: null, workers, areas, equipment, materials, faultCodes: [...FAULT_CODES],
    orders: [], history: [], acceptance: [], notifications: [], counter: 0,
  }
}

// Справочник шифров неисправностей (ТЗ §19, §43) — тот же состав, что в 0003.
// Норматив времени, материальный норматив и статус — поля ТЗ §2.5.
const FAULT_CODES: FaultCode[] = [
  { code: 'М-01', name: 'Механика: износ подшипника', description: 'Замена/ремонт подшипниковых узлов', normHours: 4, materialNorm: 'Подшипник, съёмник, смазка', workType: 'unplanned' },
  { code: 'М-02', name: 'Механика: люфт вала', description: 'Устранение люфтов и перекосов валов', normHours: 6, materialNorm: 'Шайбы, прокладки, крепёж', workType: 'unplanned' },
  { code: 'М-03', name: 'Механика: вибрация', description: 'Балансировка, крепёж, демпфирование', normHours: 3, materialNorm: 'Демпферы, крепёж', workType: 'unplanned' },
  { code: 'М-04', name: 'Механика: деформация корпуса', description: 'Трещины, сколы, правка корпусных деталей', normHours: 8, materialNorm: 'Сварочные электроды, шпаклёвка', workType: 'unplanned' },
  { code: 'Э-01', name: 'Электрика: обрыв цепи', description: 'Поиск и устранение обрывов', normHours: 2, materialNorm: 'Провод, клеммы, изолента', workType: 'unplanned' },
  { code: 'Э-02', name: 'Электрика: КЗ/замыкание', description: 'Изоляция, замена проводки', normHours: 3, materialNorm: 'Кабель, изоляция, предохранители', workType: 'unplanned' },
  { code: 'Э-03', name: 'Электрика: двигатель', description: 'Ремонт/замена электродвигателя', normHours: 6, materialNorm: 'Двигатель, муфта, крепёж', workType: 'unplanned' },
  { code: 'Э-04', name: 'Электрика: датчики/АСУ', description: 'Неисправности датчиков и автоматики', normHours: 4, materialNorm: 'Датчик, кабельный ввод', workType: 'unplanned' },
  { code: 'Г-01', name: 'Гидравлика: утечка', description: 'Течь по соединениям и уплотнениям', normHours: 2, materialNorm: 'Уплотнения, шланг', workType: 'unplanned' },
  { code: 'Г-02', name: 'Гидравлика: насос', description: 'Ремонт/замена насосного узла', normHours: 5, materialNorm: 'Насос, фильтр, масло', workType: 'unplanned' },
  { code: 'Г-03', name: 'Гидравлика: давление', description: 'Настройка редукторов, клапанов', normHours: 3, materialNorm: 'Манометр, пружина редуктора', workType: 'unplanned' },
  { code: 'П-01', name: 'Пневматика: утечка воздуха', description: 'Течь пневмосоединений', normHours: 2, materialNorm: 'Фитинги, лента ФУМ', workType: 'unplanned' },
  { code: 'П-02', name: 'Пневматика: клапан/цилиндр', description: 'Замена пневмоэлементов', normHours: 4, materialNorm: 'Клапан, цилиндр, уплотнения', workType: 'unplanned' },
  { code: 'С-01', name: 'Смазка: недостаток смазки', description: 'Восстановление подачи смазки', normHours: 1, materialNorm: 'Смазка, шприц', workType: 'planned' },
  { code: 'С-02', name: 'Смазка: загрязнение масла', description: 'Замена масла, промывка', normHours: 2, materialNorm: 'Масло, фильтр, промывка', workType: 'planned' },
]

export function demoListFaultCodes(): FaultCode[] {
  return [...load().faultCodes]
}

/** Редактирование карточки шифра (ТЗ §2.5). */
export function demoUpdateFaultCode(code: string, patch: Partial<FaultCode>): void {
  const s = load()
  const idx = s.faultCodes.findIndex((f) => f.code === code)
  if (idx < 0) return
  s.faultCodes[idx] = { ...s.faultCodes[idx], ...patch, code }
  save()
}

/** Добавление нового шифра в справочник (ТЗ §2.5). */
export function demoCreateFaultCode(input: FaultCode): void {
  const s = load()
  if (s.faultCodes.some((f) => f.code === input.code)) return
  s.faultCodes.push({ ...input })
  save()
}

let store: DemoStore | null = null

function load(): DemoStore {
  if (store) return store
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoStore
      // Миграция старого хранилища: поля справочников ТЗ §2 могли отсутствовать.
      if (!Array.isArray(parsed.materials)) parsed.materials = []
      if (!Array.isArray(parsed.faultCodes)) parsed.faultCodes = [...FAULT_CODES]
      parsed.workers = (parsed.workers ?? []).map((w) => ({
        ...w,
        rank: w.rank ?? null,
        brigade: w.brigade ?? null,
        areaId: w.areaId ?? null,
      }))
      parsed.faultCodes = parsed.faultCodes.map((f) => ({
        ...f,
        normHours: f.normHours ?? null,
        materialNorm: f.materialNorm ?? null,
        workType: f.workType ?? null,
      }))
      store = parsed
      return store
    }
  } catch {
    // повреждённое хранилище — пересеем
  }
  store = seed()
  save()
  return store
}

function save(): void {
  if (!store) return
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // переполнение хранилища — работаем в памяти
  }
}

export function demoGetProfile(): Profile | null {
  return load().profile
}

export function demoLogin(role: Profile['role']): Profile {
  const s = load()
  s.profile =
    role === 'Master'
      ? { id: 'demo-master', role, fullName: 'Типо Мастер' }
      : { id: 'demo-worker-1', role, fullName: 'Типо Исполнитель' }
  save()
  return s.profile
}

export function demoLogout(): void {
  const s = load()
  s.profile = null
  save()
}

export function demoListWorkers(): Worker[] {
  return [...load().workers]
}

export function demoUpdateWorkerStatus(workerId: string, status: WorkerStatus): void {
  const w = load().workers.find((x) => x.id === workerId)
  if (w) w.status = status
  save()
}

/** Добавление сотрудника администратором, до регистрации (ТЗ §2.4). */
export function demoCreateWorker(input: {
  fullName: string; specialty: string; rank: string | null; brigade: string | null; areaId: string | null
}): void {
  const s = load()
  s.workers.push({
    id: uid(),
    userId: '', // аккаунт ещё не создан
    fullName: input.fullName,
    specialty: input.specialty,
    rank: input.rank,
    brigade: input.brigade,
    areaId: input.areaId,
    status: 'free',
    rating: 4.0,
  })
  save()
}

/** Редактирование карточки сотрудника (ТЗ §2.4). */
export function demoUpdateWorker(workerId: string, patch: Partial<{
  fullName: string; specialty: string; rank: string | null; brigade: string | null; areaId: string | null
}>): void {
  const s = load()
  const w = s.workers.find((x) => x.id === workerId)
  if (!w) return
  Object.assign(w, patch)
  save()
}

export function demoListAreas(): Area[] {
  return [...load().areas]
}

/** Добавление участка (ТЗ §2.1) — возвращаем запись для привязок. */
export function demoCreateArea(name: string): Area {
  const s = load()
  const area: Area = { id: uid(), name }
  s.areas.push(area)
  save()
  return area
}

/** Переименование участка (ТЗ §2.1). */
export function demoUpdateArea(id: string, name: string): void {
  const s = load()
  const a = s.areas.find((x) => x.id === id)
  if (a) a.name = name
  save()
}

export function demoListEquipment(): Equipment[] {
  return [...load().equipment]
}

/** Добавление оборудования: Название + Участок (ТЗ §2.3). */
export function demoCreateEquipment(name: string, areaId: string): void {
  const s = load()
  s.equipment.push({ id: uid(), name, areaId })
  save()
}

/** Смена участка закрепления оборудования (ТЗ §2.1). В 0002 area_id NOT NULL. */
export function demoUpdateEquipment(id: string, areaId: string): void {
  const s = load()
  const e = s.equipment.find((x) => x.id === id)
  if (e) e.areaId = areaId
  save()
}

// ---------- Материалы и запчасти (ТЗ §2.2) ----------

export function demoListMaterials(): Material[] {
  return [...load().materials]
}

/** Создание/обновление позиции справочника материалов (ТЗ §2.2). */
export function demoSaveMaterial(input: {
  id?: string; name: string; qty: number; unit: string; areaId: string | null
}): void {
  const s = load()
  if (input.id) {
    const idx = s.materials.findIndex((m) => m.id === input.id)
    if (idx >= 0) s.materials[idx] = { id: input.id, name: input.name, qty: input.qty, unit: input.unit, areaId: input.areaId }
  } else {
    s.materials.push({ id: uid(), name: input.name, qty: input.qty, unit: input.unit, areaId: input.areaId })
  }
  save()
}

export function demoDeleteMaterial(id: string): void {
  const s = load()
  s.materials = s.materials.filter((m) => m.id !== id)
  save()
}

export function demoListOrders(): WorkOrder[] {
  return [...load().orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function demoCreateOrder(input: NewOrderInput, actorName: string): WorkOrder {
  const s = load()
  s.counter += 1
  const now = new Date().toISOString()
  const order: WorkOrder = {
    id: uid(),
    number: `Н-${now.slice(2, 4)}${now.slice(5, 7)}${now.slice(8, 10)}-${String(s.counter).padStart(4, '0')}`,
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
    createdBy: s.profile?.id ?? null,
    createdAt: now,
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    closedAt: null,
  }
  s.orders.push(order)
  pushHistory(s, order.id, actorName, 'Наряд выдан', [
    { field: 'status', from: null, to: 'issued' },
  ])
  save()
  return order
}

function pushHistory(
  s: DemoStore,
  orderId: string,
  actorName: string,
  action: string,
  changes: HistoryChange[],
): void {
  s.history.push({
    id: uid(),
    orderId,
    actorName,
    action,
    changes,
    createdAt: new Date().toISOString(),
  })
}

/** Дельта-лог при редактировании: только реально изменившиеся поля. */
const TRACKED_FIELDS: Array<[keyof WorkOrder, string]> = [
  ['description', 'Описание'],
  ['workType', 'Тип работ'],
  ['areaId', 'Участок'],
  ['equipmentId', 'Оборудование'],
  ['workerId', 'Исполнитель'],
  ['deadline', 'Срок'],
  ['priority', 'Приоритет'],
  ['status', 'Статус'],
  ['faultCode', 'Шифр'],
  ['comment', 'Комментарий'],
  ['normHours', 'Норматив, ч'],
  ['workDone', 'Выполненные работы'],
  ['materials', 'Материалы'],
  ['photos', 'Фото'],
  ['photosAfter', 'Фото «после»'],
  ['materialsList', 'Материалы (позиции)'],
]

export function demoUpdateOrder(
  id: string,
  patch: Partial<WorkOrder>,
  actorName: string,
  action = 'Изменение наряда',
): void {
  const s = load()
  const order = s.orders.find((o) => o.id === id)
  if (!order) return
  // Метки времени и причины применяются молча: статусные события уже логируются.
  for (const f of ['startedAt', 'completedAt', 'acceptedAt', 'closedAt', 'pausedAt', 'pauseReason', 'rejectReason'] as const) {
    if (f in patch) (order as unknown as Record<string, unknown>)[f] = patch[f] ?? null
  }
  const changes: HistoryChange[] = []
  for (const [field, label] of TRACKED_FIELDS) {
    const next = patch[field]
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(order[field])) {
      const norm = (v: unknown): string | null =>
        v == null ? null : Array.isArray(v) ? `${v.length} шт.` : String(v)
      changes.push({ field: label, from: norm(order[field]), to: norm(next) })
      ;(order as unknown as Record<string, unknown>)[field as string] = next
    }
  }
  if (changes.length > 0) pushHistory(s, id, actorName, action, changes)
  save()
}

export function demoGetHistory(orderId: string): HistoryEntry[] {
  return load()
    .history.filter((h) => h.orderId === orderId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function demoRecentHistory(limit: number): HistoryEntry[] {
  return [...load().history]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
}

export function demoGetAcceptance(orderId: string): Acceptance | null {
  return load().acceptance.find((a) => a.orderId === orderId) ?? null
}

export function demoSaveAcceptance(
  orderId: string,
  data: { aiScore: number; aiComment: string; masterDecision: Acceptance['masterDecision']; agreedWithAi: boolean; masterComment: string | null; checklist: ChecklistItem[] | null },
  actorName: string,
): void {
  const s = load()
  const existing = s.acceptance.find((a) => a.orderId === orderId)
  const row: Acceptance = existing
    ? Object.assign(existing, data, { createdAt: new Date().toISOString() })
    : {
        id: uid(),
        orderId,
        ...data,
        createdAt: new Date().toISOString(),
      }
  if (!existing) s.acceptance.push(row)
  pushHistory(s, orderId, actorName, `Приёмка: ${data.masterDecision}`, [
    { field: 'Оценка ИИ', from: null, to: `${data.aiScore}/5` },
  ])
  save()
}

/** Персональная статистика исполнителя по оборудованию (для Досье). */
// ---------- Уведомления ----------

export function demoCreateNotification(n: Omit<Notification, 'id' | 'isRead' | 'createdAt'>): void {
  const s = load()
  // Дедуп для системных (просрочка/срок): одно активное уведомление на наряд.
  if (n.type === 'OVERDUE' || n.type === 'DEADLINE_APPROACH') {
    const dup = s.notifications.find((x) => x.type === n.type && x.workOrderId === n.workOrderId)
    if (dup) return
  }
  s.notifications.unshift({
    ...n,
    id: uid(),
    isRead: false,
    createdAt: new Date().toISOString(),
  })
  save()
}

export function demoListNotifications(userId: string): Notification[] {
  return load()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function demoMarkNotificationsRead(userId: string): void {
  const s = load()
  for (const n of s.notifications) {
    if (n.userId === userId) n.isRead = true
  }
  save()
}

export function demoWorkerEquipmentStats(
  workerId: string,
): Array<{ equipment: Equipment; count: number; avgScore: number | null }> {
  const s = load()
  const byEquipment = new Map<string, { count: number; scores: number[] }>()
  for (const o of s.orders) {
    if (o.workerId !== workerId || o.status === 'cancelled') continue
    const acc = byEquipment.get(o.equipmentId) ?? { count: 0, scores: [] }
    acc.count += 1
    const accRow = s.acceptance.find((a) => a.orderId === o.id)
    if (accRow) acc.scores.push(accRow.aiScore)
    byEquipment.set(o.equipmentId, acc)
  }
  const result: Array<{ equipment: Equipment; count: number; avgScore: number | null }> = []
  for (const [eqId, acc] of byEquipment) {
    const equipment = s.equipment.find((e) => e.id === eqId)
    if (!equipment) continue
    const avgScore = acc.scores.length
      ? acc.scores.reduce((a, b) => a + b, 0) / acc.scores.length
      : null
    result.push({ equipment, count: acc.count, avgScore })
  }
  return result.sort((a, b) => b.count - a.count)
}
