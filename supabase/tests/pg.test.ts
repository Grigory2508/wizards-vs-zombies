// Сценарии сервера игры (test/scenarios.js) на Postgres-хранилище, как в Supabase.
// Нужны Postgres с применённой миграцией и запущенный supabase/tests/postgrest-lite.mjs:
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=test deno test -A supabase/tests/pg.test.ts
import assert from 'node:assert/strict';
import { scenarios } from '../../test/scenarios.js';
import { Game } from '../functions/_shared/server/game.js';
import { PgStore } from '../functions/_shared/pg-store.ts';

const base = Deno.env.get('SUPABASE_URL')!;

for (const [name, run] of scenarios) {
  Deno.test(`сервер (Postgres): ${name}`, async () => {
    await (await fetch(`${base}/__reset`)).text();
    const store = new PgStore();
    const game = new Game(store);
    const patch = async (tgId: number, fn: (p: Record<string, unknown>) => void) => {
      const row = await store.getPlayer(tgId);
      const state = structuredClone(row!.state);
      fn(state);
      assert.ok(await store.updatePlayer(tgId, state, row!.version));
    };
    await run({ game, store, patch });
  });
}
