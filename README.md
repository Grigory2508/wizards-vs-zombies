# 🧙‍♂️ Волшебники против Зомби

Математическая tower-defense игра для начальной школы — Telegram Mini App.
Ребёнок защищает замок от волн зомби: верные ответы на примеры дают ману, мана тратится на карты-заклинания.
Между ночами волшебник и замок прокачиваются. Сложность заданий настраивается в админ-боте.

**Запуск в Telegram (для владельца, простыми словами): [docs/SETUP.md](docs/SETUP.md).**

## Устройство

По техническому стандарту игр проекта (эталон — `coffee-for-two`):

- **Клиент** — статический сайт на **GitHub Pages** (`public/` + ядро `src/core` в `shared/`), бой на Canvas.
- **Сервер** — **Supabase**: Postgres + Edge Functions `api` (команды игры) и `bot` (админ-бот на вебхуке).
- **Ядро** `src/core` — чистые функции: баланс, симуляция боя, генератор заданий, правила игрока (`player.js` с `migratePlayer`).
  Один и тот же код в браузере, на локальном сервере (Node) и в Supabase (Deno).
- **Сервер игры** `src/server` — поверх любого хранилища (контракт в начале `game.js`): игрок — один JSON-документ
  с версией (оптимистичная блокировка), задания боя и правильные ответы хранятся только на сервере, награды считает сервер.
- **CI/CD** — GitHub Actions: `pages.yml` (тесты → сценарии на Postgres → gh-pages), `server.yml` (функции, вебхук, меню бота),
  `keepalive.yml` (чтобы бесплатный Supabase не засыпал).

```
src/core/          ядро (общее для клиента и сервера)
src/server/        сервер игры (game.js) и админ-бот (bot.js) — общие для Node и Supabase
src/node/          локальный сервер для разработки: Fastify + SQLite + бот на long polling
public/            клиент: index.html, style.css, js/ (экраны, бой, отрисовка), art/ (WebP)
supabase/          migrations/ (SQL), functions/api|bot, functions/_shared (копия src/core и src/server)
scripts/           sync-server, build-pages, bot-setup, botfather-image
tools/             арт (process-art), скриншоты, симуляция баланса
test/              тесты Node; test/scenarios.js — сценарии сервера, общие для SQLite и Postgres
art/               промпты и контракт на арт; art/raw — исходники генераций (в git не коммитятся)
```

## Разработка

Нужен Node.js 22.13+.

```bash
npm install
```
```bash
cp .env.example .env
```
В `.env` поставьте `DEV_MODE=1`, затем:
```bash
npm start
```
Игра — http://localhost:3000/?dev=1 (`?dev=2`, `?dev=3` — другие тестовые игроки). С `BOT_TOKEN` в `.env` локально работает и бот.

После любой правки `src/core` или `src/server`:
```bash
npm run sync-server
```
(CI проверяет, что копия в `supabase/functions/_shared` совпадает.)

### Проверки
- `npm test` — ядро, сервер на SQLite, бот, арт, баланс.
- `npm run test:pg` — те же сценарии сервера на Postgres (нужны Postgres с миграцией и `node supabase/tests/postgrest-lite.mjs`; в CI это делает `pages.yml`).
- `node tools/screenshots.mjs` — прогон игры в браузере и скриншоты всех экранов.
- `npm run balance` — симуляция кампании «ребёнком» (5 с на ответ, точность 80%).
- `npm run build` — сборка сайта в `dist/` (как на GitHub Pages).

### Арт
Промпты и контракт — `art/PROMPTS.md`, `art/assets.js`. Исходники кладутся в `art/raw/`, затем `npm run art` вырезает фон, обрезает и сохраняет WebP в `public/art/` с меткой версии в `manifest.json`.

## Сложность заданий (админ-бот)

`/admin` в боте (только для `ADMIN_IDS`): темы и уровни (диапазоны чисел, действия, переход через десяток, таблицы умножения…),
стартовые уровни по классам, пороги адаптивности, статистика точности, журнал изменений с `/undo`, экспорт/импорт JSON.
