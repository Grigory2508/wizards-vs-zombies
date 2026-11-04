// Хранилище на встроенном SQLite (node:sqlite) — для локальной разработки и тестов.
// Те же методы, что у Postgres-хранилища в Supabase (supabase/functions/_shared/pg-store.ts).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const parse = (s) => (s == null ? null : JSON.parse(s));

export function openSqlite(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');

  // Базы первой версии хранили игрока по колонкам — переносим в один JSON-документ
  const oldPlayers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='players'").get()
    && db.prepare('PRAGMA table_info(players)').all().some((c) => c.name === 'buildings');
  if (oldPlayers) db.exec('ALTER TABLE players RENAME TO players_v1');
  const oldBattles = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='battles'").get()
    && !db.prepare('PRAGMA table_info(battles)').all().some((c) => c.name === 'data');
  if (oldBattles) db.exec('ALTER TABLE battles RENAME TO battles_v1');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      tg_id INTEGER PRIMARY KEY,
      state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      result TEXT
    );
    CREATE INDEX IF NOT EXISTS battles_player ON battles (tg_id, finished_at);
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER, admin_name TEXT, key TEXT NOT NULL, before TEXT, after TEXT, note TEXT, at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS answer_stats (
      topic TEXT NOT NULL, tier INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (topic, tier)
    );
  `);

  if (oldPlayers) {
    const ins = db.prepare('INSERT INTO players (tg_id, state, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
    for (const r of db.prepare('SELECT * FROM players_v1').all()) {
      const state = {
        name: r.name, grade: r.grade, level: r.level, xp: r.xp, gold: r.gold, wave: r.wave, bestWave: r.best_wave,
        buildings: parse(r.buildings), skills: parse(r.skills) ?? {}, deck: parse(r.deck),
      };
      ins.run(r.tg_id, JSON.stringify(state), r.created_at, r.updated_at);
    }
    db.exec('DROP TABLE players_v1');
  }
  if (oldBattles) db.exec('DROP TABLE battles_v1'); // незавершённые бои старого формата не нужны
  return db;
}

export class SqliteStore {
  constructor(db) {
    this.db = db;
  }

  // ---------- Игроки ----------
  async getPlayer(tgId) {
    const r = this.db.prepare('SELECT state, version FROM players WHERE tg_id = ?').get(tgId);
    return r ? { state: parse(r.state), version: r.version } : null;
  }
  async insertPlayer(tgId, state) {
    const now = Date.now();
    const r = this.db.prepare('INSERT OR IGNORE INTO players (tg_id, state, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').run(tgId, JSON.stringify(state), now, now);
    return r.changes > 0;
  }
  async updatePlayer(tgId, state, version) {
    const r = this.db
      .prepare('UPDATE players SET state = ?, version = version + 1, updated_at = ? WHERE tg_id = ? AND version = ?')
      .run(JSON.stringify(state), Date.now(), tgId, version);
    return r.changes > 0;
  }

  // ---------- Бои ----------
  async abandonBattles(tgId) {
    this.db.prepare("UPDATE battles SET finished_at = ?, result = '\"abandoned\"' WHERE tg_id = ? AND finished_at IS NULL").run(Date.now(), tgId);
  }
  async insertBattle(tgId, battle) {
    const r = this.db.prepare('INSERT INTO battles (tg_id, data, started_at) VALUES (?, ?, ?)').run(tgId, JSON.stringify(battle), Date.now());
    return Number(r.lastInsertRowid);
  }
  async claimBattle(id, tgId) {
    const r = this.db.prepare('UPDATE battles SET finished_at = ? WHERE id = ? AND tg_id = ? AND finished_at IS NULL RETURNING data').get(Date.now(), id, tgId);
    if (r) return parse(r.data);
    const exists = this.db.prepare('SELECT 1 FROM battles WHERE id = ? AND tg_id = ?').get(id, tgId);
    return exists ? 'finished' : null;
  }
  async setBattleResult(id, result) {
    this.db.prepare('UPDATE battles SET result = ? WHERE id = ?').run(JSON.stringify(result), id);
  }
  async addAnswerStats(rows) {
    const up = this.db.prepare(
      'INSERT INTO answer_stats (topic, tier, total, correct, total_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(topic, tier) DO UPDATE SET total = total + excluded.total, correct = correct + excluded.correct, total_ms = total_ms + excluded.total_ms',
    );
    for (const s of rows) up.run(s.topic, s.tier, s.total, s.correct, s.ms);
  }

  // ---------- Для админки ----------
  async stats() {
    const q = (sql, ...a) => this.db.prepare(sql).get(...a);
    const players = q("SELECT COUNT(*) n, MAX(json_extract(state,'$.bestWave')) best, AVG(json_extract(state,'$.level')) lvl FROM players");
    const active = q('SELECT COUNT(DISTINCT tg_id) n FROM battles WHERE started_at > ?', Date.now() - 7 * 864e5);
    const battles = q("SELECT COUNT(*) n, SUM(json_extract(result,'$.victory')) wins FROM battles WHERE result IS NOT NULL AND result != '\"abandoned\"'");
    const answers = this.db.prepare('SELECT topic, tier, total, correct, total_ms FROM answer_stats ORDER BY topic, tier').all();
    const grades = this.db.prepare("SELECT json_extract(state,'$.grade') grade, COUNT(*) n FROM players GROUP BY 1 ORDER BY 1").all();
    return { players, active, battles, answers, grades };
  }

  // ---------- Настройки и журнал ----------
  async configAll() {
    return Object.fromEntries(this.db.prepare('SELECT key, value FROM config').all().map((r) => [r.key, parse(r.value)]));
  }
  async configPut(key, value) {
    this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }
  async logInsert({ adminId, adminName, key, before, after, note }) {
    this.db
      .prepare('INSERT INTO config_log (admin_id, admin_name, key, before, after, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(adminId, adminName, key, JSON.stringify(before), JSON.stringify(after), note, Date.now());
  }
  async logList(limit) {
    return this.db.prepare('SELECT id, admin_name, key, note, at FROM config_log ORDER BY id DESC LIMIT ?').all(limit);
  }
  async logLastUndoable() {
    const r = this.db.prepare("SELECT id, key, before FROM config_log WHERE note NOT LIKE 'undo%' ORDER BY id DESC LIMIT 1").get();
    return r ? { id: r.id, key: r.key, before: parse(r.before) } : null;
  }
  async logMarkUndone(id) {
    this.db.prepare("UPDATE config_log SET note = 'undone: ' || note WHERE id = ?").run(id);
  }
}
