// Взято из эталона coffee-for-two; добавлены rpc и insertIgnore.
// Минимальный клиент PostgREST на fetch — без зависимостей.
const URL_ = Deno.env.get('SUPABASE_URL')!;

/**
 * Новые проекты Supabase используют секретные ключи sb_secret_… (их передают только в заголовке apikey),
 * старые — JWT service_role (apikey + Authorization). Поддерживаем оба варианта.
 */
function serviceHeaders(): Record<string, string> {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return { apikey: key, 'Content-Type': 'application/json' };
    } catch {
      /* падаем на старый ключ */
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No Supabase service key in environment');
  return { apikey: legacy, Authorization: `Bearer ${legacy}`, 'Content-Type': 'application/json' };
}

const headers = serviceHeaders();

export async function select<T>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function insert<T>(table: string, row: Record<string, unknown>, upsert = false): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: `return=representation${upsert ? ',resolution=merge-duplicates' : ''}` },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** PATCH с фильтром; возвращает изменённые строки (пусто — фильтр не совпал, например версия). */
export async function update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`update ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function remove(table: string, query: string): Promise<void> {
  const res = await fetch(`${URL_}/rest/v1/${table}?${query}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${await res.text()}`);
}

/** Вызов SQL-функции (POST /rest/v1/rpc/<name>) */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Вставка с пропуском дубликата по первичному ключу; пусто — строка уже была */
export async function insertIgnore<T>(table: string, row: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}
