// Копирует общий код игры в папку Edge Functions, чтобы сервер в Supabase считал так же,
// как клиент и локальный сервер: src/core → _shared/core, src/server → _shared/server.
// Запускать после любой правки src/core или src/server (CI проверяет, что копия совпадает).
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

for (const dir of ['core', 'server']) {
  const from = `src/${dir}`;
  const to = `supabase/functions/_shared/${dir}`;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    if (f.endsWith('.test.js')) continue;
    cpSync(`${from}/${f}`, `${to}/${f}`);
  }
  console.log(`${from} → ${to}`);
}
