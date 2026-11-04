// Сценарии сервера игры. Одни и те же сценарии гоняются на SQLite (test/game.test.js, Node)
// и на Postgres через PostgREST (supabase/tests/pg.test.ts, Deno) — так видно,
// что в Supabase игра ведёт себя так же, как локально.
//
// ctx = { game, store, patch(tgId, fn) } — patch меняет сохранённого игрока напрямую (для подготовки).
import assert from 'node:assert/strict';
import { waveSummary } from '../src/core/balance.js';

const allZombies = (wave) => Object.values(waveSummary(wave)).reduce((a, c) => a + c, 0);
const correctAnswers = (b, n, ms = 5000) => b.problems.addsub.slice(0, n).map((x, i) => ({ slot: 'addsub', i, given: x.answer, ms }));

export const scenarios = [
  ['новый игрок: без класса, огненный шар и ледяная стена в колоде', async ({ game }) => {
    const s = await game.state({ id: 101, first_name: 'Маша' });
    assert.equal(s.name, 'Маша');
    assert.equal(s.grade, null);
    assert.deepEqual(s.deck, ['fireball', 'ice']);
    await assert.rejects(game.startBattle({ id: 101 }), /класс/);
  }],

  ['бой: награды считаются сервером, подделка не проходит', async ({ game }) => {
    const u = { id: 1, first_name: 'Тест' };
    await game.setGrade(u, 2);
    const b = await game.startBattle(u);
    const list = b.problems.addsub;
    const answers = [
      { slot: 'addsub', i: 0, given: list[0].answer, ms: 2000 },
      { slot: 'addsub', i: 1, given: list[1].answer, ms: 2000 },
      { slot: 'addsub', i: 2, given: 'неправильно', ms: 2000 },
    ];
    const { result: r, state } = await game.finishBattle(u, { battleId: b.battleId, victory: true, kills: { walker: 9999, boss: 5 }, answers });
    assert.equal(r.correct, 2);
    assert.equal(r.total, 3);
    assert.equal(r.kills, allZombies(1), 'убийств не больше, чем зомби в волне');
    assert.equal(r.victory, true);
    assert.equal(state.wave, 2);
    assert.equal((await game.state(u)).wave, 2);
    await assert.rejects(game.finishBattle(u, { battleId: b.battleId }), /уже завершён/);
  }],

  ['бой: победа без убийств не засчитывается', async ({ game }) => {
    const u = { id: 2 };
    await game.setGrade(u, 1);
    const b = await game.startBattle(u);
    const { result } = await game.finishBattle(u, { battleId: b.battleId, victory: true, kills: {}, answers: [] });
    assert.equal(result.victory, false);
    assert.equal((await game.state(u)).wave, 1);
  }],

  ['чужой бой завершить нельзя', async ({ game }) => {
    await game.setGrade({ id: 3 }, 1);
    await game.setGrade({ id: 4 }, 1);
    const battle = await game.startBattle({ id: 3 });
    await assert.rejects(game.finishBattle({ id: 4 }, { battleId: battle.battleId }), /не найден/);
    await assert.rejects(game.finishBattle({ id: 4 }, { battleId: 'abc' }), /не найден/);
  }],

  ['новый бой закрывает незавершённый', async ({ game }) => {
    const u = { id: 30 };
    await game.setGrade(u, 1);
    const first = await game.startBattle(u);
    await game.startBattle(u);
    await assert.rejects(game.finishBattle(u, { battleId: first.battleId }), /уже завершён/);
  }],

  ['адаптивность: много верных — уровень растёт, много ошибок — падает', async ({ game }) => {
    const u = { id: 5 };
    await game.setGrade(u, 2); // addsub стартует с 3
    const win = (await game.config.load()).settings().adaptWindow;
    let b = await game.startBattle(u);
    let r = await game.finishBattle(u, { battleId: b.battleId, answers: correctAnswers(b, win, 1000) });
    assert.equal(r.result.tierChanges.addsub, 'up');
    assert.equal(r.state.skills.addsub, 4);
    b = await game.startBattle(u);
    const wrong = b.problems.addsub.slice(0, win).map((x, i) => ({ slot: 'addsub', i, given: 'x', ms: 1000 }));
    r = await game.finishBattle(u, { battleId: b.battleId, answers: wrong });
    assert.equal(r.result.tierChanges.addsub, 'down');
  }],

  ['тема выключена для класса — заклинание получает сложение', async ({ game, patch }) => {
    const u = { id: 6 };
    await game.setGrade(u, 1); // умножение для 1 класса выключено
    await patch(6, (p) => {
      p.buildings.library = 2;
      p.deck = ['fireball', 'ice', 'lightning'];
    });
    const b = await game.startBattle(u);
    assert.equal(b.tiers.mult.topic, 'addsub');
    assert.ok(/[+−]/.test(b.problems.mult[0].q));
  }],

  ['улучшение построек', async ({ game, patch }) => {
    const u = { id: 7 };
    await game.state(u);
    await assert.rejects(game.upgrade(u, 'walls'), /золота/);
    await assert.rejects(game.upgrade(u, 'dragon'), /Нет такой/);
    await patch(7, (p) => (p.gold = 1000));
    const s = await game.upgrade(u, 'walls');
    assert.equal(s.buildings.walls, 2);
    assert.equal(s.gold, 960);
  }],

  ['одновременные улучшения не теряются (проверка версии)', async ({ game, patch }) => {
    const u = { id: 8 };
    await game.state(u);
    await patch(8, (p) => (p.gold = 100000));
    await Promise.all([game.upgrade(u, 'walls'), game.upgrade(u, 'tower'), game.upgrade(u, 'treasury')]);
    const s = await game.state(u);
    assert.deepEqual([s.buildings.walls, s.buildings.tower, s.buildings.treasury], [2, 2, 2]);
    assert.equal(s.gold, 100000 - 40 - 50 - 45);
  }],

  ['журнал изменений и откат', async ({ game }) => {
    const { config } = game;
    const before = (await config.load()).topic('addsub');
    const changed = structuredClone(before);
    changed[0].max = 15;
    await config.set('topic:addsub', changed, { id: 1, name: 'admin' }, 'тест');
    assert.equal((await config.load()).topic('addsub')[0].max, 15);
    const log = await config.log(5);
    assert.equal(log[0].key, 'topic:addsub');
    assert.equal(log[0].admin_name, 'admin');
    await config.undo({ id: 1 });
    assert.deepEqual((await config.load()).topic('addsub'), before);
    assert.equal(await config.undo({ id: 1 }), null, 'дважды одно и то же не откатываем');
  }],

  ['бой: карты дороже заработанной маны — подделка, награды нет', async ({ game }) => {
    const u = { id: 20 };
    await game.setGrade(u, 2);
    const b = await game.startBattle(u);
    const { result: r, state } = await game.finishBattle(u, {
      battleId: b.battleId,
      victory: true,
      kills: { walker: allZombies(1) },
      answers: correctAnswers(b, 1),
      plays: [{ card: 'fireball', t: 1 }, { card: 'fireball', t: 2 }],
    });
    assert.equal(r.manaEarned, 3);
    assert.equal(r.manaSpent, 6);
    assert.equal(r.forged, true);
    assert.equal(r.victory, false);
    assert.equal(state.wave, 1);
    assert.equal(state.gold, 0);
  }],

  ['бой: карта не из колоды — подделка', async ({ game }) => {
    const u = { id: 21 };
    await game.setGrade(u, 2);
    const b = await game.startBattle(u);
    const { result } = await game.finishBattle(u, { battleId: b.battleId, victory: true, kills: {}, answers: correctAnswers(b, 5), plays: [{ card: 'meteor', t: 1 }] });
    assert.equal(result.forged, true);
  }],

  ['бой: мана считается на сервере, повтор одного ответа не засчитывается', async ({ game }) => {
    const u = { id: 22 };
    await game.setGrade(u, 2);
    const b = await game.startBattle(u);
    const [a0, a1, a2] = b.problems.addsub;
    const { result: r } = await game.finishBattle(u, {
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
  }],

  ['бой: отчёт о потерях, золото за уцелевшие башни', async ({ game }) => {
    const run = async (id, lost) => {
      await game.setGrade({ id }, 2);
      const b = await game.startBattle({ id });
      return (await game.finishBattle({ id }, { battleId: b.battleId, victory: true, kills: { walker: allZombies(1) }, answers: [], lost })).result;
    };
    const intact = await run(23, []);
    const oneLost = await run(24, ['towerL', 'towerL', 'выдумка']);
    assert.deepEqual(oneLost.lost, ['towerL']);
    assert.equal(intact.gold - oneLost.gold, 6);
  }],

  ['колода: без повторов, новые карты при улучшении библиотеки', async ({ game, patch }) => {
    const u = { id: 25 };
    await game.setGrade(u, 2);
    await assert.rejects(game.setDeck(u, ['fireball', 'fireball']), /собрать нельзя/);
    await assert.rejects(game.setDeck(u, ['fireball', 'lightning']), /собрать нельзя/);
    await assert.rejects(game.setDeck(u, ['fireball']), /собрать нельзя/);
    await game.setDeck(u, ['ice', 'fireball']);
    await patch(25, (p) => (p.gold = 100000));
    let s = await game.upgrade(u, 'library'); // 2: молния
    assert.deepEqual([...s.deck].sort(), ['fireball', 'ice', 'lightning']);
    s = await game.upgrade(u, 'library'); // 3: каменный страж
    assert.deepEqual([...s.deck].sort(), ['fireball', 'guardian', 'ice', 'lightning']);
  }],

  ['старое сохранение с повторами в колоде открывается', async ({ game, patch }) => {
    await game.state({ id: 26 });
    await patch(26, (p) => {
      p.deck = Array(8).fill('fireball');
      p.best_wave = 7; // поле из первой версии
      delete p.bestWave;
    });
    const s = await game.state({ id: 26 });
    assert.deepEqual(s.deck, ['fireball', 'ice']);
    assert.equal(s.bestWave, 7);
  }],

  ['статистика для админки', async ({ game }) => {
    const u = { id: 40 };
    await game.setGrade(u, 3);
    const b = await game.startBattle(u);
    await game.finishBattle(u, { battleId: b.battleId, victory: true, kills: { walker: allZombies(1) }, answers: correctAnswers(b, 3) });
    const s = await game.stats();
    assert.ok(Number(s.players.n) >= 1);
    assert.ok(Number(s.battles.n) >= 1);
    assert.ok(Number(s.battles.wins) >= 1);
    const add = s.answers.find((a) => a.topic === 'addsub');
    assert.ok(add && Number(add.total) >= 3);
    assert.ok(s.grades.some((g) => Number(g.grade) === 3));
  }],
];
