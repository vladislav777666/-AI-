# Infisical: секреты вместо `.env`

План перевода проекта (`auth-screen`) с хранения секретов в файлах `.env*` на
централизованное хранение в [Infisical](https://app.infisical.com). Приложение
по-прежнему читает переменные окружения как раньше, поэтому код не меняется.

## 1. Что это за проект

- Язык/стек: TypeScript, React 19, Vite 8, Tailwind CSS 4, Capacitor 8 (Android).
- Команда запуска: `npm run dev` (Vite dev-сервер).
- Сборка: `npm run build` (`tsc && vite build`), Android: `npm run android:sync`.
- CI/CD: GitHub Actions, workflow `.github/workflows/android.yml` собирает debug APK на push в `main`.

## 2. Переменные, которые читает приложение

Читаются в [`src/lib/supabase.ts`](src/lib/supabase.ts) (значения в чат не выводятся):

| Переменная | Назначение |
| --- | --- |
| `VITE_SUPABASE_URL` | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | Публичный (anon/publishable) ключ Supabase |

Шаблон с пустыми значениями лежит в [`.env.example`](.env.example).
Поскольку переменные с префиксом `VITE_` попадают в клиентский бандл, они
публичны по определению. Секретный `service_role`/secret-ключ нельзя класть
в переменную `VITE_*` — он не должен попадать в APK.

## 3. Способ доставки

Для этого репозитория нужны два канала:

1. Локальная разработка — CLI `infisical run` вокруг команды запуска (сделано).
2. CI/CD (GitHub Actions) — Machine Identity + Universal Auth через
   `Infisical/secrets-action` (см. шаг 7, часть для CI).

Kubernetes/продакшн-серверов здесь нет, поэтому эти варианты не нужны.

## 4. Создать аккаунт и проект

1. Зарегистрироваться: https://app.infisical.com
2. `Secrets Management` → `+ Add New Project`, имя проекта — по сервису
   (например, `auth-screen`). В проекте сразу есть окружения
   `Development` / `Staging` / `Production`.
3. Перетащить существующий файл `.env` на страницу Secrets Overview, чтобы
   импортировать переменные пачкой. Целевое окружение — `Development`.

## 5. Установить CLI и войти (локальная машина, Windows)

```powershell
winget install infisical
# либо: npm install -g @infisical/cli
infisical --version

infisical login
# без браузера (WSL2, Codespaces, remote SSH): infisical login -i
```

## 6. Привязать репозиторий

```powershell
infisical init
```

`infisical init` запишет `.infisical.json` (`workspaceId`, `defaultEnvironment`).
Файл не содержит секретов и его безопасно коммитить.

## 7. Доставка секретов

Локально команда запуска уже обёрнута в [`package.json`](package.json):

```jsonc
"dev": "infisical run --env=dev -- vite"
```

Vite берёт переменные из окружения процесса, поэтому `infisical run` подхватывается
без изменений в коде. Для ручной сборки локально: `infisical run --env=dev -- npm run build`.

Для CI (GitHub Actions) добавьте в `.github/workflows/android.yml` перед шагом
`Build web app` (изменения CI не вносятся этим запуском — вставьте вручную):

```yaml
      - name: Fetch secrets from Infisical
        uses: Infisical/secrets-action@v1.0.18
        with:
          method: "universal"
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          project-slug: ${{ vars.INFISICAL_PROJECT_SLUG }}
          env-slug: "prod"
```

## 8. Проверка

1. Запустить `npm run dev` — приложение стартует, Supabase подключается.
2. Переименовать локальный `.env` в `.env.backup`.
3. Снова `npm run dev` — приложение должно стартовать, что доказывает: секреты
   приходят из Infisical, а не с диска.

## 9. Очистка

- `.gitignore` уже обновлён: игнорируются `.env`, `.env.*`, кроме `.env.example`.
- Если `.env.production` уже закоммичен, убрать его из индекса (значения не
  удаляются с диска): `git rm --cached .env.production`.
- Если секреты когда-либо попадали в коммиты — их нужно отозвать и
  перегенерировать: история git их хранит. Проверить утечки:
  https://infisical.com/docs/cli/scanning-overview
- Никогда не коммитить и не печатать реальные значения секретов.

## Шаги, которые остаются за вами

`infisical init` и `infisical login` требуют аккаунта и установки CLI — выполнить
пункты 4–6, затем вставьте CI-шаг из п. 7, создайте Machine Identity (Universal
Auth) и добавьте в GitHub: secrets `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`
и variable `INFISICAL_PROJECT_SLUG`.
