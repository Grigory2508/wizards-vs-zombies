// Генератор математических заданий. Параметры каждого уровня сложности (тира)
// хранятся в БД и редактируются через админ-бота.

/** Описание редактируемых параметров (для валидации и для кнопок бота) */
export const PARAM_SCHEMA = {
  addsub: {
    max: { type: 'int', label: 'Макс. число (результат)', min: 5, max: 1000, steps: [1, 10] },
    ops: { type: 'enum', label: 'Действия', values: ['+', '-', '+-'] },
    carry: { type: 'bool', label: 'Переход через десяток' },
  },
  compare: {
    max: { type: 'int', label: 'Макс. число', min: 5, max: 1000, steps: [1, 10] },
    expr: { type: 'bool', label: 'Слева выражение (a + b)' },
  },
  mult: {
    tables: { type: 'set', label: 'Таблицы умножения', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    maxFactor: { type: 'int', label: 'Макс. второй множитель', min: 1, max: 20, steps: [1] },
    missing: { type: 'bool', label: 'Пропущенный множитель (? × 7 = 56)' },
    division: { type: 'bool', label: 'Добавлять деление' },
  },
};

export const DEFAULT_TOPICS = {
  addsub: [
    { max: 10, ops: '+', carry: false },
    { max: 10, ops: '+-', carry: false },
    { max: 20, ops: '+-', carry: false },
    { max: 20, ops: '+-', carry: true },
    { max: 100, ops: '+-', carry: true },
  ],
  compare: [
    { max: 10, expr: false },
    { max: 20, expr: false },
    { max: 100, expr: false },
    { max: 20, expr: true },
    { max: 100, expr: true },
  ],
  mult: [
    { tables: [2], maxFactor: 5, missing: false, division: false },
    { tables: [2, 3], maxFactor: 10, missing: false, division: false },
    { tables: [2, 3, 4, 5], maxFactor: 10, missing: false, division: false },
    { tables: [2, 3, 4, 5, 6, 7, 8, 9], maxFactor: 10, missing: false, division: false },
    { tables: [2, 3, 4, 5, 6, 7, 8, 9], maxFactor: 10, missing: true, division: true },
  ],
};

export const DEFAULT_SETTINGS = {
  // С какого тира начинает ученик каждого класса; 0 — тема выключена (заклинание берёт сложение)
  grades: {
    1: { addsub: 1, compare: 1, mult: 0 },
    2: { addsub: 3, compare: 2, mult: 1 },
    3: { addsub: 5, compare: 3, mult: 3 },
    4: { addsub: 5, compare: 5, mult: 4 },
  },
  adaptUp: 0.85, // доля верных ответов, после которой тир повышается
  adaptDown: 0.5, // ниже этой доли тир понижается
  adaptWindow: 12, // сколько последних ответов учитывать
  problemsPerTopic: 40, // заданий на тему в одном бою
};

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** Варианты ответа: правильный + 3 правдоподобных неправильных */
function numericOptions(answer, spread = 3) {
  const opts = new Set([answer]);
  const candidates = [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, answer - 2];
  for (const c of shuffle(candidates)) {
    if (opts.size >= 4) break;
    if (c >= 0 && Math.abs(c - answer) <= Math.max(spread, 10)) opts.add(c);
  }
  let guard = 0;
  while (opts.size < 4 && guard++ < 100) {
    const c = answer + ri(-spread - 3, spread + 3);
    if (c >= 0) opts.add(c);
  }
  return shuffle([...opts].map(String));
}

function genAddSub(p) {
  const max = Math.max(2, p.max);
  const ops = p.ops === '+-' ? ['+', '-'] : [p.ops];
  for (let attempt = 0; attempt < 200; attempt++) {
    const op = pick(ops);
    let a, b, ans;
    if (op === '+') {
      ans = ri(2, max);
      a = ri(1, ans - 1);
      b = ans - a;
    } else {
      a = ri(2, max);
      b = ri(1, a - 1);
      ans = a - b;
    }
    const carry = op === '+' ? (a % 10) + (b % 10) >= 10 : a % 10 < b % 10;
    if (!p.carry && carry) continue;
    // Если переход разрешён — пусть встречается почаще (иначе он почти не тренируется)
    if (p.carry && !carry && max > 10 && Math.random() < 0.5) continue;
    return { q: `${a} ${op === '-' ? '−' : '+'} ${b} = ?`, answer: String(ans), options: numericOptions(ans) };
  }
  return { q: '2 + 2 = ?', answer: '4', options: numericOptions(4) };
}

function genCompare(p) {
  const max = Math.max(3, p.max);
  let leftText, left, right;
  if (p.expr) {
    const a = ri(1, Math.floor(max / 2));
    const b = ri(1, Math.floor(max / 2));
    left = a + b;
    leftText = `${a} + ${b}`;
  } else {
    left = ri(0, max);
    leftText = String(left);
  }
  const r = Math.random();
  if (r < 0.2) right = left;
  else if (r < 0.6) right = Math.max(0, Math.min(max, left + pick([-2, -1, 1, 2]))); // близкие числа — интереснее
  else right = ri(0, max);
  const answer = left > right ? '>' : left < right ? '<' : '=';
  return { q: `${leftText}  ?  ${right}`, answer, options: ['<', '=', '>'] };
}

function genMult(p) {
  const tables = p.tables?.length ? p.tables : [2];
  const a = pick(tables);
  const b = ri(1, Math.max(1, p.maxFactor));
  const prod = a * b;
  const kind = pick(['mult', ...(p.missing ? ['missing'] : []), ...(p.division ? ['div'] : [])]);
  if (kind === 'missing') return { q: `? × ${a} = ${prod}`, answer: String(b), options: numericOptions(b, 2) };
  if (kind === 'div') return { q: `${prod} : ${a} = ?`, answer: String(b), options: numericOptions(b, 2) };
  const [x, y] = Math.random() < 0.5 ? [a, b] : [b, a];
  // Неправильные варианты — соседние произведения, это типичные ошибки
  const opts = new Set([prod]);
  for (const c of shuffle([prod + a, prod - a, prod + b, prod - b, prod + 1, prod - 1, prod + 10])) {
    if (opts.size >= 4) break;
    if (c > 0) opts.add(c);
  }
  while (opts.size < 4) opts.add(prod + opts.size * 2);
  return { q: `${x} × ${y} = ?`, answer: String(prod), options: shuffle([...opts].map(String)) };
}

const GENERATORS = { addsub: genAddSub, compare: genCompare, mult: genMult };

export function generateProblem(topic, params) {
  return GENERATORS[topic](params);
}

export function generateBatch(topic, params, n) {
  const out = [];
  let prev = '';
  for (let i = 0; i < n; i++) {
    let p = generateProblem(topic, params);
    if (p.q === prev) p = generateProblem(topic, params); // без одинаковых подряд
    prev = p.q;
    out.push(p);
  }
  return out;
}

/** Проверяет и нормализует параметры тира. Бросает ошибку с понятным текстом. */
export function validateParams(topic, params) {
  const schema = PARAM_SCHEMA[topic];
  if (!schema) throw new Error(`Неизвестная тема: ${topic}`);
  const out = {};
  for (const [key, def] of Object.entries(schema)) {
    const v = params[key];
    if (def.type === 'int') {
      if (!Number.isInteger(v) || v < def.min || v > def.max) throw new Error(`${topic}.${key}: целое ${def.min}…${def.max}`);
    } else if (def.type === 'bool') {
      if (typeof v !== 'boolean') throw new Error(`${topic}.${key}: true/false`);
    } else if (def.type === 'enum') {
      if (!def.values.includes(v)) throw new Error(`${topic}.${key}: одно из ${def.values.join(', ')}`);
    } else if (def.type === 'set') {
      if (!Array.isArray(v) || !v.length || v.some((x) => !def.values.includes(x))) throw new Error(`${topic}.${key}: непустой список из ${def.values.join(',')}`);
    }
    out[key] = def.type === 'set' ? [...new Set(v)].sort((a, b) => a - b) : v;
  }
  return out;
}

export function validateSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...s };
  for (const k of ['adaptUp', 'adaptDown']) if (typeof out[k] !== 'number' || out[k] < 0 || out[k] > 1) throw new Error(`${k}: число 0…1`);
  if (out.adaptDown >= out.adaptUp) throw new Error('adaptDown должен быть меньше adaptUp');
  if (!Number.isInteger(out.adaptWindow) || out.adaptWindow < 4 || out.adaptWindow > 100) throw new Error('adaptWindow: 4…100');
  if (!Number.isInteger(out.problemsPerTopic) || out.problemsPerTopic < 10 || out.problemsPerTopic > 200) throw new Error('problemsPerTopic: 10…200');
  for (const g of ['1', '2', '3', '4']) {
    const gr = out.grades?.[g];
    if (!gr) throw new Error(`grades.${g} отсутствует`);
    if (!(gr.addsub >= 1)) throw new Error(`grades.${g}.addsub: сложение должно быть включено (≥1)`);
    for (const t of Object.keys(PARAM_SCHEMA)) if (!Number.isInteger(gr[t]) || gr[t] < 0) throw new Error(`grades.${g}.${t}: целое ≥ 0`);
  }
  return out;
}

/** Текст параметров для бота */
export function describeParams(topic, p) {
  const schema = PARAM_SCHEMA[topic];
  return Object.entries(schema)
    .map(([k, def]) => {
      let v = p[k];
      if (def.type === 'bool') v = v ? 'да' : 'нет';
      if (def.type === 'set') v = v.join(', ');
      return `• ${def.label}: <b>${v}</b>`;
    })
    .join('\n');
}
