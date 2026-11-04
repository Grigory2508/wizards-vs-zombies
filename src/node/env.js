import 'dotenv/config';

const list = (s) => (s || '').split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite);

export const env = {
  botToken: process.env.BOT_TOKEN || '',
  adminIds: list(process.env.ADMIN_IDS),
  webAppUrl: process.env.WEBAPP_URL || '',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || './data/game.db',
  // DEV_MODE=1 — можно играть в обычном браузере без Telegram (http://localhost:3000/?dev=1)
  devMode: process.env.DEV_MODE === '1',
};
