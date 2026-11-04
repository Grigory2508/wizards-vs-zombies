// Обработка арта: art/raw/* → public/art/* + public/art/manifest.json
// Запуск: npm run art            (все найденные)
//         npm run art -- wizard  (только указанные)
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, KEY_COLOR } from '../art/assets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const RAW = join(root, 'art', 'raw');
const OUT = join(root, 'public', 'art');
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const rawFiles = Object.fromEntries(
  readdirSync(RAW)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => [parse(f).name, join(RAW, f)]),
);

/** Убирает пурпурный фон: мягкая альфа по расстоянию до цвета ключа + подавление пурпурного ореола */
function chromaKey(data, channels, glow = false) {
  // glow: у объекта цветное свечение смешалось с фоном, кайму убираем жёстче (только там, где в самом объекте нет пурпурных тонов)
  const soft = glow ? 15 : 60;
  const hard = glow ? 75 : 150;
  const [kr, kg, kb] = KEY_COLOR;
  let keyLike = 0;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // «Пурпурность»: насколько R и B выше G
    const mag = Math.min(r, b) - g;
    const dist = Math.hypot(r - kr, g - kg, b - kb);
    let a = 255;
    if (dist < 90 || mag > hard) a = 0;
    else if (mag > soft) a = Math.round(255 * (1 - (mag - soft) / (hard - soft)));
    if (a > 0 && mag > 20) {
      // убираем пурпурный оттенок на краях
      const excess = mag - 20;
      data[i] = r - excess;
      data[i + 2] = b - excess;
    }
    data[i + 3] = Math.min(data[i + 3], a);
    // Считаем то, что реально увидит игрок: заметный (не прозрачный) ярко-пурпурный пиксель
    // после подавления каймы. Сиреневый камень и фиолетовые крыши сюда не попадают.
    const R = data[i], G = data[i + 1], B = data[i + 2];
    if (data[i + 3] > 40 && R > 170 && B > 170 && G < Math.min(R, B) * 0.55) keyLike++;
  }
  return keyLike;
}

/** Рамка целой версии в кадре исходника: повреждённые версии вырезаются по ней, чтобы контур не прыгал */
async function intactFrame(name) {
  if (!/-d[0-3]$/.test(name)) return null;
  // Состояния, собранные из одного атласа, уже одного размера: их общая рамка берётся по всем сразу
  const family = [0, 1, 2, 3].map((d) => name.replace(/-d[0-3]$/, `-d${d}`));
  const fromAtlas = ASSETS.find((a) => a.name === name)?.atlas;
  const sources = fromAtlas ? family : [name.replace(/-d[0-3]$/, '-d0')];
  if (!fromAtlas && name.endsWith('-d0')) return null;
  let box = null;
  for (const member of sources) {
    const file = rawFiles[member];
    if (!file) continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    chromaKey(data, info.channels);
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const { info: t } = await sharp(png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const left = -t.trimOffsetLeft;
    const top = -t.trimOffsetTop;
    box = box
      ? { l: Math.min(box.l, left), t: Math.min(box.t, top), r: Math.max(box.r, left + t.width), b: Math.max(box.b, top + t.height) }
      : { l: left, t: top, r: left + t.width, b: top + t.height };
  }
  if (!box) return null;
  return { left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t };
}

async function processSprite(asset, file) {
  const img = sharp(file).ensureAlpha();
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const residual = chromaKey(data, info.channels, asset.glowKey);
  // Доля фона по краям — проверка, что фон действительно пурпурный
  let edgeKey = 0, edgeTotal = 0;
  for (let x = 0; x < info.width; x++)
    for (const y of [0, info.height - 1]) {
      edgeTotal++;
      if (data[(y * info.width + x) * 4 + 3] === 0) edgeKey++;
    }
  for (let y = 0; y < info.height; y++)
    for (const x of [0, info.width - 1]) {
      edgeTotal++;
      if (data[(y * info.width + x) * 4 + 3] === 0) edgeKey++;
    }
  const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  const frame = await intactFrame(asset.name);
  const keyedPng = await keyed.png().toBuffer();
  let outside = 0;
  if (frame) {
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const inside = x >= frame.left && x < frame.left + frame.width && y >= frame.top && y < frame.top + frame.height;
        if (!inside && data[(y * info.width + x) * 4 + 3] > 128) outside++;
      }
    }
  }
  const trimmed = frame
    ? await sharp(keyedPng).extract(frame).toBuffer({ resolveWithObject: true })
    : await sharp(keyedPng).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const out = join(OUT, `${asset.name}.webp`);
  await sharp(trimmed.data)
    .resize(asset.size, asset.size, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(out);
  rmSync(join(OUT, `${asset.name}.png`), { force: true }); // прежний результат обработки, сырьё в art/raw не трогаем
  const { width, height } = trimmed.info;
  let opaque = 0;
  const { data: d2 } = await sharp(trimmed.data).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < d2.length; i += 4) if (d2[i] > 128) opaque++;
  return {
    file: `${asset.name}.webp`,
    report: {
      исходник: `${meta.width}×${meta.height}`,
      объект: `${width}×${height} (аспект ${(width / height).toFixed(2)})`,
      'фон по краям вырезан': `${Math.round((edgeKey / edgeTotal) * 100)}%`,
      'заполнение объекта': `${Math.round((opaque / (width * height)) * 100)}%`,
      'остатки пурпура': `${((residual / (info.width * info.height)) * 100).toFixed(2)}%`,
      ...(frame ? { 'за рамкой целой версии': `${((outside / (frame.width * frame.height)) * 100).toFixed(1)}%` } : {}),
    },
    warn: [
      edgeKey / edgeTotal < 0.9 && 'фон не пурпурный или объект упирается в край кадра',
      residual / (info.width * info.height) > 0.0005 && 'в объекте виден пурпур — проверьте глазами',
      frame && outside / (frame.width * frame.height) > 0.03 && 'контур сильно вышел за рамку целой версии — кадр сдвинулся',
    ].filter(Boolean),
  };
}

async function processBg(asset, file) {
  const meta = await sharp(file).metadata();
  const out = join(OUT, `${asset.name}.jpg`);
  await sharp(file).resize(asset.width, asset.height, { fit: 'cover', position: 'centre' }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  const stats = await sharp(out).stats();
  const lum = stats.channels.slice(0, 3).reduce((s, c, i) => s + c.mean * [0.299, 0.587, 0.114][i], 0);
  const wantAspect = asset.width / asset.height;
  const gotAspect = meta.width / meta.height;
  return {
    file: `${asset.name}.jpg`,
    report: {
      исходник: `${meta.width}×${meta.height} (аспект ${gotAspect.toFixed(2)}, нужен ${wantAspect.toFixed(2)})`,
      'средняя яркость': `${Math.round(lum)} / 255`,
    },
    warn: [
      Math.abs(gotAspect - wantAspect) / wantAspect > 0.25 && 'сильно другой аспект — обрезка съест края',
      asset.name === 'bg-battle' && lum > 120 && 'фон боя слишком светлый — зомби и эффекты потеряются',
    ].filter(Boolean),
  };
}

const manifest = existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {};
/** Метка содержимого в адресе: файл можно кэшировать навсегда, новая версия получит новый адрес */
const versioned = (file) => `${file}?v=${createHash('sha1').update(readFileSync(join(OUT, file))).digest('hex').slice(0, 8)}`;
let done = 0;
for (const asset of ASSETS) {
  if (only.length && !only.includes(asset.name)) continue;
  const file = rawFiles[asset.name];
  if (!file) continue;
  const res = asset.kind === 'bg' ? await processBg(asset, file) : await processSprite(asset, file);
  manifest[asset.name] = versioned(res.file);
  done++;
  console.log(`\n✔ ${asset.name} → public/art/${res.file}`);
  for (const [k, v] of Object.entries(res.report)) console.log(`   ${k}: ${v}`);
  for (const w of res.warn) console.log(`   ⚠ ${w}`);
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const missing = ASSETS.filter((a) => !manifest[a.name]).map((a) => a.name);
console.log(`\nОбработано: ${done}. В игре есть: ${Object.keys(manifest).length}/${ASSETS.length}.`);
if (missing.length) console.log(`Ещё нет (игра покажет эмодзи): ${missing.join(', ')}`);
