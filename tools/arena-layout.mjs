// Схема арены для генерации фона: точные дорожки из логики боя. Запуск: node tools/arena-layout.mjs
// Зомби ходят по координатам из кода, поэтому нарисованные дорожки должны лечь на те же места.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { GATE_POS, PATHS } from '../public/shared/sim.js';

const W = 720;
const H = 1280;
const path = (p) => p.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#3f7f62"/>
  <g fill="none" stroke="#d9c08f" stroke-width="96" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS.map((p) => `<path d="${path(p)}"/>`).join('\n    ')}
  </g>
  <rect x="${GATE_POS.x - 110}" y="${GATE_POS.y - 110}" width="220" height="110" fill="#5f6480"/>
  <rect x="40" y="${GATE_POS.y - 50}" width="${W - 80}" height="14" fill="#5f6480"/>
</svg>`;
mkdirSync('art/layout', { recursive: true });
await sharp(Buffer.from(svg)).png().toFile('art/layout/bg-arena-layout.png');
console.log('art/layout/bg-arena-layout.png');
