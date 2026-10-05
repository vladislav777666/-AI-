// Аутентификация: Supabase Auth (email/пароль, роль из public.profiles.role:
// Master | Worker | Head | Admin — выдаётся SQL-ом, см. 0006_user_roles.sql),
// а без ключей — демо-вход по роли (localStorage).

import { isSupabaseConfigured, supabase } from './supabase'
import * as demo from './demo'
import type { Role } from './types'

export const MOCK_PASSWORD = '1234'

export const isDemoMode = !isSupabaseConfigured

export async function signIn(email: string, password: string): Promise<void> {
  if (isDemoMode || !supabase) {
    // Демо: admin@ / head@ / master@ / worker@, любой пароль.
    const e = email.trim().toLowerCase()
    const role: Role =
      e.startsWith('admin') ? 'Admin'
        : e.startsWith('head') ? 'Head'
          : e.startsWith('master') ? 'Master'
            : 'Worker'
    demo.demoLogin(role)
    return
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUp(email: string, password: string, fullName: string): Promise<void> {
  if (isDemoMode || !supabase) throw new Error('Регистрация доступна только при подключённом Supabase.')
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: 'Worker' } },
  })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  if (isDemoMode || !supabase) {
    demo.demoLogout()
    notifyDemo()
    return
  }
  await supabase.auth.signOut()
}

/** Подписка на изменения сессии (Supabase + демо-события). */
export function onAuthChange(cb: () => void): () => void {
  if (isDemoMode || !supabase) {
    const handler = () => cb()
    window.addEventListener('demo-auth', handler)
    return () => window.removeEventListener('demo-auth', handler)
  }
  const { data } = supabase.auth.onAuthStateChange(() => cb())
  return () => data.subscription.unsubscribe()
}

function notifyDemo(): void {
  window.dispatchEvent(new Event('demo-auth'))
}

export async function demoSignInAs(role: Role): Promise<void> {
  demo.demoLogin(role)
  notifyDemo()
}
