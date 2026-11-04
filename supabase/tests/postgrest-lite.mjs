// Маленькая имитация PostgREST поверх настоящего Postgres — для проверки Edge Functions без Supabase.
// Поддерживает ровно то, чем пользуется _shared/db.ts: select с фильтрами eq / is.null / not.like,
// order, limit; insert с upsert / ignore-duplicates; patch с фильтрами; rpc.
// Запросы выполняются от роли service_role, как у функций в Supabase.
// Запуск: DATABASE_URL=postgres://... node supabase/tests/postgrest-lite.mjs  (порт 54321)
import http from 'node:http';
import pg from 'pg';

pg.types.setTypeParser(20, Number); // bigint → число, как в PostgREST
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PORT = Number(process.env.PORT || 54321);
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};

async function columns(client, table) {
  const r = await client.query("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1", [table]);
  return Object.fromEntries(r.rows.map((x) => [x.column_name, x.data_type]));
}

function where(params, cols, args) {
  const parts = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (!cols[k]) throw new Error(`unknown column ${k}`);
    if (v === 'is.null') parts.push(`${ident(k)} is null`);
    else if (v.startsWith('eq.')) {
      args.push(v.slice(3));
      parts.push(`${ident(k)} = $${args.length}`);
    } else if (v.startsWith('not.like.')) {
      args.push(v.slice(9).replaceAll('*', '%'));
      parts.push(`${ident(k)} not like $${args.length}`);
    } else throw new Error(`unsupported filter ${k}=${v}`);
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

const val = (cols, k, v) => (cols[k] === 'jsonb' ? JSON.stringify(v) : v);

async function handle(method, path, params, body, prefer) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role service_role');
    let out;
    const [, , , table, fn] = path.split('/'); // /rest/v1/<table> | /rest/v1/rpc/<fn>
    if (table === 'rpc') {
      const keys = Object.keys(body);
      const sql = `select public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) as v`;
      const r = await client.query(sql, keys.map((k) => (typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k])));
      out = r.rows[0].v;
    } else {
      const cols = await columns(client, table);
      const args = [];
      if (method === 'GET') {
        const sel = (params.get('select') || '*').split(',').map((c) => (c === '*' ? '*' : ident(c))).join(', ');
        let sql = `select ${sel} from public.${ident(table)}${where(params, cols, args)}`;
        if (params.get('order')) {
          const [c, dir] = params.get('order').split('.');
          sql += ` order by ${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}`;
        }
        if (params.get('limit')) sql += ` limit ${Number(params.get('limit'))}`;
        out = (await client.query(sql, args)).rows;
      } else if (method === 'POST') {
        const keys = Object.keys(body);
        const vals = keys.map((k) => val(cols, k, body[k]));
        let sql = `insert into public.${ident(table)} (${keys.map(ident).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`;
        if (prefer.includes('resolution=merge-duplicates')) {
          sql += ` on conflict on constraint ${ident(`${table}_pkey`)} do update set ${keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
        }
        if (prefer.includes('resolution=ignore-duplicates')) sql += ' on conflict do nothing';
        out = (await client.query(`${sql} returning *`, vals)).rows;
      } else if (method === 'PATCH') {
        const keys = Object.keys(body);
        for (const k of keys) args.push(val(cols, k, body[k]));
        const set = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
        out = (await client.query(`update public.${ident(table)} set ${set}${where(params, cols, args)} returning *`, args)).rows;
      } else throw new Error(`unsupported ${method}`);
    }
    await client.query('commit');
    return { status: 200, body: out };
  } catch (e) {
    await client.query('rollback');
    return { status: 400, body: { message: e.message } };
  } finally {
    client.release();
  }
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__reset') {
        await pool.query('truncate public.players, public.battles, public.config, public.config_log, public.answer_stats restart identity');
        res.end('ok');
        return;
      }
      const r = await handle(req.method, url.pathname, url.searchParams, raw ? JSON.parse(raw) : {}, String(req.headers.prefer || ''));
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(r.body === null || r.body === undefined ? '' : JSON.stringify(r.body));
    });
  })
  .listen(PORT, () => console.log(`postgrest-lite on :${PORT}`));
