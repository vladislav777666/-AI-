// Вход: Supabase Auth (email/пароль, роль из profiles — Вариант А).
// Без ключей Supabase — демо-режим: вход по роли, данные в localStorage.

import { useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { DEMO_PINS, demoSignInAs, isDemoMode, signIn, signInPin, signUp } from '../lib/auth'
import type { Role } from '../lib/types'

export default function Login({ error }: { error: string | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  // Вход по ПИН-коду (PDF §9 п.5): демо-режим, тестовые ПИНы §12.
  async function submitPin(e: FormEvent) {
    e.preventDefault()
    if (pinBusy) return
    setPinBusy(true)
    setPinError(null)
    try {
      const role = await signInPin(pin)
      if (!role) {
        setPinError('Неверный ПИН-код.')
      } else if (Capacitor.isNativePlatform() && role !== 'Master' && role !== 'Worker') {
        setPinError('Эта роль доступна только в веб-панели.')
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setPinBusy(false)
    }
  }

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
            {([
              { role: 'Master', label: 'Войти как Мастер' },
              { role: 'Worker', label: 'Войти как Исполнитель' },
              // Веб-роли — только веб-продакшен (в APK разделы скрыты).
              ...(Capacitor.isNativePlatform()
                ? []
                : [
                    { role: 'Head' as Role, label: 'Войти как Руководитель' },
                    { role: 'Admin' as Role, label: 'Войти как Администратор' },
                  ]),
            ] as Array<{ role: Role; label: string }>).map(({ role, label }) => (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => demoSignInAs(role).catch(() => setLocalError('Не удалось войти'))}
                className="w-full border border-neutral-900 bg-white px-6 py-4 text-lg font-medium transition-colors hover:bg-neutral-900 hover:text-white"
              >
                {label}
              </button>
            ))}

            {/* Вход по ПИН-коду (PDF §9 п.5). */}
            <form onSubmit={submitPin} noValidate className="mt-2 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="ПИН-код (4 цифры)"
                aria-label="ПИН-код"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-neutral-300 px-4 py-3 text-center tracking-[0.3em] focus:border-neutral-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pinBusy || pin.length !== 4}
                className="border border-neutral-900 px-5 text-sm font-medium transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40"
              >
                {pinBusy ? '…' : 'Войти по ПИН'}
              </button>
            </form>
            {pinError && (
              <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {pinError}
              </p>
            )}
            <p className="text-xs text-neutral-500">
              Тестовые ПИН: {DEMO_PINS.Master} — Мастер, {DEMO_PINS.Worker} — Исполнитель,{' '}
              {DEMO_PINS.Head} — Руководитель, {DEMO_PINS.Admin} — Администратор.
            </p>
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
              Роль назначается в БД (public.profiles.role): по умолчанию — Исполнитель,
              первый пользователь — Мастер; веб-роли выдаются SQL-ом (set_user_role).
            </p>
          </form>
        )}
      </main>
    </div>
  )
}
