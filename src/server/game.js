// Сервер игры поверх любого хранилища (SQLite локально, Postgres в Supabase).
// Логика — в src/core; здесь только загрузка, сохранение с проверкой версии и журнал настроек.
//
// Хранилище (store) — объект с асинхронными методами:
//   getPlayer(tgId) → { state, version } | null
//   insertPlayer(tgId, state) → boolean            (false — игрок уже есть)
//   updatePlayer(tgId, state, version) → boolean   (false — версия устарела, кто-то успел раньше)
//   abandonBattles(tgId)
//   insertBattle(tgId, battle) → id
//   claimBattle(id, tgId) → battle | null | 'finished'   (атомарно помечает бой завершённым)
//   setBattleResult(id, result)
//   addAnswerStats([{topic, tier, total, correct, ms}])
//   stats() → { players, active, battles, answers, grades }
//   configAll() → { key: value }
//   configPut(key, value)
//   logInsert({ adminId, adminName, key, before, after, note })
//   logList(limit) → [{ id, admin_name, key, note, at }]
//   logLastUndoable() → { id, key, before } | null
//   logMarkUndone(id)
//   — классы и рейтинг —
//   getClass(code) → { owner, data, version } | null
//   insertClass(code, owner, data) → boolean       (false — такой код уже занят)
//   updateClass(code, data, version) → boolean
//   classesByOwner(owner) → [{ code, data, students }]
//   classStudents(code) → [{ tgId, state, updatedAt }]
//   leaderboard({ period: 'week'|'all', week, classCode, limit, me }) → { rows: [{ rank, name, best, correct, me }], me: {...} | null }
import { DEFAULT_SETTINGS, DEFAULT_TOPICS, generateBatch } from '../core/problems.js';
import { TOPICS } from '../core/balance.js';
import {
  GameError, applyBattle, answerStats, buildBattle, judgeBattle, migratePlayer, newPlayer, publicState, setDeck, setGrade, upgrade,
} from '../core/player.js';
import {
  CODE_ALPHABET, LIMITS, addTask, addTaskResults, classForStudent, classForTeacher, editTask, newClass, ratingOf, removeTask, updateClass, weekId,
} from '../core/classroom.js';

export { GameError };

const RETRIES = 5;

/** Снимок настроек сложности; недостающие ключи берутся по умолчанию */
export function configSnapshot(map) {
  const saved = Object.fromEntries(Object.entries(map ?? {}).filter(([, v]) => v != null));
  const all = { settings: DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(DEFAULT_TOPICS).map(([t, v]) => [`topic:${t}`, v])), ...saved };
  return {
    get: (key) => all[key] ?? null,
    topic: (t) => all[`topic:${t}`],
    settings: () => all.settings,
    exportAll: () => structuredClone(all),
  };
}

/** Настройки сложности с журналом изменений и откатом */
export class Config {
  constructor(store) {
    this.store = store;
  }
  async load() {
    return configSnapshot(await this.store.configAll());
  }
  async set(key, value, admin = {}, note = '') {
    const before = (await this.load()).get(key);
    await this.store.configPut(key, value);
    await this.store.logInsert({ adminId: admin.id ?? null, adminName: admin.name ?? null, key, before, after: value, note });
  }
  log(limit = 10) {
    return this.store.logList(limit);
  }
  /** Откатить последнее изменение (сам откат тоже попадает в журнал) */
  async undo(admin) {
    const last = await this.store.logLastUndoable();
    if (!last) return null;
    await this.set(last.key, last.before, admin, `undo #${last.id}`);
    await this.store.logMarkUndone(last.id);
    return last;
  }
}

function newCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

const cleanCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

function randomSeed() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0] % (2 ** 31 - 2)) + 1;
}

export class Game {
  constructor(store) {
    this.store = store;
    this.config = new Config(store);
  }

  async load(user) {
    for (let i = 0; i < RETRIES; i++) {
      const row = await this.store.getPlayer(user.id);
      if (row) return { p: migratePlayer(row.state), version: row.version };
      if (await this.store.insertPlayer(user.id, newPlayer(user))) continue;
    }
    throw new Error('Не удалось создать игрока');
  }

  /** Изменить игрока: при одновременной записи (вторая вкладка) повторяем с новой версией */
  async mutate(user, fn) {
    const cfg = await this.config.load();
    for (let i = 0; i < RETRIES; i++) {
      const { p, version } = await this.load(user);
      const out = fn(p, cfg);
      if (await this.store.updatePlayer(user.id, p, version)) return { p, out };
    }
    throw new GameError('Игра открыта в другом окне — обновите страницу');
  }

  /** Состояние для клиента: игрок + его класс */
  async view(p) {
    const row = p.classCode ? await this.store.getClass(p.classCode) : null;
    return { ...publicState(p), class: classForStudent(p.classCode, row?.data) };
  }

  async state(user) {
    const { p } = await this.load(user);
    // Имя в Telegram могли поменять — обновим, чтобы в рейтинге было актуальное
    const name = String(user.first_name ?? '').trim().slice(0, 40);
    if (name && name !== p.name) return this.view((await this.mutate(user, (pl) => (pl.name = name))).p);
    return this.view(p);
  }

  async setGrade(user, grade) {
    return this.view((await this.mutate(user, (p, cfg) => setGrade(p, cfg, grade))).p);
  }

  async upgrade(user, key) {
    return this.view((await this.mutate(user, (p) => upgrade(p, key))).p);
  }

  async setDeck(user, deck) {
    return this.view((await this.mutate(user, (p) => setDeck(p, deck))).p);
  }

  async startBattle(user) {
    const cfg = await this.config.load();
    const { p } = await this.load(user);
    const cls = p.classCode ? (await this.store.getClass(p.classCode))?.data : null;
    const battle = buildBattle(p, cfg, randomSeed(), cls);
    // Незавершённые бои игрока закрываем (например, закрыл приложение посреди боя)
    await this.store.abandonBattles(user.id);
    const id = await this.store.insertBattle(user.id, battle);
    return { battleId: id, ...battle };
  }

  async finishBattle(user, report) {
    const battleId = Number(report?.battleId);
    if (!Number.isInteger(battleId)) throw new GameError('Бой не найден');
    // Бой помечается завершённым атомарно: один и тот же отчёт дважды награды не даст
    const battle = await this.store.claimBattle(battleId, user.id);
    if (battle === 'finished') throw new GameError('Бой уже завершён');
    if (!battle) throw new GameError('Бой не найден');
    const judged = judgeBattle(battle, report ?? {});
    const week = weekId(Date.now());
    const { p, out: result } = await this.mutate(user, (pl, cfg) => applyBattle(pl, cfg, judged, week));
    await this.store.setBattleResult(battleId, result);
    await this.store.addAnswerStats(answerStats(judged));
    // Статистика по заданиям учителя — в его класс
    if (p.classCode && Object.keys(judged.taskResults).length) {
      await this.mutateClass(p.classCode, (cls) => addTaskResults(cls, judged.taskResults)).catch(() => {});
    }
    return { result, state: await this.view(p) };
  }

  // ---------- Рейтинг ----------
  /** period: 'week' | 'all'; scope: 'all' | 'class' */
  async leaderboard(user, { period, scope }) {
    const { p } = await this.load(user);
    const week = weekId(Date.now());
    const classCode = scope === 'class' ? p.classCode : null;
    if (scope === 'class' && !classCode) return { rows: [], me: null, week, noClass: true };
    const board = await this.store.leaderboard({ period: period === 'week' ? 'week' : 'all', week, classCode, limit: 50, me: user.id });
    return { ...board, week, mine: ratingOf(p, week) };
  }

  // ---------- Классы: ученик ----------
  async classInfo(code) {
    const c = cleanCode(code);
    const row = c ? await this.store.getClass(c) : null;
    if (!row) throw new GameError('Класс не найден — попросите у учителя новую ссылку');
    return classForStudent(c, row.data);
  }

  async joinClass(user, code) {
    const c = cleanCode(code);
    const row = c ? await this.store.getClass(c) : null;
    if (!row) throw new GameError('Класс не найден — попросите у учителя новую ссылку');
    const { p } = await this.mutate(user, (pl, cfg) => {
      pl.classCode = c;
      // Год обучения класса — новичкам, кто его ещё не выбрал
      if (!pl.grade && row.data.grade) setGrade(pl, cfg, row.data.grade);
    });
    return this.view(p);
  }

  async leaveClass(user) {
    return this.view((await this.mutate(user, (p) => (p.classCode = null))).p);
  }

  // ---------- Классы: учитель ----------
  async mutateClass(code, fn) {
    for (let i = 0; i < RETRIES; i++) {
      const row = await this.store.getClass(code);
      if (!row) throw new GameError('Класс не найден');
      const data = structuredClone(row.data);
      const out = fn(data, row);
      if (await this.store.updateClass(code, data, row.version)) return { data, out };
    }
    throw new GameError('Класс изменили в другом окне — обновите страницу');
  }

  /** Класс, которым владеет пользователь; иначе ошибка */
  async ownClass(user, code) {
    const c = cleanCode(code);
    const row = c ? await this.store.getClass(c) : null;
    if (!row || Number(row.owner) !== Number(user.id)) throw new GameError('Это не ваш класс');
    return c;
  }

  async teacherClasses(user) {
    const list = await this.store.classesByOwner(user.id);
    return list.map((r) => ({ code: r.code, name: r.data.name, students: Number(r.students) || 0, tasks: r.data.tasks.length }));
  }

  async createClass(user, { name, grade }) {
    const mine = await this.store.classesByOwner(user.id);
    if (mine.length >= LIMITS.classesPerTeacher) throw new GameError(`Не больше ${LIMITS.classesPerTeacher} классов`);
    const data = newClass({ name, grade, ownerName: user.first_name });
    for (let i = 0; i < RETRIES; i++) {
      const code = newCode();
      if (await this.store.insertClass(code, user.id, data)) return this.classDetail(user, code);
    }
    throw new Error('Не удалось создать класс');
  }

  /** Всё о классе для страницы учителя: настройки, задания, ученики, примеры уровней сложности */
  async classDetail(user, code) {
    const c = await this.ownClass(user, code);
    const row = await this.store.getClass(c);
    const cfg = await this.config.load();
    const week = weekId(Date.now());
    const students = (await this.store.classStudents(c))
      .map(({ tgId, state, updatedAt }) => {
        const p = migratePlayer(state);
        const r = ratingOf(p, week);
        return {
          id: Number(tgId), name: p.name, grade: p.grade, level: p.level,
          bestWave: r.allBest, weekBest: r.weekBest, totalCorrect: r.allCorrect, weekCorrect: r.weekCorrect,
          tiers: Object.fromEntries(Object.entries(p.skills).map(([t, sk]) => [t, sk.tier])),
          lastPlayed: updatedAt,
        };
      })
      .sort((a, b) => b.bestWave - a.bestWave || b.totalCorrect - a.totalCorrect);
    // Чтобы учитель видел, что значит «уровень 3»: по три примера на каждый уровень темы
    const levels = Object.fromEntries(Object.keys(TOPICS).map((t) => [t, cfg.topic(t).map((params) => generateBatch(t, params, 3).map((x) => x.q))]));
    return { ...classForTeacher(c, row.data), students, levels, topics: TOPICS };
  }

  async classUpdate(user, code, patch) {
    const c = await this.ownClass(user, code);
    await this.mutateClass(c, (cls) => updateClass(cls, patch ?? {}));
    return this.classDetail(user, c);
  }

  async taskAdd(user, code, task) {
    const c = await this.ownClass(user, code);
    await this.mutateClass(c, (cls) => addTask(cls, task));
    return this.classDetail(user, c);
  }

  async taskEdit(user, code, id, task) {
    const c = await this.ownClass(user, code);
    await this.mutateClass(c, (cls) => editTask(cls, id, task));
    return this.classDetail(user, c);
  }

  async taskRemove(user, code, id) {
    const c = await this.ownClass(user, code);
    await this.mutateClass(c, (cls) => removeTask(cls, id));
    return this.classDetail(user, c);
  }

  /** Убрать ученика из класса (например, чужой зашёл по пересланной ссылке) */
  async removeStudent(user, code, studentId) {
    const c = await this.ownClass(user, code);
    const sid = Number(studentId);
    if (!Number.isInteger(sid) || !(await this.store.getPlayer(sid))) throw new GameError('Этого ученика нет в классе');
    await this.mutate({ id: sid }, (p) => {
      if (p.classCode !== c) throw new GameError('Этого ученика нет в классе');
      p.classCode = null;
    });
    return this.classDetail(user, c);
  }

  stats() {
    return this.store.stats();
  }
}

/** Разбор запроса API: { op, ... } → ответ. Одинаково для Node и Supabase. */
export async function handleOp(game, user, body) {
  switch (body?.op) {
    case 'state':
      return game.state(user);
    case 'grade':
      return game.setGrade(user, Number(body.grade));
    case 'upgrade':
      return game.upgrade(user, String(body.building));
    case 'deck':
      return game.setDeck(user, body.deck);
    case 'battleStart':
      return game.startBattle(user);
    case 'battleFinish':
      return game.finishBattle(user, body);
    case 'leaderboard':
      return game.leaderboard(user, { period: body.period, scope: body.scope });
    case 'classInfo':
      return game.classInfo(body.code);
    case 'joinClass':
      return game.joinClass(user, body.code);
    case 'leaveClass':
      return game.leaveClass(user);
    case 'teacherClasses':
      return game.teacherClasses(user);
    case 'createClass':
      return game.createClass(user, { name: body.name, grade: body.grade });
    case 'classDetail':
      return game.classDetail(user, body.code);
    case 'classUpdate':
      return game.classUpdate(user, body.code, body.patch);
    case 'taskAdd':
      return game.taskAdd(user, body.code, body.task);
    case 'taskEdit':
      return game.taskEdit(user, body.code, body.id, body.task);
    case 'taskRemove':
      return game.taskRemove(user, body.code, body.id);
    case 'removeStudent':
      return game.removeStudent(user, body.code, body.studentId);
    default:
      throw new GameError('Неизвестная команда');
  }
}
