// Простые звуки синтезом WebAudio, без файлов. Настройка «звук выкл» хранится на устройстве.
const KEY = 'wvz-muted';
let ctx = null;
let noiseBuffer = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch {
  // хранилище недоступно — просто не запоминаем
}
const lastPlayed = {};

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // не страшно
  }
}

/** Браузер разрешает звук только после касания: вызывается из обработчиков нажатий */
export function unlockAudio() {
  if (muted) return;
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'sine', vol = 0.15, to = null, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, from = 2000, to = 200, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(600, 0.05, { type: 'triangle', vol: 0.08 }),
  correct: () => {
    tone(660, 0.1, { type: 'triangle', vol: 0.14 });
    tone(990, 0.16, { type: 'triangle', vol: 0.14, delay: 0.08 });
  },
  wrong: () => tone(220, 0.25, { type: 'sawtooth', vol: 0.08, to: 130 }),
  noMana: () => tone(160, 0.1, { type: 'square', vol: 0.05 }),
  cast: () => tone(400, 0.18, { type: 'triangle', vol: 0.1, to: 900 }),
  fireball: () => noise(0.35, { vol: 0.3, from: 3000, to: 150 }),
  ice: () => {
    tone(1600, 0.2, { type: 'sine', vol: 0.08, to: 2400 });
    noise(0.2, { vol: 0.08, from: 8000, to: 3000 });
  },
  lightning: () => {
    noise(0.15, { vol: 0.22, from: 9000, to: 1500 });
    tone(120, 0.2, { type: 'sawtooth', vol: 0.08, to: 60 });
  },
  guardian: () => {
    noise(0.3, { vol: 0.25, from: 500, to: 80 });
    tone(90, 0.3, { type: 'square', vol: 0.08, to: 50 });
  },
  heal: () => {
    tone(523, 0.3, { vol: 0.1 });
    tone(784, 0.4, { vol: 0.1, delay: 0.1 });
  },
  meteor: () => {
    noise(0.7, { vol: 0.4, from: 1500, to: 60 });
    tone(70, 0.6, { type: 'sawtooth', vol: 0.18, to: 30 });
  },
  shot: () => tone(800, 0.06, { type: 'square', vol: 0.025, to: 400 }),
  hit: () => noise(0.05, { vol: 0.06, from: 2500, to: 900 }),
  pop: () => {
    tone(500, 0.1, { type: 'triangle', vol: 0.1, to: 1200 });
    noise(0.08, { vol: 0.07, from: 4000, to: 1500 });
  },
  bite: () => noise(0.1, { vol: 0.12, from: 900, to: 200 }),
  thud: () => {
    noise(0.22, { vol: 0.3, from: 600, to: 80 });
    tone(80, 0.2, { type: 'sine', vol: 0.2, to: 40 });
  },
  collapse: () => {
    noise(0.6, { vol: 0.4, from: 800, to: 50 });
    noise(0.4, { vol: 0.25, from: 400, to: 60, delay: 0.2 });
  },
  build: () => {
    for (let i = 0; i < 4; i++) tone(240 + i * 30, 0.06, { type: 'square', vol: 0.05, delay: i * 0.13 });
    noise(0.5, { vol: 0.1, from: 1200, to: 300 });
  },
  fanfare: () => {
    noise(0.3, { vol: 0.2, from: 900, to: 120 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.13, delay: 0.05 + i * 0.09 }));
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.14, delay: i * 0.12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.18 })),
};

// Минимальный промежуток между одинаковыми звуками, чтобы частые события не сливались в шум
const GAP = { shot: 0.12, hit: 0.08, bite: 0.15, pop: 0.06 };

export function sfx(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const gap = GAP[name] || 0.03;
  if (ctx.currentTime - (lastPlayed[name] ?? -1) < gap) return;
  lastPlayed[name] = ctx.currentTime;
  SOUNDS[name]?.();
}
