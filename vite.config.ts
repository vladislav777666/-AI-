import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})

/** Список файлов схемы БД для проверки типа при сборке. */
export const supabaseSchemaFiles = ['src/lib/supabase/schema.ts'] as const
export type SupabaseSchemaFile = (typeof supabaseSchemaFiles)[number]
