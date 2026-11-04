import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { env } from './config.js';
import { openDb, ConfigStore } from './db.js';
import { Game } from './game.js';
import { registerApi } from './api.js';
import { createBot } from './bot.js';

const db = openDb(env.dbFile);
const config = new ConfigStore(db);
const game = new Game(db, config);

const app = Fastify({ logger: { level: 'info' } });
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL('../public', import.meta.url)),
  cacheControl: false, // заголовок ставим сами
  // У картинок в адресе метка содержимого (см. manifest.json), их можно хранить в кэше навсегда
  setHeaders: (res, filePath) => res.setHeader('Cache-Control', /[\\/]art[\\/](?!manifest\.json$)/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache'),
});
registerApi(app, { game, env });
await app.listen({ port: env.port, host: env.host });

if (env.botToken) {
  const bot = createBot({ token: env.botToken, env, config, game });
  bot.catch((err) => app.log.error(err, 'bot error'));
  bot.start({ onStart: (me) => app.log.info(`Бот @${me.username} запущен`) });
  const stop = () => { bot.stop(); app.close(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  app.log.warn('BOT_TOKEN не задан — бот не запущен, авторизация через Telegram не работает (используйте DEV_MODE=1)');
}
