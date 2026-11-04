// Режет атлас из art/raw/atlas/<имя>.* на отдельные картинки art/raw/<ассет>.png: node tools/slice-atlas.mjs <имя>
// Объекты ищутся по пурпурным промежуткам, сетка заранее не считается ровной.
// Если объектов не столько, сколько ждём, файлы не пишутся: такой атлас надо перегенерировать.
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATLASES, KEY_COLOR } from '../art/assets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const name = process.argv[2];
const atlas = ATLASES[name];
if (!atlas) throw new Error(`нет такого атласа: ${name}`);
const dir = join(root, 'art', 'raw', 'atlas');
const fileName = readdirSync(dir).find((f) => parse(f).name === name);
if (!fileName) throw new Error(`нет файла атласа: ${name}`);

const { data, info } = await sharp(join(dir, fileName)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const [kr, kg, kb] = KEY_COLOR;
const solid = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    const mag = Math.min(data[i], data[i + 2]) - data[i + 1];
    const dist = Math.hypot(data[i] - kr, data[i + 1] - kg, data[i + 2] - kb);
    solid[y * W + x] = dist < 90 || mag > 150 ? 0 : 1;
  }
}

/** Отрезки вдоль оси, где есть объект; мелкие крошки (искры, щепки) приклеиваются к соседу */
function segments(profile, minGap, minSize) {
  const runs = [];
  let start = -1;
  let lastSolid = -1;
  profile.forEach((count, i) => {
    if (count > 0) {
      if (start < 0) start = i;
      else if (i - lastSolid > minGap) {
        runs.push([start, lastSolid + 1]);
        start = i;
      }
      lastSolid = i;
    }
  });
  if (start >= 0) runs.push([start, lastSolid + 1]);
  const merged = [];
  for (const run of runs) {
    const size = run[1] - run[0];
    if (size < minSize && merged.length) merged[merged.length - 1][1] = run[1];
    else if (merged.length && merged[merged.length - 1][1] - merged[merged.length - 1][0] < minSize) merged[merged.length - 1][1] = run[1];
    else merged.push([...run]);
  }
  return merged;
}

const rowProfile = Array.from({ length: H }, (_, y) => {
  let n = 0;
  for (let x = 0; x < W; x++) n += solid[y * W + x];
  return n > 2 ? n : 0; // одиночный шум не считается
});
const rows = segments(rowProfile, 10, H * 0.05);
if (rows.length !== atlas.rows) throw new Error(`${name}: рядов ${rows.length}, ждём ${atlas.rows}`);

const cells = [];
for (const [top, bottom] of rows) {
  const colProfile = Array.from({ length: W }, (_, x) => {
    let n = 0;
    for (let y = top; y < bottom; y++) n += solid[y * W + x];
    return n > 2 ? n : 0;
  });
  const cols = segments(colProfile, 5, W * 0.04); // зазоры между объектами бывают всего 8 пикселей
  if (cols.length !== atlas.cols) throw new Error(`${name}: в ряду объектов ${cols.length}, ждём ${atlas.cols}`);
  for (const [left, right] of cols) {
    // Точный низ и верх каждого объекта внутри его столбца
    let t = bottom;
    let b = top;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (solid[y * W + x]) {
          t = Math.min(t, y);
          b = Math.max(b, y + 1);
        }
      }
    }
    cells.push({ left, top: t, width: right - left, height: b - t });
  }
}

// Холст: при align все состояния одного размера и стоят низом по центру, контур не прыгает
const PAD = 24;
const maxW = Math.max(...cells.map((c) => c.width));
const maxH = Math.max(...cells.map((c) => c.height));
const png = await sharp(data, { raw: { width: W, height: H, channels: C } }).png().toBuffer();
for (let i = 0; i < atlas.members.length; i++) {
  if (!atlas.members[i]) continue; // null: лишний объект на листе, не используется
  const c = cells[i];
  const cut = await sharp(png).extract(c).toBuffer();
  const cw = atlas.align ? maxW : c.width;
  const ch = atlas.align ? maxH : c.height;
  await sharp({ create: { width: cw + PAD * 2, height: ch + PAD * 2, channels: 3, background: { r: kr, g: kg, b: kb } } })
    .composite([{ input: cut, left: PAD + Math.round((cw - c.width) / 2), top: PAD + ch - c.height }])
    .png()
    .toFile(join(root, 'art', 'raw', `${atlas.members[i]}.png`));
  console.log(`${atlas.members[i]}: ${c.width}×${c.height}`);
}
