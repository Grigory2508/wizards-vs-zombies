// Общее для экранов: Telegram, обращение к серверу, мелкие помощники интерфейса.

export const tg = window.Telegram?.WebApp;
export const $ = (id) => document.getElementById(id);
export const params = new URLSearchParams(location.search);

// Настройки задаёт config.js: локально — сервер разработки, на GitHub Pages — сборка (scripts/build-pages.mjs)
export const CONFIG = { apiUrl: 'api', botUsername: '', appShortName: 'play', ...(window.WVZ_CONFIG ?? {}) };

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

/** Команда серверу: { op, ...параметры } → ответ. Вход — по подписи Telegram (initData). */
export async function api(op, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
  else if (CONFIG.devMode && params.has('dev')) headers['X-Dev-User'] = params.get('dev') || '1';
  const res = await fetch(CONFIG.apiUrl, { method: 'POST', headers, body: JSON.stringify({ ...body, op }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

export function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${screen}`));
  window.scrollTo(0, 0);
}

let toastTimer;
export function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/** Текст от людей (имена, задания учителя) — только через esc, чтобы он не стал разметкой */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Вопрос «да/нет»: окно Telegram, а вне Telegram — обычное */
export function ask(text) {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.initData) tg.showConfirm(text, (ok) => resolve(Boolean(ok)));
    else resolve(confirm(text));
  });
}

/** Ссылка-приглашение в класс: t.me/<бот>/<app>?startapp=c_<код> */
export function inviteLink(code) {
  return CONFIG.botUsername ? `https://t.me/${CONFIG.botUsername}/${CONFIG.appShortName || 'play'}?startapp=c_${code}` : '';
}

/** Код класса из ссылки, по которой открыли игру (или ?class=КОД при разработке) */
export function startClassCode() {
  const sp = tg?.initDataUnsafe?.start_param || params.get('class') || '';
  const m = /^c_([A-Za-z0-9]{4,16})$/.exec(sp) || /^([A-Za-z0-9]{4,16})$/.exec(params.get('class') || '');
  return m ? m[1].toUpperCase() : null;
}
