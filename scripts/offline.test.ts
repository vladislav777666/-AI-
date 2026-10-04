// Юнит-тесты офлайн-очереди и offline-слоя персистентности.
// Запуск: npm run test:offline (vite --ssr собирает → node выполняет).

// ---------- Шимы окружения (до импорта модулей) ----------

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}

let online = true
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { get onLine() { return online } },
})

const events: string[] = []
;(globalThis as unknown as { window: unknown }).window = {
  dispatchEvent: (e: { type: string }) => { events.push(e.type); return true },
  addEventListener: () => {},
  removeEventListener: () => {},
}

// ---------- Импорт тестируемых модулей ----------

const sync = await import('../src/lib/sync')
const offline = await import('../src/lib/offline')

// ---------- Инфраструктура ----------

let passed = 0
let failed = 0
function check(cond: unknown, name: string): void {
  if (cond) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.error(`FAIL  ${name}`)
  }
}

function reset(): void {
  store.clear()
  online = true
  events.length = 0
}

const netErr = () => new TypeError('Failed to fetch')
const srvErr = () => new Error('duplicate key value violates unique constraint "materials_pkey"')

// ---------- Тесты ----------

// 1. enqueue / pendingCount
reset()
sync.enqueue({ entityId: 'e1', operationType: 'status', payload: { status: 'in_work' } })
check(sync.pendingCount() === 1, 'enqueue: операция кладётся в очередь и считается pending')
const stored = JSON.parse(store.get('master-sync-queue-v1') ?? '[]')
check(stored[0]?.status === 'PENDING', 'enqueue: статус PENDING')

// 2. persist: успех — очередь пуста
reset()
{
  const r = await offline.persist(
    { fn: 'updateArea', args: ['a1', 'X'] },
    async () => 'ok',
    () => 'offline',
  )
  check(r === 'ok' && sync.pendingCount() === 0, 'persist: успех → без постановки в очередь')
}

// 3. persist: офлайн — в очередь, возвращается локальное значение
reset()
online = false
{
  let called = false
  const r = await offline.persist(
    { fn: 'updateArea', args: ['a1', 'X'] },
    async () => { called = true; return 'ok' },
    () => 'offline',
  )
  check(r === 'offline' && !called, 'persist: офлайн → прямой вызов пропущен, возврат fallback')
  check(sync.pendingCount() === 1, 'persist: офлайн → операция в очереди')
}

// 4. persist: сетевая ошибка — в очередь
reset()
{
  const r = await offline.persist(
    { fn: 'deleteMaterial', args: ['m1'] },
    async () => { throw netErr() },
    () => 'offline',
  )
  check(r === 'offline' && sync.pendingCount() === 1, 'persist: сетевая ошибка → операция в очереди')
}

// 5. persist: ошибка сервера НЕ маскируется и не ставится в очередь
reset()
{
  let threw = false
  try {
    await offline.persist(
      { fn: 'deleteMaterial', args: ['m1'] },
      async () => { throw srvErr() },
      () => 'offline',
    )
  } catch {
    threw = true
  }
  check(threw && sync.pendingCount() === 0, 'persist: ошибка сервера → исключение, без очереди')
}

// 6. readThrough: кэш после успеха, офлайн-выдача кэша, ошибка сервера пробрасывается
reset()
{
  let fetches = 0
  const fetcher = async () => { fetches += 1; return ['a', 'b'] }
  const first = await offline.readThrough('list', fetcher)
  check(first.length === 2 && fetches === 1, 'readThrough: успешный ответ закэширован')
  const again = await offline.readThrough('list', async () => { throw netErr() })
  check(again.length === 2 && fetches === 1, 'readThrough: сетевая ошибка → отдан кэш')

  online = false
  let offlineFetches = 0
  const cached = await offline.readThrough('list', async () => { offlineFetches += 1; return [] })
  check(cached.length === 2 && offlineFetches === 0, 'readThrough: офлайн → кэш без обращения к сети')
  online = true

  let serverThrew = false
  try {
    await offline.readThrough('other', async () => { throw srvErr() })
  } catch {
    serverThrew = true
  }
  check(serverThrew, 'readThrough: ошибка сервера пробрасывается, кэш не прячет её')
}

// 7. flushQueue: успешная отправка → очередь пуста, событие db-synced
reset()
sync.enqueue({ entityId: 'e1', operationType: 'status', payload: { status: 'closed' } })
sync.enqueue({ entityId: '', operationType: 'db', payload: { db: { fn: 'createArea', args: ['У1', 'id-1'] } } })
{
  const res = await sync.flushQueue(async () => { /* ok */ })
  check(res.synced === 2 && sync.pendingCount() === 0, 'flush: обе операции отправлены, очередь пуста')
  check(events.includes('db-synced'), 'flush: отправлено событие db-synced')
}

// 8. flushQueue: ошибка валидации → операция снята с очереди
reset()
sync.enqueue({ entityId: 'e1', operationType: 'status', payload: { status: 'in_work' } })
{
  const res = await sync.flushQueue(async () => { throw new Error('Недопустимый переход статуса — обновите данные.') })
  check(sync.pendingCount() === 0 && res.errors.length === 1, 'flush: ошибка валидации → операция удалена')
}

// 9. flushQueue: сетевая ошибка → остаётся PENDING
reset()
sync.enqueue({ entityId: 'e1', operationType: 'db', payload: { db: { fn: 'updateArea', args: ['a', 'b'] } } })
{
  await sync.flushQueue(async () => { throw netErr() })
  const ops = sync.getQueue()
  check(ops.length === 1 && ops[0].status === 'PENDING', 'flush: сетевая ошибка → PENDING до восстановления сети')
}

// 10. flushQueue: ошибка сервера → FAILED и не ретраится
reset()
sync.enqueue({ entityId: 'e1', operationType: 'db', payload: { db: { fn: 'updateArea', args: ['a', 'b'] } } })
{
  await sync.flushQueue(async () => { throw srvErr() })
  const ops = sync.getQueue()
  check(ops.length === 1 && ops[0].status === 'FAILED', 'flush: ошибка сервера → FAILED')
  let retried = 0
  const res = await sync.flushQueue(async () => { retried += 1 })
  check(retried === 0 && res.synced === 0, 'flush: FAILED не ретраится автоматически')
}

// 11. flushQueue: параллельные вызовы делят один прогон (нет двойного применения)
reset()
sync.enqueue({ entityId: 'e1', operationType: 'db', payload: { db: { fn: 'updateArea', args: ['a', 'b'] } } })
{
  let runs = 0
  const slowRunner = async () => { runs += 1; await new Promise((r) => setTimeout(r, 30)) }
  const p1 = sync.flushQueue(slowRunner)
  const p2 = sync.flushQueue(slowRunner)
  check(p1 === p2, 'flush: параллельный вызов возвращает тот же промис')
  const [r1, r2] = await Promise.all([p1, p2])
  check(runs === 1 && r1.synced === 1 && r2.synced === 1, 'flush: операция применена один раз')
}

// 12. isNetworkError: сетевые сообщения vs ошибки сервера
check(sync.isNetworkError(netErr()), 'isNetworkError: TypeError Failed to fetch')
check(sync.isNetworkError(new Error('Load failed')), 'isNetworkError: Load failed')
check(!sync.isNetworkError(srvErr()), 'isNetworkError: ошибка сервера — не сетевая')
check(!sync.isNetworkError(new Error('Недопустимый переход')), 'isNetworkError: ошибка валидации — не сетевая')

// ---------- Итог ----------

console.log(`\nИТОГ: ${passed}/${passed + failed} проверок пройдено`)
if (failed > 0) process.exitCode = 1
