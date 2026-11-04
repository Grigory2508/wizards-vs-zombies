import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BattleSim, PATHS, snapToLane } from '../src/core/sim.js';
import { CARDS, HAND_SIZE, MANA_MAX, START_BUILDINGS, annexStage, damageStage, defaultDeck, manaForAnswer, towerHeight, towerLook, wallStage } from '../src/core/balance.js';
import { playNight } from '../tools/bot.js';

const make = (over = {}) => new BattleSim({ wave: 1, buildings: { ...START_BUILDINGS }, deck: defaultDeck(7), seed: 5, ...over });
const stepFor = (sim, seconds) => {
  for (let i = 0; i < seconds * 30 && !sim.ended; i++) sim.step(1 / 30);
};

test('рука: при двух картах в колоде в руке ровно две разные карты, и после розыгрыша они остаются', () => {
  const sim = make({ deck: defaultDeck(1) });
  assert.deepEqual([...sim.hand].sort(), ['fireball', 'ice']);
  assert.equal(sim.queue.length, 0);
  sim.mana = MANA_MAX;
  const slot = sim.hand.indexOf('ice');
  assert.equal(sim.play(slot, 360, 400), '');
  assert.deepEqual([...sim.hand].sort(), ['fireball', 'ice']);
});

test('мана: только за верные ответы, быстрый +4, серия +1, потолок 10', () => {
  assert.equal(manaForAnswer(5000, 1), 3);
  assert.equal(manaForAnswer(3999, 1), 4);
  assert.equal(manaForAnswer(5000, 3), 4);
  assert.equal(manaForAnswer(1000, 3), 5);
  const sim = make();
  stepFor(sim, 5);
  assert.equal(sim.mana, 0, 'пассивного прироста нет');
  assert.equal(sim.answer(false, 1000), 0);
  assert.equal(sim.mana, 0);
  sim.answer(true, 5000);
  sim.answer(true, 5000);
  assert.equal(sim.mana, 6);
  assert.equal(sim.answer(true, 5000), 4, 'третий подряд');
  sim.answer(true, 1000);
  assert.equal(sim.mana, MANA_MAX);
  sim.answer(false, 1000);
  assert.equal(sim.streak, 0);
});

test('рука: 4 карты, сыгранная уходит в конец очереди, маны не хватает — отказ', () => {
  const sim = make({ deck: ['fireball', 'ice', 'lightning', 'guardian', 'heal', 'meteor', 'fireball', 'ice'] });
  assert.equal(sim.hand.length, HAND_SIZE);
  assert.equal(sim.queue.length, 4);
  const slot = sim.hand.findIndex((k) => k !== 'lightning');
  const key = sim.hand[slot];
  assert.equal(sim.play(slot, 300, 400), 'mana');
  sim.mana = 10;
  const next = sim.queue[0];
  assert.equal(sim.play(slot, 300, 400), '');
  assert.equal(sim.mana, 10 - CARDS[key].cost);
  assert.equal(sim.hand[slot], next);
  assert.equal(sim.queue.at(-1), key);
});

test('зомби сначала грызёт башню своей дорожки, потом идёт к замку', () => {
  const sim = make();
  sim.spawns = [{ type: 'walker', lane: 0, time: 0, hp: 100000 }];
  sim.total = 1;
  sim.towerDps = 0;
  sim.towers[0].maxHp = 10;
  sim.towers[0].hp = 10;
  stepFor(sim, 1);
  const z = sim.zombies[0];
  while (!z.biting) sim.step(1 / 30);
  assert.equal(z.biting, sim.towers[0]);
  assert.equal(sim.castle.hp, sim.castle.maxHp, 'замок пока цел');
  stepFor(sim, 5);
  assert.equal(sim.towers[0].alive, false, 'башня разрушена');
  assert.equal(sim.towers[1].alive, true, 'вторая дорожка не тронута');
  stepFor(sim, 3);
  assert.ok(z.t > PATHS[0].towerStop, 'зомби пошёл дальше');
  stepFor(sim, 200);
  assert.equal(sim.ended, true);
  assert.equal(sim.victory, false, 'разрушен замок — поражение');
});

test('страж держит зомби, лёд замедляет', () => {
  const run = (setup) => {
    const sim = make({ deck: Array(8).fill('fireball') });
    sim.spawns = [{ type: 'walker', lane: 0, time: 0, hp: 100000 }];
    sim.towerDps = 0;
    setup?.(sim);
    stepFor(sim, 12);
    return sim.zombies[0].t;
  };
  const free = run();
  const held = run((sim) => {
    sim.hand[0] = 'guardian';
    sim.mana = 4;
    assert.equal(snapToLane(190, 300).lane, 0);
    sim.play(0, 190, 300);
  });
  assert.ok(held < free, `страж: ${held} < ${free}`);
  const iced = run((sim) => {
    sim.hand[0] = 'ice';
    sim.mana = 2;
    sim.play(0, 300, 200);
  });
  assert.ok(iced < free, `лёд: ${iced} < ${free}`);
});

test('целебный круг чинит постройки, руины не восстанавливает', () => {
  const sim = make();
  sim.castle.hp = 10;
  sim.towers[1].alive = false;
  sim.towers[1].hp = 0;
  sim.hand[0] = 'heal';
  sim.mana = 3;
  sim.play(0, 360, 660);
  stepFor(sim, 1);
  assert.ok(sim.castle.hp > 10);
  assert.equal(sim.towers[1].hp, 0);
  assert.equal(sim.towers[1].alive, false);
});

test('стадии разрушения по порогам', () => {
  assert.equal(damageStage(1), 0);
  assert.equal(damageStage(0.67), 0);
  assert.equal(damageStage(0.66), 1);
  assert.equal(damageStage(0.34), 1);
  assert.equal(damageStage(0.33), 2);
  assert.equal(damageStage(0.01), 2);
  assert.equal(damageStage(0), 3);
});

test('бой предсказуем при одинаковом зерне', () => {
  const opts = { wave: 3, buildings: START_BUILDINGS, deck: defaultDeck(1), seed: 42 };
  assert.deepEqual(playNight(opts), playNight(opts));
});

test('бот с точностью 80% и ответом за ~5 с проходит первую ночь почти всегда', () => {
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) if (playNight({ wave: 1, buildings: START_BUILDINGS, deck: defaultDeck(1), seed }).victory) wins++;
  assert.ok(wins >= 36, `побед ${wins} из 40`);
});

test('стадии внешнего вида по уровням построек', () => {
  const stages = (fn, levels) => levels.map(fn);
  assert.deepEqual(stages(wallStage, [1, 3, 4, 7, 8, 11, 12, 15]), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(stages(towerLook, [1, 5, 6, 10, 11, 15]), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(stages(annexStage, [1, 5, 6, 10, 11, 15]), [0, 0, 1, 1, 2, 2]);
  assert.ok(towerHeight(15) > towerHeight(1));
});

test('состояния постройки меняются по порогам и сообщаются один раз', () => {
  const seen = [];
  const sim = make({ on: (name, b) => { if (name === 'buildingStage' && b.id === 'towerL') seen.push(b.stage); } });
  const t = sim.towers[0];
  for (const r of [0.8, 0.66, 0.5, 0.33, 0.1, 0]) sim.hurtBuilding(t, t.hp - t.maxHp * r, null);
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(t.alive, false);
});
