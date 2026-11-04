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
import { DEFAULT_SETTINGS, DEFAULT_TOPICS } from '../core/problems.js';
import {
  GameError, applyBattle, answerStats, buildBattle, judgeBattle, migratePlayer, newPlayer, publicState, setDeck, setGrade, upgrade,
} from '../core/player.js';

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

  async state(user) {
    return publicState((await this.load(user)).p);
  }

  async setGrade(user, grade) {
    return publicState((await this.mutate(user, (p, cfg) => setGrade(p, cfg, grade))).p);
  }

  async upgrade(user, key) {
    return publicState((await this.mutate(user, (p) => upgrade(p, key))).p);
  }

  async setDeck(user, deck) {
    return publicState((await this.mutate(user, (p) => setDeck(p, deck))).p);
  }

  async startBattle(user) {
    const cfg = await this.config.load();
    const { p } = await this.load(user);
    const battle = buildBattle(p, cfg, randomSeed());
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
    const { p, out: result } = await this.mutate(user, (pl, cfg) => applyBattle(pl, cfg, judged));
    await this.store.setBattleResult(battleId, result);
    await this.store.addAnswerStats(answerStats(judged));
    return { result, state: publicState(p) };
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
    default:
      throw new GameError('Неизвестная команда');
  }
}
