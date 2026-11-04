// Контракт на арт: какие картинки нужны игре, в каком размере и как их обрабатывать.
// Сырьё из Gemini кладётся в art/raw/<name>.jpg (или .png/.webp),
// `npm run art` превращает его в public/art/<name>.(webp|jpg) и обновляет public/art/manifest.json.
//
// kind:
//   sprite — объект на пурпурном фоне (#FF00FF) → фон вырезается, обрезка по краям, вписывается в size×size
//   icon   — то же, что sprite, но квадратная иконка
//   bg     — фон без прозрачности → обрезка «по центру» под width×height, сохраняется в JPG
// ref — что приложить референсом при генерации.

export const KEY_COLOR = [255, 0, 255];

export const ASSETS = [
  { name: 'bg-arena', kind: 'bg', width: 900, height: 1600, wave: 1, ref: 'layout/bg-arena-layout.png' },
  { name: 'castle-s1-d0', kind: 'sprite', size: 640, wave: 1, ref: 'bg-arena' },
  { name: 'castle-s1-d1', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s1-d0' },
  { name: 'castle-s1-d2', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s1-d0' },
  { name: 'castle-s1-d3', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s1-d0' },
  { name: 'castle-s2-d0', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s1-d0' },
  { name: 'castle-s2-d1', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s2-d0' },
  { name: 'castle-s2-d2', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s2-d0' },
  { name: 'castle-s2-d3', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s2-d0' },
  { name: 'castle-s3-d0', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s2-d0' },
  { name: 'castle-s3-d1', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s3-d0' },
  { name: 'castle-s3-d2', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s3-d0' },
  { name: 'castle-s3-d3', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s3-d0' },
  { name: 'castle-s4-d0', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s3-d0' },
  { name: 'castle-s4-d1', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s4-d0' },
  { name: 'castle-s4-d2', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s4-d0' },
  { name: 'castle-s4-d3', kind: 'sprite', size: 640, wave: 3, ref: 'castle-s4-d0' },
  { name: 'tower-s1-d0', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s1-d0-single', atlas: 'atlas-tower-s1' },
  { name: 'tower-s1-d1', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s1-d0-single', atlas: 'atlas-tower-s1' },
  { name: 'tower-s1-d2', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s1-d0-single', atlas: 'atlas-tower-s1' },
  { name: 'tower-s1-d3', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s1-d0-single', atlas: 'atlas-tower-s1' },
  { name: 'tower-s2-d0', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s2-d0-single', atlas: 'atlas-tower-s2' },
  { name: 'tower-s2-d1', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s2-d0-single', atlas: 'atlas-tower-s2' },
  { name: 'tower-s2-d2', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s2-d0-single', atlas: 'atlas-tower-s2' },
  { name: 'tower-s2-d3', kind: 'sprite', size: 448, wave: 3, ref: 'old/tower-s2-d0-single', atlas: 'atlas-tower-s2' },
  { name: 'tower-s3-d0', kind: 'sprite', size: 448, wave: 3, ref: 'tower-s2-d0', atlas: 'atlas-tower-s3' },
  { name: 'tower-s3-d1', kind: 'sprite', size: 448, wave: 3, ref: 'tower-s2-d0', atlas: 'atlas-tower-s3' },
  { name: 'tower-s3-d2', kind: 'sprite', size: 448, wave: 3, ref: 'tower-s2-d0', atlas: 'atlas-tower-s3' },
  { name: 'tower-s3-d3', kind: 'sprite', size: 448, wave: 3, ref: 'tower-s2-d0', atlas: 'atlas-tower-s3' },
  { name: 'zombie-walker', kind: 'sprite', size: 256, wave: 1, ref: 'old/zombie-walker-olive' },
  { name: 'zombie-runner', kind: 'sprite', size: 256, wave: 2, ref: 'zombie-walker' },
  { name: 'zombie-bucket', kind: 'sprite', size: 256, wave: 2, ref: 'zombie-walker' },
  { name: 'zombie-boss', kind: 'sprite', size: 448, wave: 2, ref: 'zombie-walker' },
  { name: 'wizard', kind: 'sprite', size: 256, wave: 2, ref: 'zombie-walker' },
  { name: 'guardian', kind: 'sprite', size: 256, wave: 2, ref: 'zombie-walker' },
  { name: 'icon-mana', kind: 'icon', size: 96, wave: 2, ref: 'wizard' },
  { name: 'library-s1', kind: 'sprite', size: 400, wave: 4, ref: 'castle-s1-d0', atlas: 'atlas-library' },
  { name: 'library-s2', kind: 'sprite', size: 400, wave: 4, ref: 'castle-s1-d0', atlas: 'atlas-library' },
  { name: 'library-s3', kind: 'sprite', size: 400, wave: 4, ref: 'castle-s1-d0', atlas: 'atlas-library' },
  { name: 'treasury-s1', kind: 'sprite', size: 320, wave: 4, ref: 'library-s1', atlas: 'atlas-treasury' },
  { name: 'treasury-s2', kind: 'sprite', size: 320, wave: 4, ref: 'library-s1', atlas: 'atlas-treasury' },
  { name: 'treasury-s3', kind: 'sprite', size: 320, wave: 4, ref: 'library-s1', atlas: 'atlas-treasury' },
  { name: 'scaffold', kind: 'sprite', size: 512, wave: 4, ref: 'library-s1' },
  { name: 'card-fireball', kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-ice', kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-lightning', kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-guardian', kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-heal', glowKey: true, kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-meteor', kind: 'icon', size: 192, wave: 5, ref: 'zombie-walker', atlas: 'atlas-cards' },
  { name: 'card-frame', kind: 'icon', size: 384, wave: 5, ref: 'card-fireball' },
];

// Мелкие картинки рисуются одним листом: tools/slice-atlas.mjs режет его на части.
// align — все части одного размера и стоят низом по центру (состояния одной постройки).
export const ATLASES = {
  "atlas-tower-s1": {
    "rows": 1,
    "cols": 4,
    "align": true,
    "members": [
      "tower-s1-d0",
      "tower-s1-d1",
      "tower-s1-d2",
      "tower-s1-d3"
    ]
  },
  "atlas-tower-s2": {
    "rows": 1,
    "cols": 4,
    "align": true,
    "members": [
      "tower-s2-d0",
      "tower-s2-d1",
      "tower-s2-d2",
      "tower-s2-d3"
    ]
  },
  "atlas-tower-s3": {
    "rows": 1,
    "cols": 4,
    "align": true,
    "members": [
      "tower-s3-d0",
      "tower-s3-d1",
      "tower-s3-d2",
      "tower-s3-d3"
    ]
  },
  "atlas-library": {
    "rows": 1,
    "cols": 3,
    "members": [
      "library-s1",
      "library-s2",
      "library-s3"
    ]
  },
  "atlas-treasury": {
    "rows": 2,
    "cols": 2,
    "members": [
      "treasury-s1",
      "treasury-s2",
      null,
      "treasury-s3"
    ]
  },
  "atlas-cards": {
    "rows": 2,
    "cols": 3,
    "members": [
      "card-fireball",
      "card-ice",
      "card-lightning",
      "card-guardian",
      "card-heal",
      "card-meteor"
    ]
  }
};
