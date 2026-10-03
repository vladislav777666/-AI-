import { isSupabaseConfigured, supabase } from './supabase'

export type Role = 'Master' | 'Worker'

/**
 * Демо-пароль для режима заглушки (когда Supabase не подключён).
 * В режиме Supabase пароли хранятся в таблице public.demo_accounts (bcrypt).
 */
export const MOCK_PASSWORD = '1234'

function mockLogin(password: string): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(password === MOCK_PASSWORD), 600)
  })
}

/**
 * Проверка роли и пароля.
 * - Supabase настроен → RPC login_with_role(p_role, p_password) (см. supabase/migrations).
 * - Ключей нет → локальная заглушка.
 * Бросает Error при недоступности сети/базы — вызывающая стор показывает сообщение.
 */
export async function loginWithRole(role: Role, password: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return mockLogin(password)
  }

  const { data, error } = await supabase.rpc('login_with_role', {
    p_role: role,
    p_password: password,
  })

  if (error) {
    // PGRST202: RPC ещё не создан (миграция не выполнена) → работаем на заглушке.
    if (error.code === 'PGRST202') {
      console.warn('[auth] login_with_role not found in Supabase, using mock login. Run supabase/migrations/0001_auth_by_role.sql.')
      return mockLogin(password)
    }
    throw new Error(error.message)
  }

  return Boolean(data)
}
