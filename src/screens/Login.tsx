// Вход: Supabase Auth (email/пароль, роль из profiles — Вариант А).
// Без ключей Supabase — демо-режим: вход по роли, данные в localStorage.

import { useState, type FormEvent } from 'react'
import { demoSignInAs, isDemoMode, signIn, signUp } from '../lib/auth'

export default function Login({ error }: { error: string | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const shownError = localError ?? error

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setLocalError(null)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password, fullName)
        setLocalError('Проверьте почту: подтвердите адрес, затем войдите.')
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-white text-neutral-900">
      <header
        className="px-6 pt-10 sm:pt-16"
        style={{ paddingTop: 'calc(2.5rem + env(safe-area-inset-top))' }}
      >
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Наряды</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {isDemoMode
            ? 'Демо-режим (Supabase не подключён): вход по роли, данные в браузере.'
            : 'Модуль «Мастер»: управление нарядами и исполнителями.'}
        </p>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        {isDemoMode ? (
          <div className="flex w-full max-w-sm flex-col gap-4">
            {(['Master', 'Worker'] as const).map((role) => (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => demoSignInAs(role).catch(() => setLocalError('Не удалось войти'))}
                className="w-full border border-neutral-900 bg-white px-6 py-4 text-lg font-medium transition-colors hover:bg-neutral-900 hover:text-white"
              >
                {role === 'Master' ? 'Войти как Мастер' : 'Войти как Исполнитель'}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-4">
            <div className="flex gap-2">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 border px-4 py-2 text-sm font-medium transition-colors ${
                    mode === m ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'
                  }`}
                >
                  {m === 'signin' ? 'Вход' : 'Регистрация'}
                </button>
              ))}
            </div>

            {mode === 'signup' && (
              <input
                type="text"
                placeholder="ФИО"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Пароль"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
            />

            {shownError && <p role="alert" className="text-sm text-red-600">{shownError}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full border border-neutral-900 bg-neutral-900 px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-white hover:text-neutral-900 disabled:opacity-50"
            >
              {busy ? 'Секунду…' : mode === 'signin' ? 'Войти' : 'Зарегистрироваться'}
            </button>
            <p className="text-center text-xs text-neutral-400">
              Роль назначается системой: первый пользователь — Мастер, остальные — Исполнители.
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
