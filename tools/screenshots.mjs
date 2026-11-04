// Прогон игры в настоящем браузере и скриншоты: node tools/screenshots.mjs [папка]
// Поднимает свой сервер на отдельном порту с временной базой, рабочая база не затрагивается.
// Браузер — установленный Chrome (скачивать отдельный не нужно).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright-core';

const OUT = resolve(process.argv[2] || 'screenshots');
const PORT = 3177;
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640, touch: true },
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '412x915', width: 412, height: 915, touch: true },
  { name: '1280x800', width: 1280, height: 800, touch: false },
];

const dbDir = mkdtempSync(join(tmpdir(), 'wvz-shots-'));
const dbFile = join(dbDir, 'game.db');
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
  env: { ...process.env, PORT: String(PORT), DEV_MODE: '1', BOT_TOKEN: '', DB_FILE: dbFile },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // ещё стартует
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('сервер не запустился');
}

const problems = [];

/** Отвечает на текущий пример: верно или неверно. Берёт данные из самой игры. */
const answerInPage = (page, correct = true) =>
  page.evaluate((good) => {
    const b = window.__battle;
    if (!b?.current || b.current.locked) return false;
    const want = b.current.p.answer;
    const btn = b.optionButtons.find((x) => !x.hidden && (x.dataset.value === want) === good);
    btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return true;
  }, correct);

async function earnMana(page, amount) {
  for (let i = 0; i < 40; i++) {
    const mana = await page.evaluate(() => window.__battle.sim.mana);
    if (mana >= amount) return mana;
    await answerInPage(page);
    await page.waitForTimeout(290);
  }
  throw new Error('мана не набирается');
}

/** Все карты, стадии разрушения и нагрузка. Цифры боя здесь подставляются, в отчёт сервера этот бой не идёт. */
async function effectScenes(page, ctx, vp) {
  const play = (key, x, y) =>
    page.evaluate(([k, px, py]) => {
      const b = window.__battle;
      b.sim.hand[0] = k;
      b.sim.mana = 10;
      b.playCard(0, px, py);
      return b.sim.mana;
    }, [key, x, y]);
  // Побольше зомби на обеих дорожках
  await page.evaluate(() => {
    const s = window.__battle.sim;
    for (const z of s.zombies) z.hp = z.maxHp = 100000;
    const extra = Array.from({ length: 12 }, (_, i) => ({ type: ['runner', 'bucket', 'boss', 'walker'][i % 4], lane: i % 2, time: s.time + i * 0.2, hp: 100000 }));
    s.spawns.splice(s.spawnIdx, 0, ...extra);
    s.total += 12;
    s.towerDps = 0;
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, 'scene-zombies.png') });

  await play('ice', 190, 300);
  await play('guardian', 530, 420);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, 'scene-ice-guardian.png') });
  await play('lightning', 200, 300);
  await page.waitForTimeout(70);
  await page.screenshot({ path: join(OUT, 'scene-lightning.png') });
  await play('meteor', 220, 300);
  await page.waitForTimeout(760);
  await page.screenshot({ path: join(OUT, 'scene-meteor.png') });

  // Разрушение: каждая стадия левой башни и замка
  const damage = (id, ratio) =>
    page.evaluate(([bid, r]) => {
      const s = window.__battle.sim;
      const b = s.buildings().find((x) => x.id === bid);
      s.hurtBuilding(b, b.hp - b.maxHp * r, null);
    }, [id, ratio]);
  await damage('towerL', 0.6);
  await damage('castle', 0.6);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, 'scene-damage-cracks.png') });
  await damage('towerL', 0.2);
  await damage('castle', 0.2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'scene-damage-fire.png') });
  await play('heal', 360, 660);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, 'scene-heal.png') });
  const healed = await page.evaluate(() => window.__battle.sim.castle.hp / window.__battle.sim.castle.maxHp);
  if (healed <= 0.2) problems.push(`целебный круг не починил замок: ${healed}`);
  await damage('towerL', 0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, 'scene-tower-falling.png') });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(OUT, 'scene-tower-rubble.png') });

  // Кадры при нагрузке: процессор замедлен в 4 раза, метеориты сыплются без остановки
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const stress = await page.evaluate(async () => {
    const b = window.__battle;
    const frames = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((resolve) => {
      let cast = 0;
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        if (now - cast > 700) {
          cast = now;
          b.sim.hand[0] = 'meteor';
          b.sim.mana = 10;
          b.playCard(0, 200 + Math.random() * 320, 250 + Math.random() * 300);
        }
        if (now - t0 < 6000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    frames.sort((x, y) => x - y);
    const r = b.renderer;
    return { fps: Math.round(frames.length / 6), p95: Math.round(frames[Math.floor(frames.length * 0.95)]), particles: r.particles.count, zombies: b.sim.zombies.length };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`нагрузка, процессор ×4 медленнее: ${stress.fps} кадров/с, 95% кадров не дольше ${stress.p95} мс (частиц ${stress.particles}, зомби ${stress.zombies})`);
}

async function run(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/telegram\.org|fonts\.g|ERR_|Failed to load resource/.test(m.text())) problems.push(`${vp.name}: ${m.text()}`);
  });
  const id = 1000 + vp.width;
  await page.goto(`${BASE}/?dev=${id}`);
  await page.waitForSelector('#screen-grade.active, #screen-castle.active');
  if (await page.locator('#screen-grade.active').count()) await page.click('[data-grade="2"]');
  await page.waitForSelector('#screen-castle.active');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${vp.name}-castle.png`) });

  // Экран колоды внизу списка
  await page.evaluate(() => document.getElementById('deck-slots').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(OUT, `${vp.name}-deck.png`) });

  await page.evaluate(() => document.querySelector('.castle-scroll').scrollTo(0, 0));
  await page.click('#btn-battle');
  await page.waitForSelector('#screen-battle.active');
  await page.waitForFunction(() => window.__battle?.sim?.zombies.length >= 2, null, { timeout: 25000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${vp.name}-battle.png`) });

  // Геометрия: экран целиком в окне, элементы не вылезают
  const fit = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight };
  });
  if (fit.left < -0.5 || fit.top < -0.5 || fit.right > fit.w + 0.5 || fit.bottom > fit.h + 0.5) problems.push(`${vp.name}: экран боя вылезает за окно: ${JSON.stringify(fit)}`);

  // Неверный ответ: виден правильный
  await answerInPage(page, false);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUT, `${vp.name}-wrong.png`) });
  const manaAfterWrong = await page.evaluate(() => window.__battle.sim.mana);
  if (manaAfterWrong !== 0) problems.push(`${vp.name}: неверный ответ дал ману: ${manaAfterWrong}`);
  await page.waitForTimeout(1050);

  // Набираем ману и перетаскиваем карту на арену настоящими событиями мыши/касания
  await earnMana(page, 6);
  const geom = await page.evaluate(() => {
    const b = window.__battle;
    const card = b.cardEls[0].getBoundingClientRect();
    const stage = b.stage.getBoundingClientRect();
    const z = b.sim.zombies[0];
    return { cx: card.x + card.width / 2, cy: card.y + card.height / 2, tx: stage.x + (z ? z.x : 300) * b.k, ty: stage.y + (z ? z.y + 30 : 400) * b.k };
  });
  await page.mouse.move(geom.cx, geom.cy);
  await page.mouse.down();
  await page.mouse.move((geom.cx + geom.tx) / 2, (geom.cy + geom.ty) / 2, { steps: 4 });
  await page.mouse.move(geom.tx, geom.ty, { steps: 4 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(OUT, `${vp.name}-drag.png`) });
  const manaBefore = await page.evaluate(() => window.__battle.sim.mana);
  await page.mouse.up();
  await page.waitForTimeout(460);
  await page.screenshot({ path: join(OUT, `${vp.name}-impact.png`) });
  const played = await page.evaluate(() => ({ plays: window.__battle.sim.plays.length, mana: window.__battle.sim.mana }));
  if (played.plays !== 1) problems.push(`${vp.name}: перетаскивание не разыграло карту (карт: ${played.plays})`);
  if (played.mana >= manaBefore) problems.push(`${vp.name}: мана не потрачена`);

  if (vp.name === '412x915') await effectScenes(page, ctx, vp);

  // Только на телефоне 390 и на десктопе: доигрываем бой до итогов и замеряем кадры
  if (vp.name === '390x844' || vp.name === '1280x800') {
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else resolve(Math.round((n / (performance.now() - t0)) * 1000));
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`${vp.name}: ${fps} кадров/с на этой машине`);
    for (let i = 0; i < 700; i++) {
      const state = await page.evaluate(() => {
        const b = window.__battle;
        if (!b) return null;
        const slot = b.sim.hand.findIndex((k) => b.sim.mana >= { fireball: 3 }[k]);
        const z = b.sim.zombies[0];
        if (slot >= 0 && z) b.playCard(slot, z.x, z.y);
        return b.sim.ended;
      });
      if (state === null || state) break;
      await answerInPage(page);
      await page.waitForTimeout(280);
    }
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${vp.name}-result.png`) });
    console.log(`${vp.name}: итоги — ${(await page.locator('#result-title').textContent()).trim()}: ${(await page.locator('#result-rows').innerText()).replace(/\s*\n\s*/g, ' | ')}`);
    await page.click('#result-ok');
    await page.waitForSelector('#screen-castle.active');
  }
  await ctx.close();
}

/** Правит игрока прямо в базе прогона (только во временной) */
function patchPlayer(id, fields) {
  const db = new DatabaseSync(dbFile);
  for (const [k, v] of Object.entries(fields)) db.prepare(`UPDATE players SET ${k} = ? WHERE tg_id = ?`).run(typeof v === 'object' ? JSON.stringify(v) : v, id);
  db.close();
}

/** Листы всех состояний: стены × разрушение, башни × разрушение, рост пристроек */
async function contactSheets(page) {
  const png = await page.evaluate(async () => {
    const art = await import('./js/castle-art.js');
    await (await import('./js/sprites.js')).loadSprites(); // листы показывают все стадии сразу
    const render = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#25553f';
      g.fillRect(0, 0, w, h);
      g.font = '700 18px sans-serif';
      draw(g);
      return c.toDataURL('image/png');
    };
    const castles = render(1240, 1240, (g) => {
      [2, 5, 9, 13].forEach((walls, row) => {
        [0, 1, 2, 3].forEach((state, col) => {
          g.save();
          g.translate(col * 310, row * 310);
          g.scale(0.62, 0.62);
          art.drawCastleComposition(g, { walls, tower: 1, library: 3 + row * 4, treasury: 3 + row * 4 }, state);
          g.restore();
          g.fillStyle = '#fff';
          g.fillText(`стены ${walls}, состояние ${state}`, col * 310 + 8, row * 310 + 22);
        });
      });
    });
    const towers = render(560, 780, (g) => {
      [3, 8, 13].forEach((level, row) => {
        [0, 1, 2, 3].forEach((state, col) => {
          g.save();
          g.translate(col * 140 + 14, row * 260 + 16);
          art.drawTower(g, level, state);
          g.restore();
        });
        g.fillStyle = '#fff';
        g.fillText(`башня ${level}`, 8, row * 260 + 18);
      });
    });
    const annexes = render(1200, 420, (g) => {
      [1, 5, 6, 10, 11, 15].forEach((level, i) => {
        art.drawLibrary(g, level, 100 + i * 200, 190);
        art.drawTreasury(g, level, 100 + i * 200, 400);
        g.fillStyle = '#fff';
        g.fillText(`ур. ${level}`, 20 + i * 200, 22);
      });
    });
    return { castles, towers, annexes };
  });
  for (const [name, url] of Object.entries(png)) writeFileSync(join(OUT, `sheet-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
}

/** Покупка улучшения по-настоящему: анимация, новая стадия стен, потом бой с прокачанным замком */
async function upgradeScenes(browser) {
  const id = 4242;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`улучшения: ${e.message}`));
  await page.goto(`${BASE}/?dev=${id}`);
  await page.click('[data-grade="2"]');
  await page.waitForSelector('#screen-castle.active');
  patchPlayer(id, { gold: 200000, buildings: { walls: 3, tower: 5, library: 5, treasury: 5 } });
  await page.reload();
  await page.waitForSelector('#screen-castle.active');
  await contactSheets(page);
  await page.screenshot({ path: join(OUT, 'upgrade-0-before.png') });

  const buy = (index) => page.locator('#buildings .btn-up').nth(index).click();
  await buy(0); // стены 3 → 4: новая стадия
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'upgrade-1-scaffold.png') });
  await page.waitForTimeout(290);
  await page.screenshot({ path: join(OUT, 'upgrade-2-flash.png') });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, 'upgrade-3-caption.png') });
  await page.waitForFunction(() => !window.__castleView.anim, null, { timeout: 6000 });

  // Обычное улучшение без смены стадии анимируется без подписи
  await buy(0);
  await page.waitForTimeout(300);
  const noCaption = await page.evaluate(() => window.__castleView.anim?.caption);
  if (noCaption !== '') problems.push(`улучшение без новой стадии: подпись «${noCaption}»`);
  await page.waitForFunction(() => !window.__castleView.anim, null, { timeout: 6000 });

  // Башни 5 → 6: подпись другая. Быстрая покупка подряд не ломает анимацию.
  await buy(1);
  await page.waitForTimeout(100);
  await buy(2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'upgrade-4-library.png') });
  await page.waitForFunction(() => !window.__castleView.anim, null, { timeout: 6000 });

  // Максимум: экран замка и бой с полностью прокачанными постройками
  patchPlayer(id, { buildings: { walls: 15, tower: 15, library: 15, treasury: 15 } });
  await page.reload();
  await page.waitForSelector('#screen-castle.active');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'castle-max.png') });
  await page.click('#btn-battle');
  await page.waitForFunction(() => window.__battle?.sim?.zombies.length >= 2, null, { timeout: 25000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'arena-max.png') });
  for (const [walls, tower, name] of [[2, 3, 'wood'], [9, 8, 'iron']]) {
    patchPlayer(id, { buildings: { walls, tower, library: tower, treasury: tower } });
    await page.goto(`${BASE}/?dev=${id}`);
    await page.waitForSelector('#screen-castle.active');
    await page.click('#btn-battle');
    await page.waitForFunction(() => window.__battle?.sim?.zombies.length >= 1, null, { timeout: 25000 });
    await page.evaluate(() => {
      const s = window.__battle.sim;
      s.hurtBuilding(s.towers[0], s.towers[0].hp - s.towers[0].maxHp * 0.5, null);
      s.hurtBuilding(s.towers[1], s.towers[1].hp, null);
      s.hurtBuilding(s.castle, s.castle.hp - s.castle.maxHp * 0.3, null);
    });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: join(OUT, `arena-damaged-${name}.png`) });
  }
  await ctx.close();
}

/** Загрузка арта по-настоящему: новый профиль, сколько скачано и готова ли следующая стадия заранее */
async function artLoading(browser) {
  const id = 5151;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`загрузка арта: ${e.message}`));
  const got = new Map();
  page.on('response', async (res) => {
    const m = res.url().match(/\/art\/([a-z0-9-]+)\.(?:webp|jpg)/);
    if (m) got.set(m[1], Number(res.headers()['content-length']) || 0);
  });
  await page.goto(`${BASE}/?dev=${id}`);
  await page.click('[data-grade="2"]');
  await page.waitForSelector('#screen-castle.active');
  await page.waitForLoadState('networkidle');
  const kb = (names) => Math.round(names.reduce((sum, n) => sum + (got.get(n) || 0), 0) / 1024);
  const sets = await page.evaluate(async () => {
    const m = await import('./js/sprites.js');
    const b = { walls: 1, tower: 1, library: 1, treasury: 1 };
    return { home: m.homeArt(b), battle: m.battleArt(b) };
  });
  console.log(`  первый экран: ${new Set(sets.home).size} картинок, ${kb([...new Set(sets.home)])} КБ`);
  console.log(`  с запасом для боя и улучшения: ${got.size} картинок, ${kb([...got.keys()])} КБ`);
  if (got.size >= 50) problems.push('новый игрок скачал весь арт сразу');
  for (const n of sets.battle) if (!got.has(n)) problems.push(`к бою не загружено: ${n}`);

  // Перед покупкой, меняющей стадию, новая картинка уже должна быть загружена
  patchPlayer(id, { gold: 5000, buildings: { walls: 3, tower: 5, library: 5, treasury: 5 } });
  got.clear();
  await page.reload();
  await page.waitForSelector('#screen-castle.active');
  await page.waitForLoadState('networkidle');
  for (const n of ['castle-s2-d0', 'tower-s2-d0', 'library-s2', 'treasury-s2', 'scaffold']) {
    if (!got.has(n)) problems.push(`следующая стадия не подготовлена: ${n}`);
  }
  const ready = await page.evaluate(async () => Boolean((await import('./js/sprites.js')).sprite('castle-s2-d0')));
  if (!ready) problems.push('картинка следующей стадии не готова к покупке');

  // Заголовки кэша: картинки навсегда, манифест и код проверяются
  const art = await fetch(`${BASE}/art/wizard.webp?v=1`);
  const list = await fetch(`${BASE}/art/manifest.json`);
  const code = await fetch(`${BASE}/js/app.js`);
  if (!art.headers.get('cache-control').includes('immutable')) problems.push('картинки не кэшируются надолго');
  if (list.headers.get('cache-control') !== 'no-cache' || code.headers.get('cache-control') !== 'no-cache') problems.push('манифест или код закэшированы навсегда');
  await ctx.close();

  // Картинки не загрузились вообще: игра работает на запасных рисунках
  const off = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page2 = await off.newPage();
  page2.on('pageerror', (e) => problems.push(`без картинок: ${e.message}`));
  await page2.route(/\/art\/.*\.(webp|jpg)/, (route) => route.abort());
  await page2.goto(`${BASE}/?dev=${id}`);
  await page2.waitForSelector('#screen-castle.active');
  await page2.click('#btn-battle');
  await page2.waitForFunction(() => window.__battle?.sim?.zombies.length >= 1, null, { timeout: 25000 });
  await page2.screenshot({ path: join(OUT, 'no-art-battle.png') });
  await off.close();
}

try {
  await waitForServer();
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: 'chrome', headless: true });
  await artLoading(browser);
  console.log('✔ загрузка арта');
  await upgradeScenes(browser);
  console.log('✔ улучшения и листы состояний');
  for (const vp of VIEWPORTS) {
    await run(browser, vp);
    console.log(`✔ ${vp.name}`);
  }
  await browser.close();
} finally {
  server.kill();
  setTimeout(() => {
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // файл базы ещё занят — временная папка, не страшно
    }
  }, 300);
}
if (problems.length) {
  console.log('\nПроблемы:');
  for (const p of problems) console.log(' ✖', p);
  process.exitCode = 1;
} else {
  console.log(`\nОшибок нет. Скриншоты: ${OUT}`);
}
