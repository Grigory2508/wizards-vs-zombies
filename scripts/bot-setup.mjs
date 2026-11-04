// Настройка бота после выкладки: вебхук на Supabase, меню команд, кнопка «Играть».
// Запускает .github/workflows/server.yml. Переменные:
//   BOT_TOKEN, WEBHOOK_SECRET, PROJECT_REF, WEBAPP_URL, ADMIN_IDS (через запятую)
import { setupBot } from '../src/server/bot.js';

const { BOT_TOKEN, WEBHOOK_SECRET = '', PROJECT_REF, WEBAPP_URL = '', ADMIN_IDS = '' } = process.env;
if (!BOT_TOKEN || !PROJECT_REF) throw new Error('Нужны BOT_TOKEN и PROJECT_REF');

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const me = await call('getMe', {});
console.log(`Бот: @${me.username}`);

await call('setWebhook', {
  url: `https://${PROJECT_REF}.supabase.co/functions/v1/bot`,
  secret_token: WEBHOOK_SECRET || undefined,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});
console.log('Вебхук установлен');

const env = { adminIds: ADMIN_IDS.split(/[,\s]+/).filter(Boolean).map(Number), webAppUrl: WEBAPP_URL };
// setupBot ожидает методы в стиле grammY: api.setMyCommands(commands, other), api.setChatMenuButton(other)
await setupBot(
  {
    setMyCommands: (commands, other = {}) => call('setMyCommands', { commands, ...other }),
    setChatMenuButton: (other) => call('setChatMenuButton', other),
  },
  env,
);
console.log(`Команды и кнопка «Играть» (${WEBAPP_URL || 'адрес не задан'}) настроены, админов: ${env.adminIds.length}`);
