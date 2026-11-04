// Правила игрока — чистые функции без базы и сети. Один и тот же код работает
// на локальном сервере (Node) и в Supabase Edge Function (Deno).
//
// cfg — снимок настроек сложности: { topic(name) → [тиры], settings() → {...} }.
// Время и случайность приходят параметрами, внутри Date.now()/Math.random для состояния не используются
// (генератор заданий случайный намеренно: задания каждый раз разные, ответы хранит сервер).
import {
  BUILDINGS, START_BUILDINGS, CARDS, ZOMBIES, upgradeCost, waveSummary,
  XP_PER_CORRECT, xpForLevel, battleGold, manaForAnswer,
  defaultDeck, isValidDeck, addCardToDeck, openCards,
} from './balance.js';
import { generateBatch } from './problems.js';

export class GameError extends Error {}

export const PLAYER_VERSION = 1;

/** Новый игрок */
export function newPlayer(user) {
  return migratePlayer({
    v: PLAYER_VERSION,
    name: user.first_name || 'Волшебник',
    grade: null,
    level: 1,
    xp: 0,
    gold: 0,
    wave: 1,
    bestWave: 0,
    buildings: { ...START_BUILDINGS },
    skills: {},
    deck: defaultDeck(START_BUILDINGS.library),
  });
}

/**
 * Приводит сохранение любой прежней формы к текущей. Старые сохранения у игроков должны открываться,
 * поэтому каждое изменение формы состояния — здесь и с тестом.
 */
export function migratePlayer(raw) {
  const p = structuredClone(raw ?? {});
  p.v = PLAYER_VERSION;
  p.name ??= 'Волшебник';
  p.grade ??= null;
  p.level ??= 1;
  p.xp ??= 0;
  p.gold ??= 0;
  p.wave ??= 1;
  // Ранние версии хранили лучший результат в best_wave
  p.bestWave ??= p.best_wave ?? 0;
  delete p.best_wave;
  p.buildings = { ...START_BUILDINGS, ...(p.buildings ?? {}) };
  p.skills ??= {};
  // Колода без повторов и только из открытых карт (старые колоды из 8 огненных шаров заменяются)
  if (!isValidDeck(p.deck, p.buildings.library)) p.deck = defaultDeck(p.buildings.library);
  return p;
}

/** То, что видит клиент */
export function publicState(p) {
  return {
    name: p.name,
    grade: p.grade,
    level: p.level,
    xp: p.xp,
    xpNext: xpForLevel(p.level),
    gold: p.gold,
    wave: p.wave,
    bestWave: p.bestWave,
    buildings: p.buildings,
    deck: p.deck,
    upgradeCosts: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, p.buildings[k] >= BUILDINGS[k].maxLevel ? null : upgradeCost(k, p.buildings[k])])),
    skills: Object.fromEntries(Object.entries(p.skills).map(([t, s]) => [t, s.tier])),
    nextWave: waveSummary(p.wave),
  };
}

export function setGrade(p, cfg, grade) {
  if (![1, 2, 3, 4].includes(grade)) throw new GameError('Класс должен быть от 1 до 4');
  const g = cfg.settings().grades[grade];
  p.grade = grade;
  p.skills = {};
  for (const [topic, tier] of Object.entries(g)) p.skills[topic] = { tier, recent: [] };
  return p;
}

export function upgrade(p, key) {
  const b = BUILDINGS[key];
  if (!b) throw new GameError('Нет такой постройки');
  const lvl = p.buildings[key];
  if (lvl >= b.maxLevel) throw new GameError('Максимальный уровень');
  const cost = upgradeCost(key, lvl);
  if (p.gold < cost) throw new GameError('Не хватает золота');
  p.gold -= cost;
  p.buildings[key] = lvl + 1;
  if (key === 'library') {
    // Новая карта сразу попадает в колоду, чтобы её можно было попробовать в следующем бою
    for (const card of openCards(lvl + 1)) if (!openCards(lvl).includes(card)) p.deck = addCardToDeck(p.deck, card);
  }
  return p;
}

export function setDeck(p, deck) {
  if (!isValidDeck(deck, p.buildings.library)) throw new GameError('Такую колоду собрать нельзя');
  p.deck = deck;
  return p;
}

/** Текущий тир темы для игрока (0 — тема выключена для его класса) */
export function tierFor(p, cfg, topic) {
  const tiers = cfg.topic(topic);
  const t = p.skills[topic]?.tier ?? cfg.settings().grades[p.grade || 1][topic] ?? 1;
  return t === 0 ? 0 : Math.min(Math.max(1, t), tiers.length);
}

/** Задания на бой: по темам карт колоды. Сервер сохраняет их вместе с правильными ответами. */
export function buildBattle(p, cfg, seed) {
  if (!p.grade) throw new GameError('Сначала выбери класс');
  const settings = cfg.settings();
  const problems = {};
  const tiers = {};
  for (const key of p.deck) {
    const slot = CARDS[key].topic;
    if (problems[slot]) continue;
    let topic = slot;
    if (tierFor(p, cfg, topic) === 0) topic = 'addsub'; // тема выключена для класса — запасная
    const tier = tierFor(p, cfg, topic);
    tiers[slot] = { topic, tier };
    problems[slot] = generateBatch(topic, cfg.topic(topic)[tier - 1], settings.problemsPerTopic);
  }
  return { wave: p.wave, problems, tiers, deck: [...p.deck], seed };
}

/**
 * Проверка отчёта о бое по заданиям, сохранённым на сервере. Не трогает игрока:
 * возвращает итог, который потом применяет applyBattle. Клиент не может «накрутить» себе золото.
 * battle = { wave, problems, tiers, deck }
 * report = { victory, kills: {walker: n, ...}, answers: [{slot, i, given, ms}], plays: [{card, t}], lost: ['towerL', ...] }
 */
export function judgeBattle(battle, report) {
  const { problems, tiers } = battle;
  let correct = 0;
  let total = 0;
  let streak = 0;
  let manaEarned = 0;
  const seen = new Set(); // один и тот же ответ дважды не считается
  const perTopic = {};
  const answers = Array.isArray(report.answers) ? report.answers.slice(0, 1000) : [];
  for (const a of answers) {
    const list = problems[a?.slot];
    if (!list || !Number.isInteger(a.i)) continue;
    const seenKey = `${a.slot}:${a.i}`;
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    const prob = list[((a.i % list.length) + list.length) % list.length];
    const ok = String(a.given) === prob.answer;
    const ms = Math.min(Math.max(0, Number(a.ms) || 0), 60000);
    total++;
    if (ok) {
      correct++;
      streak++;
      manaEarned += manaForAnswer(ms, streak);
    } else {
      streak = 0;
    }
    const { topic, tier } = tiers[a.slot];
    (perTopic[topic] ??= { tier, results: [], ms: 0 }).results.push(ok);
    perTopic[topic].ms += ms;
  }

  // Сыгранные карты: только из колоды этого боя и не дороже маны, заработанной верными ответами
  const deck = battle.deck ?? [];
  const plays = Array.isArray(report.plays) ? report.plays.slice(0, 1000) : [];
  let manaSpent = 0;
  let forged = false;
  for (const play of plays) {
    if (!deck.includes(play?.card)) forged = true;
    else manaSpent += CARDS[play.card].cost;
  }
  if (manaSpent > manaEarned) forged = true;

  // Убитые зомби — не больше, чем было в волне
  const summary = waveSummary(battle.wave);
  const killed = {};
  let kills = 0;
  for (const [type, n] of Object.entries(report.kills || {})) {
    if (!ZOMBIES[type]) continue;
    const k = Math.min(Math.max(0, Math.floor(n) || 0), summary[type] || 0);
    kills += k;
    killed[type] = k;
  }
  const totalZombies = Object.values(summary).reduce((a, b) => a + b, 0);
  const victory = !forged && Boolean(report.victory) && kills >= totalZombies;

  const lost = [...new Set((Array.isArray(report.lost) ? report.lost : []).filter((b) => ['castle', 'towerL', 'towerR'].includes(b)))];
  const towersSaved = 2 - lost.filter((b) => b !== 'castle').length;

  return { wave: battle.wave, victory, forged, killed: forged ? {} : killed, kills, towersSaved, lost, correct, total, perTopic, manaEarned, manaSpent, cardsPlayed: plays.length };
}

/** Применяет итог боя к игроку: золото, опыт, следующая ночь, адаптивная сложность */
export function applyBattle(p, cfg, judged) {
  const settings = cfg.settings();
  const goldBonus = BUILDINGS.treasury.effect(p.buildings.treasury).goldBonus;
  const { gold, towerGold } = battleGold({ kills: judged.killed, victory: judged.victory, wave: judged.wave, towersSaved: judged.towersSaved, goldBonus });
  const xp = judged.correct * XP_PER_CORRECT;
  p.gold += gold;
  p.xp += xp;
  let levelsUp = 0;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    levelsUp++;
  }
  if (judged.victory) {
    p.bestWave = Math.max(p.bestWave, judged.wave);
    if (p.wave === judged.wave) p.wave++;
  }

  const tierChanges = {};
  for (const [topic, d] of Object.entries(judged.perTopic)) {
    const skill = (p.skills[topic] ??= { tier: d.tier, recent: [] });
    if (skill.tier === 0) continue;
    skill.recent = [...skill.recent, ...d.results].slice(-settings.adaptWindow);
    if (skill.recent.length >= settings.adaptWindow) {
      const acc = skill.recent.filter(Boolean).length / skill.recent.length;
      const maxTier = cfg.topic(topic).length;
      if (acc >= settings.adaptUp && skill.tier < maxTier) {
        skill.tier++;
        skill.recent = [];
        tierChanges[topic] = 'up';
      } else if (acc <= settings.adaptDown && skill.tier > 1) {
        skill.tier--;
        skill.recent = [];
        tierChanges[topic] = 'down';
      }
    }
  }

  return {
    victory: judged.victory, wave: judged.wave, gold, towerGold, xp, correct: judged.correct, total: judged.total, kills: judged.kills,
    levelsUp, tierChanges, manaEarned: judged.manaEarned, manaSpent: judged.manaSpent, cardsPlayed: judged.cardsPlayed, lost: judged.lost, forged: judged.forged,
  };
}

/** Статистика ответов по темам из итога боя: [{topic, tier, total, correct, ms}] */
export function answerStats(judged) {
  return Object.entries(judged.perTopic).map(([topic, d]) => ({
    topic, tier: d.tier, total: d.results.length, correct: d.results.filter(Boolean).length, ms: Math.round(d.ms),
  }));
}
