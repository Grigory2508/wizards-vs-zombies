// Загрузка арта по частям: сразу только то, что видно. Если картинки нет — игра рисует сама или показывает эмодзи.
import { annexStage, towerLook, wallStage } from '../shared/balance.js';

const images = {};
const loading = {};
let manifest = {};
let manifestReady = null;

function loadManifest() {
  manifestReady ??= fetch('art/manifest.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
    .then((m) => {
      manifest = m;
    });
  return manifestReady;
}

function loadOne(name) {
  if (images[name]) return null;
  loading[name] ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      images[name] = img;
      resolve();
    };
    img.onerror = () => {
      delete loading[name]; // при следующем запросе попробуем ещё раз
      resolve();
    };
    img.src = `art/${manifest[name]}`;
  });
  return loading[name];
}

/** Загружает названные картинки; без списка — все */
export async function loadSprites(names) {
  await loadManifest();
  await Promise.all((names || Object.keys(manifest)).filter((n) => manifest[n]).map(loadOne));
}

/** Не ждём дольше ms: на плохой связи игра продолжит с тем, что успело загрузиться */
export const loadSpritesWithin = (names, ms) => Promise.race([loadSprites(names), new Promise((r) => setTimeout(r, ms))]);

const CARD_ART = ['fireball', 'ice', 'lightning', 'guardian', 'heal', 'meteor'].map((k) => `card-${k}`);
const castleArt = (b, d) => `castle-s${wallStage(b.walls) + 1}-d${d}`;
const towerArt = (b, d) => `tower-s${towerLook(b.tower) + 1}-d${d}`;

/** Экран замка при этих уровнях построек */
export const homeArt = (b) => [
  castleArt(b, 0), towerArt(b, 0), `library-s${annexStage(b.library) + 1}`, `treasury-s${annexStage(b.treasury) + 1}`, 'wizard', ...CARD_ART,
];

/** Бой при этих уровнях: все стадии разрушения, зомби, фон, интерфейс */
export const battleArt = (b) => [
  ...homeArt(b),
  ...[1, 2, 3].flatMap((d) => [castleArt(b, d), towerArt(b, d)]),
  'bg-arena', 'zombie-walker', 'zombie-runner', 'zombie-bucket', 'zombie-boss', 'guardian', 'icon-mana', 'card-frame',
];

/** Всё, что покажет ближайшее улучшение любой постройки: леса и новые стадии */
export const nextUpgradeArt = (b) => [
  'scaffold',
  ...Object.keys(b).flatMap((key) => homeArt({ ...b, [key]: b[key] + 1 })),
];

export const sprite = (name) => images[name] || null;
export const artUrl = (name) => (manifest[name] && images[name] ? `art/${manifest[name]}` : null);

/** HTML-иконка: картинка, если есть, иначе эмодзи */
export function iconHtml(name, emoji, cls = 'art-icon') {
  const url = artUrl(name);
  return url ? `<img class="${cls}" src="${url}" alt="" draggable="false">` : emoji;
}

/**
 * Рисует спрайт на canvas с опорой «по низу по центру» (ноги стоят в точке x, y).
 * h — высота в пикселях. Возвращает false, если картинки нет.
 */
export function drawSprite(ctx, name, x, y, h, { flip = false } = {}) {
  const img = images[name];
  if (!img) return false;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}
