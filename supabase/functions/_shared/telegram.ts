// Взято из эталона coffee-for-two.
// Проверка initData Mini App (HMAC-SHA-256 по токену бота) и вызовы Bot API.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TgUser {
  id: number;
  first_name: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

const enc = new TextEncoder();

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Возвращает пользователя, если подпись верна и данные не старше maxAgeSec. */
export async function verifyInitData(initData: string, botToken: string, maxAgeSec = 24 * 3600): Promise<{ user: TgUser; startParam?: string } | null> {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData') as Uint8Array<ArrayBuffer>, botToken);
  const calc = hex(await hmac(secret, checkString));
  if (calc !== hash) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null;
  if (!user?.id) return null;
  return { user, startParam: params.get('start_param') ?? undefined };
}

export async function botApi<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; error_code?: number; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}
