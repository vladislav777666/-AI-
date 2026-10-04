// Персистентность действий (Мастер, Исполнитель, веб-админ):
//  - запись уходит в Supabase сразу, а при отсутствии сети — в локальную
//    очередь (replay через db.runQueuedOp при появлении сети) — «всегда»;
//  - чтение возвращает кэш последнего успешного ответа, если сеть
//    недоступна — экраны работают офлайн.
// Демо-режим (без ключей Supabase) не использует этот модуль.

import { enqueue, isNetworkError, type DbFnName } from './sync'

/** Клиентский UUID — генерируется до записи, чтобы повтор из очереди был идемпотентен. */
export function uid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Запись: прямой вызов Supabase; при офлайне или сетевой ошибке операция
 * уходит в очередь и возвращается локальное значение (optimistic).
 * Ошибки сервера (валидация, RLS, дубликат) НЕ маскируются — пробрасываются.
 */
export async function persist<T>(
  op: { fn: DbFnName; args: unknown[] },
  direct: () => Promise<T>,
  whenOffline: () => T,
): Promise<T> {
  if (offline()) {
    enqueue({ entityId: '', operationType: 'db', payload: { db: op } })
    return whenOffline()
  }
  try {
    return await direct()
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue({ entityId: '', operationType: 'db', payload: { db: op } })
      return whenOffline()
    }
    throw err
  }
}

// ---------- Кэш последних успешных чтений ----------

const CACHE_KEY = 'master-db-cache-v1'

function cacheLoad(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function cacheSave(cache: Record<string, unknown>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // переполнение: работаем без кэша
  }
}

export function cacheGet<T>(key: string): T | null {
  const value = cacheLoad()[key]
  return value === undefined ? null : (value as T)
}

export function cacheSet(key: string, value: unknown): void {
  const cache = cacheLoad()
  cache[key] = value
  cacheSave(cache)
}

/**
 * Чтение: успешный ответ кладётся в кэш; при сетевой ошибке или отключённой
 * сети возвращается кэш (ошибки сервера пробрасываются — кэш не прячет их).
 */
export async function readThrough<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (offline()) {
    const cached = cacheGet<T>(key)
    if (cached !== null) return cached
  }
  try {
    const data = await fetcher()
    cacheSet(key, data)
    return data
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = cacheGet<T>(key)
      if (cached !== null) return cached
    }
    throw err
  }
}
