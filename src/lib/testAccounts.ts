// Тестовые аккаунты для быстрого входа по роли (демонстрация и защита).
//
// Аккаунты создаются в Supabase Auth (Admin API) и наполняются демо-набором
// из supabase/migrations/0011_demo_seed.sql. Пароль — демонстрационный,
// он публичный по замыслу: это витрина, а не боевой доступ.
//
// Роли Master / Head / Admin открывают веб-панели, Worker — кабинет исполнителя
// (worker@naryad.app связан со строкой сотрудника «Типо Исполнитель»).

import type { Role } from './types'

export const TEST_PASSWORD = 'naryad123'

export const TEST_ACCOUNTS: Record<Role, string> = {
  Master: 'master@naryad.app',
  Worker: 'worker@naryad.app',
  Head: 'head@naryad.app',
  Admin: 'admin@naryad.app',
}
