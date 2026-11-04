import {
  BUILDINGS, START_BUILDINGS, CARDS, ZOMBIES, upgradeCost, waveSummary,
  XP_PER_CORRECT, xpForLevel, battleGold, manaForAnswer,
  defaultDeck, isValidDeck, addCardToDeck, openCards,
} from '../public/shared/balance.js';
import { randomInt } from 'node:crypto';
import { generateBatch } from './problems.js';

export class GameError extends Error {}

export class Game {
  constructor(db, config) {
    this.db = db;
    this.config = config;
  }

  // ---------- Игрок ----------
  getPlayer(tgId) {
    const row = this.db.prepare('SELECT * FROM players WHERE tg_id = ?').get(tgId);
    if (!row) return null;
    const buildings = JSON.parse(row.buildings);
    const saved = row.deck ? JSON.parse(row.deck) : null;
    const deck = isValidDeck(saved, buildings.library) ? saved : defaultDeck(buildings.library);
    return { ...row, buildings, skills: JSON.parse(row.skills), deck };
  }

  getOrCreatePlayer(user) {
    let p = this.getPlayer(user.id);
    if (!p) {
      const now = Date.now();
      this.db
        .prepare('INSERT INTO players (tg_id, name, buildings, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, user.first_name || 'Волшебник', JSON.stringify(START_BUILDINGS), '{}', now, now);
      p = this.getPlayer(user.id);
    }
    return p;
  }

  save(p) {
    this.db
      .prepare('UPDATE players SET name=?, grade=?, level=?, xp=?, gold=?, wave=?, buildings=?, skills=?, deck=?, best_wave=?, updated_at=? WHERE tg_id=?')
      .run(p.name, p.grade, p.level, p.xp, p.gold, p.wave, JSON.stringify(p.buildings), JSON.stringify(p.skills), JSON.stringify(p.deck), p.best_wave, Date.now(), p.tg_id);
  }

  /** То, что видит клиент */
  publicState(p) {
    return {
      name: p.name,
      grade: p.grade,
      level: p.level,
      xp: p.xp,
      xpNext: xpForLevel(p.level),
      gold: p.gold,
      wave: p.wave,
      bestWave: p.best_wave,
      buildings: p.buildings,
      deck: p.deck,
      upgradeCosts: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, p.buildings[k] >= BUILDINGS[k].maxLevel ? null : upgradeCost(k, p.buildings[k])])),
      skills: Object.fromEntries(Object.entries(p.skills).map(([t, s]) => [t, s.tier])),
      nextWave: waveSummary(p.wave),
    };
  }

  setGrade(p, grade) {
    if (![1, 2, 3, 4].includes(grade)) throw new GameError('Класс должен быть от 1 до 4');
    const g = this.config.settings().grades[grade];
    p.grade = grade;
    p.skills = {};
    for (const [topic, tier] of Object.entries(g)) p.skills[topic] = { tier, recent: [] };
    this.save(p);
    return p;
  }

  upgrade(p, key) {
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
    this.save(p);
    return p;
  }

  setDeck(p, deck) {
    if (!isValidDeck(deck, p.buildings.library)) throw new GameError('Такую колоду собрать нельзя');
    p.deck = deck;
    this.save(p);
    return p;
  }

  // ---------- Сложность ----------
  /** Текущий тир темы для игрока (0 — тема выключена для его класса) */
  tierFor(p, topic) {
    const tiers = this.config.topic(topic);
    const t = p.skills[topic]?.tier ?? this.config.settings().grades[p.grade || 1][topic] ?? 1;
    return t === 0 ? 0 : Math.min(Math.max(1, t), tiers.length);
  }

  // ---------- Бой ----------
  startBattle(p) {
    if (!p.grade) throw new GameError('Сначала выбери класс');
    const settings = this.config.settings();
    const problems = {};
    const tiers = {};
    // Какие темы нужны: по картам колоды
    for (const key of p.deck) {
      const slot = CARDS[key].topic;
      if (problems[slot]) continue;
      let topic = slot;
      if (this.tierFor(p, topic) === 0) topic = 'addsub'; // тема выключена для класса — запасная
      const tier = this.tierFor(p, topic);
      tiers[slot] = { topic, tier };
      problems[slot] = generateBatch(topic, this.config.topic(topic)[tier - 1], settings.problemsPerTopic);
    }
    const seed = randomInt(1, 2 ** 31);
    // Незавершённые бои игрока закрываем (например, закрыл приложение посреди боя)
    this.db.prepare("UPDATE battles SET finished_at=?, result='abandoned' WHERE tg_id=? AND finished_at IS NULL").run(Date.now(), p.tg_id);
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO battles (tg_id, wave, problems, tiers, deck, seed, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.tg_id, p.wave, JSON.stringify(problems), JSON.stringify(tiers), JSON.stringify(p.deck), seed, Date.now());
    return { battleId: Number(lastInsertRowid), wave: p.wave, problems, tiers, deck: p.deck, seed };
  }

  /**
   * Завершение боя. Ответы проверяются по заданиям, сохранённым на сервере,
   * награда считается здесь же — клиент не может «накрутить» себе золото.
   * report = { battleId, victory, kills: {walker: n, ...}, answers: [{slot, i, given, ms}],
   *            plays: [{card, t}], lost: ['towerL', ...] }
   */
  finishBattle(p, report) {
    const battle = this.db.prepare('SELECT * FROM battles WHERE id = ? AND tg_id = ?').get(report.battleId, p.tg_id);
    if (!battle) throw new GameError('Бой не найден');
    if (battle.finished_at) throw new GameError('Бой уже завершён');
    const problems = JSON.parse(battle.problems);
    const tiers = JSON.parse(battle.tiers);
    const settings = this.config.settings();

    // 1. Проверка ответов
    let correct = 0;
    let total = 0;
    let streak = 0;
    let manaEarned = 0;
    const seen = new Set(); // один и тот же ответ дважды не считается
    const perTopic = {};
    const answers = Array.isArray(report.answers) ? report.answers.slice(0, 1000) : [];
    for (const a of answers) {
      const list = problems[a.slot];
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
    const deck = battle.deck ? JSON.parse(battle.deck) : [];
    const plays = Array.isArray(report.plays) ? report.plays.slice(0, 1000) : [];
    let manaSpent = 0;
    let forged = false;
    for (const play of plays) {
      if (!deck.includes(play?.card)) forged = true;
      else manaSpent += CARDS[play.card].cost;
    }
    if (manaSpent > manaEarned) forged = true;

    // 2. Убитые зомби — не больше, чем было в волне
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

    // Какие постройки потеряны
    const lost = [...new Set((Array.isArray(report.lost) ? report.lost : []).filter((b) => ['castle', 'towerL', 'towerR'].includes(b)))];
    const towersSaved = 2 - lost.filter((b) => b !== 'castle').length;

    // 3. Награды
    const goldBonus = BUILDINGS.treasury.effect(p.buildings.treasury).goldBonus;
    const { gold, towerGold } = battleGold({ kills: forged ? {} : killed, victory, wave: battle.wave, towersSaved, goldBonus });
    const xp = correct * XP_PER_CORRECT;
    p.gold += gold;
    p.xp += xp;
    let levelsUp = 0;
    while (p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level++;
      levelsUp++;
    }
    const wave = battle.wave;
    if (victory) {
      p.best_wave = Math.max(p.best_wave, wave);
      if (p.wave === wave) p.wave++;
    }

    // 4. Адаптивная сложность и статистика
    const tierChanges = {};
    const upsert = this.db.prepare(
      'INSERT INTO answer_stats (topic, tier, total, correct, total_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(topic, tier) DO UPDATE SET total = total + excluded.total, correct = correct + excluded.correct, total_ms = total_ms + excluded.total_ms',
    );
    for (const [topic, d] of Object.entries(perTopic)) {
      upsert.run(topic, d.tier, d.results.length, d.results.filter(Boolean).length, Math.round(d.ms));
      const skill = (p.skills[topic] ??= { tier: d.tier, recent: [] });
      if (skill.tier === 0) continue;
      skill.recent = [...skill.recent, ...d.results].slice(-settings.adaptWindow);
      if (skill.recent.length >= settings.adaptWindow) {
        const acc = skill.recent.filter(Boolean).length / skill.recent.length;
        const maxTier = this.config.topic(topic).length;
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

    this.save(p);
    const result = { victory, wave, gold, towerGold, xp, correct, total, kills, levelsUp, tierChanges, manaEarned, manaSpent, cardsPlayed: plays.length, lost, forged };
    this.db.prepare('UPDATE battles SET finished_at=?, result=? WHERE id=?').run(Date.now(), JSON.stringify(result), battle.id);
    return result;
  }

  // ---------- Для админки ----------
  stats() {
    const players = this.db.prepare('SELECT COUNT(*) n, MAX(best_wave) best, AVG(level) lvl FROM players').get();
    const active = this.db.prepare('SELECT COUNT(DISTINCT tg_id) n FROM battles WHERE started_at > ?').get(Date.now() - 7 * 864e5);
    const battles = this.db.prepare("SELECT COUNT(*) n, SUM(json_extract(result,'$.victory')) wins FROM battles WHERE finished_at IS NOT NULL AND result != 'abandoned'").get();
    const answers = this.db.prepare('SELECT * FROM answer_stats ORDER BY topic, tier').all();
    const grades = this.db.prepare('SELECT grade, COUNT(*) n FROM players GROUP BY grade').all();
    return { players, active, battles, answers, grades };
  }
}
