import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// vite.config.ts — корректная настройка Tailwind 4 для Vite 8.
//
// Плагин tailwindcss читает конфигурацию через @tailwindcss/node, который
// ищет корневой файл стилей внутри node_modules/tailwindcss/index.css.
// Если в проекте его нет (или меняем локальный index.css), явно указываем
// путь до src/index.css. Это устраняет ENOENT при запуске tailwindcss v4
// на проекте с Vite 8 и без node_modules.
//
// В нынешней версии плагина (4.3.x) тип PluginOptions = { optimize? } не
// содержит content/theme. Передача этих полей вызывает TS2530/TS2353
// (unknown properties) и ENOENT при генерации/серверах. Поэтому мы оставляем
// вызов без опций; тему и содержимое выносим в обычный конфиг
// tailwindcss (создаём src/tailwind.config.ts), который подключается
// @import "tailwindcss" в src/index.css.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss({ optimize: true }),
  ],
})

// Список файлов схемы БД для проверки типа при сборке.
export const supabaseSchemaFiles = ['src/lib/supabase/schema.ts'] as const
export type SupabaseSchemaFile = (typeof supabaseSchemaFiles)[number]
