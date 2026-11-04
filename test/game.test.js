import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openSqlite, SqliteStore } from '../src/node/sqlite-store.js';
import { Game } from '../src/server/game.js';
import { migratePlayer } from '../src/core/player.js';
import { generateBatch, DEFAULT_TOPICS, validateParams, validateSettings, DEFAULT_SETTINGS } from '../src/core/problems.js';
import { validateInitData } from '../src/node/auth.js';
import { scenarios } from './scenarios.js';

/** Игра на SQLite в памяти + прямое изменение сохранённого игрока для подготовки сценариев */
export function setup() {
  const db = openSqlite(':memory:');
  const store = new SqliteStore(db);
  const game = new Game(store);
  const patch = async (tgId, fn) => {
    const row = await store.getPlayer(tgId);
    const state = structuredClone(row.state);
    fn(state);
    assert.ok(await store.updatePlayer(tgId, state, row.version));
  };
  return { db, store, game, patch };
}

for (const [name, run] of scenarios) test(`сервер (SQLite): ${name}`, () => run(setup()));

test('задания: правильный ответ всегда среди вариантов, без повторов вариантов', () => {
  for (const [topic, tiers] of Object.entries(DEFAULT_TOPICS)) {
    for (const params of tiers) {
      for (const p of generateBatch(topic, params, 300)) {
        assert.ok(p.options.includes(p.answer), `${topic}: ${p.q} -> ${p.answer} / ${p.options}`);
        assert.equal(new Set(p.options).size, p.options.length, `дубли в вариантах: ${p.options}`);
        assert.ok(p.options.every((o) => !String(o).startsWith('-')), 'отрицательные варианты');
      }
    }
  }
});

test('задания: соблюдаются ограничения уровня', () => {
  for (const p of generateBatch('addsub', { max: 10, ops: '+', carry: false }, 300)) {
    const [a, b] = p.q.match(/\d+/g).map(Number);
    assert.ok(p.q.includes('+') && a + b <= 10 && Number(p.answer) === a + b, p.q);
  }
  for (const p of generateBatch('addsub', { max: 20, ops: '+-', carry: false }, 300)) {
    const [a, b] = p.q.match(/\d+/g).map(Number);
    if (p.q.includes('+')) assert.ok((a % 10) + (b % 10) < 10, `переход через десяток: ${p.q}`);
    else assert.ok(a % 10 >= b % 10, `заём: ${p.q}`);
  }
  for (const p of generateBatch('mult', { tables: [3], maxFactor: 5, missing: false, division: false }, 200)) {
    const [a, b] = p.q.match(/\d+/g).map(Number);
    assert.ok((a === 3 && b <= 5) || (b === 3 && a <= 5), p.q);
  }
});

test('валидация параметров', () => {
  assert.throws(() => validateParams('addsub', { max: 2, ops: '+', carry: false }));
  assert.throws(() => validateParams('mult', { tables: [], maxFactor: 5, missing: false, division: false }));
  assert.deepEqual(validateParams('mult', { tables: [3, 2, 3], maxFactor: 5, missing: false, division: false }).tables, [2, 3]);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, adaptUp: 0.4, adaptDown: 0.5 }));
});

test('проверка подписи initData', () => {
  const token = '123:ABC';
  const user = JSON.stringify({ id: 42, first_name: 'Маша' });
  const auth_date = String(Math.floor(Date.now() / 1000));
  const fields = { auth_date, query_id: 'q1', user };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  const initData = new URLSearchParams({ ...fields, hash }).toString();
  assert.equal(validateInitData(initData, token).id, 42);
  assert.equal(validateInitData(initData, '999:WRONG'), null);
  assert.equal(validateInitData(initData.replace('42', '43'), token), null);
});

test('старая база первой версии (игрок по колонкам) переносится в новый формат', () => {
  const file = ':memory:';
  const db = openSqlite(file);
  // Имитируем старую схему на отдельной базе
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const old = new DatabaseSync(':memory:');
  old.exec(`CREATE TABLE players (tg_id INTEGER PRIMARY KEY, name TEXT, grade INTEGER, level INTEGER, xp INTEGER, gold INTEGER, wave INTEGER,
    buildings TEXT, skills TEXT, best_wave INTEGER, created_at INTEGER, updated_at INTEGER, deck TEXT);
    INSERT INTO players VALUES (5, 'Петя', 2, 3, 10, 77, 4, '{"walls":2,"tower":1,"library":1,"treasury":1}', '{}', 3, 0, 0, '["fireball","fireball"]');
    CREATE TABLE battles (id INTEGER PRIMARY KEY, tg_id INTEGER, wave INTEGER, problems TEXT, tiers TEXT, started_at INTEGER);`);
  db.close();
  return import('node:fs').then(({ mkdtempSync }) => {
    const dir = mkdtempSync(`${process.env.TMPDIR || '/tmp'}/wvz-`);
    const path = `${dir}/old.db`;
    old.exec(`VACUUM INTO '${path}'`);
    const store = new SqliteStore(openSqlite(path));
    return store.getPlayer(5).then((row) => {
      const p = migratePlayer(row.state);
      assert.equal(p.name, 'Петя');
      assert.equal(p.gold, 77);
      assert.equal(p.bestWave, 3);
      assert.equal(p.buildings.walls, 2);
      assert.deepEqual(p.deck, ['fireball', 'ice']);
    });
  });
});
