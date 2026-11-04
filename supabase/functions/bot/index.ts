// Админ-бот на вебхуке: Telegram сам присылает сюда сообщения (адрес и секрет ставит
// .github/workflows/server.yml). Логика бота та же, что локально: _shared/server/bot.js.
import { webhookCallback } from 'grammy';
import { createBot } from '../_shared/server/bot.js';
import { Game } from '../_shared/server/game.js';
import { PgStore } from '../_shared/pg-store.ts';

const TOKEN = Deno.env.get('BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const env = {
  adminIds: (Deno.env.get('ADMIN_IDS') ?? '').split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite),
  webAppUrl: Deno.env.get('WEBAPP_URL') ?? '',
};

// Сведения о боте известны заранее (имя задаёт CI) — не спрашиваем их у Telegram при каждом холодном старте
const USERNAME = Deno.env.get('BOT_USERNAME') ?? '';
const botInfo = USERNAME
  ? {
    id: Number(TOKEN.split(':')[0]), is_bot: true as const, first_name: USERNAME, username: USERNAME,
    can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
    can_connect_to_business: false, has_main_web_app: true,
  }
  : undefined;

const bot = createBot({ token: TOKEN, env, game: new Game(new PgStore()), botInfo });
bot.catch((err) => console.error('bot error', err));
// Секрет вебхука проверяем сами: так неверный секрет — это 401, а сбой при ответе пользователю — нет
const handle = webhookCallback(bot, 'std/http');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    return await handle(req);
  } catch (e) {
    // Ошибку записываем в лог, но отвечаем 200: иначе Telegram будет присылать то же сообщение снова и снова
    console.error('bot update failed', e);
    return new Response('ok');
  }
});
