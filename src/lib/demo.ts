// Демо-бэкенд: когда ключи Supabase не заданы, приложение работает на
// localStorage-хранилище с сеялкой данных. Тот же контракт, что и у db.ts.

import type {
  Acceptance, Area, ChecklistItem, Equipment, FaultCode, HistoryChange, HistoryEntry,
  Material, MaterialItem, NewOrderInput, Notification, Profile, WorkOrder, Worker, WorkerStatus,
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
  /** Однократная досыпка исторических нарядов для аналитики (панель
   *  руководителя): флаг, чтобы не дублировать данные при перезагрузке. */
  analyticsSeeded?: boolean
  /** Однократная досыпка истории нарядов (§4.3) для старых хранилищ. */
  historySeeded?: boolean
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
// Весовой коэффициент сложности (1..5) — Раздел 2, п.4 панели руководителя;
// материальный норматив в единицах списания — Раздел 3.4 «По материалам».
const FAULT_CODES: FaultCode[] = [
  { code: 'М-01', name: 'Механика: износ подшипника', description: 'Замена/ремонт подшипниковых узлов', normHours: 4, materialNorm: 'Подшипник, съёмник, смазка', workType: 'unplanned', complexity: 3, materialNormQty: 4 },
  { code: 'М-02', name: 'Механика: люфт вала', description: 'Устранение люфтов и перекосов валов', normHours: 6, materialNorm: 'Шайбы, прокладки, крепёж', workType: 'unplanned', complexity: 3, materialNormQty: 3 },
  { code: 'М-03', name: 'Механика: вибрация', description: 'Балансировка, крепёж, демпфирование', normHours: 3, materialNorm: 'Демпферы, крепёж', workType: 'unplanned', complexity: 2, materialNormQty: 2 },
  { code: 'М-04', name: 'Механика: деформация корпуса', description: 'Трещины, сколы, правка корпусных деталей', normHours: 8, materialNorm: 'Сварочные электроды, шпаклёвка', workType: 'unplanned', complexity: 5, materialNormQty: 6 },
  { code: 'Э-01', name: 'Электрика: обрыв цепи', description: 'Поиск и устранение обрывов', normHours: 2, materialNorm: 'Провод, клеммы, изолента', workType: 'unplanned', complexity: 1, materialNormQty: 3 },
  { code: 'Э-02', name: 'Электрика: КЗ/замыкание', description: 'Изоляция, замена проводки', normHours: 3, materialNorm: 'Кабель, изоляция, предохранители', workType: 'unplanned', complexity: 3, materialNormQty: 5 },
  { code: 'Э-03', name: 'Электрика: двигатель', description: 'Ремонт/замена электродвигателя', normHours: 6, materialNorm: 'Двигатель, муфта, крепёж', workType: 'unplanned', complexity: 5, materialNormQty: 4 },
  { code: 'Э-04', name: 'Электрика: датчики/АСУ', description: 'Неисправности датчиков и автоматики', normHours: 4, materialNorm: 'Датчик, кабельный ввод', workType: 'unplanned', complexity: 2, materialNormQty: 2 },
  { code: 'Г-01', name: 'Гидравлика: утечка', description: 'Течь по соединениям и уплотнениям', normHours: 2, materialNorm: 'Уплотнения, шланг', workType: 'unplanned', complexity: 2, materialNormQty: 2 },
  { code: 'Г-02', name: 'Гидравлика: насос', description: 'Ремонт/замена насосного узла', normHours: 5, materialNorm: 'Насос, фильтр, масло', workType: 'unplanned', complexity: 4, materialNormQty: 5 },
  { code: 'Г-03', name: 'Гидравлика: давление', description: 'Настройка редукторов, клапанов', normHours: 3, materialNorm: 'Манометр, пружина редуктора', workType: 'unplanned', complexity: 2, materialNormQty: 2 },
  { code: 'П-01', name: 'Пневматика: утечка воздуха', description: 'Течь пневмосоединений', normHours: 2, materialNorm: 'Фитинги, лента ФУМ', workType: 'unplanned', complexity: 1, materialNormQty: 2 },
  { code: 'П-02', name: 'Пневматика: клапан/цилиндр', description: 'Замена пневмоэлементов', normHours: 4, materialNorm: 'Клапан, цилиндр, уплотнения', workType: 'unplanned', complexity: 3, materialNormQty: 3 },
  { code: 'С-01', name: 'Смазка: недостаток смазки', description: 'Восстановление подачи смазки', normHours: 1, materialNorm: 'Смазка, шприц', workType: 'planned', complexity: 1, materialNormQty: 2 },
  { code: 'С-02', name: 'Смазка: загрязнение масла', description: 'Замена масла, промывка', normHours: 2, materialNorm: 'Масло, фильтр, промывка', workType: 'planned', complexity: 2, materialNormQty: 3 },
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
        complexity: f.complexity ?? FAULT_CODES.find((d) => d.code === f.code)?.complexity ?? null,
        materialNormQty: f.materialNormQty ?? FAULT_CODES.find((d) => d.code === f.code)?.materialNormQty ?? null,
      }))
      store = parsed
      seedAnalytics(store)
      seedHistory(store)
      return store
    }
  } catch {
    // повреждённое хранилище — пересеем
  }
  store = seed()
  seedAnalytics(store)
  seedHistory(store)
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

/**
 * Досыпка демо-истории для веб-панели руководителя (Дашборд / Рейтинг /
 * Аномалии). Добавляется один раз и детерминированно (без случайности):
 *   • плановые работы с внеплановыми «хвостами» в течение недели → аномалии 3.1/3.2;
 *   • повторные обращения по тому же оборудованию в течение 7 дней → возвраты (Р. 2 п.3);
 *   • списания материалов выше норматива → аномалии 3.4;
 *   • отказы (в т.ч. без причины), просрочки и активные наряды → Дашборд и Рейтинг.
 * Существующие демо-данные не трогаются.
 */
function seedAnalytics(s: DemoStore): void {
  if (s.analyticsSeeded) return
  s.analyticsSeeded = true
  const workers = s.workers
  const equipment = s.equipment
  if (workers.length === 0 || equipment.length === 0) return

  const DAY = 86_400_000
  const at = (daysAgo: number, hour: number): Date => {
    const d = new Date(Date.now() - daysAgo * DAY)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const fault = (code: string): FaultCode =>
    s.faultCodes.find((f) => f.code === code) ?? {
      code, name: code, description: '', normHours: null, materialNorm: null, workType: 'unplanned',
    }
  const eqId = (i: number) => equipment[i % equipment.length].id
  const wId = (i: number) => workers[i % workers.length].id
  const areaOf = (equipmentId: string) => equipment.find((e) => e.id === equipmentId)?.areaId ?? ''
  let seq = 0

  const add = (o: {
    eq: string
    worker: string | null
    type: WorkOrder['workType']
    code: string
    daysAgo: number
    reactH: number | null
    workH: number | null
    status: WorkOrder['status']
    deadlineDays: number
    closeDays?: number
    materials?: MaterialItem[]
    rejectReason?: string | null
  }): WorkOrder => {
    seq += 1
    const f = fault(o.code)
    const createdAt = at(o.daysAgo, 8)
    const deadline = at(o.daysAgo - o.deadlineDays, 18)
    const acceptedAt = o.reactH == null ? null : new Date(createdAt.getTime() + o.reactH * 3_600_000)
    const startedAt = acceptedAt
    const completedAt =
      o.workH != null && startedAt ? new Date(startedAt.getTime() + o.workH * 3_600_000) : null
    const closedAt =
      completedAt && o.status === 'closed'
        ? new Date(completedAt.getTime() + (o.closeDays ?? 0) * DAY)
        : null
    const order: WorkOrder = {
      id: uid(),
      number: `Н-АН-${String(seq).padStart(4, '0')}`,
      workType: o.type,
      description: `${f.name}. ${f.description}`,
      areaId: areaOf(o.eq),
      equipmentId: o.eq,
      workerId: o.worker,
      deadline: deadline.toISOString(),
      priority: o.type === 'planned' ? 'planned' : 'normal',
      status: o.status,
      faultCode: f.code,
      photos: [],
      comment: null,
      normHours: f.normHours,
      workDone: completedAt ? `Выполнено: ${f.name.toLowerCase()}` : null,
      workerComment: null,
      materials: o.materials?.map((m) => `${m.name} × ${m.qty} ${m.unit}`).join('; ') ?? null,
      materialsList: o.materials ?? [],
      photosAfter: [],
      pauseReason: null,
      rejectReason: o.rejectReason ?? null,
      pausedAt: null,
      createdBy: 'demo-master',
      createdAt: createdAt.toISOString(),
      acceptedAt: acceptedAt?.toISOString() ?? null,
      startedAt: startedAt?.toISOString() ?? null,
      completedAt: completedAt?.toISOString() ?? null,
      closedAt: closedAt?.toISOString() ?? null,
    }
    s.orders.push(order)
    seedOrderHistory(s, order)
    if (['closed', 'completed', 'rework'].includes(order.status)) {
      s.acceptance.push({
        id: uid(),
        orderId: order.id,
        aiScore: 3 + ((seq * 5) % 3), // 3..5, детерминированно
        aiComment: 'Демо-оценка ИИ.',
        masterDecision: order.status === 'rework' ? 'rework' : 'accepted',
        agreedWithAi: true,
        masterComment: null,
        checklist: null,
        createdAt: (closedAt ?? completedAt ?? createdAt).toISOString(),
      })
    }
    return order
  }

  const planned = (eq: string, worker: string, daysAgo: number, code: string) =>
    add({ eq, worker, type: 'planned', code, daysAgo, reactH: 1, workH: 2, status: 'closed', deadlineDays: 2 })

  // --- Станок #1: плановый + три внеплановых «хвоста» (аномалия 3.1/3.2) ---
  planned(eqId(0), wId(0), 42, 'С-01')
  add({ eq: eqId(0), worker: wId(0), type: 'unplanned', code: 'М-01', daysAgo: 40, reactH: 2, workH: 5, status: 'closed', deadlineDays: 1, closeDays: 1, materials: [{ name: 'Подшипник 6205', qty: 8, unit: 'шт' }, { name: 'Смазка', qty: 3, unit: 'кг' }] })
  add({ eq: eqId(0), worker: wId(1), type: 'unplanned', code: 'Г-01', daysAgo: 39, reactH: 4, workH: 3, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(0), worker: wId(2), type: 'unplanned', code: 'Э-01', daysAgo: 37, reactH: 1, workH: 2, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(0), worker: wId(0), type: 'unplanned', code: 'М-01', daysAgo: 36, reactH: 3, workH: 9, status: 'closed', deadlineDays: 1, closeDays: 2 }) // повтор < 7 дней
  add({ eq: eqId(0), worker: wId(1), type: 'unplanned', code: 'Э-03', daysAgo: 28, reactH: 6, workH: 7, status: 'closed', deadlineDays: 2, closeDays: 1 })
  add({ eq: eqId(0), worker: wId(0), type: 'unplanned', code: 'М-02', daysAgo: 21, reactH: 2, workH: 6, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(0), worker: wId(2), type: 'unplanned', code: 'Э-01', daysAgo: 14, reactH: 1, workH: 1, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(0), worker: wId(0), type: 'unplanned', code: 'М-03', daysAgo: 1, reactH: 1, workH: null, status: 'in_work', deadlineDays: 1 })
  add({ eq: eqId(0), worker: wId(1), type: 'unplanned', code: 'Г-01', daysAgo: 3, reactH: null, workH: null, status: 'issued', deadlineDays: -1 }) // просрочен

  // --- Пресс: плановый + два внеплановых; перерасход по Г-02 ---
  planned(eqId(1), wId(1), 30, 'С-02')
  add({ eq: eqId(1), worker: wId(1), type: 'unplanned', code: 'Г-01', daysAgo: 28, reactH: 2, workH: 3, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(1), worker: wId(0), type: 'unplanned', code: 'Г-02', daysAgo: 26, reactH: 5, workH: 8, status: 'closed', deadlineDays: 2, closeDays: 1, materials: [{ name: 'Масло И-ГМ-40', qty: 14, unit: 'л' }, { name: 'Фильтр', qty: 2, unit: 'шт' }] })
  add({ eq: eqId(1), worker: wId(2), type: 'unplanned', code: 'М-04', daysAgo: 18, reactH: 8, workH: 12, status: 'closed', deadlineDays: 3, closeDays: 2 })
  add({ eq: eqId(1), worker: wId(1), type: 'unplanned', code: 'Г-03', daysAgo: 11, reactH: 1, workH: 2, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(1), worker: wId(0), type: 'unplanned', code: 'П-02', daysAgo: 5, reactH: 3, workH: 4, status: 'closed', deadlineDays: 1, materials: [{ name: 'Клапан', qty: 4, unit: 'шт' }, { name: 'Уплотнения', qty: 2, unit: 'шт' }] })
  add({ eq: eqId(1), worker: wId(1), type: 'unplanned', code: 'Э-02', daysAgo: 2, reactH: 1, workH: null, status: 'suspended', deadlineDays: 2 })

  // --- Компрессор: плановый + три внеплановых; перерасход по П-01; отказ без причины ---
  planned(eqId(2), wId(2), 20, 'С-01')
  add({ eq: eqId(2), worker: wId(2), type: 'unplanned', code: 'П-01', daysAgo: 19, reactH: 1, workH: 3, status: 'closed', deadlineDays: 1, materials: [{ name: 'Фитинги', qty: 5, unit: 'шт' }, { name: 'Лента ФУМ', qty: 3, unit: 'шт' }] })
  add({ eq: eqId(2), worker: wId(1), type: 'unplanned', code: 'П-02', daysAgo: 17, reactH: 2, workH: 4, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(2), worker: wId(2), type: 'unplanned', code: 'П-01', daysAgo: 14, reactH: 1, workH: 2, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(2), worker: wId(2), type: 'unplanned', code: 'П-01', daysAgo: 13, reactH: 1, workH: 1, status: 'closed', deadlineDays: 1 }) // повтор < 7 дней
  add({ eq: eqId(2), worker: wId(0), type: 'unplanned', code: 'Э-04', daysAgo: 10, reactH: 2, workH: 3, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(2), worker: wId(1), type: 'unplanned', code: 'П-02', daysAgo: 6, reactH: 2, workH: 5, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(2), worker: wId(2), type: 'unplanned', code: 'Э-01', daysAgo: 4, reactH: null, workH: null, status: 'rejected', deadlineDays: 1, rejectReason: null })
  add({ eq: eqId(2), worker: wId(1), type: 'unplanned', code: 'М-03', daysAgo: 1, reactH: 2, workH: null, status: 'accepted', deadlineDays: 2 })

  // --- Конвейер: плановый без «хвоста» (база); доработка и отказ с причиной ---
  planned(eqId(3), wId(0), 12, 'С-02')
  add({ eq: eqId(3), worker: wId(2), type: 'unplanned', code: 'М-03', daysAgo: 9, reactH: 1, workH: 2, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(3), worker: wId(1), type: 'unplanned', code: 'Э-01', daysAgo: 7, reactH: 2, workH: 2, status: 'closed', deadlineDays: 1 })
  add({ eq: eqId(3), worker: wId(0), type: 'unplanned', code: 'Г-01', daysAgo: 3, reactH: 1, workH: 2, status: 'closed', deadlineDays: 1, materials: [{ name: 'Уплотнения', qty: 1, unit: 'шт' }] })
  add({ eq: eqId(3), worker: wId(1), type: 'unplanned', code: 'М-02', daysAgo: 2, reactH: 2, workH: 4, status: 'rework', deadlineDays: 1 })
  add({ eq: eqId(3), worker: wId(1), type: 'unplanned', code: 'М-01', daysAgo: 5, reactH: null, workH: null, status: 'rejected', deadlineDays: 1, rejectReason: 'Оборудование остановлено по требованию цеха' })

  // --- Плановая работа внутри последней недели: в отчётах видны и плановые,
  // --- и внеплановые остановки (после неё — Э-02 по тому же прессу).
  planned(eqId(1), wId(1), 4, 'С-01')

  // --- Пятая единица (если есть): самый проблемный узел ---
  if (equipment.length >= 5) {
    planned(eqId(4), wId(2), 25, 'С-02')
    add({ eq: eqId(4), worker: wId(0), type: 'unplanned', code: 'Г-01', daysAgo: 23, reactH: 2, workH: 4, status: 'closed', deadlineDays: 1 })
    add({ eq: eqId(4), worker: wId(1), type: 'unplanned', code: 'Г-02', daysAgo: 21, reactH: 4, workH: 6, status: 'closed', deadlineDays: 2, materials: [{ name: 'Насос', qty: 1, unit: 'шт' }, { name: 'Масло', qty: 9, unit: 'л' }] })
    add({ eq: eqId(4), worker: wId(2), type: 'unplanned', code: 'Г-03', daysAgo: 19, reactH: 1, workH: 3, status: 'closed', deadlineDays: 1 })
    add({ eq: eqId(4), worker: wId(2), type: 'unplanned', code: 'М-01', daysAgo: 8, reactH: 3, workH: 5, status: 'closed', deadlineDays: 1 })
    add({ eq: eqId(4), worker: wId(1), type: 'unplanned', code: 'Э-03', daysAgo: 4, reactH: 2, workH: 8, status: 'closed', deadlineDays: 2 })
    // В работе — только у одного исполнителя: правило «одна активная задача» (ТЗ §6).
    add({ eq: eqId(4), worker: wId(2), type: 'unplanned', code: 'Г-02', daysAgo: 1, reactH: 1, workH: null, status: 'in_work', deadlineDays: 1 })
  }
}

/** Лента истории наряда (§4.3): жизненный цикл от выдачи до приёмки
 *  строится по меткам времени наряда. Уже сохранённые записи не трогаются. */
function seedOrderHistory(s: DemoStore, order: WorkOrder): void {
  if (s.history.some((h) => h.orderId === order.id)) return
  const workerName =
    s.workers.find((w) => w.id === order.workerId)?.fullName ?? 'Исполнитель'
  pushHistory(s, order.id, 'Типо Мастер', 'Наряд выдан', [
    { field: 'Статус', from: null, to: 'issued' },
  ], order.createdAt)
  if (order.acceptedAt) {
    pushHistory(s, order.id, workerName, 'Статус наряда', [
      { field: 'Статус', from: 'issued', to: 'in_work' },
    ], order.acceptedAt)
  }
  if (order.completedAt) {
    pushHistory(s, order.id, workerName, 'Работы сданы', [
      { field: 'Выполненные работы', from: null, to: order.workDone },
      ...(order.materialsList.length > 0
        ? [{ field: 'Материалы (позиции)', from: null, to: `${order.materialsList.length} шт.` }]
        : []),
    ], order.completedAt)
    pushHistory(s, order.id, workerName, 'Статус наряда', [
      { field: 'Статус', from: 'in_work', to: 'completed' },
    ], order.completedAt)
  }
  if (order.closedAt || order.status === 'rework') {
    pushHistory(s, order.id, 'Типо Мастер', 'Приёмка работ', [
      { field: 'Решение', from: null, to: order.status === 'rework' ? 'rework' : 'accepted' },
      { field: 'Статус', from: 'completed', to: order.status === 'rework' ? 'rework' : 'closed' },
    ], order.closedAt ?? order.completedAt ?? order.createdAt)
  }
}

/** Досыпка ленты истории для хранилищ, созданных до §4.3: проходит один раз,
 *  нарядам без записей строятся события по их меткам времени. */
function seedHistory(s: DemoStore): void {
  if (s.historySeeded) return
  s.historySeeded = true
  for (const o of s.orders) seedOrderHistory(s, o)
}

export function demoGetProfile(): Profile | null {
  return load().profile
}

export function demoLogin(role: Profile['role']): Profile {
  const s = load()
  s.profile =
    role === 'Master'
      ? { id: 'demo-master', role, fullName: 'Типо Мастер' }
      : role === 'Admin'
        ? { id: 'demo-admin', role, fullName: 'Типо Администратор' }
        : role === 'Head'
          ? { id: 'demo-head', role, fullName: 'Типо Руководитель' }
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

/** Закрепление оборудования за участком (ТЗ §2.1); null — открепить. */
export function demoUpdateEquipment(id: string, areaId: string | null): void {
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
  /** Время события (для сида истории); по умолчанию — сейчас. */
  at?: string,
): void {
  s.history.push({
    id: uid(),
    orderId,
    actorName,
    action,
    changes,
    createdAt: at ?? new Date().toISOString(),
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
  // Идентификаторы участка/оборудования/исполнителя в истории показываем
  // именами, а не UUID («Исполнитель: Иванов И.И. → Петров П.П.»).
  const norm = (field: keyof WorkOrder, v: unknown): string | null => {
    if (v == null) return null
    const id = String(v)
    if (field === 'workerId') return s.workers.find((w) => w.id === id)?.fullName ?? id
    if (field === 'areaId') return s.areas.find((a) => a.id === id)?.name ?? id
    if (field === 'equipmentId') return s.equipment.find((e) => e.id === id)?.name ?? id
    return Array.isArray(v) ? `${v.length} шт.` : id
  }
  const changes: HistoryChange[] = []
  for (const [field, label] of TRACKED_FIELDS) {
    const next = patch[field]
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(order[field])) {
      changes.push({ field: label, from: norm(field, order[field]), to: norm(field, next) })
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

/** Оценки приёмки по всем нарядам (orderId → балл) — для аналитики. */
export function demoAcceptanceScores(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of load().acceptance) out[a.orderId] = a.aiScore
  return out
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
