// Замок на главном экране: собран из тех же слоёв, что и на арене, и показывает улучшение:
// растут леса, летит пыль, вспышка — и постройка уже в новом виде.
import { sprite } from './sprites.js';
import { sfx } from './audio.js';
import { annexStage, towerHeight, towerLook, wallStage } from '../shared/balance.js';
import { COMPOSITION, TOWER_W, castleDebris, drawCastleComposition, drawScaffold, drawTower, offscreen, towerDebris, wizardStandY } from './castle-art.js';

const W = 640;
const H = 340;
const BASE_X = W / 2;
const BASE_Y = H - 8;
const TOWER_DX = 250;
const TOWER_LIFT = 26;

const DURATION = 1.25;
const SWAP_AT = 0.62;
const CAPTION_TIME = 2.1;

const CAPTIONS = {
  walls: 'Новый вид стен!',
  tower: 'Новый вид башен!',
  library: 'Библиотека выросла!',
  treasury: 'Сокровищница выросла!',
};

const stageOf = (key, level) => (key === 'walls' ? wallStage(level) : key === 'tower' ? towerLook(level) : annexStage(level));

/** Где на картинке постройка: сюда встают леса и летит пыль */
function regionOf(key, levels) {
  if (key === 'walls') return [{ x: BASE_X - 142, y: BASE_Y - 180, w: 284, h: 180 }];
  if (key === 'library') return [{ x: BASE_X - 240, y: BASE_Y - 130, w: 120, h: 130 }];
  if (key === 'treasury') return [{ x: BASE_X + 118, y: BASE_Y - 124, w: 124, h: 124 }];
  const th = towerHeight(levels.tower) + 8;
  const y = BASE_Y - TOWER_LIFT - th;
  return [
    { x: BASE_X - TOWER_DX - TOWER_W / 2, y, w: TOWER_W, h: th },
    { x: BASE_X + TOWER_DX - TOWER_W / 2, y, w: TOWER_W, h: th },
  ];
}

export class CastleView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.levels = null;
    this.layer = null;
    this.anim = null;
    this.parts = [];
    this.raf = 0;
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    if (!box.width) return false; // экран скрыт
    this.scale = (box.width / W) * Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(W * this.scale);
    if (this.canvas.width !== cw) {
      this.canvas.width = cw;
      this.canvas.height = Math.round(H * this.scale);
      this.layer = null;
    }
    return true;
  }

  /** Картинка замка при данных уровнях */
  buildLayer(levels) {
    return offscreen(W, H, this.scale, (g) => {
      g.fillStyle = '#25553f';
      g.beginPath();
      g.ellipse(BASE_X, BASE_Y - 8, W * 0.49, 40, 0, 0, Math.PI * 2);
      g.fill();
      const th = towerHeight(levels.tower);
      for (const dx of [-TOWER_DX, TOWER_DX]) {
        g.save();
        g.translate(BASE_X + dx - TOWER_W / 2, BASE_Y - TOWER_LIFT - th - 20);
        drawTower(g, levels.tower, 0);
        g.restore();
      }
      g.save();
      g.translate(BASE_X - COMPOSITION.X, BASE_Y - COMPOSITION.Y);
      drawCastleComposition(g, levels, 0);
      g.restore();
      const wiz = sprite('wizard');
      const y = BASE_Y + wizardStandY(levels) + 6;
      if (wiz) {
        const wh = 104;
        const ww = (wiz.width / wiz.height) * wh;
        g.drawImage(wiz, BASE_X - ww / 2, y - wh, ww, wh);
      } else {
        g.font = '66px serif';
        g.textAlign = 'center';
        g.fillText('🧙', BASE_X, y - 12);
      }
    });
  }

  /** Показать текущее состояние. Анимация идущего улучшения не сбрасывается. */
  show(levels) {
    if (this.anim) return;
    this.levels = { ...levels };
    if (!this.resize()) return;
    this.layer = this.buildLayer(this.levels);
    this.draw(0);
  }

  playUpgrade(key, before, after) {
    this.finishAnim();
    if (!this.resize()) return;
    const newStage = stageOf(key, before[key]) !== stageOf(key, after[key]);
    this.levels = { ...after };
    this.anim = {
      key,
      t: 0,
      oldLayer: this.buildLayer(before),
      newLayer: this.buildLayer(after),
      regions: regionOf(key, after),
      debris: key === 'tower' ? towerDebris(after.tower) : castleDebris(after.walls),
      caption: newStage ? CAPTIONS[key] : '',
      swapped: false,
      total: newStage ? DURATION + CAPTION_TIME : DURATION,
      dustTimer: 0,
    };
    this.parts.length = 0;
    this.layer = this.anim.newLayer;
    sfx('build');
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  finishAnim() {
    if (!this.anim) return;
    cancelAnimationFrame(this.raf);
    this.anim = null;
    this.parts.length = 0;
  }

  dust(region, n, speed) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: region.x + Math.random() * region.w,
        y: region.y + region.h - Math.random() * region.h * 0.7,
        vx: (Math.random() - 0.5) * speed,
        vy: -Math.random() * speed * 0.5,
        t: 0,
        life: 0.5 + Math.random() * 0.5,
        r: 8 + Math.random() * 16,
        debris: Math.random() < 0.3,
      });
    }
  }

  tick(now) {
    const a = this.anim;
    if (!a) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    a.t += dt;
    a.dustTimer -= dt;
    if (a.t < DURATION - 0.2 && a.dustTimer <= 0) {
      a.dustTimer = 0.09;
      for (const r of a.regions) this.dust(r, 2, 90);
    }
    if (!a.swapped && a.t >= SWAP_AT) {
      a.swapped = true;
      for (const r of a.regions) this.dust(r, 18, 240);
      sfx(a.caption ? 'fanfare' : 'thud');
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.parts.splice(i, 1);
        continue;
      }
      if (p.debris) p.vy += 700 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.draw(dt);
    if (a.t >= a.total) {
      this.anim = null;
      this.draw(0);
      return;
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  draw() {
    const { ctx, scale } = this;
    const a = this.anim;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (!a) {
      if (this.layer) ctx.drawImage(this.layer, 0, 0, W, H);
      return;
    }
    // Лёгкая дрожь, пока идёт стройка, и толчок при смене вида
    const since = a.t - SWAP_AT;
    const jolt = since >= 0 && since < 0.3 ? (1 - since / 0.3) * 7 : a.t < SWAP_AT ? 1 : 0;
    if (jolt) ctx.translate(Math.sin(a.t * 70) * jolt, Math.cos(a.t * 55) * jolt);
    ctx.drawImage(a.swapped ? a.newLayer : a.oldLayer, 0, 0, W, H);

    // Леса вырастают, держатся и убираются
    if (a.t < DURATION) {
      const k = a.t < 0.35 ? a.t / 0.35 : a.t > DURATION - 0.3 ? (DURATION - a.t) / 0.3 : 1;
      for (const r of a.regions) drawScaffold(ctx, r.x, r.y, r.w, r.h, Math.max(0, k));
    }
    // Пыль и обломки
    for (const p of this.parts) {
      const q = p.t / p.life;
      ctx.globalAlpha = 1 - q;
      if (p.debris) {
        ctx.fillStyle = a.debris[Math.floor(p.r) % a.debris.length];
        ctx.fillRect(p.x, p.y, 7, 7);
      } else {
        ctx.fillStyle = '#d8d2e8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + q), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // Вспышка при смене вида
    if (since >= 0 && since < 0.28) {
      ctx.globalAlpha = (1 - since / 0.28) * 0.85;
      for (const r of a.regions) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const rad = Math.max(r.w, r.h) * (0.6 + since * 2);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#ffffff00');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
      ctx.globalAlpha = 1;
    }
    if (a.caption && a.t > SWAP_AT) this.drawCaption(a);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawCaption(a) {
    const { ctx } = this;
    const t = a.t - SWAP_AT;
    const left = a.total - a.t;
    const pop = t < 0.18 ? 0.4 + (t / 0.18) * 0.85 : t < 0.32 ? 1.25 - ((t - 0.18) / 0.14) * 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, left / 0.4);
    ctx.translate(W / 2, 58);
    ctx.scale(pop, pop);
    ctx.font = '800 52px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#2a1650';
    ctx.strokeText(a.caption, 0, 0);
    const grad = ctx.createLinearGradient(0, -26, 0, 26);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(1, '#ffb52e');
    ctx.fillStyle = grad;
    ctx.fillText(a.caption, 0, 0);
    ctx.restore();
  }
}
