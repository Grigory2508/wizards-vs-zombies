// Сборка клиента для GitHub Pages: public/ → dist/, общее ядро src/core → dist/shared/,
// и config.js с адресом сервера (Supabase Edge Function api).
//   API_URL=https://<ref>.supabase.co/functions/v1/api node scripts/build-pages.mjs
// Без API_URL игра не сможет сохранять прогресс — сборка предупредит.
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('public', out, { recursive: true });
mkdirSync(`${out}/shared`, { recursive: true });
for (const f of readdirSync('src/core')) if (f.endsWith('.js') && !f.endsWith('.test.js')) cpSync(`src/core/${f}`, `${out}/shared/${f}`);

const apiUrl = process.env.API_URL || '';
if (!apiUrl) console.warn('::warning::API_URL не задан — сайт соберётся, но игра не сможет обратиться к серверу');
// Имя бота и короткое имя Mini App — для ссылок-приглашений в класс (t.me/<бот>/<app>?startapp=c_<код>)
const botUsername = (process.env.BOT_USERNAME || '').replace(/^@/, '');
const appShortName = process.env.APP_SHORTNAME || 'play';
if (!botUsername) console.warn('::warning::BOT_USERNAME не задан — учитель увидит код класса, но не ссылку-приглашение');
writeFileSync(`${out}/config.js`, `window.WVZ_CONFIG = ${JSON.stringify({ apiUrl, botUsername, appShortName, devMode: false })};\n`);
writeFileSync(`${out}/.nojekyll`, '');
console.log(`dist готов, API: ${apiUrl || '(не задан)'}`);
