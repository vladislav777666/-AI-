// Вход: быстрый вход по роли (4 кнопки) в тестовые аккаунты Supabase —
// именно так показывается система на защите, без регистрации и ввода пароля.
//
// Регистрация убрана: учётные записи создаёт администратор (Admin API),
// а тестовые наполнены миграцией supabase/migrations/0011_demo_seed.sql.
// Дополнительно оставлен обычный вход по email и паролю для реальных
// аккаунтов (например, руководителя предприятия).
//
// Без ключей Supabase приложение работает в демо-режиме: те же 4 кнопки,
// но вход выполняется в localStorage-сессию.

import { useState, type FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { DEMO_PINS, demoSignInAs, isDemoMode, signIn, signInPin } from '../lib/auth'
import { TEST_ACCOUNTS, TEST_PASSWORD } from '../lib/testAccounts'
import type { Role } from '../lib/types'

const ROLE_BUTTONS: Array<{ role: Role; label: string }> = [
  { role: 'Master', label: 'Войти как Мастер' },
  { role: 'Worker', label: 'Войти как Исполнитель' },
  // Веб-роли — только веб-панель (в APK разделы скрыты).
  { role: 'Head', label: 'Войти как Руководитель' },
  { role: 'Admin', label: 'Войти как Администратор' },
]

export default function Login({ error }: { error: string | null }) {
  const native = Capacitor.isNativePlatform()
  const roles = native
    ? ROLE_BUTTONS.filter((r) => r.role === 'Master' || r.role === 'Worker')
    : ROLE_BUTTONS

  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  const shownError = localError ?? error

  /** Вход по роли: демо-сессия без ключей либо тестовый аккаунт Supabase. */
  async function enterAs(role: Role): Promise<void> {
    if (busy) return
    setBusy(true)
    setLocalError(null)
    try {
      if (isDemoMode) {
        await demoSignInAs(role)
      } else {
        await signIn(TEST_ACCOUNTS[role], TEST_PASSWORD)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  /** Вход по ПИН-коду (PDF §9 п.5): только демо-режим, тестовые ПИНы §12. */
  async function submitPin(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (pinBusy) return
    setPinBusy(true)
    setPinError(null)
    try {
      const role = await signInPin(pin)
      if (!role) {
        setPinError('Неверный ПИН-код.')
      } else if (native && role !== 'Master' && role !== 'Worker') {
        setPinError('Эта роль доступна только в веб-панели.')
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setPinBusy(false)
    }
  }

  /** Обычный вход по email и паролю — для реальных аккаунтов. */
  async function submitEmail(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setLocalError(null)
    try {
      await signIn(email, password)
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
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-4">
            {roles.map(({ role, label }) => (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => { void enterAs(role) }}
                className="w-full border border-neutral-900 bg-white px-6 py-4 text-lg font-medium transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {shownError && (
            <p role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {shownError}
            </p>
          )}

          {/* Вход по ПИН-коду (PDF §9 п.5) — только в демо-режиме. */}
          {isDemoMode && (
            <>
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
            </>
          )}

          {/* Обычный вход по email — для реальных аккаунтов (без регистрации). */}
          {!isDemoMode && (
            showEmail ? (
              <form onSubmit={submitEmail} noValidate className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full border border-neutral-900 bg-neutral-900 px-6 py-3 font-medium text-white transition-colors hover:bg-white hover:text-neutral-900 disabled:opacity-50"
                >
                  {busy ? 'Секунду…' : 'Войти'}
                </button>
                <p className="text-center text-xs text-neutral-400">
                  Роль назначается в БД (public.profiles.role): по умолчанию — Исполнитель,
                  первый пользователь — Мастер; веб-роли выдаются SQL-ом (set_user_role).
                </p>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowEmail(true)}
                className="text-center text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                Войти по email и паролю
              </button>
            )
          )}
        </div>
      </main>
    </div>
  )
}
