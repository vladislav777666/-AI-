// Корневой компонент: сессия → вход / Мастер / Исполнитель / веб-роли
// (Веб-руководитель и Веб-администратор — общая веб-панель).

import { useEffect, useState } from 'react'
import { isDemoMode, onAuthChange } from './lib/auth'
import * as db from './lib/db'
import type { Profile } from './lib/types'
import Login from './screens/Login'
import MasterApp from './screens/master/MasterApp'
import WorkerApp from './screens/worker/WorkerApp'
import AdminApp from './screens/admin/AdminApp'

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
      setSession({ state: 'anon' })
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
  if (session.profile.role === 'Admin' || session.profile.role === 'Head') {
    // Веб-роли (руководитель и администратор): внутри AdminApp
    // дополнительно гейтится на веб-продакшен.
    return <AdminApp key="admin" profile={session.profile} />
  }
  return <WorkerApp key="worker" profile={session.profile} />
}

// Демо-режим подсвечиваем в консоли, чтобы не путаться при отладке.
if (isDemoMode) {
  console.info('[app] Supabase не подключён — работаем на демо-данных (localStorage).')
}
