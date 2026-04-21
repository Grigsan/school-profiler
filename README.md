# School Profiler (PostgreSQL persistence)

Приложение переведено на **entity-scoped хранение в PostgreSQL**. Глобальный `state.json` и глобальная ревизия больше не используются как runtime persistence для ученических действий.

## Новая архитектура

- Источник истины: PostgreSQL.
- Данные разбиты по сущностям: `Child`, `AccessCode`, `Session`, `Answer`, `SpecialistReview`, `SystemMeta`.
- Ученические действия пишутся точечно в конкретную сессию:
  - `POST /api/student/login`
  - `POST /api/student/start`
  - `GET /api/session/:id`
  - `POST /api/session/:id/answer`
  - `POST /api/session/:id/pause`
  - `POST /api/session/:id/complete`
- Админские действия вынесены в отдельные endpoint’ы:
  - `GET /api/admin/dashboard`
  - `POST /api/admin/review/:sessionId`
  - `POST /api/admin/session/:sessionId/reset`
  - `POST /api/admin/session/:sessionId/reopen`
  - `POST /api/admin/import`
  - `POST /api/admin/reset`

## Команды

```bash
npm run lint
npm run build
npm run prisma:generate
npm run state:reset
npm run state:backup
```

## Примечание

`PUT /api/state` отключён (410 Gone), чтобы исключить архитектурно неверную глобальную перезапись всего приложения.
