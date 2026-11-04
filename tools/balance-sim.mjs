// Симуляция баланса без отрисовки: целые кампании «ребёнка», с покупкой улучшений и без неё.
// Запуск: node tools/balance-sim.mjs [--runs 200] [--nights 25] [--attempts 5] [--accuracy 0.8] [--mean 5] [--json файл]
// Логика боя та же, что в игре (src/core/sim.js), награды считает та же формула, что и сервер.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILDINGS, START_BUILDINGS, XP_PER_CORRECT, addCardToDeck, battleGold, defaultDeck, openCards, upgradeCost, xpForLevel,
} from '../src/core/balance.js';
import { playNight } from './bot.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number.isNaN(Number(process.argv[i + 1])) ? process.argv[i + 1] : Number(process.argv[i + 1]) : def;
};
const RUNS = arg('runs', 200);
const NIGHTS = arg('nights', 25);
const ATTEMPTS = arg('attempts', 5); // столько раз подряд ребёнок пробует одну ночь, потом бросает
const ACCURACY = arg('accuracy', 0.8);
const MEAN = arg('mean', 5);
const JSON_OUT = arg('json', null);

/** Покупаем самое дешёвое улучшение, пока хватает золота: постройки растут примерно поровну */
function buyUpgrades(p) {
  for (;;) {
    let best = null;
    for (const key of Object.keys(BUILDINGS)) {
      if (p.buildings[key] >= BUILDINGS[key].maxLevel) continue;
      const cost = upgradeCost(key, p.buildings[key]);
      if (cost <= p.gold && (!best || cost < best.cost)) best = { key, cost };
    }
    if (!best) return;
    const was = p.buildings[best.key];
    p.gold -= best.cost;
    p.buildings[best.key] = was + 1;
    if (best.key === 'library') {
      for (const card of openCards(was + 1)) if (!openCards(was).includes(card)) p.deck = addCardToDeck(p.deck, card);
    }
  }
}

function campaign(seed, upgrades) {
  const p = { wave: 1, level: 1, xp: 0, gold: 0, buildings: { ...START_BUILDINGS }, deck: defaultDeck(1) };
  const nights = {};
  let battle = 0;
  while (p.wave <= NIGHTS) {
    const night = (nights[p.wave] ??= { attempts: 0, first: null, won: false, time: 0, castle: 0 });
    if (night.attempts >= ATTEMPTS) break;
    if (upgrades) buyUpgrades(p);
    if (night.attempts === 0) {
      night.level = p.level;
      night.buildings = { ...p.buildings };
    }
    const r = playNight({
      wave: p.wave, buildings: p.buildings, level: p.level, deck: p.deck, seed: seed * 1009 + ++battle, accuracy: ACCURACY, meanAnswer: MEAN,
    });
    night.attempts++;
    if (night.first === null) night.first = r.victory;
    const towersSaved = 2 - r.lost.filter((b) => b !== 'castle').length;
    const goldBonus = BUILDINGS.treasury.effect(p.buildings.treasury).goldBonus;
    p.gold += battleGold({ kills: r.killsByType, victory: r.victory, wave: p.wave, towersSaved, goldBonus }).gold;
    p.xp += r.correct * XP_PER_CORRECT;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
    }
    if (r.victory) {
      night.won = true;
      night.time = r.time;
      night.castle = r.castleHp;
      p.wave++;
    }
  }
  return nights;
}

export function table(upgrades, count = RUNS) {
  const runs = Array.from({ length: count }, (_, i) => campaign(i + 1, upgrades));
  const rows = [];
  for (let n = 1; n <= NIGHTS; n++) {
    const reached = runs.map((r) => r[n]).filter(Boolean);
    if (!reached.length) break;
    const won = reached.filter((x) => x.won);
    const avg = (list, f) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0);
    rows.push({
      night: n,
      reached: reached.length / count,
      firstWin: avg(reached, (x) => (x.first ? 1 : 0)),
      passed: won.length / reached.length,
      attempts: avg(reached, (x) => x.attempts),
      level: avg(reached, (x) => x.level),
      buildings: avg(reached, (x) => Object.values(x.buildings).reduce((a, b) => a + b, 0) / 4),
      time: avg(won, (x) => x.time),
      castle: avg(won, (x) => x.castle),
    });
  }
  return rows;
}

const pct = (x) => `${Math.round(x * 100)}%`;
function print(title, rows) {
  console.log(`\n### ${title}\n`);
  console.log('| Ночь | Дошли | Победа с 1-й попытки | Прошли за 5 попыток | Попыток | Ур. мага | Ср. ур. построек | Длина боя, с | Замок в конце |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.night} | ${pct(r.reached)} | ${pct(r.firstWin)} | ${pct(r.passed)} | ${r.attempts.toFixed(1)} | ${r.level.toFixed(1)} | ${r.buildings.toFixed(1)} | ${Math.round(r.time)} | ${pct(r.castle)} |`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  const without = table(false);
  const withUp = table(true);
  print('Без улучшений построек', without);
  print('С улучшениями', withUp);
  console.log(`\nКампаний: ${RUNS} на вариант, точность ${pct(ACCURACY)}, ответ ${MEAN}±2 с, ${((Date.now() - started) / 1000).toFixed(0)} с счёта.`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ without, withUp }, null, 1));
}
