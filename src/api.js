import { validateInitData } from './auth.js';
import { GameError } from './game.js';

export function registerApi(app, { game, env }) {
  // Авторизация: заголовок "Authorization: tma <initData>" (или "dev <id>" в режиме разработки)
  app.decorateRequest('player', null);
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const [scheme, ...rest] = (req.headers.authorization || '').split(' ');
    const value = rest.join(' ');
    let user = null;
    if (scheme === 'tma') user = validateInitData(value, env.botToken);
    else if (scheme === 'dev' && env.devMode) user = { id: Number(value) || 1, first_name: 'Тестовый маг' };
    if (!user) return reply.code(401).send({ error: 'Откройте игру через Telegram' });
    req.player = game.getOrCreatePlayer(user);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof GameError) return reply.code(400).send({ error: err.message });
    req.log.error(err);
    reply.code(err.statusCode || 500).send({ error: 'Ошибка сервера' });
  });

  app.get('/api/state', async (req) => game.publicState(req.player));

  app.post('/api/grade', async (req) => game.publicState(game.setGrade(req.player, Number(req.body?.grade))));

  app.post('/api/upgrade', async (req) => game.publicState(game.upgrade(req.player, String(req.body?.building))));

  app.post('/api/deck', async (req) => game.publicState(game.setDeck(req.player, req.body?.deck)));

  app.post('/api/battle/start', async (req) => game.startBattle(req.player));

  app.post('/api/battle/finish', async (req) => {
    const result = game.finishBattle(req.player, req.body || {});
    return { result, state: game.publicState(req.player) };
  });
}
