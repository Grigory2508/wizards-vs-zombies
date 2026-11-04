// API игры: все действия игрока проходят здесь. Клиент шлёт { op, ... } с подписью Telegram
// в заголовке X-Telegram-Init-Data; сервер применяет ту же логику, что и локальный сервер
// (src/core, src/server → _shared, копируется `npm run sync-server`).
import { Game, GameError, handleOp } from '../_shared/server/game.js';
import { PgStore } from '../_shared/pg-store.ts';
import { verifyInitData } from '../_shared/telegram.ts';

const BOT_TOKEN = Deno.env.get('BOT_TOKEN') ?? '';
const game = new Game(new PgStore());

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-telegram-init-data',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const body = await req.json().catch(() => ({}));
  // Проверка, что сервер и база живы (её же дёргает keepalive, чтобы бесплатный проект Supabase не засыпал)
  if (body?.op === 'ping') {
    await game.config.load();
    return json({ ok: true });
  }

  const auth = await verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!auth) return json({ error: 'Откройте игру через Telegram' }, 401);

  try {
    return json(await handleOp(game, auth.user, body));
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Ошибка сервера' }, 500);
  }
});
