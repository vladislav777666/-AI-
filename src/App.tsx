// Корневой компонент: сессия → вход / Мастер / Исполнитель / веб-роли.
// Веб-руководитель (Head) и веб-администратор (Admin) — разные должности:
// руководитель видит аналитику и просмотр нарядов, администратор ведёт
// справочники §2. Панели раздельные.

import { useEffect, useState } from 'react'
import { isDemoMode, onAuthChange } from './lib/auth'
import * as db from './lib/db'
import type { Profile } from './lib/types'
import Login from './screens/Login'
import MasterApp from './screens/master/MasterApp'
import WorkerApp from './screens/worker/WorkerApp'
import AdminApp from './screens/admin/AdminApp'
import HeadApp from './screens/head/HeadApp'

type Session =
  | { state: 'loading' }
  | { state: 'anon' }
  | { state: 'authed'; profile: Profile }

export default function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' })

  async function loadProfile() {
    try {
      const profile = await db.getProfile()
      setSession(profile ? { state: 'authed', profile } : { state: 'anon' })
    } catch {
      // Сбой проверки сессии (например, нет сети) — не повод показывать экран
      // входа: берём профиль из кэша последнего успешного входа.
      const cached = db.cachedProfile()
      setSession(cached ? { state: 'authed', profile: cached } : { state: 'anon' })
    }
  }

  useEffect(() => {
    void loadProfile()
    return onAuthChange(() => {
      void loadProfile()
    })
  }, [])

  if (session.state === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-neutral-500">
        Загрузка…
      </div>
    )
  }

  if (session.state === 'anon') {
    return <Login error={null} />
  }

  if (session.profile.role === 'Master') {
    return <MasterApp key="master" profile={session.profile} />
  }
  if (session.profile.role === 'Head') {
    // Веб-панель руководителя: дашборд, рейтинг, аномалии — только просмотр
    // (правки и справочники — у администратора). Гейтится на веб-продакшен.
    return <HeadApp key="head" profile={session.profile} />
  }
  if (session.profile.role === 'Admin') {
    // Веб-панель администратора (§2): справочники и контроль нарядов.
    return <AdminApp key="admin" profile={session.profile} />
  }
  return <WorkerApp key="worker" profile={session.profile} />
}

// Демо-режим подсвечиваем в консоли, чтобы не путаться при отладке.
if (isDemoMode) {
  console.info('[app] Supabase не подключён — работаем на демо-данных (localStorage).')
}
