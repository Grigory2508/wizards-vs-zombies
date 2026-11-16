// Классы учителя и рейтинг — чистые функции без базы.
// Класс: учитель создаёт его на странице «Учителю», дети вступают по ссылке-приглашению.
// В классе можно: задать год обучения для новых учеников, закрепить уровень сложности темы
// и добавить свои задания — они попадаются в бою вперемешку с обычными.
import { GameError } from './errors.js';
import { numericOptions, shuffle } from './problems.js';

export const LIMITS = {
  className: 40,
  classesPerTeacher: 20,
  tasksPerClass: 100,
  question: 200,
  answer: 30,
  wrong: 3,
};

/** Как часто в бою попадаются задания учителя: доля от всех примеров */
export const CUSTOM_SHARE = { off: 0, rare: 0.2, often: 0.5, only: 1 };

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Неделя для еженедельного рейтинга: понедельник по Москве (UTC+3), вид «2026-W47» */
export function weekId(nowMs) {
  const d = new Date(nowMs + 3 * 3600_000);
  const day = (d.getUTCDay() + 6) % 7; // 0 — понедельник
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = 1 + Math.floor((thursday - yearStart) / (7 * 864e5));
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function newClass({ name, grade, ownerName }) {
  const n = clean(name, LIMITS.className);
  if (!n) throw new GameError('Назовите класс');
  const g = Number(grade);
  return {
    name: n,
    ownerName: clean(ownerName, 40) || 'Учитель',
    grade: [1, 2, 3, 4].includes(g) ? g : null,
    customShare: 'rare',
    fixedTiers: {},
    tasks: [],
    nextTaskId: 1,
  };
}

/** Проверяет и нормализует задание учителя: вопрос, правильный ответ, до трёх неверных */
export function cleanTask(raw) {
  const q = clean(raw?.q, LIMITS.question);
  const answer = clean(raw?.answer, LIMITS.answer);
  if (!q) throw new GameError('Напишите вопрос');
  if (!answer) throw new GameError('Напишите правильный ответ');
  const wrong = [...new Set((Array.isArray(raw?.wrong) ? raw.wrong : []).map((w) => clean(w, LIMITS.answer)).filter((w) => w && w !== answer))].slice(0, LIMITS.wrong);
  // Для числового ответа неверные варианты можно не писать — придумаем сами
  if (wrong.length < 1 && !/^-?\d+$/.test(answer)) throw new GameError('Добавьте хотя бы один неверный вариант ответа');
  return { q, answer, wrong, enabled: raw?.enabled !== false };
}

export function updateClass(cls, patch) {
  if (patch.name !== undefined) {
    const n = clean(patch.name, LIMITS.className);
    if (!n) throw new GameError('Назовите класс');
    cls.name = n;
  }
  if (patch.grade !== undefined) {
    const g = Number(patch.grade);
    cls.grade = [1, 2, 3, 4].includes(g) ? g : null;
  }
  if (patch.customShare !== undefined) {
    if (!(patch.customShare in CUSTOM_SHARE)) throw new GameError('Неизвестная частота заданий');
    cls.customShare = patch.customShare;
  }
  if (patch.fixedTiers !== undefined) {
    const out = {};
    for (const [topic, tier] of Object.entries(patch.fixedTiers ?? {})) {
      const t = Number(tier);
      if (Number.isInteger(t) && t >= 1 && t <= 10) out[topic] = t;
    }
    cls.fixedTiers = out;
  }
  return cls;
}

export function addTask(cls, raw) {
  if (cls.tasks.length >= LIMITS.tasksPerClass) throw new GameError(`Не больше ${LIMITS.tasksPerClass} заданий в классе`);
  const task = { id: cls.nextTaskId++, ...cleanTask(raw), total: 0, correct: 0 };
  cls.tasks.push(task);
  return task;
}

export function editTask(cls, id, raw) {
  const t = cls.tasks.find((x) => x.id === Number(id));
  if (!t) throw new GameError('Задание не найдено');
  const merged = cleanTask({ ...t, ...raw });
  // Текст или ответ поменялись — прежняя статистика больше не про это задание
  if (merged.q !== t.q || merged.answer !== t.answer) Object.assign(t, { total: 0, correct: 0 });
  Object.assign(t, merged);
  return t;
}

export function removeTask(cls, id) {
  const before = cls.tasks.length;
  cls.tasks = cls.tasks.filter((x) => x.id !== Number(id));
  if (cls.tasks.length === before) throw new GameError('Задание не найдено');
  return cls;
}

/** Статистика ответов по заданиям учителя: { id: {total, correct} } */
export function addTaskResults(cls, results) {
  for (const [id, r] of Object.entries(results ?? {})) {
    const t = cls.tasks.find((x) => x.id === Number(id));
    if (!t) continue;
    t.total += r.total;
    t.correct += r.correct;
  }
  return cls;
}

/** Задания учителя для боя: вопрос, варианты в случайном порядке, правильный ответ хранит сервер */
export function customProblems(cls, n = 40) {
  const active = (cls?.tasks ?? []).filter((t) => t.enabled);
  if (!active.length || !CUSTOM_SHARE[cls.customShare]) return [];
  const out = [];
  while (out.length < n) {
    for (const t of shuffle([...active])) {
      if (out.length >= n) break;
      const wrong = t.wrong.length ? t.wrong : numericOptions(Number(t.answer)).filter((o) => o !== t.answer).slice(0, 3);
      out.push({ id: t.id, q: t.q, answer: t.answer, options: shuffle([t.answer, ...wrong]) });
    }
  }
  return out;
}

/** Что видит ученик о своём классе */
export function classForStudent(code, cls) {
  return code && cls ? { code, name: cls.name, teacher: cls.ownerName } : null;
}

/** Что видит учитель (без данных учеников — их добавляет сервер) */
export function classForTeacher(code, cls) {
  return {
    code,
    name: cls.name,
    grade: cls.grade,
    customShare: cls.customShare,
    fixedTiers: cls.fixedTiers,
    tasks: cls.tasks.map(({ id, q, answer, wrong, enabled, total, correct }) => ({ id, q, answer, wrong, enabled, total, correct })),
  };
}

/** Строка рейтинга из сохранения игрока */
export function ratingOf(p, week) {
  const thisWeek = p.week?.id === week ? p.week : null;
  return {
    allBest: p.bestWave ?? 0,
    allCorrect: p.totalCorrect ?? 0,
    weekBest: thisWeek?.best ?? 0,
    weekCorrect: thisWeek?.correct ?? 0,
    playedThisWeek: Boolean(thisWeek),
  };
}
