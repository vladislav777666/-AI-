import { useState, type FormEvent } from 'react'
import { loginWithRole, MOCK_PASSWORD, type Role } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'

type Step = 'role' | 'password' | 'success'

const ROLE_LABELS: Record<Role, string> = {
  Master: 'Мастер',
  Worker: 'Исполнитель',
}

export default function App() {
  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<Role | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function selectRole(next: Role) {
    setRole(next)
    setPassword('')
    setError(null)
    setStep('password')
  }

  function goBack() {
    setPassword('')
    setError(null)
    setStep('role')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || !role) return

    setError(null)
    setLoading(true)
    try {
      const ok = await loginWithRole(role, password)
      if (ok) {
        setStep('success')
      } else {
        setError('Неверный пароль. Попробуйте ещё раз.')
      }
    } catch (err) {
      setError(err instanceof Error ? `Ошибка связи: ${err.message}` : 'Ошибка связи с сервером.')
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    setPassword('')
    setError(null)
    setRole(null)
    setStep('role')
  }

  return (
    <div className="flex min-h-svh flex-col bg-white text-neutral-900">
      <header className="px-6 pt-10 sm:pt-16">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Вход</h1>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        {step === 'role' && (
          <div className="flex w-full max-w-sm flex-col gap-4">
            <p className="mb-2 text-center text-sm text-neutral-500">Выберите роль</p>

            {(Object.keys(ROLE_LABELS) as Role[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectRole(key)}
                className="w-full border border-neutral-900 bg-white px-6 py-4 text-lg font-medium text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:bg-neutral-900 active:text-white"
              >
                {ROLE_LABELS[key]}
              </button>
            ))}
          </div>
        )}

        {step === 'password' && role && (
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-sm flex-col gap-4"
            noValidate
          >
            <div className="mb-2 text-center">
              <p className="text-sm text-neutral-500">Вы вошли как</p>
              <p className="text-lg font-medium">{ROLE_LABELS[role]}</p>
            </div>

            <label htmlFor="password" className="sr-only">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full border border-neutral-900 bg-white px-4 py-4 text-lg placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-2 focus:outline-neutral-900"
            />

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || password.length === 0}
              className="w-full border border-neutral-900 bg-neutral-900 px-6 py-4 text-lg font-medium text-white transition-colors hover:bg-white hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300 disabled:text-neutral-500"
            >
              {loading ? 'Входим…' : 'Войти'}
            </button>

            <button
              type="button"
              onClick={goBack}
              className="w-full px-6 py-2 text-base text-neutral-500 underline-offset-4 transition-colors hover:text-neutral-900 hover:underline"
            >
              Назад
            </button>
          </form>
        )}

        {step === 'success' && role && (
          <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center border border-neutral-900 text-2xl">
              ✓
            </div>
            <p className="text-xl font-medium">Вы вошли как «{ROLE_LABELS[role]}»</p>
            <p className="text-sm text-neutral-500">Авторизация пройдена успешно.</p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 w-full border border-neutral-900 bg-white px-6 py-4 text-lg font-medium transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              Выйти
            </button>
          </div>
        )}
      </main>

      <footer className="px-6 pb-6 text-center text-xs text-neutral-400 sm:pb-8">
        {isSupabaseConfigured ? 'Supabase подключён' : `Демо-пароль: ${MOCK_PASSWORD}`}
      </footer>
    </div>
  )
}
