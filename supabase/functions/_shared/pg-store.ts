// Хранилище игры на Postgres (Supabase) через PostgREST.
// Те же методы, что у SQLite-хранилища для локальной разработки (src/node/sqlite-store.js);
// описание контракта — в начале src/server/game.js.
import { insert, insertIgnore, rpc, select, update } from './db.ts';

type Json = Record<string, unknown>;
const now = () => new Date().toISOString();
const id = (n: number) => encodeURIComponent(String(n));

export class PgStore {
  // ---------- Игроки ----------
  async getPlayer(tgId: number) {
    const rows = await select<{ state: Json; version: number }>('players', `tg_id=eq.${id(tgId)}&select=state,version`);
    return rows[0] ?? null;
  }

  async insertPlayer(tgId: number, state: Json) {
    return (await insertIgnore('players', { tg_id: tgId, state, version: 1 })).length > 0;
  }

  /** Сохраняет, только если версия не изменилась; иначе false — игру уже кто-то обновил */
  async updatePlayer(tgId: number, state: Json, version: number) {
    const rows = await update('players', `tg_id=eq.${id(tgId)}&version=eq.${id(version)}`, { state, version: version + 1, updated_at: now() });
    return rows.length > 0;
  }

  // ---------- Бои ----------
  async abandonBattles(tgId: number) {
    await update('battles', `tg_id=eq.${id(tgId)}&finished_at=is.null`, { finished_at: now(), result: 'abandoned' });
  }

  async insertBattle(tgId: number, battle: Json) {
    const [row] = await insert<{ id: number }>('battles', { tg_id: tgId, data: battle });
    return Number(row.id);
  }

  async claimBattle(battleId: number, tgId: number) {
    const r = await rpc<{ status: string; data?: Json }>('claim_battle', { p_id: battleId, p_tg: tgId });
    if (r.status === 'ok') return r.data;
    return r.status === 'finished' ? 'finished' : null;
  }

  async setBattleResult(battleId: number, result: Json) {
    await update('battles', `id=eq.${id(battleId)}`, { result });
  }

  async addAnswerStats(rows: Json[]) {
    if (rows.length) await rpc('add_answer_stats', { p_rows: rows });
  }

  stats() {
    return rpc<Json>('admin_stats');
  }

  // ---------- Настройки и журнал ----------
  async configAll() {
    const rows = await select<{ key: string; value: unknown }>('config', 'select=key,value');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async configPut(key: string, value: unknown) {
    await insert('config', { key, value }, true);
  }

  async logInsert(e: { adminId: number | null; adminName: string | null; key: string; before: unknown; after: unknown; note: string }) {
    await insert('config_log', { admin_id: e.adminId, admin_name: e.adminName, key: e.key, before: e.before, after: e.after, note: e.note ?? '' });
  }

  logList(limit: number) {
    return select<Json>('config_log', `select=id,admin_name,key,note,at&order=id.desc&limit=${id(limit)}`);
  }

  async logLastUndoable() {
    const rows = await select<{ id: number; key: string; before: unknown; note: string }>('config_log', 'select=id,key,before,note&note=not.like.undo*&order=id.desc&limit=1');
    return rows[0] ?? null;
  }

  async logMarkUndone(logId: number) {
    const [row] = await select<{ note: string }>('config_log', `id=eq.${id(logId)}&select=note`);
    if (row) await update('config_log', `id=eq.${id(logId)}`, { note: `undone: ${row.note}` });
  }
}
