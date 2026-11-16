// Сценарии сервера игры. Одни и те же сценарии гоняются на SQLite (test/game.test.js, Node)
// и на Postgres через PostgREST (supabase/tests/pg.test.ts, Deno) — так видно,
// что в Supabase игра ведёт себя так же, как локально.
//
// ctx = { game, store, patch(tgId, fn) } — patch меняет сохранённого игрока напрямую (для подготовки).
import assert from 'node:assert/strict';
import { waveSummary } from '../src/core/balance.js';
import { weekId } from '../src/core/classroom.js';

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

  // ---------- Рейтинг ----------
  ['рейтинг за всё время: лучшая ночь, при равенстве — больше верных ответов', async ({ game, patch }) => {
    const set = async (id, name, bestWave, totalCorrect) => {
      await game.state({ id, first_name: name });
      await patch(id, (p) => Object.assign(p, { bestWave, totalCorrect }));
    };
    await set(201, 'Аня', 5, 40);
    await set(202, 'Боря', 7, 10);
    await set(203, 'Вика', 5, 90);
    await game.state({ id: 204, first_name: 'Новичок' }); // ещё не играл — в рейтинге его нет
    const b = await game.leaderboard({ id: 201 }, { period: 'all', scope: 'all' });
    assert.deepEqual(b.rows.map((r) => r.name), ['Боря', 'Вика', 'Аня']);
    assert.deepEqual(b.rows.map((r) => r.rank), [1, 2, 3]);
    assert.equal(b.me.rank, 3);
    assert.equal(b.me.me, true);
    assert.equal(b.rows.find((r) => r.me).name, 'Аня');
    assert.ok(b.rows.every((r) => !('tg_id' in r) && !('id' in r)), 'номера Telegram наружу не отдаём');
    const none = await game.leaderboard({ id: 204 }, { period: 'all', scope: 'all' });
    assert.equal(none.me, null);
  }],

  ['рейтинг недели: считается только эта неделя, бой обновляет счёт', async ({ game, patch }) => {
    const u = { id: 210, first_name: 'Гоша' };
    await game.setGrade(u, 1);
    const b = await game.startBattle(u);
    const { state } = await game.finishBattle(u, { battleId: b.battleId, victory: true, kills: { walker: allZombies(1) }, answers: correctAnswers(b, 4) });
    assert.equal(state.totalCorrect, 4);
    await game.state({ id: 211, first_name: 'Старичок' });
    await patch(211, (p) => Object.assign(p, { bestWave: 9, totalCorrect: 99, week: { id: '2000-W01', best: 9, correct: 99 } }));
    const week = await game.leaderboard(u, { period: 'week', scope: 'all' });
    assert.equal(week.week, weekId(Date.now()));
    assert.deepEqual(week.rows.map((r) => [r.name, r.best, r.correct]), [['Гоша', 1, 4]]);
    const all = await game.leaderboard(u, { period: 'all', scope: 'all' });
    assert.deepEqual(all.rows.map((r) => r.name), ['Старичок', 'Гоша']);
  }],

  // ---------- Классы ----------
  ['класс: учитель создаёт, ученик вступает по коду, рейтинг класса — только свои', async ({ game, patch }) => {
    const teacher = { id: 300, first_name: 'Мария Ивановна' };
    const cls = await game.createClass(teacher, { name: '  3 «Б»  ', grade: 3 });
    assert.equal(cls.name, '3 «Б»');
    assert.match(cls.code, /^[A-Z2-9]{8}$/);
    const info = await game.classInfo(cls.code.toLowerCase());
    assert.deepEqual(info, { code: cls.code, name: '3 «Б»', teacher: 'Мария Ивановна' });
    await assert.rejects(game.classInfo('NOPE1234'), /не найден/);

    const kid = { id: 301, first_name: 'Петя' };
    const joined = await game.joinClass(kid, cls.code);
    assert.equal(joined.class.name, '3 «Б»');
    assert.equal(joined.grade, 3, 'год обучения класса — новичку');
    await game.joinClass({ id: 302, first_name: 'Оля' }, cls.code);
    await game.state({ id: 303, first_name: 'Чужой' });
    for (const [id, best] of [[301, 2], [302, 4], [303, 9]]) await patch(id, (p) => Object.assign(p, { bestWave: best, totalCorrect: 5 }));

    const board = await game.leaderboard(kid, { period: 'all', scope: 'class' });
    assert.deepEqual(board.rows.map((r) => r.name), ['Оля', 'Петя']);
    const noClass = await game.leaderboard({ id: 303 }, { period: 'all', scope: 'class' });
    assert.equal(noClass.noClass, true);

    const list = await game.teacherClasses(teacher);
    assert.deepEqual(list.map((c) => [c.name, c.students]), [['3 «Б»', 2]]);
    const detail = await game.classDetail(teacher, cls.code);
    assert.deepEqual(detail.students.map((x) => x.name), ['Оля', 'Петя']);
    assert.ok(detail.levels.addsub.length >= 1 && detail.levels.addsub[0].length === 3, 'примеры уровней для учителя');

    const left = await game.leaveClass(kid);
    assert.equal(left.class, null);
  }],

  ['класс: чужой учитель ничего не видит и не меняет', async ({ game }) => {
    const owner = { id: 310, first_name: 'Учитель' };
    const cls = await game.createClass(owner, { name: '2 «А»' });
    const stranger = { id: 311, first_name: 'Хитрец' };
    await assert.rejects(game.classDetail(stranger, cls.code), /не ваш/);
    await assert.rejects(game.classUpdate(stranger, cls.code, { name: 'взлом' }), /не ваш/);
    await assert.rejects(game.taskAdd(stranger, cls.code, { q: '1+1', answer: '2' }), /не ваш/);
    await game.joinClass({ id: 312 }, cls.code);
    await assert.rejects(game.removeStudent(stranger, cls.code, 312), /не ваш/);
    assert.equal((await game.state({ id: 312 })).class.code, cls.code);
    await assert.rejects(game.removeStudent(owner, cls.code, 99999), /нет в классе/);
    const after = await game.removeStudent(owner, cls.code, 312);
    assert.equal(after.students.length, 0);
    assert.equal((await game.state({ id: 312 })).class, null);
    assert.equal(await game.store.getPlayer(99999), null, 'несуществующий ученик не создан');
  }],

  ['задания учителя: проверка, бой с ними, статистика по заданию', async ({ game }) => {
    const teacher = { id: 320, first_name: 'Учитель' };
    const cls = await game.createClass(teacher, { name: 'Кружок', grade: 2 });
    await assert.rejects(game.taskAdd(teacher, cls.code, { q: '', answer: '2' }), /вопрос/);
    await assert.rejects(game.taskAdd(teacher, cls.code, { q: 'Столица России?', answer: 'Москва' }), /неверный вариант/);
    let d = await game.taskAdd(teacher, cls.code, { q: 'У Маши 5 яблок, 2 отдала. Сколько осталось?', answer: '3' }); // неверные придумаем сами
    d = await game.taskAdd(teacher, cls.code, { q: 'Что больше: 7 или 9?', answer: '9', wrong: ['7', '9', ''] });
    assert.deepEqual(d.tasks.map((t) => t.wrong), [[], ['7']]);
    d = await game.classUpdate(teacher, cls.code, { customShare: 'often' });
    assert.equal(d.customShare, 'often');

    const kid = { id: 321 };
    await game.joinClass(kid, cls.code);
    const b = await game.startBattle(kid);
    assert.equal(b.customShare, 0.5);
    assert.ok(b.problems.custom.length > 0);
    const c0 = b.problems.custom[0];
    assert.ok(c0.options.includes(c0.answer) && c0.options.length >= 2);
    const answers = b.problems.custom.slice(0, 4).map((x, i) => ({ slot: 'custom', i, given: i === 3 ? 'не то' : x.answer, ms: 3000 }));
    const { result, state } = await game.finishBattle(kid, { battleId: b.battleId, answers });
    assert.equal(result.correct, 3);
    assert.equal(state.skills.custom, undefined, 'задания учителя не попадают в адаптивность');
    d = await game.classDetail(teacher, cls.code);
    assert.equal(d.tasks.reduce((a, t) => a + t.total, 0), 4);
    assert.equal(d.tasks.reduce((a, t) => a + t.correct, 0), 3);

    d = await game.taskEdit(teacher, cls.code, d.tasks[0].id, { enabled: false });
    assert.equal(d.tasks[0].enabled, false);
    d = await game.taskRemove(teacher, cls.code, d.tasks[1].id);
    assert.equal(d.tasks.length, 1);
    const b2 = await game.startBattle(kid);
    assert.equal(b2.problems.custom, undefined, 'все задания выключены — в бою их нет');
  }],

  ['закреплённый учителем уровень: бой на нём, адаптивность не меняет', async ({ game }) => {
    const teacher = { id: 330 };
    const cls = await game.createClass(teacher, { name: 'Класс', grade: 2 });
    await game.classUpdate(teacher, cls.code, { fixedTiers: { addsub: 1, bad: 'x' } });
    const kid = { id: 331 };
    await game.joinClass(kid, cls.code); // 2 год обучения: сложение с 3 уровня
    const b = await game.startBattle(kid);
    assert.equal(b.tiers.addsub.tier, 1);
    assert.equal(b.tiers.addsub.fixed, true);
    const win = (await game.config.load()).settings().adaptWindow;
    const r = await game.finishBattle(kid, { battleId: b.battleId, answers: correctAnswers(b, win, 1000) });
    assert.equal(r.result.tierChanges.addsub, undefined);
    assert.equal(r.state.skills.addsub, 3, 'собственный уровень ученика не тронут');
  }],
];
