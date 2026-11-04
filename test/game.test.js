import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDb, ConfigStore } from '../src/db.js';
import { Game } from '../src/game.js';
import { generateBatch, DEFAULT_TOPICS, validateParams, validateSettings, DEFAULT_SETTINGS } from '../src/problems.js';
import { validateInitData } from '../src/auth.js';
import { waveSummary, defaultDeck } from '../public/shared/balance.js';

const setup = () => {
  const db = openDb(':memory:');
  const config = new ConfigStore(db);
  return { db, config, game: new Game(db, config) };
};

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

test('бой: награды считаются сервером, подделка не проходит', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 1, first_name: 'Тест' });
  game.setGrade(p, 2);
  const b = game.startBattle(p);
  const list = b.problems.addsub;
  const answers = [
    { slot: 'addsub', i: 0, given: list[0].answer, ms: 2000 },
    { slot: 'addsub', i: 1, given: list[1].answer, ms: 2000 },
    { slot: 'addsub', i: 2, given: 'неправильно', ms: 2000 },
  ];
  const r = game.finishBattle(p, { battleId: b.battleId, victory: true, kills: { walker: 9999, boss: 5 }, answers });
  const total = Object.values(waveSummary(1)).reduce((a, c) => a + c, 0);
  assert.equal(r.correct, 2);
  assert.equal(r.total, 3);
  assert.equal(r.kills, total, 'убийств не больше, чем зомби в волне');
  assert.equal(r.victory, true);
  assert.equal(game.getPlayer(1).wave, 2);
  assert.throws(() => game.finishBattle(p, { battleId: b.battleId }), /уже завершён/);
});

test('бой: победа без убийств не засчитывается', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 2 });
  game.setGrade(p, 1);
  const b = game.startBattle(p);
  const r = game.finishBattle(p, { battleId: b.battleId, victory: true, kills: {}, answers: [] });
  assert.equal(r.victory, false);
  assert.equal(game.getPlayer(2).wave, 1);
});

test('чужой бой завершить нельзя', () => {
  const { game } = setup();
  const a = game.getOrCreatePlayer({ id: 3 });
  const b = game.getOrCreatePlayer({ id: 4 });
  game.setGrade(a, 1);
  game.setGrade(b, 1);
  const battle = game.startBattle(a);
  assert.throws(() => game.finishBattle(b, { battleId: battle.battleId }), /не найден/);
});

test('адаптивность: много верных — уровень растёт, много ошибок — падает', () => {
  const { game, config } = setup();
  const p = game.getOrCreatePlayer({ id: 5 });
  game.setGrade(p, 2); // addsub стартует с 3
  const win = config.settings().adaptWindow;
  let b = game.startBattle(p);
  let ans = b.problems.addsub.slice(0, win).map((x, i) => ({ slot: 'addsub', i, given: x.answer, ms: 1000 }));
  let r = game.finishBattle(p, { battleId: b.battleId, answers: ans });
  assert.equal(r.tierChanges.addsub, 'up');
  assert.equal(game.getPlayer(5).skills.addsub.tier, 4);
  b = game.startBattle(p);
  ans = b.problems.addsub.slice(0, win).map((x, i) => ({ slot: 'addsub', i, given: 'x', ms: 1000 }));
  r = game.finishBattle(p, { battleId: b.battleId, answers: ans });
  assert.equal(r.tierChanges.addsub, 'down');
});

test('тема выключена для класса — заклинание получает сложение', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 6 });
  game.setGrade(p, 1); // умножение для 1 класса выключено
  p.buildings.library = 3;
  p.deck = defaultDeck(3);
  game.save(p);
  const b = game.startBattle(p);
  assert.equal(b.tiers.mult.topic, 'addsub');
  assert.ok(/[+−]/.test(b.problems.mult[0].q));
});

test('улучшение построек', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 7 });
  assert.throws(() => game.upgrade(p, 'walls'), /золота/);
  p.gold = 1000;
  game.upgrade(p, 'walls');
  assert.equal(game.getPlayer(7).buildings.walls, 2);
  assert.equal(game.getPlayer(7).gold, 960);
});

test('журнал изменений и откат', () => {
  const { config } = setup();
  const before = config.topic('addsub');
  const changed = structuredClone(before);
  changed[0].max = 15;
  config.set('topic:addsub', changed, { id: 1, name: 'admin' }, 'тест');
  assert.equal(config.topic('addsub')[0].max, 15);
  config.undo({ id: 1 });
  assert.deepEqual(config.topic('addsub'), before);
  assert.equal(config.undo({ id: 1 }), null, 'дважды одно и то же не откатываем');
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

// ---------- Мана, колода, отчёт боя ----------
const correctAnswers = (b, n) => b.problems.addsub.slice(0, n).map((x, i) => ({ slot: 'addsub', i, given: x.answer, ms: 5000 }));

test('бой: карты дороже заработанной маны — подделка, награды нет', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 20 });
  game.setGrade(p, 2);
  const b = game.startBattle(p);
  const all = Object.values(waveSummary(1)).reduce((a, c) => a + c, 0);
  const r = game.finishBattle(p, {
    battleId: b.battleId,
    victory: true,
    kills: { walker: all },
    answers: correctAnswers(b, 1),
    plays: [{ card: 'fireball', t: 1 }, { card: 'fireball', t: 2 }],
  });
  assert.equal(r.manaEarned, 3);
  assert.equal(r.manaSpent, 6);
  assert.equal(r.forged, true);
  assert.equal(r.victory, false);
  assert.equal(game.getPlayer(20).wave, 1);
  assert.equal(game.getPlayer(20).gold, 0);
});

test('бой: карта не из колоды — подделка', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 21 });
  game.setGrade(p, 2);
  const b = game.startBattle(p);
  const r = game.finishBattle(p, { battleId: b.battleId, victory: true, kills: {}, answers: correctAnswers(b, 5), plays: [{ card: 'meteor', t: 1 }] });
  assert.equal(r.forged, true);
});

test('бой: мана считается на сервере, повтор одного ответа не засчитывается', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 22 });
  game.setGrade(p, 2);
  const b = game.startBattle(p);
  const [a0, a1, a2] = b.problems.addsub;
  const r = game.finishBattle(p, {
    battleId: b.battleId,
    answers: [
      { slot: 'addsub', i: 0, given: a0.answer, ms: 5000 }, // 3
      { slot: 'addsub', i: 0, given: a0.answer, ms: 5000 }, // повтор
      { slot: 'addsub', i: 1, given: a1.answer, ms: 1000 }, // 4 — быстрый
      { slot: 'addsub', i: 2, given: a2.answer, ms: 1000 }, // 5 — быстрый и серия
    ],
  });
  assert.equal(r.total, 3);
  assert.equal(r.manaEarned, 12);
});

test('бой: отчёт о потерях, золото за уцелевшие башни', () => {
  const { game } = setup();
  const all = Object.values(waveSummary(1)).reduce((a, c) => a + c, 0);
  const run = (id, lost) => {
    const p = game.getOrCreatePlayer({ id });
    game.setGrade(p, 2);
    const b = game.startBattle(p);
    return game.finishBattle(p, { battleId: b.battleId, victory: true, kills: { walker: all }, answers: [], lost });
  };
  const intact = run(23, []);
  const oneLost = run(24, ['towerL', 'towerL', 'выдумка']);
  assert.deepEqual(oneLost.lost, ['towerL']);
  assert.equal(intact.gold - oneLost.gold, 6);
});

test('колода: без повторов, на старте огненный шар и ледяная стена, новые карты при улучшении библиотеки', () => {
  const { game } = setup();
  const p = game.getOrCreatePlayer({ id: 25 });
  game.setGrade(p, 2);
  assert.deepEqual(game.publicState(p).deck, ['fireball', 'ice']);
  // Повторы и закрытые карты не принимаются
  assert.throws(() => game.setDeck(p, ['fireball', 'fireball']), /собрать нельзя/);
  assert.throws(() => game.setDeck(p, ['fireball', 'lightning']), /собрать нельзя/);
  assert.throws(() => game.setDeck(p, ['fireball']), /собрать нельзя/);
  game.setDeck(p, ['ice', 'fireball']);
  p.gold = 100000;
  game.upgrade(p, 'library'); // 2: молния
  assert.deepEqual([...game.getPlayer(25).deck].sort(), ['fireball', 'ice', 'lightning']);
  game.upgrade(p, 'library'); // 3: каменный страж
  const deck = game.getPlayer(25).deck;
  assert.deepEqual([...deck].sort(), ['fireball', 'guardian', 'ice', 'lightning']);
  assert.equal(new Set(deck).size, deck.length);
});

test('старая колода с повторами превращается в колоду без повторов', () => {
  const { game, db } = setup();
  const p = game.getOrCreatePlayer({ id: 26 });
  db.prepare('UPDATE players SET deck = ? WHERE tg_id = 26').run(JSON.stringify(Array(8).fill('fireball')));
  assert.deepEqual(game.getPlayer(26).deck, ['fireball', 'ice']);
});
