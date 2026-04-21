# School Profiler (production-like server mode)

Приложение переведено с browser-localStorage на **центральное серверное хранение** (`data/state.json`), чтобы дети могли продолжать работу с разных устройств и видеть общий актуальный статус.

## Что изменилось

- Админ PIN теперь берётся из `ADMIN_PIN` (по умолчанию `69760626`).
- Источник истины — серверное состояние (`/api/state`), а не localStorage браузера.
- Добавлен контроль ревизий (optimistic concurrency), чтобы снизить риск потери данных при параллельной работе.
- Добавлены команды безопасного сброса и резервного копирования серверного состояния.
- Подготовлены Docker / docker-compose и пример Nginx-конфига для HTTPS reverse proxy.
- Добавлен каркас Prisma-схемы и миграции для PostgreSQL-переезда (`prisma/`).

## Быстрый старт (Ubuntu / Linux)

```bash
cp .env.example .env
npm ci
npm run state:reset
npm run dev
```

Открыть: `http://localhost:3000`

## Production (без Docker)

```bash
cp .env.example .env
npm ci
npm run build
npm run state:reset
npm run start
```

## Production (Docker Compose)

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

## Основные команды

```bash
# Линт
npm run lint

# Production build
npm run build

# Чистый старт (сброс всех данных, кроме фиксированных классов 4А/4Б/6А/6Б)
npm run state:reset

# Локальный backup серверного состояния
npm run state:backup
```

## Импорт/рабочий цикл после деплоя

1. Выполнить `npm run state:reset` (чистая база).
2. Войти администратором (PIN из `ADMIN_PIN`).
3. Импортировать реестр учащихся с `access_code`.
4. Ученики заходят по своим кодам с любых устройств.
5. Данные сессий и прогресса сразу сохраняются в общее серверное состояние.

## Reset/backup для эксплуатации

- Сброс: `npm run state:reset`
- Backup: `npm run state:backup`
- API reset (только при активной admin cookie): `DELETE /api/state`

## PostgreSQL / Prisma подготовка

В репозитории добавлены:

- `prisma/schema.prisma`
- `prisma/migrations/20260421000000_init/migration.sql`

Команды для дальнейшего полного перехода на PostgreSQL:

```bash
npx prisma generate
npx prisma migrate deploy
```

## Reverse proxy (HTTPS)

Пример Nginx: `deploy/nginx.conf`.

Рекомендуется:

1. Выпустить сертификат Let's Encrypt (`certbot`).
2. Включить `proxy_set_header X-Forwarded-Proto $scheme`.
3. Пробрасывать только HTTPS наружу.

## Переменные окружения

См. `.env.example`.

Критичные:

- `ADMIN_PIN=69760626`
- `SESSION_SECRET=<случайная длинная строка>`
