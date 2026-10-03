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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss({
      // Путь до корневого CSS. Если таких нет, применяем src/index.css.
      config: {
        content: {
          files: [
            'src/**/*.tsx',
            'src/**/*.ts',
            'src/**/*.jsx',
            'src/**/*.js',
          ],
        },
        theme: {
          extend: {
            fontFamily: {
              sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
            },
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        safelist: [],
        // Path to the CSS file to process. If not set, @tailwindcss/node
        // looks for node_modules/tailwindcss/index.css; we override that.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // @ts-expect-error - path is optional for the plugin
        process: {
          main: ['src/index.css'],
        },
      },
    }),
  ],
})

// Список файлов схемы БД для проверки типа при сборке.
export const supabaseSchemaFiles = ['src/lib/supabase/schema.ts'] as const
export type SupabaseSchemaFile = (typeof supabaseSchemaFiles)[number]
