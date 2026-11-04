import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_TOPICS, DEFAULT_SETTINGS } from './problems.js';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS players (
      tg_id INTEGER PRIMARY KEY,
      name TEXT,
      grade INTEGER,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      wave INTEGER NOT NULL DEFAULT 1,
      buildings TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '{}',
      best_wave INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      problems TEXT NOT NULL,
      tiers TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      result TEXT
    );
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_name TEXT,
      key TEXT NOT NULL,
      before TEXT,
      after TEXT,
      note TEXT,
      at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS answer_stats (
      topic TEXT NOT NULL,
      tier INTEGER NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (topic, tier)
    );
  `);

  // Колонки, появившиеся после первой версии базы
  const addColumn = (table, column, type) => {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  };
  addColumn('players', 'deck', 'TEXT');
  addColumn('battles', 'deck', 'TEXT');
  addColumn('battles', 'seed', 'INTEGER');

  // Начальная конфигурация сложности
  const ins = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
  for (const [topic, tiers] of Object.entries(DEFAULT_TOPICS)) ins.run(`topic:${topic}`, JSON.stringify(tiers));
  ins.run('settings', JSON.stringify(DEFAULT_SETTINGS));
  return db;
}

export class ConfigStore {
  constructor(db) {
    this.db = db;
  }
  get(key) {
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }
  topic(topic) {
    return this.get(`topic:${topic}`);
  }
  settings() {
    return this.get('settings');
  }
  /** Записать значение и добавить запись в журнал изменений */
  set(key, value, admin = {}, note = '') {
    const before = this.get(key);
    this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
    this.db
      .prepare('INSERT INTO config_log (admin_id, admin_name, key, before, after, note, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(admin.id ?? null, admin.name ?? null, key, JSON.stringify(before), JSON.stringify(value), note, Date.now());
  }
  log(limit = 10) {
    return this.db.prepare('SELECT * FROM config_log ORDER BY id DESC LIMIT ?').all(limit);
  }
  /** Откатить последнее изменение (само изменение тоже логируется) */
  undo(admin) {
    const last = this.db.prepare("SELECT * FROM config_log WHERE note NOT LIKE 'undo%' ORDER BY id DESC LIMIT 1").get();
    if (!last) return null;
    this.set(last.key, JSON.parse(last.before), admin, `undo #${last.id}`);
    this.db.prepare("UPDATE config_log SET note = 'undone: ' || note WHERE id = ?").run(last.id);
    return last;
  }
  exportAll() {
    const rows = this.db.prepare('SELECT key, value FROM config ORDER BY key').all();
    return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  }
}
