// Картинка 640×360 для BotFather (/newapp просит фото Mini App) — из готового арта игры.
//   node scripts/botfather-image.mjs → docs/botfather-640x360.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const art = (n) => `public/art/${n}`;
const W = 640;
const H = 360;

const bg = await sharp(art('bg-arena.jpg')).resize(W, H, { fit: 'cover', position: 'top' }).modulate({ brightness: 0.75 }).toBuffer();
const sprite = (name, h) => sharp(art(`${name}.webp`)).resize({ height: h }).png().toBuffer();
const [castle, wizard, zombie, runner] = await Promise.all([sprite('castle-s3-d0', 210), sprite('wizard', 150), sprite('zombie-walker', 130), sprite('zombie-runner', 115)]);
const meta = async (b) => sharp(b).metadata();
const cm = await meta(castle);

const title = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0820" stop-opacity="0.85"/><stop offset="1" stop-color="#0b0820" stop-opacity="0"/></linearGradient></defs>
  <rect width="${W}" height="110" fill="url(#g)"/>
  <text x="${W / 2}" y="52" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="38" fill="#ffd36e" stroke="#2a1655" stroke-width="6" paint-order="stroke">Волшебники против Зомби</text>
  <text x="${W / 2}" y="86" text-anchor="middle" font-family="DejaVu Sans" font-size="19" fill="#f4f0ff" stroke="#2a1655" stroke-width="4" paint-order="stroke">Реши пример — сотвори заклинание!</text>
</svg>`);

mkdirSync('docs', { recursive: true });
await sharp(bg)
  .composite([
    { input: castle, left: Math.round(W / 2 - cm.width / 2), top: H - cm.height - 8 },
    { input: wizard, left: 70, top: H - 160 },
    { input: zombie, left: W - 200, top: H - 145 },
    { input: runner, left: W - 120, top: H - 130 },
    { input: title, left: 0, top: 0 },
  ])
  .png()
  .toFile('docs/botfather-640x360.png');
console.log('docs/botfather-640x360.png');
