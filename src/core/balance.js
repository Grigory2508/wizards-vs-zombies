// Общий баланс игры: используется и сервером (расчёт наград, стоимость улучшений),
// и клиентом (бой), и симуляцией. Меняете цифры здесь — меняется везде.

const castleHp = (lvl) => 100 + 50 * (lvl - 1);
const towerHp = (lvl) => 60 + 30 * (lvl - 1);

export const BUILDINGS = {
  walls: {
    name: 'Стены замка',
    icon: '🧱',
    desc: 'Прочность замка и башен',
    maxLevel: 15,
    baseCost: 40,
    effect: (lvl) => ({ hp: castleHp(lvl), towerHp: towerHp(lvl) }),
    effectText: (lvl) => `Прочность: замок ${castleHp(lvl)}, башни ${towerHp(lvl)}`,
  },
  tower: {
    name: 'Сторожевые башни',
    icon: '🏯',
    desc: 'Сами стреляют по зомби',
    maxLevel: 15,
    baseCost: 50,
    effect: (lvl) => ({ dps: 4 + 3 * (lvl - 1) }),
    effectText: (lvl) => `Урон в секунду: ${4 + 3 * (lvl - 1)}`,
  },
  library: {
    name: 'Библиотека',
    icon: '📚',
    desc: 'Новые карты и сила магии',
    maxLevel: 15,
    baseCost: 60,
    effect: (lvl) => ({ spellPower: 1 + 0.1 * (lvl - 1) }),
    effectText: (lvl) => `Сила заклинаний: +${10 * (lvl - 1)}%`,
  },
  treasury: {
    name: 'Сокровищница',
    icon: '💰',
    desc: 'Больше золота за победы',
    maxLevel: 15,
    baseCost: 45,
    effect: (lvl) => ({ goldBonus: 1 + 0.1 * (lvl - 1) }),
    effectText: (lvl) => `Бонус золота: +${10 * (lvl - 1)}%`,
  },
};

export const START_BUILDINGS = { walls: 1, tower: 1, library: 1, treasury: 1 };

/** Стоимость улучшения с уровня lvl на lvl+1 */
export function upgradeCost(key, lvl) {
  return Math.round(BUILDINGS[key].baseCost * Math.pow(1.55, lvl - 1));
}

// Карты. Каждая тренирует свою тему математики и открывается уровнем библиотеки.
// radius — радиус области на арене (логические пиксели 720×1280).
export const CARDS = {
  fireball: {
    name: 'Огненный шар',
    icon: '🔥',
    topic: 'addsub',
    library: 1,
    cost: 3,
    damage: 34,
    radius: 110,
    delay: 0.35,
    desc: 'Взрыв по области',
  },
  ice: {
    name: 'Ледяная стена',
    icon: '❄️',
    topic: 'compare',
    library: 1, // открыта с самого начала, вместе с огненным шаром
    cost: 2,
    damage: 6,
    radius: 140,
    slow: 0.4, // скорость становится 40%
    duration: 5,
    delay: 0.1,
    desc: 'Замедляет зомби в области',
  },
  lightning: {
    name: 'Цепная молния',
    icon: '⚡',
    topic: 'mult',
    library: 2,
    cost: 4,
    damage: 32,
    targets: 3,
    radius: 90,
    delay: 0,
    desc: 'Бьёт трёх зомби рядом с точкой',
  },
  guardian: {
    name: 'Каменный страж',
    icon: '🗿',
    topic: 'compare',
    library: 3,
    cost: 4,
    hp: 150,
    dps: 6,
    duration: 16,
    radius: 60,
    delay: 0,
    desc: 'Встаёт на дорожке и держит зомби',
  },
  heal: {
    name: 'Целебный круг',
    icon: '💚',
    topic: 'addsub',
    library: 4,
    cost: 3,
    healShare: 0.3, // доля полной прочности; руины не чинит
    radius: 240,
    delay: 0.2,
    desc: 'Чинит замок и башни в круге',
  },
  meteor: {
    name: 'Метеорит',
    icon: '☄️',
    topic: 'mult',
    library: 5,
    cost: 6,
    damage: 120,
    radius: 190,
    delay: 0.7,
    desc: 'Большой урон по большой области',
  },
};

export const TOPICS = {
  addsub: 'Сложение и вычитание',
  compare: 'Сравнение чисел',
  mult: 'Умножение',
};

// ---------- Колода ----------
export const DECK_SIZE = 8;
export const HAND_SIZE = 4;

export const openCards = (libraryLevel) => Object.keys(CARDS).filter((k) => libraryLevel >= CARDS[k].library);

// Каждая карта в колоде — в одном экземпляре, без повторов. Пока открыто не больше DECK_SIZE карт,
// в колоде все открытые; выбирать, какие взять, придётся, только когда карт станет больше.

/** Сколько карт должно быть в колоде при стольких открытых */
export const deckSize = (openCount) => Math.min(DECK_SIZE, openCount);

export function defaultDeck(libraryLevel) {
  return openCards(libraryLevel).slice(0, DECK_SIZE);
}

export function isValidDeck(deck, libraryLevel) {
  const open = openCards(libraryLevel);
  if (!Array.isArray(deck) || deck.length !== deckSize(open.length)) return false;
  if (new Set(deck).size !== deck.length) return false;
  return deck.every((k) => open.includes(k));
}

/** Новая открытая карта сразу попадает в колоду, если в ней есть место */
export function addCardToDeck(deck, key) {
  if (deck.includes(key) || deck.length >= DECK_SIZE) return deck;
  return [...deck, key];
}

// ---------- Мана ----------
export const MANA_MAX = 10;
export const MANA_CORRECT = 3;
export const MANA_FAST = 4;
export const FAST_ANSWER_MS = 4000;
export const STREAK_BONUS_FROM = 3;

/** Сколько маны даёт верный ответ. streak — серия с учётом этого ответа */
export function manaForAnswer(ms, streak) {
  return (ms < FAST_ANSWER_MS ? MANA_FAST : MANA_CORRECT) + (streak >= STREAK_BONUS_FROM ? 1 : 0);
}

export const ARCHMAGE_STREAK = 5; // только титул на экране

// ---------- Постройки в бою ----------
export const TOWER_PERIOD = 0.8; // секунд между выстрелами
export const TOWER_RANGE = 340;

/** Стадия разрушения: 0 — целое (100–67%), 1 — трещины (66–34%), 2 — проломы (33–1%), 3 — руины */
export function damageStage(ratio) {
  const pct = Math.ceil(Math.max(0, ratio) * 100);
  if (pct >= 67) return 0;
  if (pct >= 34) return 1;
  if (pct >= 1) return 2;
  return 3;
}

// Внешний вид построек по уровням
/** Стены: 0 — частокол (1–3), 1 — камень (4–7), 2 — камень с железом (8–11), 3 — магическая крепость (12–15) */
export const wallStage = (level) => (level >= 12 ? 3 : level >= 8 ? 2 : level >= 4 ? 1 : 0);
/** Башни: 0 — деревянная вышка (1–5), 1 — каменная (6–10), 2 — магическая (11–15) */
export const towerLook = (level) => (level >= 11 ? 2 : level >= 6 ? 1 : 0);
export const towerHeight = (level) => 125 + 5 * level;
/** Библиотека и сокровищница: 3 стадии */
export const annexStage = (level) => (level >= 11 ? 2 : level >= 6 ? 1 : 0);

export const ZOMBIES = {
  walker: { name: 'Зомби', icon: '🧟', hp: 40, speed: 0.032, dps: 5, gold: 3, size: 1 },
  runner: { name: 'Бегун', icon: '🧟‍♀️', hp: 24, speed: 0.065, dps: 4, gold: 4, size: 0.9 },
  bucket: { name: 'Зомби в ведре', icon: '🧟‍♂️', hp: 110, speed: 0.026, dps: 7, gold: 7, size: 1.1 },
  boss: { name: 'Зомби-великан', icon: '🧟', hp: 650, speed: 0.018, dps: 25, gold: 60, size: 2 },
};

export const LANES = 2;

/** Детерминированный генератор случайных чисел — состав волны одинаков на сервере и клиенте */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Сколько зомби каждого типа в ночи: доли растут плавно, чтобы сложность не прыгала от ночи к ночи */
function waveTypes(wave, count) {
  const buckets = wave >= 5 ? Math.round(count * Math.min(0.22, 0.08 + 0.02 * (wave - 5))) : 0;
  const runners = wave >= 3 ? Math.round(count * Math.min(0.3, 0.15 + 0.03 * (wave - 3))) : 0;
  return [
    ...Array(buckets).fill('bucket'),
    ...Array(runners).fill('runner'),
    ...Array(count - buckets - runners).fill('walker'),
  ];
}

/** Состав волны (ночи): список появлений зомби */
export function waveSpawns(wave) {
  const rand = rng(wave * 9973 + 17);
  const count = Math.round((5 + Math.floor(wave * 1.4)) * (wave % 10 === 0 ? 0.7 : 1)); // в ночь босса обычных зомби меньше
  const hpScale = 1 + 0.12 * (wave - 1);
  const interval = Math.max(1.6, 4.2 - wave * 0.15);
  const types = waveTypes(wave, count);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  const spawns = [];
  let t = 2;
  for (const type of types) {
    spawns.push({ type, lane: Math.floor(rand() * LANES), time: t, hp: Math.round(ZOMBIES[type].hp * hpScale) });
    t += interval * (0.6 + rand() * 0.8);
  }
  if (wave % 10 === 0) {
    spawns.push({ type: 'boss', lane: wave % 20 === 0 ? 1 : 0, time: t + 2, hp: Math.round(ZOMBIES.boss.hp * (wave / 10)) });
  }
  return spawns;
}

export function waveSummary(wave) {
  const counts = {};
  for (const s of waveSpawns(wave)) counts[s.type] = (counts[s.type] || 0) + 1;
  return counts;
}

// Волшебник
export const XP_PER_CORRECT = 5;
export function xpForLevel(level) {
  return 40 + 30 * (level - 1);
}
/** Бонус силы заклинаний от уровня волшебника */
export function wizardPower(level) {
  return 1 + 0.05 * (level - 1);
}

export function victoryGold(wave) {
  return 20 + 8 * wave;
}

/** Золото за каждую башню, уцелевшую к победе */
export function towerSavedGold(wave) {
  return 5 + wave;
}

/** Золото за бой: одна формула и для сервера, и для симуляции. kills = {walker: n, ...} */
export function battleGold({ kills, victory, wave, towersSaved, goldBonus }) {
  let killGold = 0;
  for (const [type, n] of Object.entries(kills)) killGold += n * ZOMBIES[type].gold;
  const towerGold = victory ? towersSaved * towerSavedGold(wave) : 0;
  return { gold: Math.round((killGold + (victory ? victoryGold(wave) : 0) + towerGold) * goldBonus), towerGold };
}
