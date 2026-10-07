# «НарядAI»

«Наряд выдан — ИИ на контроле»

Система выдачи и контроля нарядов: мастер выдаёт наряды с телефона, исполнители получают и
закрывают их, ИИ следит за сроками, проверяет выполнение, ищет аномалии и считает рейтинг.
Кейс №1, Qostanai Industry Hackathon 2026.

## Стек

React 19 · TypeScript (strict) · Vite 8 · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime) ·
Capacitor 8 (Android) · NVIDIA NIM (ИИ).

## Быстрый старт (демо-режим, без ключей)

```bash
npm install
npx vite            # http://localhost:5173
```

Без переменных окружения приложение работает в **демо-режиме**: данные и сессия хранятся в
`localStorage` браузера, доступны все роли, справочники и история за 3 месяца.

Тестовые **ПИН-коды** (ТЗ §9 п.5, §12):

| Роль | ПИН | Где доступна |
| --- | --- | --- |
| Мастер смены | `1111` | телефон + веб |
| Исполнитель | `2222` | телефон |
| Руководитель | `3333` | веб-панель |
| Администратор | `4444` | веб-панель |

Можно также войти кнопкой по роли или логином `master@` / `worker@` / `head@` / `admin@`
(пароль любой).

## Продакшн-режим (Supabase + NVIDIA NIM)

1. Скопируйте `.env.example` в `.env` и заполните:

```
VITE_SUPABASE_URL=...        # Supabase → Project Settings → API
VITE_SUPABASE_ANON_KEY=...   # публичный anon-ключ
VITE_NVIDIA_NIM_API_KEY=...  # ключ NVIDIA NIM (без него ИИ работает на локальных правилах)
VITE_NIM_MODEL=nvidia_nim/openai/gpt-oss-20b
VITE_ENABLE_THINKING=true
```

2. Примените схему БД (миграции `0001`–`0010`):

```bash
supabase link --project-ref <ref>
supabase db push
```

3. Запустите: `npm run dev` (обёрнут в `infisical run` — см. [INFISICAL.md](INFISICAL.md),
   либо используйте `npx vite` напрямую с локальным `.env`).

Секреты читаются только из окружения: реальные `.env*` в git не попадают (в индексе — лишь
`.env.example`). Секретный `service_role`-ключ в `VITE_*` класть нельзя — он попадёт в бандл.

## Сборка и проверки

```bash
npm run build        # tsc + сборка в dist/
npm run preview      # предпросмотр собранной версии
npm run test:offline # юнит-тесты офлайн-очереди и обезличивания (32 проверки)
npx tsc --noEmit     # проверка типов
```

## Android (APK)

```bash
npm run android:sync   # сборка веб-части + cap sync android
npm run android:open   # открыть проект в Android Studio
```

Либо через CI: `.github/workflows/android.yml` собирает debug и release APK на push в `main`
и выкладывает артефактами (требуются секреты Infisical — см. INFISICAL.md).

## Структура

```
src/
  lib/          данные, схема, синхронизация, ИИ, аналитика
  screens/
    master/     панель мастера: наряды, канбан, выдача, отчёты, ИИ, уведомления
    worker/     приложение исполнителя: очередь, действия, закрытие, оценки
    head/       веб-панель руководителя: дашборд, рейтинг, аномалии
    admin/      справочники: участки, оборудование, сотрудники, шифры, материалы
supabase/migrations/   схема БД и RLS-политики (0001–0010)
scripts/offline.test.ts
```

## Документы

- [ОТЧЁТ-аудит-Кейс-1.md](ОТЧЁТ-аудит-Кейс-1.md) — аудит соответствия ТЗ: матрица требований,
  проверки, допущения, внешние зависимости.
- [INFISICAL.md](INFISICAL.md) — вынос секретов в Infisical.
