// Постройки: собираются из слоёв по уровням, у замка и башен — 4 состояния разрушения.
// Есть картинка в art/manifest.json — рисуется она, нет — запасной вариант кодом.
//   castle-s{1..4}-d{0..3}, tower-s{1..3}-d{0..3}, library-s{1..3}, treasury-s{1..3}, scaffold
import { sprite } from './sprites.js';
import { annexStage, towerHeight, towerLook, wallStage } from '../shared/balance.js';

const TAU = Math.PI * 2;
const LINE = '#1b1540';

export const COMPOSITION = { W: 500, H: 310, X: 250, Y: 304 }; // X, Y — опорная точка: низ по центру
export const TOWER_W = 110;
export const KEEP_TOP = -150; // сюда встаёт волшебник на замке, нарисованном кодом
const PAINTED_CASTLE_W = 320;
const PAINTED_CASTLE_H = 260;
const PAINTED_PLATFORM = 0.75; // настил на картинке замка: доля высоты от низа

/** Высота, на которой стоит волшебник: у картинки настил выше, чем у рисунка кодом */
export function wizardStandY(levels) {
  const img = sprite(`castle-s${wallStage(levels.walls) + 1}-d0`);
  if (!img) return KEEP_TOP;
  const k = Math.min(PAINTED_CASTLE_W / img.width, PAINTED_CASTLE_H / img.height);
  return -img.height * k * PAINTED_PLATFORM;
}

// Материалы стен по стадиям: 0 частокол, 1 камень, 2 камень с железом, 3 магическая крепость
const WALL_MATERIAL = [
  { wall: '#9a6b3f', alt: '#86592f', top: '#c49a66', debris: ['#9a6b3f', '#6f4a29', '#c49a66'] },
  { wall: '#8d84b8', alt: '#9f96c9', top: '#bdb5e0', debris: ['#968dc0', '#6e6596', '#5d5484'] },
  { wall: '#6f7590', alt: '#7f86a2', top: '#a4abc4', debris: ['#7f86a2', '#4f5468', '#a8aec2'] },
  { wall: '#5b4fb0', alt: '#6d60c8', top: '#a497f2', debris: ['#6d60c8', '#473c96', '#5ef2e4'] },
];
const TOWER_MATERIAL = [
  { wall: '#a0713f', alt: '#8b5f33', top: '#c9a06c', debris: ['#a0713f', '#6f4a29', '#c9a06c'] },
  { wall: '#837aac', alt: '#968dc0', top: '#b5acd8', debris: ['#968dc0', '#6e6596', '#5d5484'] },
  { wall: '#5b4fb0', alt: '#6d60c8', top: '#a497f2', debris: ['#6d60c8', '#473c96', '#5ef2e4'] },
];

/** Какие обломки летят от построек: цвет зависит от материала */
export const castleDebris = (wallsLevel) => WALL_MATERIAL[wallStage(wallsLevel)].debris;
export const towerDebris = (towerLevel) => TOWER_MATERIAL[towerLook(towerLevel)].debris;

// ---------- Общие помощники ----------
export function offscreen(w, h, scale, draw) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale);
  c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  draw(g, w, h);
  return c;
}

export function tinted(source, color, alpha = 1) {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const g = c.getContext('2d');
  g.drawImage(source, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function outlined(g, path, fill, line = LINE, width = 4) {
  g.beginPath();
  path(g);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = width;
  g.strokeStyle = line;
  g.lineJoin = 'round';
  g.stroke();
}
export const ellipse = (x, y, rx, ry) => (g) => g.ellipse(x, y, rx, ry, 0, 0, TAU);
export const rrect = (x, y, w, h, r) => (g) => g.roundRect(x, y, w, h, r);
const poly = (...pts) => (g) => {
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
};

/** Картинка с опорой «низ по центру», если она есть */
function drawPainted(g, name, x, y, maxW, maxH) {
  const img = sprite(name);
  if (!img) return false;
  const k = Math.min(maxW / img.width, maxH / img.height);
  g.drawImage(img, x - (img.width * k) / 2, y - img.height * k, img.width * k, img.height * k);
  return true;
}

function blocks(g, x, y, w, h, mat) {
  const bw = 30;
  const bh = 18;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = mat.wall;
  g.fillRect(x, y, w, h);
  for (let row = 0, by = y; by < y + h; row++, by += bh) {
    for (let bx = x - (row % 2 ? bw / 2 : 0); bx < x + w; bx += bw) {
      g.fillStyle = (Math.round(bx / bw) + row) % 3 === 0 ? mat.alt : mat.wall;
      g.fillRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    }
  }
  g.restore();
}

/** Каменный блок с контуром и светлым верхом: сверху видна его крышка, вид под углом */
function stoneBox(g, x, y, w, h, mat) {
  outlined(g, rrect(x, y, w, h, 5), mat.wall);
  blocks(g, x + 2, y + 2, w - 4, h - 4, mat);
  outlined(g, rrect(x - 3, y - 9, w + 6, 13, 4), mat.top);
}

function crenels(g, x, y, w, mat, step = 26) {
  for (let cx = x; cx < x + w - 10; cx += step) outlined(g, rrect(cx, y - 15, 15, 17, 3), mat.top, LINE, 3);
}

function log(g, x, baseY, w, h) {
  outlined(g, poly([x, baseY], [x, baseY - h + 10], [x + w / 2, baseY - h], [x + w, baseY - h + 10], [x + w, baseY]), '#9a6b3f', LINE, 3);
  g.fillStyle = '#c49a6655';
  g.fillRect(x + 3, baseY - h + 12, 4, h - 14);
}

function rune(g, x, y, s = 1) {
  g.strokeStyle = '#5ef2e4';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y - 9 * s);
  g.lineTo(x, y + 9 * s);
  g.moveTo(x - 6 * s, y - 3 * s);
  g.lineTo(x + 6 * s, y + 4 * s);
  g.stroke();
}

function crystal(g, x, y, s = 1) {
  outlined(g, poly([x, y - 17 * s], [x + 11 * s, y], [x, y + 15 * s], [x - 11 * s, y]), '#5ef2e4', LINE, 3);
  g.fillStyle = '#ffffffaa';
  g.fillRect(x - 3 * s, y - 8 * s, 3 * s, 8 * s);
}

function gate(g, stage, height) {
  const w = 36;
  const baseY = 0;
  outlined(g, (p) => {
    p.moveTo(-w, baseY - 3);
    p.lineTo(-w, baseY - height + w);
    p.arc(0, baseY - height + w, w, Math.PI, 0);
    p.lineTo(w, baseY - 3);
    p.closePath();
  }, stage === 3 ? '#2d2470' : '#5b3a22');
  g.fillStyle = stage === 3 ? '#42359c' : '#3f2614';
  for (let i = -2; i <= 2; i++) g.fillRect(i * 13 - 2, baseY - height + 8, 4, height - 12);
  if (stage === 2) {
    g.fillStyle = '#2a2d3d';
    g.fillRect(-w + 2, baseY - 40, w * 2 - 4, 8);
    g.fillRect(-w + 2, baseY - 18, w * 2 - 4, 8);
    g.fillStyle = '#c8cedd';
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.arc(i * 14, baseY - 36, 2.5, 0, TAU);
      g.arc(i * 14, baseY - 14, 2.5, 0, TAU);
      g.fill();
    }
  }
  if (stage === 3) rune(g, 0, baseY - 28, 1.3);
}

// ---------- Замок: донжон и стены ----------
function drawKeep(g, stage) {
  const mat = WALL_MATERIAL[stage];
  if (stage === 0) {
    // Дощатая сторожка с настилом, на котором стоит волшебник
    outlined(g, rrect(-66, KEEP_TOP + 4, 132, 110, 4), '#9a6b3f');
    g.fillStyle = '#6f4a29';
    for (let x = -46; x < 66; x += 22) g.fillRect(x, KEEP_TOP + 8, 3, 104);
    outlined(g, rrect(-76, KEEP_TOP - 6, 152, 14, 4), mat.top);
    g.fillStyle = '#ffd66b';
    g.fillRect(-48, KEEP_TOP + 36, 18, 20);
    g.fillRect(30, KEEP_TOP + 36, 18, 20);
    return;
  }
  stoneBox(g, -74, KEEP_TOP + 2, 148, 112, mat);
  crenels(g, -72, KEEP_TOP - 4, 148, mat);
  g.fillStyle = '#ffd66b';
  g.fillRect(-50, KEEP_TOP + 34, 18, 24);
  g.fillRect(32, KEEP_TOP + 34, 18, 24);
  if (stage === 2) {
    g.fillStyle = '#2a2d3d';
    g.fillRect(-74, KEEP_TOP + 14, 148, 7);
    g.fillStyle = '#8f96ad';
    outlined(g, poly([-96, -60], [-74, KEEP_TOP + 30], [-74, -60]), '#8f96ad', LINE, 3);
    outlined(g, poly([96, -60], [74, KEEP_TOP + 30], [74, -60]), '#8f96ad', LINE, 3);
  }
  if (stage === 3) {
    rune(g, -18, KEEP_TOP + 46);
    rune(g, 18, KEEP_TOP + 46);
  }
}

function drawWalls(g, stage) {
  const mat = WALL_MATERIAL[stage];
  const half = 126;
  if (stage === 0) {
    // Деревянный частокол
    for (let x = -half; x < half - 4; x += 21) log(g, x, 0, 20, 74 + ((x * 7) % 9));
    outlined(g, rrect(-half - 2, -48, half * 2 + 4, 6, 2), '#6f4a29', LINE, 2);
    gate(g, 0, 70);
    return;
  }
  const h = [0, 84, 92, 102][stage];
  stoneBox(g, -half, -h, half * 2, h, mat);
  crenels(g, -half + 2, -h - 5, half * 2, mat);

  if (stage === 2) {
    // Железные полосы, заклёпки и шипы
    g.fillStyle = '#2a2d3d';
    g.fillRect(-half, -h + 24, half * 2, 7);
    g.fillRect(-half, -30, half * 2, 7);
    g.fillStyle = '#c8cedd';
    for (let x = -half + 12; x < half; x += 24) {
      g.beginPath();
      g.arc(x, -h + 27.5, 2.4, 0, TAU);
      g.arc(x, -26.5, 2.4, 0, TAU);
      g.fill();
    }
  }
  if (stage === 3) {
    for (const x of [-92, -58, 58, 92]) rune(g, x, -h / 2 + 4);
    g.fillStyle = '#ffcc4d';
    g.fillRect(-half, -6, half * 2, 5);
  }
  gate(g, stage, Math.min(h - 8, 78));

  // Угловые башенки
  for (const x of [-half - 12, half - 26]) {
    const th = h + 32;
    stoneBox(g, x, -th, 38, th, mat);
    if (stage === 1) crenels(g, x, -th - 5, 38, mat, 13);
    if (stage === 2) {
      g.fillStyle = '#2a2d3d';
      g.fillRect(x, -th + 22, 38, 6);
      outlined(g, poly([x - 4, -th - 6], [x + 19, -th - 34], [x + 42, -th - 6]), '#4f5468');
    }
    if (stage === 3) {
      outlined(g, poly([x - 6, -th - 6], [x + 19, -th - 46], [x + 44, -th - 6]), '#332a86');
      g.fillStyle = '#ffcc4d';
      g.fillRect(x - 3, -th - 9, 44, 4);
      crystal(g, x + 19, -th - 54, 0.75);
      rune(g, x + 19, -th / 2);
    }
  }
}

// ---------- Библиотека и сокровищница ----------
export function drawLibrary(g, level, x = 0, y = 0) {
  const stage = annexStage(level);
  const s = 0.72 + (level - 1) * 0.022;
  if (drawPainted(g, `library-s${stage + 1}`, x, y, 120 * s + 30, 130 * s + 30)) return;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const stone = ['#a58c6b', '#8d84b8', '#5b4fb0'][stage];
  const trim = ['#6f5a3f', '#5d5484', '#ffcc4d'][stage];
  const h = 70 + stage * 12;
  if (stage >= 1) {
    outlined(g, rrect(-66, -h + 26, 30, h - 26, 4), stone);
    outlined(g, poly([-72, -h + 26], [-51, -h - 6], [-30, -h + 26]), '#4a3f9c');
  }
  outlined(g, rrect(-44, -h, 88, h, 4), stone);
  g.fillStyle = trim;
  g.fillRect(-44, -h, 88, 6);
  // Окна горят: читают
  g.fillStyle = '#ffd66b';
  for (let i = 0; i < 1 + stage; i++) {
    const wx = -30 + i * (stage === 0 ? 24 : stage === 1 ? 40 : 26);
    outlined(g, rrect(wx, -h + 18, 14, 22, 7), '#ffd66b', LINE, 2);
  }
  // Купол в виде раскрытой книги
  const domeY = -h + 2;
  outlined(g, (p) => {
    p.moveTo(-54, domeY);
    p.quadraticCurveTo(-48, domeY - 54, 0, domeY - 34);
    p.quadraticCurveTo(48, domeY - 54, 54, domeY);
    p.closePath();
  }, stage === 2 ? '#7b2f8f' : '#a33b4c');
  outlined(g, (p) => {
    p.moveTo(-46, domeY - 4);
    p.quadraticCurveTo(-40, domeY - 46, 0, domeY - 28);
    p.quadraticCurveTo(40, domeY - 46, 46, domeY - 4);
    p.closePath();
  }, '#f7efd6', LINE, 3);
  g.strokeStyle = '#a89f86';
  g.lineWidth = 2;
  for (const k of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(k * 8, domeY - 20 + i * 6);
      g.quadraticCurveTo(k * 24, domeY - 34 + i * 6, k * 38, domeY - 26 + i * 8);
      g.stroke();
    }
  }
  g.strokeStyle = LINE;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, domeY - 30);
  g.lineTo(0, domeY);
  g.stroke();
  if (stage === 2) {
    crystal(g, 0, domeY - 52, 0.8);
    rune(g, 18, -22);
    rune(g, -18, -22);
  }
  g.restore();
}

const TREASURE_SPOTS = [[0, 0], [-34, -6], [34, -6], [-16, -22], [18, -22], [-52, -22], [52, -22], [0, -38], [-34, -40], [34, -40], [-54, -42], [54, -42], [14, -54], [-16, -56]];

function goldPile(g, x, y, s) {
  outlined(g, ellipse(x, y - 10 * s, 24 * s, 13 * s), '#e0a020', LINE, 3);
  outlined(g, ellipse(x - 3 * s, y - 16 * s, 15 * s, 9 * s), '#ffcc4d', LINE, 2);
  g.fillStyle = '#fff3b0';
  for (const [dx, dy] of [[-8, -16], [5, -20], [11, -10], [-14, -8]]) {
    g.beginPath();
    g.arc(x + dx * s, y + dy * s, 2.2 * s, 0, TAU);
    g.fill();
  }
}

function chest(g, x, y, s) {
  outlined(g, rrect(x - 19 * s, y - 20 * s, 38 * s, 20 * s, 3), '#8a5528', LINE, 3);
  outlined(g, rrect(x - 21 * s, y - 32 * s, 42 * s, 15 * s, 7), '#a8682f', LINE, 3);
  g.fillStyle = '#ffcc4d';
  g.fillRect(x - 4 * s, y - 22 * s, 8 * s, 10 * s);
}

export function drawTreasury(g, level, x = 0, y = 0) {
  const stage = annexStage(level);
  if (drawPainted(g, `treasury-s${stage + 1}`, x, y, 150, 130)) return;
  g.save();
  g.translate(x, y);
  if (stage >= 1) {
    // Хранилище появляется, когда золота становится много
    const col = stage === 2 ? '#5b4fb0' : '#8d84b8';
    outlined(g, rrect(-46, -92, 92, 56, 5), col);
    outlined(g, poly([-54, -90], [0, -122], [54, -90]), stage === 2 ? '#ffcc4d' : '#6a5ca8');
    outlined(g, rrect(-13, -76, 26, 40, 12), '#3f2614', LINE, 3);
  }
  const count = Math.min(TREASURE_SPOTS.length, Math.ceil(level * 0.95));
  // Дальние раньше — ближние поверх
  const spots = TREASURE_SPOTS.slice(0, count).map((p, i) => [p[0], p[1], i]).sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, i] of spots) {
    const s = 0.72 + (i % 3) * 0.08 + level * 0.008;
    if (i % 3 === 2) chest(g, dx, dy, s);
    else goldPile(g, dx, dy, s);
  }
  g.restore();
}

// ---------- Разрушение ----------
/** Вырезы делают настоящие дыры в контуре, поэтому силуэт меняется, а не только цвет */
function bite(g, ...pts) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000'; // непрозрачный: вырез должен быть сквозным
  g.beginPath();
  poly(...pts)(g);
  g.fill();
  g.restore();
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = LINE;
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.beginPath();
  poly(...pts)(g);
  g.stroke();
  g.restore();
}

function cracks(g, x, y, w, h, n, seed) {
  g.strokeStyle = '#17112f';
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let cx = x + ((i * 0.37 + seed) % 1) * w;
    let cy = y + ((i * 0.53 + seed) % 0.55) * h;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      cx += (s % 2 ? -1 : 1) * (5 + (i % 3) * 3);
      cy += 11;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }
}

function hole(g, x, y, rx, ry) {
  g.fillStyle = '#100b24';
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0.3, 0, TAU);
  g.fill();
  g.strokeStyle = LINE;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#ff8a3d';
  g.beginPath();
  g.ellipse(x, y + ry * 0.45, rx * 0.5, ry * 0.3, 0, 0, TAU);
  g.fill();
}

function scorch(g, x, y, r) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, '#0b0818cc');
  grad.addColorStop(1, '#0b081800');
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

function rubbleHeap(g, cx, y, w, h, mat) {
  const colors = [mat.wall, mat.alt, mat.top];
  const stones = [[-0.2, 0.12], [0.08, 0.08], [0.28, 0.2], [-0.36, 0.3], [-0.1, 0.32], [0.14, 0.34], [0.4, 0.42], [-0.46, 0.58], [-0.24, 0.56], [0.02, 0.58], [0.26, 0.6], [0.47, 0.7], [-0.36, 0.84], [-0.12, 0.84], [0.12, 0.86], [0.36, 0.88]];
  const r = Math.min(w * 0.085, 16) + 3;
  stones.forEach(([sx, sy], i) => {
    const k = 0.8 + ((i * 7) % 5) * 0.09;
    outlined(g, ellipse(cx + sx * w, y - h + sy * h, r * k, r * k * 0.68), colors[i % 3], LINE, 3);
  });
}

function drawCastleDamage(g, state) {
  if (state === 1) {
    // Трещины и выбитые камни
    cracks(g, -110, -82, 220, 72, 5, 0.13);
    cracks(g, -60, KEEP_TOP + 8, 120, 50, 2, 0.41);
    bite(g, [-96, -92], [-80, -66], [-58, -92], [-58, -110], [-96, -110]);
    bite(g, [70, -92], [84, -74], [102, -92], [102, -110], [70, -110]);
  } else if (state === 2) {
    // Проломы, копоть
    cracks(g, -115, -80, 230, 74, 8, 0.27);
    cracks(g, -66, KEEP_TOP + 6, 132, 60, 4, 0.71);
    bite(g, [-132, -125], [-112, -58], [-88, -70], [-62, -40], [-44, -74], [-44, -130]);
    bite(g, [46, -128], [58, -64], [84, -46], [104, -74], [132, -60], [140, -130]);
    bite(g, [40, KEEP_TOP - 25], [46, KEEP_TOP + 30], [66, KEEP_TOP + 18], [80, KEEP_TOP + 38], [90, KEEP_TOP - 25]);
    hole(g, -84, -30, 22, 15);
    hole(g, 96, -24, 18, 13);
    scorch(g, -30, KEEP_TOP + 60, 66);
    scorch(g, 70, -60, 60);
    scorch(g, -90, -60, 56);
  }
}

// ---------- Сборка замка ----------
/** Весь замок: библиотека и сокровищница по бокам, донжон, стены. Опорная точка — низ по центру. */
export function drawCastleComposition(g, levels, state = 0) {
  const stage = wallStage(levels.walls);
  const mat = WALL_MATERIAL[stage];
  g.save();
  g.translate(COMPOSITION.X, COMPOSITION.Y);
  if (state === 3) {
    drawCastleRuin(g, levels, mat, stage);
    g.restore();
    return;
  }
  drawLibrary(g, levels.library, -180, -4);
  drawTreasury(g, levels.treasury, 182, -4);
  // Замок рисуется на отдельном слое, чтобы вырезы не дырявили пристройки
  const painted = sprite(`castle-s${stage + 1}-d${state}`);
  if (painted) {
    const k = Math.min(PAINTED_CASTLE_W / painted.width, PAINTED_CASTLE_H / painted.height);
    g.drawImage(painted, -(painted.width * k) / 2, -painted.height * k, painted.width * k, painted.height * k);
  } else {
    // Картинки этого состояния ещё нет: повреждения рисуются поверх целой картинки, если она есть
    const intact = sprite(`castle-s${stage + 1}-d0`);
    const layer = offscreen(COMPOSITION.W, COMPOSITION.H, g.getTransform().a, (l) => {
      l.translate(COMPOSITION.X, COMPOSITION.Y);
      if (intact) {
        const k = Math.min(PAINTED_CASTLE_W / intact.width, PAINTED_CASTLE_H / intact.height);
        l.drawImage(intact, -(intact.width * k) / 2, -intact.height * k, intact.width * k, intact.height * k);
      } else {
        drawKeep(l, stage);
        drawWalls(l, stage);
      }
      drawCastleDamage(l, state);
    });
    g.drawImage(layer, -COMPOSITION.X, -COMPOSITION.Y, COMPOSITION.W, COMPOSITION.H);
  }
  g.restore();
}

function drawCastleRuin(g, levels, mat, stage) {
  const painted = sprite(`castle-s${stage + 1}-d3`);
  if (painted) {
    const k = Math.min(PAINTED_CASTLE_W / painted.width, PAINTED_CASTLE_H / painted.height);
    g.drawImage(painted, -(painted.width * k) / 2, -painted.height * k, painted.width * k, painted.height * k);
    return;
  }
  // Пристройки в копоти, от замка — обломки стен и груда камней
  drawLibrary(g, levels.library, -180, -4);
  drawTreasury(g, levels.treasury, 182, -4);
  outlined(g, poly([-126, 0], [-126, -56], [-100, -40], [-84, -66], [-60, -24], [-52, 0]), mat.wall);
  outlined(g, poly([52, 0], [64, -32], [84, -70], [104, -46], [126, -62], [126, 0]), mat.wall);
  outlined(g, poly([-48, -14], [-40, -74], [-12, -52], [8, -92], [36, -60], [46, -14]), mat.alt);
  rubbleHeap(g, 0, 4, 250, 48, mat);
}

// ---------- Сторожевая башня ----------
export function drawTower(g, level, state = 0) {
  if (state !== 1 && state !== 2) {
    paintTower(g, level, state);
    return;
  }
  const h = towerHeight(level) + 26;
  const layer = offscreen(TOWER_W, h, g.getTransform().a, (l) => paintTower(l, level, state));
  g.drawImage(layer, 0, 0, TOWER_W, h);
}

function paintTower(g, level, state) {
  const look = towerLook(level);
  const mat = TOWER_MATERIAL[look];
  const h = towerHeight(level);
  const w = TOWER_W;
  const baseY = h + 20;
  const cx = w / 2;
  if (drawPainted(g, `tower-s${look + 1}-d${state}`, cx, baseY, w, h + 20)) return;
  if (state === 3) {
    // Руины: груда камней с обломком основания
    outlined(g, poly([cx - 28, baseY], [cx - 26, baseY - 36], [cx - 6, baseY - 24], [cx + 10, baseY - 48], [cx + 28, baseY - 18], [cx + 30, baseY]), mat.wall);
    rubbleHeap(g, cx, baseY + 2, w * 0.92, 42, mat);
    return;
  }
  const top = baseY - h;
  if (look === 0) {
    // Деревянная вышка на каменном основании
    outlined(g, rrect(16, baseY - 40, w - 32, 40, 4), '#8d84b8');
    outlined(g, poly([24, baseY - 36], [34, top + 34], [w - 34, top + 34], [w - 24, baseY - 36]), mat.wall);
    g.strokeStyle = '#6f4a29';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(30, baseY - 40);
    g.lineTo(w - 36, top + 40);
    g.moveTo(w - 30, baseY - 40);
    g.lineTo(36, top + 40);
    g.stroke();
    outlined(g, rrect(16, top + 18, w - 32, 22, 4), mat.top);
    for (const x of [18, w / 2 - 6, w - 30]) outlined(g, rrect(x, top + 4, 12, 16, 2), mat.alt, LINE, 3);
    crystal(g, cx, top + 8, 0.85);
  } else {
    stoneBox(g, 17, top + 36, w - 34, h - 36, mat);
    crenels(g, 17, top + 30, w - 34, mat, 21);
    outlined(g, rrect(cx - 12, top + 60, 24, 34, 12), '#201846');
    if (look === 1) {
      g.fillStyle = '#ffd66b';
      g.fillRect(cx - 7, top + 96, 14, 16);
      crystal(g, cx, top + 18, 1);
    } else {
      outlined(g, poly([8, top + 34], [cx, top - 10], [w - 8, top + 34]), '#332a86');
      g.fillStyle = '#ffcc4d';
      g.fillRect(12, top + 30, w - 24, 5);
      crystal(g, cx, top - 12, 1);
      rune(g, cx, baseY - 40, 1.2);
    }
  }
  if (state === 1) {
    cracks(g, 20, top + 44, w - 40, h - 60, 3, 0.19);
    bite(g, [8, top + 24], [24, top + 56], [42, top + 28], [42, top - 8], [8, top - 8]);
  } else if (state === 2) {
    cracks(g, 20, top + 44, w - 40, h - 60, 5, 0.63);
    bite(g, [4, top + 20], [24, top + 78], [50, top + 46], [50, top - 20], [4, top - 20]);
    bite(g, [w - 2, baseY - 76], [w - 28, baseY - 62], [w - 14, baseY - 40], [w - 2, baseY - 36]);
    hole(g, cx - 2, baseY - 46, 15, 13);
    scorch(g, cx, top + 80, 44);
  }
}

// ---------- Строительные леса ----------
/** Леса вокруг прямоугольника: k от 0 до 1 — насколько они выросли снизу вверх */
export function drawScaffold(g, x, y, w, h, k) {
  g.save();
  g.beginPath();
  g.rect(x - 16, y + h - h * k - 16, w + 32, h * k + 20);
  g.clip();
  const img = sprite('scaffold');
  if (img) {
    g.drawImage(img, x - 14, y - 12, w + 28, h + 14);
    g.restore();
    return;
  }
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  const poles = Math.max(2, Math.round(w / 50));
  const stepX = (w + 14) / poles;
  for (const [color, width] of [[LINE, 9], ['#c49a66', 5]]) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    for (let i = 0; i <= poles; i++) {
      const px = x - 7 + i * stepX;
      g.moveTo(px, y + h);
      g.lineTo(px, y - 8);
    }
    for (let py = y + h - 28; py > y - 4; py -= 42) {
      g.moveTo(x - 14, py);
      g.lineTo(x + w + 14, py);
      for (let i = 0; i < poles; i++) {
        g.moveTo(x - 7 + i * stepX, py);
        g.lineTo(x - 7 + (i + 1) * stepX, py - 36);
      }
    }
    g.stroke();
  }
  g.restore();
}
