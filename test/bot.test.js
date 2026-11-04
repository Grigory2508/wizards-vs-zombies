import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite, SqliteStore } from '../src/node/sqlite-store.js';
import { Game } from '../src/server/game.js';
import { createBot } from '../src/server/bot.js';

const ADMIN = 100;
const USER = 200;

function setup() {
  const game = new Game(new SqliteStore(openSqlite(':memory:')));
  const env = { adminIds: [ADMIN], webAppUrl: 'https://game.example' };
  const bot = createBot({ token: '1:TEST', env, game });
  // Снимок настроек на момент проверки
  const config = { topic: async (t) => (await game.config.load()).topic(t), settings: async () => (await game.config.load()).settings() };
  bot.botInfo = { id: 1, is_bot: true, first_name: 'Bot', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
  const calls = [];
  // Подменяем Telegram API: записываем вызовы и отвечаем успехом
  bot.api.config.use(async (prev, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } : true };
  });
  let uid = 1;
  const from = (id) => ({ id, is_bot: false, first_name: id === ADMIN ? 'Админ' : 'Петя' });
  const send = (id, text) =>
    bot.handleUpdate({
      update_id: uid++,
      message: { message_id: uid, date: 0, chat: { id, type: 'private' }, from: from(id), text, entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : [] },
    });
  const click = (id, data) =>
    bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: from(id), chat_instance: 'x', data, message: { message_id: 5, date: 0, chat: { id, type: 'private' }, text: 'x' } },
    });
  return { bot, calls, send, click, config };
}

const last = (calls, method) => calls.filter((c) => c.method === method).at(-1)?.payload;
const buttons = (payload) => payload.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);

test('обычный пользователь получает кнопку игры и не видит админку', async () => {
  const { calls, send, click, config } = setup();
  await send(USER, '/start');
  const msg = last(calls, 'sendMessage');
  assert.equal(msg.reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example');
  assert.ok(!msg.text.includes('/admin'));
  const n = calls.length;
  await send(USER, '/admin');
  assert.equal(calls.length, n, 'на /admin не-админу бот молчит');
  const before = await config.topic('addsub');
  await click(USER, 'e:addsub:1:max:10');
  assert.deepEqual(await config.topic('addsub'), before, 'чужой клик не меняет настройки');
  assert.equal(last(calls, 'answerCallbackQuery').text, 'Нет доступа');
});

test('админ меняет параметры уровня кнопками', async () => {
  const { calls, send, click, config } = setup();
  await send(ADMIN, '/admin');
  assert.ok(buttons(last(calls, 'sendMessage')).includes('topics'));

  await click(ADMIN, 'tr:addsub:1');
  const tierScreen = last(calls, 'editMessageText');
  assert.ok(tierScreen.text.includes('уровень 1'));
  assert.ok(buttons(tierScreen).includes('e:addsub:1:max:10'));

  await click(ADMIN, 'e:addsub:1:max:10');
  assert.equal((await config.topic('addsub'))[0].max, 20);
  await click(ADMIN, 'e:addsub:1:carry:t');
  assert.equal((await config.topic('addsub'))[0].carry, true);
  await click(ADMIN, 'e:addsub:1:ops:c');
  assert.equal((await config.topic('addsub'))[0].ops, '-');
  await click(ADMIN, 'e:mult:2:tables:s7');
  assert.deepEqual((await config.topic('mult'))[1].tables, [2, 3, 7]);

  // Граница: меньше минимума не уходит
  for (let i = 0; i < 5; i++) await click(ADMIN, 'e:addsub:1:max:-10');
  assert.equal((await config.topic('addsub'))[0].max, 5);

  // Откат последнего изменения
  const beforeUndo = (await config.topic('mult'))[1].tables;
  await send(ADMIN, '/undo');
  assert.equal((await config.topic('addsub'))[0].max, 10, 'откатилось последнее изменение (−10 от 15→5 обратно)');
  assert.deepEqual((await config.topic('mult'))[1].tables, beforeUndo);
});

test('админ: уровни, классы, адаптивность, превью, статистика, экспорт', async () => {
  const { calls, send, click, config } = setup();
  await click(ADMIN, 'ta:compare');
  assert.equal((await config.topic('compare')).length, 6);
  await click(ADMIN, 'td:compare');
  assert.equal((await config.topic('compare')).length, 5);

  await click(ADMIN, 'ge:1:mult:1');
  assert.equal((await config.settings()).grades[1].mult, 1);
  await click(ADMIN, 'ge:1:addsub:-1');
  assert.equal((await config.settings()).grades[1].addsub, 1, 'сложение нельзя выключить');

  await click(ADMIN, 'ae:adaptUp:-0.05');
  assert.equal((await config.settings()).adaptUp, 0.8);

  await send(ADMIN, '/preview mult 3');
  const preview = last(calls, 'sendMessage').text;
  assert.equal((preview.match(/<code>/g) || []).length, 10);

  await send(ADMIN, '/stats');
  assert.ok(last(calls, 'sendMessage').text.includes('Статистика'));
  await send(ADMIN, '/log');
  assert.ok(last(calls, 'sendMessage').text.includes('ae') || last(calls, 'sendMessage').text.includes('settings'));
  await send(ADMIN, '/export');
  assert.ok(calls.some((c) => c.method === 'sendDocument'));
});
