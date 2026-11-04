// Отрисовка арены и эффекты боя. Логика — в shared/sim.js, сюда приходят только её события.
// Горячий цикл без аллокаций: частицы, цифры, кольца и снаряды живут в заранее созданных пулах,
// статичные картинки один раз рисуются в отдельные canvas.
import { sprite } from './sprites.js';
import { sfx } from './audio.js';
import { CARDS } from '../shared/balance.js';
import { towerHeight } from '../shared/balance.js';
import { ARENA, PATHS, WIZARD_POS, inArea, snapToLane } from '../shared/sim.js';
import { COMPOSITION, TOWER_W, castleDebris, drawCastleComposition, drawTower, ellipse, offscreen, outlined, rrect, tinted, towerDebris, wizardStandY } from './castle-art.js';

const TAU = Math.PI * 2;
const GROUND_SQUASH = 0.72;

// ---------- Пулы ----------
class Pool {
  constructor(size, make) {
    this.items = Array.from({ length: size }, make);
    this.count = 0;
  }
  take() {
    if (this.count >= this.items.length) return null; // эффект не критичен: при перегрузке просто пропускаем
    return this.items[this.count++];
  }
  remove(i) {
    this.count--;
    const dead = this.items[i];
    this.items[i] = this.items[this.count];
    this.items[this.count] = dead;
  }
}

const P_CONFETTI = 0;
const P_DEBRIS = 1;
const P_PUFF = 2;
const P_SPARK = 3;

// ---------- Картинки, нарисованные кодом ----------
const GUARD_W = 124;
const GUARD_H = 112;

const ZOMBIE_LOOK = {
  walker: { w: 80, h: 100, shirt: '#f08a2c', pants: '#3f7fc4', skin: '#8fd14f', head: 25, body: 21 },
  runner: { w: 72, h: 94, shirt: '#ffd23f', pants: '#c8453f', skin: '#a2dd5c', head: 21, body: 16 },
  bucket: { w: 92, h: 112, shirt: '#7c8aa0', pants: '#5d4b8a', skin: '#7cc247', head: 26, body: 27, bucket: true },
  boss: { w: 180, h: 200, shirt: '#8d2f52', pants: '#47306f', skin: '#7ec24a', head: 50, body: 58, cape: true },
};

function drawZombieArt(g, look) {
  const { w, h, shirt, pants, skin, head, body } = look;
  const cx = w / 2;
  const unit = h / 100;
  if (look.cape) outlined(g, rrect(cx - body - 8, h * 0.35, (body + 8) * 2, h * 0.5, 16), '#5a1f3a');
  outlined(g, rrect(cx - body * 0.75, h * 0.76, body * 0.6, h * 0.22, 6), pants);
  outlined(g, rrect(cx + body * 0.15, h * 0.76, body * 0.6, h * 0.22, 6), pants);
  outlined(g, ellipse(cx, h * 0.62, body, h * 0.21), shirt);
  outlined(g, rrect(cx - body - 12 * unit, h * 0.5, 16 * unit, h * 0.26, 7), skin);
  outlined(g, rrect(cx + body - 4 * unit, h * 0.5, 16 * unit, h * 0.26, 7), skin);
  const hy = look.bucket ? h * 0.33 : h * 0.3;
  outlined(g, ellipse(cx, hy, head, head * 0.95), skin);
  // Лицо: глаза разного размера и глуповатая улыбка
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(cx - head * 0.38, hy - head * 0.1, head * 0.3, 0, TAU);
  g.arc(cx + head * 0.36, hy - head * 0.1, head * 0.22, 0, TAU);
  g.fill();
  g.fillStyle = '#1b1540';
  g.beginPath();
  g.arc(cx - head * 0.32, hy - head * 0.06, head * 0.13, 0, TAU);
  g.arc(cx + head * 0.4, hy - head * 0.08, head * 0.1, 0, TAU);
  g.fill();
  g.beginPath();
  g.ellipse(cx, hy + head * 0.5, head * 0.42, head * 0.22, 0, 0, Math.PI);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(cx - head * 0.2, hy + head * 0.5, head * 0.14, head * 0.14);
  g.fillRect(cx + head * 0.06, hy + head * 0.5, head * 0.14, head * 0.14);
  if (look.bucket) {
    outlined(g, (p) => {
      p.moveTo(cx - head * 0.95, hy - head * 0.15);
      p.lineTo(cx - head * 0.7, hy - head * 1.25);
      p.lineTo(cx + head * 0.7, hy - head * 1.25);
      p.lineTo(cx + head * 0.95, hy - head * 0.15);
      p.closePath();
    }, '#a8b4c6');
    g.fillStyle = '#ffffff55';
    g.fillRect(cx - head * 0.45, hy - head * 1.1, head * 0.22, head * 0.9);
  } else {
    outlined(g, (p) => {
      p.moveTo(cx - head * 0.8, hy - head * 0.6);
      p.lineTo(cx - head * 0.3, hy - head * 1.25);
      p.lineTo(cx, hy - head * 0.85);
      p.lineTo(cx + head * 0.4, hy - head * 1.2);
      p.lineTo(cx + head * 0.8, hy - head * 0.55);
      p.closePath();
    }, '#35404a', '#1b1540', 3);
  }
}

function drawGuardian(g, w, h) {
  const stone = '#9a93a8';
  outlined(g, rrect(w * 0.12, h * 0.34, w * 0.2, h * 0.34, 10), stone);
  outlined(g, rrect(w * 0.68, h * 0.34, w * 0.2, h * 0.34, 10), stone);
  outlined(g, rrect(w * 0.28, h * 0.72, w * 0.18, h * 0.26, 6), '#7d7690');
  outlined(g, rrect(w * 0.54, h * 0.72, w * 0.18, h * 0.26, 6), '#7d7690');
  outlined(g, rrect(w * 0.22, h * 0.3, w * 0.56, h * 0.48, 16), '#b1aabf');
  outlined(g, rrect(w * 0.3, h * 0.04, w * 0.4, h * 0.3, 12), '#b1aabf');
  g.fillStyle = '#5ef2e4';
  g.fillRect(w * 0.37, h * 0.15, w * 0.08, h * 0.06);
  g.fillRect(w * 0.55, h * 0.15, w * 0.08, h * 0.06);
  g.fillRect(w * 0.45, h * 0.45, w * 0.1, h * 0.14);
}

function drawGround(g, W, H) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b2f4d');
  bg.addColorStop(0.5, '#25553f');
  bg.addColorStop(1, '#2f6a3c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Пятна травы
  for (let i = 0; i < 60; i++) {
    const x = (i * 197) % W;
    const y = 120 + ((i * 131) % (H - 120));
    g.fillStyle = i % 2 ? '#ffffff08' : '#00000012';
    g.beginPath();
    g.ellipse(x, y, 34 + (i % 5) * 10, 12 + (i % 3) * 5, 0, 0, TAU);
    g.fill();
  }
  // Дорожки: широкая тёмная кромка и светлая середина
  const offset = 20; // картинка шире арены на тряску
  for (const [color, width] of [['#5a4530', 104], ['#a98a5c', 88], ['#b89a6c', 58]]) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const path of PATHS) {
      g.beginPath();
      path.points.forEach(([x, y], i) => (i ? g.lineTo(x + offset, y) : g.moveTo(x + offset, y)));
      g.stroke();
    }
  }
  // Кладбищенские ворота наверху
  const gx = W / 2;
  const gy = 148;
  for (const [x, y, s] of [[110, 110, 1], [190, 90, 0.8], [W - 110, 110, 1], [W - 190, 90, 0.8], [70, 210, 0.9], [W - 70, 210, 0.9], [90, 400, 0.9], [W - 90, 400, 0.9], [W / 2, 420, 1.1], [W / 2 - 60, 300, 0.8], [W / 2 + 60, 300, 0.8]]) {
    outlined(g, rrect(x - 16 * s, y - 34 * s, 32 * s, 40 * s, 14 * s), '#6d6f8c', '#1b1540', 3);
    g.fillStyle = '#3f4160';
    g.fillRect(x - 2, y - 26 * s, 4, 18 * s);
    g.fillRect(x - 7 * s, y - 21 * s, 14 * s, 4);
  }
  g.strokeStyle = '#1b1540';
  g.lineWidth = 7;
  for (let x = 40; x < W - 40; x += 34) {
    if (Math.abs(x - gx) < 80) continue;
    g.beginPath();
    g.moveTo(x, gy - 4);
    g.lineTo(x, gy - 44);
    g.stroke();
  }
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(40, gy - 34);
  g.lineTo(gx - 80, gy - 34);
  g.moveTo(gx + 80, gy - 34);
  g.lineTo(W - 40, gy - 34);
  g.stroke();
  outlined(g, rrect(gx - 104, gy - 96, 30, 100, 6), '#4d4a6e');
  outlined(g, rrect(gx + 74, gy - 96, 30, 100, 6), '#4d4a6e');
  g.lineWidth = 9;
  g.strokeStyle = '#1b1540';
  g.beginPath();
  g.arc(gx, gy - 74, 80, Math.PI, 0);
  g.stroke();
  g.fillStyle = '#ffcc4d';
  g.beginPath();
  g.arc(gx, gy - 154, 9, 0, TAU);
  g.fill();
}

export class ArenaRenderer {
  constructor(canvas, sim, { buildings }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.level = buildings;
    this.scale = 1;
    this.time = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.sx = 0;
    this.sy = 0;
    this.wizardSwing = 0;
    this.preview = null; // { key, x, y }
    this.hint = '';
    this.hintTime = 0;

    this.particles = new Pool(420, () => ({ kind: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, size: 4, color: '#fff', ground: 0, rot: 0, spin: 0 }));
    this.texts = new Pool(36, () => ({ text: '', x: 0, y: 0, t: 0, life: 1, size: 28, color: '#fff' }));
    this.rings = new Pool(20, () => ({ x: 0, y: 0, t: 0, life: 1, r: 60, color: '#fff' }));
    this.bolts = new Pool(12, () => ({ pts: new Float32Array(32), n: 0, t: 0, life: 0.3, color: '#fff' }));
    this.shots = new Pool(30, () => ({ x0: 0, y0: 0, x1: 0, y1: 0, t: 0, life: 0.2, kind: 'tower', arc: 0 }));
    this.fxPools = [this.texts, this.rings, this.bolts, this.shots];
    this.allBuildings = sim.buildings();

    // Постройки: у каждой свои таймеры анимации, чтобы не держать их в логике
    this.anim = new Map();
    for (const b of sim.buildings()) this.anim.set(b, { recoil: 0, flash: 0, collapse: 0 });
    this.order = []; // сортировка по глубине без новых массивов
    this.zonesPulse = 0;

    this.buildArt();
  }

  // ---------- Подготовка ----------
  buildArt() {
    const q = 2;
    this.art = { zombie: {}, castle: [], tower: [] };
    for (const [type, look] of Object.entries(ZOMBIE_LOOK)) {
      const painted = sprite(`zombie-${type}`);
      const base = painted
        ? offscreen(look.w, look.h, q, (g, w, h) => {
          const k = Math.min(w / painted.width, h / painted.height);
          g.drawImage(painted, (w - painted.width * k) / 2, h - painted.height * k, painted.width * k, painted.height * k);
        })
        : offscreen(look.w, look.h, q, (g) => drawZombieArt(g, look));
      this.art.zombie[type] = { base, white: tinted(base, '#ffffff'), ice: tinted(base, '#7dd3fc', 0.45), w: look.w, h: look.h };
    }
    // Замок и башни собираются из слоёв по уровням построек, по картинке на состояние разрушения
    this.towerH = towerHeight(this.level.tower);
    this.towerCanvasH = this.towerH + 26;
    for (let state = 0; state < 4; state++) {
      const castle = offscreen(COMPOSITION.W, COMPOSITION.H, q, (g) => drawCastleComposition(g, this.level, state));
      this.art.castle.push({ base: castle, white: state < 3 ? tinted(castle, '#ffffff') : null });
      const tower = offscreen(TOWER_W, this.towerCanvasH, q, (g) => drawTower(g, this.level.tower, state));
      this.art.tower.push({ base: tower, white: state < 3 ? tinted(tower, '#ffffff') : null });
    }
    this.wizardY = wizardStandY(this.level);
    this.castleColors = castleDebris(this.level.walls);
    this.towerColors = towerDebris(this.level.tower);
    const paintedGuard = sprite('guardian');
    const guard = offscreen(GUARD_W, GUARD_H, q, (g, w, h) => {
      if (!paintedGuard) {
        drawGuardian(g, w, h);
        return;
      }
      const k = Math.min(w / paintedGuard.width, h / paintedGuard.height);
      g.drawImage(paintedGuard, (w - paintedGuard.width * k) / 2, h - paintedGuard.height * k, paintedGuard.width * k, paintedGuard.height * k);
    });
    this.art.guard = { base: guard, white: tinted(guard, '#ffffff') };
  }

  resize(pixelScale) {
    this.scale = pixelScale;
    this.canvas.width = Math.round(ARENA.W * pixelScale);
    this.canvas.height = Math.round(ARENA.H * pixelScale);
    // Фон шире арены на 20 с каждой стороны, чтобы при тряске не было пустых краёв
    this.ground = offscreen(ARENA.W + 40, ARENA.H + 40, pixelScale, (g, w, h) => {
      const painted = sprite('bg-arena');
      if (painted) {
        // Точно совпадает с дорожками: логическая ширина 720, поля для тряски — растянутая копия
        const ph = painted.height * (ARENA.W / painted.width);
        g.drawImage(painted, 0, 0, w, painted.height * (w / painted.width));
        g.drawImage(painted, 20, 20, ARENA.W, ph);
      }
      else drawGround(g, w, h);
    });
  }

  // ---------- Эффекты ----------
  addShake(power) {
    this.shake = Math.min(1, this.shake + power);
  }
  freeze(seconds) {
    this.hitstop = Math.max(this.hitstop, seconds);
  }
  particle(kind, x, y, vx, vy, life, size, color, ground = 0) {
    const p = this.particles.take();
    if (!p) return;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.t = 0;
    p.life = life;
    p.size = size;
    p.color = color;
    p.ground = ground;
    p.rot = Math.random() * TAU;
    p.spin = (Math.random() - 0.5) * 14;
  }
  burst(kind, x, y, n, speed, life, size, colors, ground = 0, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.particle(kind, x, y, Math.cos(a) * v, Math.sin(a) * v * GROUND_SQUASH - up, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), colors[i % colors.length], ground);
    }
  }
  text(x, y, text, color, size = 34, life = 0.8) {
    const t = this.texts.take();
    if (!t) return;
    t.text = text;
    t.x = x;
    t.y = y;
    t.t = 0;
    t.life = life;
    t.size = size;
    t.color = color;
  }
  ring(x, y, r, color, life = 0.4) {
    const o = this.rings.take();
    if (!o) return;
    o.x = x;
    o.y = y;
    o.r = r;
    o.color = color;
    o.t = 0;
    o.life = life;
  }
  bolt(x0, y0, x1, y1, color) {
    const b = this.bolts.take();
    if (!b) return;
    const segs = 7;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const off = i === 0 || i === segs ? 0 : 26;
      b.pts[i * 2] = x0 + (x1 - x0) * k + (Math.random() - 0.5) * off;
      b.pts[i * 2 + 1] = y0 + (y1 - y0) * k + (Math.random() - 0.5) * off;
    }
    b.n = segs + 1;
    b.t = 0;
    b.life = 0.28;
    b.color = color;
  }
  shot(x0, y0, x1, y1, life, kind, arc = 0) {
    const s = this.shots.take();
    if (!s) return;
    s.x0 = x0;
    s.y0 = y0;
    s.x1 = x1;
    s.y1 = y1;
    s.t = 0;
    s.life = life;
    s.kind = kind;
    s.arc = arc;
  }

  // ---------- События логики ----------
  onEvent(name, a, b, c) {
    switch (name) {
      case 'spawn':
        this.burst(P_PUFF, a.x, a.y, 5, 50, 0.5, 18, ['#8c86a8']);
        break;
      case 'cast': {
        this.wizardSwing = 0.45;
        sfx('cast');
        const card = CARDS[a];
        if (a === 'fireball') this.shot(WIZARD_POS.x, WIZARD_POS.y - 60, b, c, card.delay, 'fire', 70);
        else if (a === 'meteor') this.shot(b + 150, -60, b, c, card.delay, 'meteor');
        break;
      }
      case 'impact': {
        const card = CARDS[a];
        if (a === 'fireball') {
          sfx('fireball');
          this.ring(b, c, card.radius, '#ff9a3d');
          this.burst(P_SPARK, b, c, 26, 340, 0.55, 8, ['#ffcf4a', '#ff8a3d', '#ff5d3d'], c + 30, 60);
          this.burst(P_PUFF, b, c, 8, 80, 0.7, 34, ['#ffa94d', '#7a6a6a']);
          this.addShake(0.32);
          this.freeze(0.05);
        } else if (a === 'meteor') {
          sfx('meteor');
          this.ring(b, c, card.radius, '#ff6a2b', 0.6);
          this.ring(b, c, card.radius * 0.6, '#ffe08a', 0.45);
          this.burst(P_SPARK, b, c, 50, 560, 0.8, 10, ['#ffe08a', '#ff8a3d', '#ff4d2b'], c + 40, 120);
          this.burst(P_DEBRIS, b, c, 18, 420, 1.1, 12, ['#6e5c4d', '#4d3f35'], c + 50, 280);
          this.burst(P_PUFF, b, c, 14, 140, 1, 50, ['#8a7766', '#5f5350']);
          this.addShake(0.85);
          this.freeze(0.08);
        } else if (a === 'ice') {
          sfx('ice');
          this.ring(b, c, card.radius, '#a6e7ff');
          this.burst(P_SPARK, b, c, 24, 220, 0.6, 7, ['#d8f6ff', '#7dd3fc'], 0, 40);
          this.addShake(0.08);
        } else if (a === 'heal') {
          sfx('heal');
          this.ring(b, c, card.radius, '#7cf29c', 0.6);
        }
        break;
      }
      case 'lightning': {
        sfx('lightning');
        let px = WIZARD_POS.x;
        let py = WIZARD_POS.y - 70;
        for (let i = 0; i < a.length; i++) {
          this.bolt(px, py, a[i].x, a[i].y - 40, '#fff27a');
          px = a[i].x;
          py = a[i].y - 40;
        }
        this.addShake(0.18);
        break;
      }
      case 'guardSummon':
        sfx('guardian');
        this.burst(P_PUFF, a.x, a.y, 12, 110, 0.7, 30, ['#a9a2b5', '#807a90']);
        this.burst(P_DEBRIS, a.x, a.y, 8, 200, 0.7, 8, ['#9a93a8'], a.y + 14, 200);
        this.addShake(0.22);
        break;
      case 'guardHit':
        sfx('bite');
        this.burst(P_PUFF, a.x, a.y - 50, 2, 60, 0.35, 12, ['#b1aabf']);
        break;
      case 'guardDead':
        sfx('collapse');
        this.burst(P_DEBRIS, a.x, a.y - 50, 14, 260, 0.9, 11, ['#b1aabf', '#7d7690'], a.y + 12, 200);
        this.burst(P_PUFF, a.x, a.y - 30, 8, 90, 0.7, 28, ['#a9a2b5']);
        break;
      case 'zombieHit':
        if (b >= 1) {
          sfx('hit');
          const big = b >= 25;
          this.text(a.x + (Math.random() - 0.5) * 24, a.y - this.zombieHeight(a) * 0.85, String(Math.round(b)), c === 'tower' ? '#d6ccff' : big ? '#ffcf4a' : '#ffffff', big ? 44 : c === 'tower' ? 26 : 34);
        }
        break;
      case 'zombieDead': {
        sfx('pop');
        const y = a.y - this.zombieHeight(a) * 0.45;
        this.burst(P_PUFF, a.x, y, 8, 90, 0.5, 26, ['#d7f5b0', '#a4c98a', '#e8e8e8']);
        this.burst(P_CONFETTI, a.x, y, a.type === 'boss' ? 60 : 18, a.type === 'boss' ? 520 : 300, 1, 9, ['#ff7ad9', '#ffcc4d', '#8f6bff', '#4ade80', '#5ee7ff'], a.y + 18, 200);
        if (a.type === 'boss') {
          this.addShake(0.8);
          this.freeze(0.08);
        }
        break;
      }
      case 'towerShot': {
        sfx('shot');
        const anim = this.anim.get(a);
        anim.recoil = 1;
        this.shot(a.x, a.y - this.towerH + 14, b.x, b.y - 40, c, 'tower');
        break;
      }
      case 'buildingHit': {
        const anim = this.anim.get(a);
        anim.flash = 0.1;
        const boss = c?.type === 'boss';
        sfx(boss ? 'thud' : 'bite');
        this.addShake(boss ? 0.5 : 0.14);
        if (boss) this.freeze(0.06);
        const hitX = c ? c.x : a.x;
        const hitY = c ? c.y - 30 : a.y - 80;
        this.burst(P_DEBRIS, hitX, hitY, boss ? 12 : 5, boss ? 300 : 190, 0.7, boss ? 11 : 7, a.id === 'castle' ? this.castleColors : this.towerColors, hitY + 50, 160);
        this.burst(P_PUFF, hitX, hitY, boss ? 6 : 2, 70, 0.5, boss ? 28 : 16, ['#b7b0cf']);
        this.text(hitX, hitY - 20, `-${Math.round(b)}`, '#ff8a9c', boss ? 40 : 28);
        break;
      }
      case 'buildingStage':
        // Переход в новую стадию повреждения — заметный удар и горсть обломков
        if (a.alive && a.hp > 0) {
          sfx('thud');
          this.addShake(0.42);
          this.freeze(0.06);
          const big = a.id === 'castle';
          this.burst(P_DEBRIS, a.x, a.y - (big ? 110 : 90), big ? 24 : 16, 340, 1, 12, big ? this.castleColors : this.towerColors, a.y, 240);
          this.burst(P_PUFF, a.x, a.y - 60, 8, 110, 0.8, 34, ['#b7b0cf', '#8c86a8']);
        }
        break;
      case 'buildingDestroyed': {
        sfx('collapse');
        this.anim.get(a).collapse = 1;
        const big = a.id === 'castle';
        this.addShake(big ? 1 : 0.75);
        this.freeze(0.08);
        this.burst(P_DEBRIS, a.x, a.y - 80, big ? 60 : 36, big ? 520 : 400, 1.3, 15, big ? this.castleColors : this.towerColors, a.y + 6, 300);
        this.burst(P_PUFF, a.x, a.y - 40, big ? 26 : 16, big ? 220 : 150, 1.2, 56, ['#b7b0cf', '#8c86a8', '#6d6890']);
        break;
      }
      case 'healed':
        for (let i = 0; i < 14; i++) this.particle(P_SPARK, a.x + (Math.random() - 0.5) * 90, a.y - Math.random() * 110, 0, -90 - Math.random() * 60, 0.8, 8, i % 2 ? '#7cf29c' : '#c6ffd6');
        this.text(a.x, a.y - 130, '+', '#7cf29c', 44);
        break;
      default:
    }
  }

  zombieHeight(z) {
    return ZOMBIE_LOOK[z.type].h * this.zombieScale(z);
  }
  zombieScale(z) {
    if (z.type !== 'boss') return this.depth(z.y);
    return 0.62 + 0.6 * Math.min(1, Math.max(0, (z.y - 150) / 500));
  }
  /** Ближе к низу экрана — крупнее: вид сверху под углом */
  depth(y) {
    return 1 + 0.5 * Math.min(1, Math.max(0, (y - 130) / 620));
  }

  // ---------- Покадровое обновление эффектов ----------
  update(dt, realDt) {
    this.time += realDt;
    this.shake = Math.max(0, this.shake - realDt * 2.2);
    const mag = this.shake * this.shake * 26;
    this.sx = mag ? Math.sin(this.time * 71) * mag : 0;
    this.sy = mag ? Math.cos(this.time * 53) * mag : 0;
    this.wizardSwing = Math.max(0, this.wizardSwing - realDt);

    const parts = this.particles;
    for (let i = parts.count - 1; i >= 0; i--) {
      const p = parts.items[i];
      p.t += dt;
      if (p.t >= p.life) {
        parts.remove(i);
        continue;
      }
      if (p.kind === P_PUFF) {
        p.vx *= 1 - 3 * dt;
        p.vy *= 1 - 3 * dt;
      } else if (p.kind === P_SPARK) {
        p.vy += 320 * dt;
      } else {
        p.vy += 900 * dt;
        p.rot += p.spin * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.ground && p.y > p.ground && p.vy > 0) {
        // Отскок от земли
        p.y = p.ground;
        p.vy *= -0.45;
        p.vx *= 0.6;
        p.spin *= 0.5;
      }
    }
    for (let n = 0; n < this.fxPools.length; n++) {
      const pool = this.fxPools[n];
      for (let i = pool.count - 1; i >= 0; i--) {
        const o = pool.items[i];
        o.t += dt;
        if (o.t >= o.life) pool.remove(i);
      }
    }
    for (const b of this.anim.values()) {
      b.recoil = Math.max(0, b.recoil - dt * 6);
      b.flash = Math.max(0, b.flash - dt);
      b.collapse = Math.max(0, b.collapse - dt * 1.2);
    }
    // Огонь и дым на сильно разрушенных постройках
    this.smokeTimer = (this.smokeTimer || 0) - dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.14;
      for (let n = 0; n < this.allBuildings.length; n++) {
        const b = this.allBuildings[n];
        if (!b.alive || b.stage < 2) continue;
        const w = b.id === 'castle' ? 100 : 30;
        const x = b.x + (Math.random() - 0.5) * w;
        const y = b.y - 70 - Math.random() * 60;
        this.particle(P_PUFF, x, y, (Math.random() - 0.5) * 16, -70, 0.9, 22, '#3d3a4f');
        this.particle(P_SPARK, x, y + 10, (Math.random() - 0.5) * 30, -110, 0.45, 9, Math.random() < 0.5 ? '#ff8a3d' : '#ffcf4a');
      }
    }
  }

  // ---------- Кадр ----------
  draw() {
    const { ctx, scale } = this;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.translate(this.sx, this.sy);
    ctx.drawImage(this.ground, -20, -20, ARENA.W + 40, ARENA.H + 40);

    this.drawZones();
    for (const tower of this.sim.towers) this.drawTowerAt(tower);

    // Сортировка по глубине (вставками, на месте)
    const order = this.order;
    let n = 0;
    for (const z of this.sim.zombies) if (!z.dead) order[n++] = z;
    for (const g of this.sim.guards) order[n++] = g;
    order.length = n;
    for (let i = 1; i < n; i++) {
      const it = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].y > it.y) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = it;
    }
    let castleDrawn = false;
    for (let i = 0; i < n; i++) {
      if (!castleDrawn && order[i].y > 660) {
        this.drawCastleAt();
        castleDrawn = true;
      }
      if (order[i].kind === 'guard') this.drawGuard(order[i]);
      else this.drawZombie(order[i]);
    }
    if (!castleDrawn) this.drawCastleAt();

    this.drawShots();
    this.drawParticles();
    this.drawBolts();
    this.drawRings();
    this.drawTexts();
    this.drawPreview();
    this.drawHint();
  }

  drawZones() {
    const { ctx } = this;
    for (const z of this.sim.zones) {
      ctx.fillStyle = '#7dd3fc33';
      ctx.strokeStyle = '#bdeeff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * GROUND_SQUASH, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawHp(x, y, w, ratio, h = 9) {
    const { ctx } = this;
    ctx.fillStyle = '#0d0a22';
    ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = ratio > 0.66 ? '#4ade80' : ratio > 0.33 ? '#facc15' : '#ff5d73';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, ratio), h);
  }

  drawTowerAt(tower) {
    const { ctx } = this;
    const anim = this.anim.get(tower);
    const w = TOWER_W;
    const h = this.towerCanvasH;
    const ruin = this.art.tower[3].base;
    if (!tower.alive && anim.collapse <= 0) {
      ctx.drawImage(ruin, tower.x - w / 2, tower.y - h + 6, w, h);
      return;
    }
    const art = this.art.tower[Math.min(tower.stage, 2)];
    ctx.save();
    ctx.translate(tower.x, tower.y);
    if (!tower.alive) {
      // Башня оседает и заваливается набок
      const k = 1 - anim.collapse;
      ctx.drawImage(ruin, -w / 2, -h + 6, w, h);
      ctx.beginPath();
      ctx.rect(-120, -h - 40, 240, h + 40);
      ctx.clip();
      ctx.translate(0, k * k * h);
      ctx.rotate((tower.lane === 0 ? 1 : -1) * k * 0.35);
    } else {
      const squash = anim.recoil * 0.05;
      ctx.scale(1 + squash, 1 - squash);
    }
    ctx.drawImage(art.base, -w / 2, -h + 6, w, h);
    if (anim.flash > 0) {
      ctx.globalAlpha = Math.min(1, anim.flash / 0.1);
      ctx.drawImage(art.white, -w / 2, -h + 6, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (tower.alive) this.drawHp(tower.x, tower.y - this.towerH - 22, 86, tower.hp / tower.maxHp);
  }

  drawCastleAt() {
    const { ctx, sim } = this;
    const castle = sim.castle;
    const anim = this.anim.get(castle);
    const w = COMPOSITION.W;
    const h = COMPOSITION.H;
    const x = castle.x - COMPOSITION.X;
    const y = castle.y - COMPOSITION.Y;
    const ruin = this.art.castle[3].base;
    if (!castle.alive && anim.collapse <= 0) {
      ctx.drawImage(ruin, x, y, w, h);
      return;
    }
    const art = this.art.castle[Math.min(castle.stage, 2)];
    ctx.save();
    if (!castle.alive) {
      const k = 1 - anim.collapse;
      ctx.drawImage(ruin, x, y, w, h);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(0, k * k * h);
    }
    ctx.drawImage(art.base, x, y, w, h);
    if (anim.flash > 0) {
      ctx.globalAlpha = Math.min(1, anim.flash / 0.1);
      ctx.drawImage(art.white, x, y, w, h);
      ctx.globalAlpha = 1;
    }
    // Волшебник стоит на замке и замахивается при каждом заклинании
    if (castle.alive) {
      const swing = this.wizardSwing > 0 ? Math.sin((this.wizardSwing / 0.45) * Math.PI) : 0;
      const bob = Math.sin(this.time * 3) * 2;
      ctx.save();
      ctx.translate(WIZARD_POS.x, castle.y + this.wizardY + 8 + bob - swing * 10);
      ctx.rotate(-swing * 0.28);
      ctx.scale(1 + swing * 0.14, 1 + swing * 0.14);
      const wiz = sprite('wizard');
      if (wiz) {
        const wh = 104;
        const ww = (wiz.width / wiz.height) * wh;
        ctx.drawImage(wiz, -ww / 2, -wh, ww, wh);
      } else {
        ctx.font = '70px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🧙', 0, -20);
      }
      ctx.restore();
    }
    ctx.restore();
    if (castle.alive) this.drawHp(castle.x, castle.y + this.wizardY - 118, 200, castle.hp / castle.maxHp, 12);
  }

  drawZombie(z) {
    const { ctx } = this;
    const art = this.art.zombie[z.type];
    const s = this.zombieScale(z);
    const w = art.w * s;
    const h = art.h * s;
    const bounce = Math.abs(Math.sin(z.phase));
    const tilt = Math.sin(z.phase) * 0.09;
    // Тень
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(z.x, z.y + 3, w * 0.42, w * 0.14, 0, 0, TAU);
    ctx.fill();
    // Укус: короткий рывок к цели
    let lunge = 0;
    if (z.biting) lunge = z.biteTimer < 0.25 ? (0.25 - z.biteTimer) * 40 * (z.biting.x > z.x ? 1 : -1) : 0;
    ctx.save();
    ctx.translate(z.x + lunge, z.y - (z.biting ? 0 : bounce * 10 * s));
    ctx.rotate(tilt);
    if (z.lane === 0) ctx.scale(-1, 1);
    ctx.drawImage(z.slowed ? art.ice : art.base, -w / 2, -h, w, h);
    if (z.flash > 0) {
      ctx.globalAlpha = Math.min(1, z.flash / 0.08);
      ctx.drawImage(art.white, -w / 2, -h, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (z.hp < z.maxHp) this.drawHp(z.x, z.y - h - 12, Math.max(44, w * 0.7), z.hp / z.maxHp, 7);
  }

  drawGuard(g) {
    const { ctx } = this;
    const s = this.depth(g.y);
    const w = GUARD_W * s;
    const h = GUARD_H * s;
    ctx.fillStyle = '#00000055';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 3, w * 0.45, w * 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.drawImage(this.art.guard.base, g.x - w / 2, g.y - h, w, h);
    if (g.flash > 0) {
      ctx.globalAlpha = Math.min(1, g.flash / 0.08);
      ctx.drawImage(this.art.guard.white, g.x - w / 2, g.y - h, w, h);
      ctx.globalAlpha = 1;
    }
    this.drawHp(g.x, g.y - h - 12, 64, g.hp / g.maxHp, 7);
  }

  drawShots() {
    const { ctx } = this;
    const pool = this.shots;
    for (let i = 0; i < pool.count; i++) {
      const s = pool.items[i];
      const k = s.t / s.life;
      const x = s.x0 + (s.x1 - s.x0) * k;
      const y = s.y0 + (s.y1 - s.y0) * k - Math.sin(k * Math.PI) * s.arc;
      if (s.kind === 'tower') {
        ctx.fillStyle = '#5ef2e4';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
      } else {
        const r = s.kind === 'meteor' ? 44 : 20;
        ctx.fillStyle = '#ff6a2b';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffd66b';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, TAU);
        ctx.fill();
        if (Math.random() < 0.8) this.particle(P_SPARK, x, y, (Math.random() - 0.5) * 60, -30, 0.35, r * 0.4, '#ff9a3d');
      }
    }
  }

  drawParticles() {
    const { ctx } = this;
    const pool = this.particles;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.items[i];
      const k = p.t / p.life;
      ctx.fillStyle = p.color;
      if (p.kind === P_PUFF) {
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k), 0, TAU);
        ctx.fill();
      } else if (p.kind === P_SPARK) {
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.6), 0, TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        ctx.setTransform(cos * this.scale, sin * this.scale, -sin * this.scale, cos * this.scale, (p.x + this.sx) * this.scale, (p.y + this.sy) * this.scale);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.kind === P_CONFETTI ? p.size * 0.6 : p.size);
        ctx.setTransform(this.scale, 0, 0, this.scale, this.sx * this.scale, this.sy * this.scale);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBolts() {
    const { ctx } = this;
    const pool = this.bolts;
    ctx.lineJoin = 'round';
    for (let i = 0; i < pool.count; i++) {
      const b = pool.items[i];
      ctx.globalAlpha = 1 - b.t / b.life;
      ctx.beginPath();
      ctx.moveTo(b.pts[0], b.pts[1]);
      for (let j = 1; j < b.n; j++) ctx.lineTo(b.pts[j * 2], b.pts[j * 2 + 1]);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawRings() {
    const { ctx } = this;
    const pool = this.rings;
    for (let i = 0; i < pool.count; i++) {
      const o = pool.items[i];
      const k = o.t / o.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 14 * (1 - k) + 2;
      const r = o.r * (0.35 + 0.65 * Math.sqrt(k));
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, r, r * GROUND_SQUASH, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawTexts() {
    const { ctx } = this;
    const pool = this.texts;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < pool.count; i++) {
      const t = pool.items[i];
      const k = t.t / t.life;
      // Цифра выпрыгивает, отскакивает и тает
      const pop = k < 0.18 ? 0.5 + (k / 0.18) * 0.8 : k < 0.32 ? 1.3 - ((k - 0.18) / 0.14) * 0.3 : 1;
      const size = Math.round(t.size * pop);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `800 ${size}px Rubik, sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#150f2e';
      const y = t.y - k * 46;
      ctx.strokeText(t.text, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, y);
    }
    ctx.globalAlpha = 1;
  }

  drawPreview() {
    const pv = this.preview;
    if (!pv) return;
    const { ctx } = this;
    const card = CARDS[pv.key];
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 10]);
    ctx.lineDashOffset = -this.time * 40;
    const colors = { fireball: '#ff9a3d', ice: '#a6e7ff', lightning: '#fff27a', guardian: '#d6d0e0', heal: '#7cf29c', meteor: '#ff6a2b' };
    const color = colors[pv.key];
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}33`;
    let { x, y } = pv;
    if (pv.key === 'guardian') {
      const spot = snapToLane(x, y);
      x = spot.x;
      y = spot.y;
    }
    ctx.beginPath();
    ctx.ellipse(x, y, card.radius, card.radius * GROUND_SQUASH, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // Кого заденет: метка над целями
    ctx.fillStyle = color;
    if (pv.key === 'lightning') {
      for (const z of this.sim.nearestZombies(x, y, card.targets)) this.drawMark(z);
    } else if (pv.key !== 'guardian') {
      if (pv.key === 'heal') {
        for (const b of this.sim.buildings()) if (b.alive && inArea(x, y, card.radius, b.x, b.y)) this.drawMarkAt(b.x, b.y - 150);
      } else {
        for (const z of this.sim.zombies) if (inArea(x, y, card.radius, z.x, z.y)) this.drawMark(z);
      }
    }
  }
  drawMark(z) {
    this.drawMarkAt(z.x, z.y - this.zombieHeight(z) - 18);
  }
  drawMarkAt(x, y) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 14);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x, y + 4);
    ctx.closePath();
    ctx.fill();
  }

  drawHint() {
    if (!this.hint || this.time > this.hintTime) return;
    const { ctx } = this;
    ctx.globalAlpha = Math.min(1, this.hintTime - this.time);
    ctx.font = '800 34px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#150f2e';
    ctx.fillStyle = '#fff';
    ctx.strokeText(this.hint, 360, 400);
    ctx.fillText(this.hint, 360, 400);
    ctx.globalAlpha = 1;
  }
  showHint(text, seconds = 2.5) {
    this.hint = text;
    this.hintTime = this.time + seconds;
  }
}
