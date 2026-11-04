// Локальный сервер для разработки: отдаёт клиент, принимает команды игры на /api
// и запускает бота в режиме long polling. В продакшене то же самое делают
// GitHub Pages (клиент) и Supabase Edge Functions (api, bot).
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { openSqlite, SqliteStore } from './sqlite-store.js';
import { Game, GameError, handleOp } from '../server/game.js';
import { createBot, setupBot } from '../server/bot.js';
import { validateInitData } from './auth.js';

const game = new Game(new SqliteStore(openSqlite(env.dbFile)));
const app = Fastify({ logger: { level: 'warn' } });

const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../../public', import.meta.url)),
  cacheControl: false, // заголовок ставим сами
  // У картинок в адресе метка содержимого (см. manifest.json), их можно хранить в кэше навсегда
  setHeaders: (res, filePath) => (/[\\/]art[\\/](?!manifest\.json$)/.test(filePath) ? res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') : noCache(res)),
});
// Общее ядро игры: в браузере оно лежит по адресу /shared/ (на GitHub Pages его туда копирует сборка)
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../core', import.meta.url)),
  prefix: '/shared/',
  decorateReply: false,
  cacheControl: false,
  setHeaders: noCache,
});
// Настройки клиента: локально API на этом же сервере
app.get('/config.js', (req, reply) => {
  reply.type('text/javascript').header('Cache-Control', 'no-cache').send(`window.WVZ_CONFIG = ${JSON.stringify({ apiUrl: 'api', devMode: env.devMode })};`);
});

app.post('/api', async (req, reply) => {
  let user = validateInitData(req.headers['x-telegram-init-data'], env.botToken);
  if (!user && env.devMode && req.headers['x-dev-user']) user = { id: Number(req.headers['x-dev-user']) || 1, first_name: 'Тестовый маг' };
  if (!user) return reply.code(401).send({ error: 'Откройте игру через Telegram' });
  try {
    return await handleOp(game, user, req.body ?? {});
  } catch (e) {
    if (e instanceof GameError) return reply.code(400).send({ error: e.message });
    req.log.error(e);
    return reply.code(500).send({ error: 'Ошибка сервера' });
  }
});

await app.listen({ port: env.port, host: env.host });
console.log(`Игра: http://localhost:${env.port}/${env.devMode ? '?dev=1' : ''}`);

if (env.botToken) {
  const bot = createBot({ token: env.botToken, env, game });
  bot.catch((err) => console.error('bot error', err));
  await setupBot(bot.api, env);
  bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
  const stop = () => {
    bot.stop();
    app.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  console.warn('BOT_TOKEN не задан — бот не запущен, вход через Telegram не работает (для игры в браузере: DEV_MODE=1)');
}
