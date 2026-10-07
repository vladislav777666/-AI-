// Демо-бэкенд: когда ключи Supabase не заданы, приложение работает на
// localStorage-хранилище с сеялкой данных. Тот же контракт, что и у db.ts.

import type {
  Acceptance, Area, ChecklistItem, Equipment, FaultCode, HistoryChange, HistoryEntry,
  Material, MaterialItem, NewOrderInput, Notification, Priority, Profile, WorkOrder, Worker, WorkerStatus,
} from './types'

export const KEY = 'master-module-demo-v1'

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
  /** Однократная досыпка до 500+ нарядов за 3 месяца (PDF §8). */
  bulkSeeded?: boolean
}

function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`
}

// ---------- Тестовый набор PDF §8: 4 участка, 25 единиц оборудования,
// 15 исполнителей в 3 бригадах, 40 позиций материалов, 20 шифров, 500+ нарядов.

const AREA_NAMES = [
  'Дробление',
  'Обогащение',
  'Ремонтно-механический цех',
  'Энергетический участок',
] as const

interface EqSeed {
  name: string
  inventoryNo: string
  equipmentType: string
  criticality: string
  area: number
}

/** 25 единиц оборудования (PDF §8); названия «Дробилка КМД-1750» и
 *  «Конвейер К-3» совпадают с эталонными примерами §6.1/§6.5. */
const EQUIPMENT_SEED: EqSeed[] = [
  // Дробление
  { name: 'Дробилка КМД-1750', inventoryNo: 'INV-0101', equipmentType: 'Дробильная техника', criticality: 'Высокая', area: 0 },
  { name: 'Грохот вибрационный ГИС-1230', inventoryNo: 'INV-0102', equipmentType: 'Грохоты', criticality: 'Высокая', area: 0 },
  { name: 'Конвейер К-3', inventoryNo: 'INV-0103', equipmentType: 'Конвейеры', criticality: 'Высокая', area: 0 },
  { name: 'Конвейер К-7', inventoryNo: 'INV-0104', equipmentType: 'Конвейеры', criticality: 'Средняя', area: 0 },
  { name: 'Питатель вибрационный ПВ-90', inventoryNo: 'INV-0105', equipmentType: 'Питатели', criticality: 'Средняя', area: 0 },
  { name: 'Сито грохот СГ-150', inventoryNo: 'INV-0106', equipmentType: 'Грохоты', criticality: 'Низкая', area: 0 },
  // Обогащение
  { name: 'Флотомашина ФМ-10', inventoryNo: 'INV-0201', equipmentType: 'Флотомашины', criticality: 'Средняя', area: 1 },
  { name: 'Сепаратор С-4М', inventoryNo: 'INV-0202', equipmentType: 'Сепараторы', criticality: 'Средняя', area: 1 },
  { name: 'Насос ИЦ-100-50', inventoryNo: 'INV-0203', equipmentType: 'Насосы', criticality: 'Высокая', area: 1 },
  { name: 'Конвейер К-12', inventoryNo: 'INV-0204', equipmentType: 'Конвейеры', criticality: 'Средняя', area: 1 },
  { name: 'Мельница МШЦ-3200', inventoryNo: 'INV-0205', equipmentType: 'Мельницы', criticality: 'Высокая', area: 1 },
  { name: 'Гидроциклон ГЦ-500', inventoryNo: 'INV-0206', equipmentType: 'Гидроциклоны', criticality: 'Низкая', area: 1 },
  // Ремонтно-механический цех
  { name: 'Станок ЧПУ-1', inventoryNo: 'INV-0301', equipmentType: 'Металлорежущие станки', criticality: 'Средняя', area: 2 },
  { name: 'Станок токарный 16К20', inventoryNo: 'INV-0302', equipmentType: 'Металлорежущие станки', criticality: 'Средняя', area: 2 },
  { name: 'Станок фрезерный 6М82Г', inventoryNo: 'INV-0303', equipmentType: 'Металлорежущие станки', criticality: 'Средняя', area: 2 },
  { name: 'Пресс гидравлический 1600 кН', inventoryNo: 'INV-0304', equipmentType: 'Прессы', criticality: 'Высокая', area: 2 },
  { name: 'Компрессор ВП-2', inventoryNo: 'INV-0305', equipmentType: 'Компрессоры', criticality: 'Высокая', area: 2 },
  { name: 'Сварочный трансформатор ВД-306', inventoryNo: 'INV-0306', equipmentType: 'Сварочное оборудование', criticality: 'Низкая', area: 2 },
  { name: 'Кран-балка 3,2 т', inventoryNo: 'INV-0307', equipmentType: 'Грузоподъёмное', criticality: 'Высокая', area: 2 },
  // Энергетический участок
  { name: 'Трансформатор ТМ-1000', inventoryNo: 'INV-0401', equipmentType: 'Электрооборудование', criticality: 'Высокая', area: 3 },
  { name: 'Распределительный щит ЩС-0,4', inventoryNo: 'INV-0402', equipmentType: 'Электрооборудование', criticality: 'Средняя', area: 3 },
  { name: 'Насос центробежный НЦ-65', inventoryNo: 'INV-0403', equipmentType: 'Насосы', criticality: 'Средняя', area: 3 },
  { name: 'Вентилятор ВЦ-14', inventoryNo: 'INV-0404', equipmentType: 'Вентиляция', criticality: 'Низкая', area: 3 },
  { name: 'Генератор ДГ-100', inventoryNo: 'INV-0405', equipmentType: 'Электрооборудование', criticality: 'Высокая', area: 3 },
  { name: 'Компрессор КС-18', inventoryNo: 'INV-0406', equipmentType: 'Компрессоры', criticality: 'Средняя', area: 3 },
]

interface WorkerSeed {
  userId: string
  fullName: string
  specialty: string
  rank: string
  brigade: string
  area: number
  status: WorkerStatus
  rating: number
}

/** 15 исполнителей в 3 бригадах (PDF §8). */
const WORKER_SEED: WorkerSeed[] = [
  { userId: 'demo-worker-1', fullName: 'Типо Исполнитель', specialty: 'Слесарь', rank: '4 разряд', brigade: 'Бригада №1', area: 0, status: 'free', rating: 4.6 },
  { userId: 'demo-worker-2', fullName: 'Иванов И.И.', specialty: 'Электрик', rank: '5 разряд', brigade: 'Бригада №2', area: 0, status: 'busy', rating: 4.2 },
  { userId: 'demo-worker-3', fullName: 'Петров П.П.', specialty: 'Механик', rank: '3 разряд', brigade: 'Бригада №3', area: 1, status: 'not_on_shift', rating: 3.9 },
  { userId: 'demo-worker-4', fullName: 'Сидоров С.С.', specialty: 'Сварщик', rank: '5 разряд', brigade: 'Бригада №1', area: 2, status: 'free', rating: 4.8 },
  { userId: 'demo-worker-5', fullName: 'Ким А.В.', specialty: 'Оператор дробильной установки', rank: '4 разряд', brigade: 'Бригада №1', area: 0, status: 'queue', rating: 4.1 },
  { userId: 'demo-worker-6', fullName: 'Ахметов Е.С.', specialty: 'Слесарь по ремонту машин', rank: '4 разряд', brigade: 'Бригада №2', area: 1, status: 'free', rating: 3.6 },
  { userId: 'demo-worker-7', fullName: 'Оспанов О.О.', specialty: 'Электромонтёр', rank: '4 разряд', brigade: 'Бригада №3', area: 3, status: 'busy', rating: 4.4 },
  { userId: 'demo-worker-8', fullName: 'Мельников М.М.', specialty: 'Слесарь-сантехник', rank: '3 разряд', brigade: 'Бригада №2', area: 1, status: 'free', rating: 4.0 },
  { userId: 'demo-worker-9', fullName: 'Гаврилов Г.Г.', specialty: 'Механик', rank: '5 разряд', brigade: 'Бригада №1', area: 2, status: 'queue', rating: 4.7 },
  { userId: 'demo-worker-10', fullName: 'Нурланов Н.Н.', specialty: 'Оператор сепараторов', rank: '3 разряд', brigade: 'Бригада №3', area: 1, status: 'free', rating: 3.8 },
  { userId: 'demo-worker-11', fullName: 'Фёдоров Ф.Ф.', specialty: 'Электрик', rank: '4 разряд', brigade: 'Бригада №2', area: 3, status: 'not_on_shift', rating: 4.3 },
  { userId: 'demo-worker-12', fullName: 'Тлеуов Т.Т.', specialty: 'Стропальщик', rank: '3 разряд', brigade: 'Бригада №1', area: 2, status: 'free', rating: 4.5 },
  { userId: 'demo-worker-13', fullName: 'Захаров З.З.', specialty: 'Слесарь КИПиА', rank: '4 разряд', brigade: 'Бригада №3', area: 3, status: 'busy', rating: 4.2 },
  { userId: 'demo-worker-14', fullName: 'Саинов С.С.', specialty: 'Оператор мельницы', rank: '4 разряд', brigade: 'Бригада №2', area: 1, status: 'free', rating: 3.7 },
  { userId: 'demo-worker-15', fullName: 'Дьяченко Д.Д.', specialty: 'Слесарь-ремонтник', rank: '5 разряд', brigade: 'Бригада №1', area: 0, status: 'queue', rating: 4.9 },
]

/** 40 позиций материалов и запчастей (PDF §8). */
const MATERIAL_SEED: Array<{ name: string; qty: number; unit: string; area: number }> = [
  { name: 'Подшипник 6205', qty: 24, unit: 'шт', area: 0 },
  { name: 'Подшипник 6206', qty: 18, unit: 'шт', area: 0 },
  { name: 'Подшипник 36208', qty: 10, unit: 'шт', area: 1 },
  { name: 'Масло индустриальное И-ГМ-40', qty: 60, unit: 'л', area: 1 },
  { name: 'Масло гидравлическое И-Г-46', qty: 45, unit: 'л', area: 2 },
  { name: 'Кабель ПВС 3×1.5', qty: 120, unit: 'м', area: 3 },
  { name: 'Кабель ВВГ 3×2.5', qty: 200, unit: 'м', area: 3 },
  { name: 'Провод ПВ-3 2,5', qty: 150, unit: 'м', area: 3 },
  { name: 'Пневмоцилиндр SC32×100', qty: 6, unit: 'шт', area: 2 },
  { name: 'Клапан пневматический 5/2', qty: 8, unit: 'шт', area: 2 },
  { name: 'Шланг гидравлический DN16', qty: 30, unit: 'м', area: 2 },
  { name: 'Ремень клиновой B-2000', qty: 12, unit: 'шт', area: 0 },
  { name: 'Цепь приводная 24B-1', qty: 6, unit: 'м', area: 0 },
  { name: 'Ролик конвейерный 108', qty: 40, unit: 'шт', area: 0 },
  { name: 'Батарея сетевая 4К-9НК', qty: 14, unit: 'шт', area: 3 },
  { name: 'Пускатель ПМ-12', qty: 10, unit: 'шт', area: 3 },
  { name: 'Автомат ВА47-29', qty: 25, unit: 'шт', area: 3 },
  { name: 'Смазка литиевая ЛИТОЛ-24', qty: 35, unit: 'кг', area: 2 },
  { name: 'Смазка пластичная CI-2', qty: 20, unit: 'кг', area: 1 },
  { name: 'Фильтр гидравлический Г750', qty: 9, unit: 'шт', area: 2 },
  { name: 'Фильтр масляный МФ-1', qty: 11, unit: 'шт', area: 2 },
  { name: 'Уплотнение манжета 35×52×7', qty: 30, unit: 'шт', area: 1 },
  { name: 'Прокладка паронитовая', qty: 50, unit: 'шт', area: 1 },
  { name: 'Лента ФУМ', qty: 25, unit: 'рул', area: 2 },
  { name: 'Изолента ПВХ', qty: 40, unit: 'рул', area: 3 },
  { name: 'Электрод Р3-3.2', qty: 60, unit: 'кг', area: 2 },
  { name: 'Проволока Св-08Г2С', qty: 25, unit: 'кг', area: 2 },
  { name: 'Шпаклёвка реактивная', qty: 15, unit: 'кг', area: 2 },
  { name: 'Болт М12×40', qty: 300, unit: 'шт', area: 0 },
  { name: 'Гайка М12', qty: 300, unit: 'шт', area: 0 },
  { name: 'Шайба Гровера М12', qty: 300, unit: 'шт', area: 0 },
  { name: 'Крепёж анкерный М16', qty: 80, unit: 'шт', area: 2 },
  { name: 'Датчик температуры ТС-104', qty: 7, unit: 'шт', area: 3 },
  { name: 'Датчик давления ДМ-05', qty: 6, unit: 'шт', area: 3 },
  { name: 'Прокладка пробковая', qty: 45, unit: 'шт', area: 1 },
  { name: 'Насосная группа НГ-32', qty: 3, unit: 'шт', area: 1 },
  { name: 'Муфта зубчатая М-3', qty: 8, unit: 'шт', area: 0 },
  { name: 'Мотор-редуктор 1:23', qty: 4, unit: 'шт', area: 0 },
  { name: 'Фитинги латунные 1/2″', qty: 50, unit: 'шт', area: 2 },
  { name: 'Термоусадка 3×1', qty: 20, unit: 'м', area: 3 },
]

function seed(): DemoStore {
  const areas: Area[] = AREA_NAMES.map((name) => ({ id: uid(), name }))
  const equipment: Equipment[] = EQUIPMENT_SEED.map((e) => ({
    id: uid(),
    areaId: areas[e.area].id,
    name: e.name,
    inventoryNo: e.inventoryNo,
    equipmentType: e.equipmentType,
    criticality: e.criticality,
  }))
  const workers: Worker[] = WORKER_SEED.map((w) => ({
    id: uid(),
    userId: w.userId,
    fullName: w.fullName,
    specialty: w.specialty,
    rank: w.rank,
    brigade: w.brigade,
    areaId: areas[w.area].id,
    status: w.status,
    rating: w.rating,
  }))
  const materials: Material[] = MATERIAL_SEED.map((m) => ({
    id: uid(), name: m.name, qty: m.qty, unit: m.unit, areaId: areas[m.area].id,
  }))
  return {
    profile: null, workers, areas, equipment, materials, faultCodes: [...FAULT_CODES],
    orders: [], history: [], acceptance: [], notifications: [], counter: 0,
  }
}

/**
 * Доведение демо-хранилища до минимального тестового набора PDF §8
 * (4 участка, 25 оборудования, 15 исполнителей, 40 материалов, 20 шифров).
 * Существующие записи не пересоздаются: старые участки «Участок №N»
 * переименываются в названия из §8, недостающее — добавляется.
 */
function migrateBasics(s: DemoStore): void {
  // 1. Участки: переименование старых + добавление до 4.
  s.areas.forEach((a, i) => {
    if (a.name === 'Участок №1') a.name = AREA_NAMES[0]
    else if (a.name === 'Участок №2') a.name = AREA_NAMES[1]
    else if (a.name.startsWith('Участок №') && i < AREA_NAMES.length) a.name = AREA_NAMES[i]
  })
  for (let i = s.areas.length; i < AREA_NAMES.length; i++) {
    s.areas.push({ id: uid(), name: AREA_NAMES[i] })
  }
  // 2. Оборудование: добавить до 25 (атрибуты §8 заполняются для новых).
  for (let i = s.equipment.length; i < EQUIPMENT_SEED.length; i++) {
    const e = EQUIPMENT_SEED[i]
    s.equipment.push({
      id: uid(), areaId: s.areas[e.area]?.id ?? s.areas[0].id, name: e.name,
      inventoryNo: e.inventoryNo, equipmentType: e.equipmentType, criticality: e.criticality,
    })
  }
  // 3. Исполнители: добавить до 15 в 3 бригады.
  for (let i = s.workers.length; i < WORKER_SEED.length; i++) {
    const w = WORKER_SEED[i]
    s.workers.push({
      id: uid(), userId: w.userId, fullName: w.fullName, specialty: w.specialty,
      rank: w.rank, brigade: w.brigade, areaId: s.areas[w.area]?.id ?? null,
      status: w.status, rating: w.rating,
    })
  }
  // 4. Материалы: добавить до 40 позиций.
  for (let i = s.materials.length; i < MATERIAL_SEED.length; i++) {
    const m = MATERIAL_SEED[i]
    s.materials.push({
      id: uid(), name: m.name, qty: m.qty, unit: m.unit,
      areaId: s.areas[m.area]?.id ?? null,
    })
  }
  // 5. Шифры неисправностей: добавить недостающие по коду (до 20).
  const known = new Set(s.faultCodes.map((f) => f.code))
  for (const f of FAULT_CODES) {
    if (!known.has(f.code)) s.faultCodes.push({ ...f })
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
  { code: 'М-05', name: 'Механика: биение вала', description: 'Центровка, замена муфт, динамическая балансировка', normHours: 5, materialNorm: 'Муфты, крепёж', workType: 'unplanned', complexity: 4, materialNormQty: 3 },
  { code: 'Э-05', name: 'Электрика: пускатель/контактор', description: 'Замена пускателя, зачистка контактов', normHours: 2, materialNorm: 'Пускатель, провод', workType: 'unplanned', complexity: 2, materialNormQty: 2 },
  { code: 'Г-04', name: 'Гидравлика: утечка масла из бака', description: 'Замена уплотнений, промывка контура', normHours: 4, materialNorm: 'Уплотнения, масло', workType: 'unplanned', complexity: 3, materialNormQty: 4 },
  { code: 'П-03', name: 'Пневматика: износ клапана ресивера', description: 'Замена клапанной группы', normHours: 3, materialNorm: 'Клапан, прокладки', workType: 'unplanned', complexity: 3, materialNormQty: 2 },
  { code: 'С-03', name: 'Смазка: засорение системы ЦС', description: 'Промывка магистрали, замена фильтров', normHours: 2, materialNorm: 'Смазка, фильтры', workType: 'planned', complexity: 2, materialNormQty: 3 },
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
      migrateBasics(store)
      seedAnalytics(store)
      seedHistory(store)
      seedBulk(store)
      save()
      return store
    }
  } catch {
    // повреждённое хранилище — пересеем
  }
  store = seed()
  migrateBasics(store)
  seedAnalytics(store)
  seedHistory(store)
  seedBulk(store)
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

/**
 * Досыпка до 500+ нарядов за 3 месяца (PDF §8) с заложенными
 * закономерностями (§8 «3–4 закономерности» для показа ИИ на защите):
 *   • конвейер («проблемный узел») ломается ~3 раза чаще остальных;
 *   • один исполнитель часто получает повторные отказы;
 *   • поломка вскоре после планового ремонта (ППР) — сигнал качества ППR;
 *   • списания ТМЦ в 3 раза выше норматива — аномальный расход.
 * Плюс недавние активные наряды всех статусов (доска, счётчики,
 * эскалации §6.1). Детерминировано, выполняется один раз.
 */
function seedBulk(s: DemoStore): void {
  if (s.bulkSeeded || s.orders.length >= 500) {
    s.bulkSeeded = true
    return
  }
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
  const areaOf = (equipmentId: string) => equipment.find((e) => e.id === equipmentId)?.areaId ?? ''
  const used = new Set(s.orders.map((o) => o.number))
  let numSeq = 1
  const nextNumber = (): string => {
    let num = ''
    do {
      num = `Н-АН-${String(numSeq).padStart(4, '0')}`
      numSeq += 1
    } while (used.has(num))
    used.add(num)
    return num
  }

  interface BulkOrder {
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
    priority?: Priority
    materials?: MaterialItem[]
    rejectReason?: string | null
  }

  const push = (o: BulkOrder): void => {
    const f = fault(o.code)
    const createdAt = at(o.daysAgo, 8)
    const deadline = at(o.daysAgo - o.deadlineDays, 18)
    const acceptedAt = o.reactH == null ? null : new Date(createdAt.getTime() + o.reactH * 3_600_000)
    const startedAt = acceptedAt
    const completedAt = o.workH != null && startedAt ? new Date(startedAt.getTime() + o.workH * 3_600_000) : null
    const closedAt =
      completedAt && o.status === 'closed'
        ? new Date(completedAt.getTime() + (o.closeDays ?? 0) * DAY)
        : null
    const order: WorkOrder = {
      id: uid(),
      number: nextNumber(),
      workType: o.type,
      description: `${f.name}. ${f.description}`,
      areaId: areaOf(o.eq),
      equipmentId: o.eq,
      workerId: o.worker,
      deadline: deadline.toISOString(),
      priority: o.priority ?? (o.type === 'planned' ? 'planned' : 'normal'),
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
      pauseReason: o.status === 'suspended' ? 'Ждёт запчасти' : null,
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
        aiScore: 3 + ((s.orders.length * 5) % 3),
        aiComment: 'Демо-оценка ИИ.',
        masterDecision: order.status === 'rework' ? 'rework' : 'accepted',
        agreedWithAi: true,
        masterComment: null,
        checklist: null,
        createdAt: (closedAt ?? completedAt ?? createdAt).toISOString(),
      })
    }
  }

  const codes = s.faultCodes.map((f) => f.code)
  const UNPL = codes.filter((c) => (fault(c).workType ?? 'unplanned') !== 'planned')
  const PLN = codes.filter((c) => fault(c).workType === 'planned')
  const unpl = UNPL.length ? UNPL : codes
  const pln = PLN.length ? PLN : codes
  const conveyor = equipment.find((e) => /Конвейер/i.test(e.name)) ?? equipment[0]
  const others = equipment.filter((e) => e.id !== conveyor.id)
  const rejecter = (workers[5] ?? workers[0]).id

  // --- Недавние активные наряды всех статусов (без in_work — правило §6) ---
  // [status, daysAgo, deadlineDays]; deadlineDays < daysAgo → просрочен.
  const actives: Array<[WorkOrder['status'], number, number]> = [
    ['issued', 2, 1], ['issued', 3, 1], ['issued', 1, 3], ['issued', 4, 3], ['issued', 1, 2], ['issued', 5, 4],
    ['accepted', 3, 2], ['accepted', 2, 1], ['accepted', 1, 4],
    ['queued', 2, 3], ['queued', 4, 5], ['queued', 3, 4], ['queued', 5, 6],
    ['suspended', 3, 4], ['suspended', 5, 6],
    ['completed', 2, 3], ['completed', 3, 4], ['completed', 4, 6],
    ['rework', 3, 2], ['rework', 4, 5], ['rework', 5, 7],
  ]
  actives.forEach(([status, daysAgo, deadlineDays], idx) => {
    const worker = workers[idx % workers.length]
    const isPlanned = idx % 3 === 0
    push({
      eq: equipment[(idx * 7) % equipment.length].id,
      worker: worker.id,
      type: isPlanned ? 'planned' : 'unplanned',
      code: isPlanned ? pln[idx % pln.length] : unpl[idx % unpl.length],
      daysAgo,
      reactH: status === 'issued' ? null : 1 + (idx % 3),
      workH: ['completed', 'rework'].includes(status) ? 2 + (idx % 4) : null,
      status,
      deadlineDays,
    })
  })

  // --- Основная масса: 500+ нарядов за ~3 месяца ---
  const total = 520 - s.orders.length
  const rejectReasons: Array<string | null> = [
    'Нет материалов', 'Нет допуска', 'Занят аварийным обслуживанием', null,
  ]
  let pendingPpr: { eq: string; daysAgo: number } | null = null
  for (let i = 0; i < total; i++) {
    const daysAgo = 3 + Math.floor((i * 85) / Math.max(1, total)) // 3..87 дней (3 месяца)
    // 1) Плановый ремонт…
    if (i % 14 === 0 && total - i > 2) {
      const eq = equipment[(i * 5) % equipment.length]
      push({
        eq: eq.id, worker: workers[(i * 3) % workers.length].id, type: 'planned',
        code: pln[i % pln.length], daysAgo, reactH: 1, workH: 2, status: 'closed', deadlineDays: 3,
      })
      pendingPpr = { eq: eq.id, daysAgo }
      continue
    }
    // 2) …затем внеплановая поломка того же узла вскоре после ППR.
    if (pendingPpr) {
      const p = pendingPpr
      pendingPpr = null
      push({
        eq: p.eq, worker: workers[i % workers.length].id, type: 'unplanned',
        code: unpl[i % unpl.length], daysAgo: Math.max(1, p.daysAgo - 2),
        reactH: 2, workH: 3, status: 'closed', deadlineDays: 1,
      })
      continue
    }
    // 3) Повторные отказы одного исполнителя (компонент рейтинга §6.6).
    if (i % 11 === 5) {
      const eq = others[i % others.length] ?? conveyor
      push({
        eq: eq.id, worker: rejecter, type: 'unplanned', code: unpl[i % unpl.length],
        daysAgo, reactH: null, workH: null, status: 'rejected', deadlineDays: 1,
        rejectReason: rejectReasons[i % rejectReasons.length],
      })
      continue
    }
    // 4) Основная масса: конвейер — проблемный узел (~3× чаще остальных):
    //    у него 1/9 внеплановых, у каждого остального — 7/9/24 ≈ 1/27.
    const isUnplanned = i % 3 !== 0
    const eq = isUnplanned
      ? (i % 9 === 0 ? conveyor : others[(i * 7) % others.length] ?? conveyor)
      : equipment[(i * 11) % equipment.length]
    const code = isUnplanned ? unpl[i % unpl.length] : pln[i % pln.length]
    const priority: Priority | undefined = isUnplanned
      ? (['normal', 'normal', 'high', 'emergency', 'normal', 'high'] as Priority[])[i % 6]
      : 'planned'
    // 5) Аномальный расход: в 3 раза выше материального норматива (§6.5).
    const f = fault(code)
    const materials = isUnplanned && i % 13 === 4 && f.materialNormQty
      ? [{
          name: (f.materialNorm ?? 'Материалы').split(',')[0].trim(),
          qty: f.materialNormQty * 3,
          unit: 'шт',
        }]
      : undefined
    push({
      eq: eq.id,
      worker: workers[(i * 7) % workers.length].id,
      type: isUnplanned ? 'unplanned' : 'planned',
      code,
      daysAgo,
      reactH: isUnplanned ? 1 + (i % 5) : 1,
      workH: 2 + (i % 6),
      status: 'closed',
      deadlineDays: isUnplanned ? 1 : 3,
      closeDays: i % 5 === 0 ? 1 : 0,
      priority,
      materials,
    })
  }
  s.bulkSeeded = true
  save()
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
export function demoCreateEquipment(
  name: string,
  areaId: string,
  attrs?: Pick<Equipment, 'inventoryNo' | 'equipmentType' | 'criticality'>,
): void {
  const s = load()
  s.equipment.push({
    id: uid(),
    name,
    areaId,
    inventoryNo: attrs?.inventoryNo ?? null,
    equipmentType: attrs?.equipmentType ?? null,
    criticality: attrs?.criticality ?? null,
  })
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
