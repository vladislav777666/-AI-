// Демо-бэкенд: когда ключи Supabase не заданы, приложение работает на
// localStorage-хранилище с сеялкой данных. Тот же контракт, что и у db.ts.

import type {
  Acceptance, Area, Equipment, HistoryChange, HistoryEntry, NewOrderInput,
  Profile, WorkOrder, Worker, WorkerStatus,
} from './types'

const KEY = 'master-module-demo-v1'

interface DemoStore {
  profile: Profile | null
  workers: Worker[]
  areas: Area[]
  equipment: Equipment[]
  orders: WorkOrder[]
  history: HistoryEntry[]
  acceptance: Acceptance[]
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
    { id: uid(), userId: 'demo-worker-1', fullName: 'Типо Исполнитель', specialty: 'Слесарь', status: 'free', rating: 4.6 },
    { id: uid(), userId: 'demo-worker-2', fullName: 'Иванов И.И.', specialty: 'Электрик', status: 'busy', rating: 4.2 },
    { id: uid(), userId: 'demo-worker-3', fullName: 'Петров П.П.', specialty: 'Механик', status: 'not_on_shift', rating: 3.9 },
  ]
  return { profile: null, workers, areas, equipment, orders: [], history: [], acceptance: [], counter: 0 }
}

let store: DemoStore | null = null

function load(): DemoStore {
  if (store) return store
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      store = JSON.parse(raw) as DemoStore
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

export function demoListAreas(): Area[] {
  return [...load().areas]
}

export function demoListEquipment(): Equipment[] {
  return [...load().equipment]
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
    materials: null,
    photosAfter: [],
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
  // Метки времени (acceptedAt и т.п.) применяются молча, без отдельной записи в историю:
  // статусные события уже логируются выше по статусу.
  for (const f of ['startedAt', 'completedAt', 'acceptedAt', 'closedAt'] as const) {
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
  data: { aiScore: number; aiComment: string; masterDecision: Acceptance['masterDecision']; agreedWithAi: boolean; masterComment: string | null },
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
