// Страница учителя: свои классы, ссылка-приглашение, ученики, свои задания, сложность.
// Учителем считается тот, кто создал класс: права проверяет сервер.
import { $, api, show, toast, esc, ask, haptic, tg, inviteLink } from './ui.js';

const page = $('teacher-page');
let onBack = () => {};
let current = null; // открытый класс (ответ classDetail)

const SHARE = [
  ['off', 'Выкл'],
  ['rare', 'Редко'],
  ['often', 'Часто'],
  ['only', 'Только свои'],
];
const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);

async function call(op, body, okText) {
  try {
    const res = await api(op, body);
    if (okText) toast(okText);
    haptic.ok();
    return res;
  } catch (e) {
    haptic.err();
    toast(e.message);
    return null;
  }
}

// ---------- Список классов ----------
async function renderList() {
  current = null;
  $('teacher-title').textContent = '👩‍🏫 Для учителя';
  page.innerHTML = '<p class="hint">Загружаем…</p>';
  const list = await call('teacherClasses');
  if (!list) return;
  page.innerHTML = `
    <p class="hint">Создайте класс и отправьте ученикам ссылку. Вы увидите их успехи, сможете добавить свои задания и настроить сложность.</p>
    <div class="cards">${list
      .map((c) => `<button class="card class-card" data-code="${c.code}"><div class="card-icon">🏫</div><div class="card-body"><div class="card-title">${esc(c.name)}</div><div class="card-text">Учеников: ${c.students} · своих заданий: ${c.tasks}</div></div><span class="chev">›</span></button>`)
      .join('') || '<p class="hint">У вас пока нет классов.</p>'}</div>
    <h2>Новый класс</h2>
    <form class="form" id="new-class">
      <label>Название<input name="name" maxlength="40" placeholder="Например, 3 «Б»" required></label>
      <label>Год обучения<select name="grade"><option value="">не задавать</option><option>1</option><option>2</option><option selected>3</option><option>4</option></select>
        <small>Новые ученики начнут с заданий этого класса.</small></label>
      <button class="btn-primary" type="submit">Создать класс</button>
    </form>`;
  page.querySelectorAll('.class-card').forEach((b) => (b.onclick = () => openClass(b.dataset.code)));
  page.querySelector('#new-class').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const d = await call('createClass', { name: f.get('name'), grade: Number(f.get('grade')) || null }, 'Класс создан');
    if (d) renderClass(d);
  };
}

// ---------- Класс ----------
async function openClass(code) {
  page.innerHTML = '<p class="hint">Загружаем…</p>';
  const d = await call('classDetail', { code });
  if (d) renderClass(d);
  else renderList();
}

function renderClass(d) {
  current = d;
  $('teacher-title').textContent = `🏫 ${d.name}`;
  const link = inviteLink(d.code);
  const topicRows = Object.entries(d.topics)
    .map(([t, name]) => {
      const fixed = d.fixedTiers[t] ?? 0;
      const levels = d.levels[t] ?? [];
      const examples = fixed ? (levels[fixed - 1] ?? []).join('   ') : 'у каждого ученика свой уровень: растёт, когда он отвечает верно';
      return `<label>${esc(name)}<select data-topic="${t}"><option value="0">Подстраивается сама</option>${levels
        .map((_, i) => `<option value="${i + 1}" ${fixed === i + 1 ? 'selected' : ''}>Уровень ${i + 1}</option>`)
        .join('')}</select><small class="examples">${esc(examples)}</small></label>`;
    })
    .join('');

  page.innerHTML = `
    <button class="link back-link" id="to-list">‹ Все мои классы</button>

    <h2>Пригласить учеников</h2>
    <div class="invite">
      ${link
        ? `<code class="invite-link">${esc(link)}</code>
           <div class="row"><button class="btn-small" id="copy-link">📋 Скопировать</button><button class="btn-small" id="share-link">📨 Отправить в Telegram</button></div>`
        : ''}
      <p class="hint">Код класса: <b class="code">${d.code}</b>${link ? ' — его можно ввести вручную в «Мой класс».' : '. Ученики вводят его в игре: «Мой класс» → код.'}</p>
    </div>

    <h2>Ученики <small>${d.students.length}</small></h2>
    <div class="students">${d.students
      .map(
        (s) => `<div class="student"><div class="student-main"><b>${esc(s.name)}</b><small>${s.grade ? `${s.grade} кл. · ` : ''}лучшая ночь ${s.bestWave} · верных ${s.totalCorrect}${s.weekCorrect ? ` · за неделю ${s.weekCorrect}` : ''} · ${agoText(s.lastPlayed)}</small></div><button class="icon-btn" data-remove="${s.id}" title="Убрать из класса">✕</button></div>`,
      )
      .join('') || '<p class="hint">Пока никого. Отправьте ученикам ссылку выше.</p>'}</div>

    <h2>Свои задания <small>${d.tasks.length}</small></h2>
    <div class="tabs small" id="share">${SHARE.map(([k, n]) => `<button data-share="${k}" class="${d.customShare === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <p class="hint">Как часто в бою попадаются ваши задания вместо обычных примеров.</p>
    <div class="tasks">${d.tasks
      .map(
        (t) => `<div class="task ${t.enabled ? '' : 'off'}">
          <div class="task-q">${esc(t.q)}</div>
          <div class="task-a">Ответ: <b>${esc(t.answer)}</b>${t.wrong.length ? ` · неверные: ${t.wrong.map(esc).join(', ')}` : ' · неверные подберутся сами'}</div>
          <div class="task-foot"><small>${t.total ? `верно ${t.correct} из ${t.total} (${pct(t.correct, t.total)}%)` : 'ещё не решали'}</small>
            <span><button class="btn-small" data-toggle="${t.id}">${t.enabled ? 'Выключить' : 'Включить'}</button><button class="icon-btn" data-del="${t.id}" title="Удалить">🗑</button></span></div>
        </div>`,
      )
      .join('') || '<p class="hint">Добавьте задание — например, текстовую задачу или вопрос по теме урока.</p>'}</div>
    <form class="form" id="new-task">
      <label>Вопрос<textarea name="q" maxlength="200" rows="2" placeholder="У Маши 5 яблок, 2 она отдала. Сколько осталось?" required></textarea></label>
      <label>Правильный ответ<input name="answer" maxlength="30" placeholder="3" required></label>
      <label>Неверные варианты<div class="row"><input name="w1" maxlength="30" placeholder="2"><input name="w2" maxlength="30" placeholder="7"><input name="w3" maxlength="30" placeholder="4"></div>
        <small>Если ответ — число, неверные можно не писать: игра подберёт сама.</small></label>
      <button class="btn-primary" type="submit">Добавить задание</button>
    </form>

    <h2>Сложность</h2>
    <form class="form" id="difficulty">
      <label>Год обучения для новых учеников<select name="grade"><option value="">не задавать</option>${[1, 2, 3, 4].map((g) => `<option ${d.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      ${topicRows}
      <small>«Подстраивается сама» — задания усложняются, когда ученик отвечает верно, и упрощаются при ошибках. Закреплённый уровень одинаков для всего класса.</small>
    </form>

    <h2>Название класса</h2>
    <form class="form row" id="rename"><input name="name" maxlength="40" value="${esc(d.name)}" required><button class="btn-small" type="submit">Сохранить</button></form>`;

  const save = (patch, text = 'Сохранено') => call('classUpdate', { code: d.code, patch }, text).then((r) => r && renderClass(r));
  page.querySelector('#to-list').onclick = () => renderList();
  page.querySelector('#copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована');
    } catch {
      toast('Не получилось скопировать — выделите ссылку вручную');
    }
  });
  page.querySelector('#share-link')?.addEventListener('click', () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Вступай в класс ${d.name} в игре «Волшебники против Зомби» 🧙‍♂️`)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  });
  page.querySelectorAll('[data-remove]').forEach((b) => {
    b.onclick = async () => {
      const s = d.students.find((x) => String(x.id) === b.dataset.remove);
      if (!(await ask(`Убрать ${s?.name ?? 'ученика'} из класса? Его прогресс в игре сохранится.`))) return;
      const r = await call('removeStudent', { code: d.code, studentId: Number(b.dataset.remove) }, 'Ученик убран из класса');
      if (r) renderClass(r);
    };
  });
  page.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => save({ customShare: b.dataset.share })));
  page.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const t = d.tasks.find((x) => String(x.id) === b.dataset.toggle);
      const r = await call('taskEdit', { code: d.code, id: t.id, task: { enabled: !t.enabled } });
      if (r) renderClass(r);
    };
  });
  page.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await ask('Удалить задание?'))) return;
      const r = await call('taskRemove', { code: d.code, id: Number(b.dataset.del) }, 'Задание удалено');
      if (r) renderClass(r);
    };
  });
  page.querySelector('#new-task').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const task = { q: f.get('q'), answer: f.get('answer'), wrong: [f.get('w1'), f.get('w2'), f.get('w3')] };
    const r = await call('taskAdd', { code: d.code, task }, 'Задание добавлено');
    if (r) renderClass(r);
  };
  const diff = page.querySelector('#difficulty');
  diff.querySelector('[name=grade]').onchange = (e) => save({ grade: Number(e.target.value) || null });
  diff.querySelectorAll('[data-topic]').forEach((sel) => {
    sel.onchange = () => {
      const fixed = {};
      diff.querySelectorAll('[data-topic]').forEach((x) => Number(x.value) && (fixed[x.dataset.topic] = Number(x.value)));
      save({ fixedTiers: fixed });
    };
  });
  page.querySelector('#rename').onsubmit = (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    if (String(name).trim() !== d.name) save({ name }, 'Переименовано');
  };
}

function agoText(iso) {
  if (!iso) return 'ещё не играл(а)';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return 'играл(а) только что';
  const h = Math.round(min / 60);
  if (h < 24) return `играл(а) ${h} ч назад`;
  const days = Math.round(h / 24);
  return days === 1 ? 'играл(а) вчера' : `играл(а) ${days} дн назад`;
}

$('screen-teacher').querySelector('[data-back]').onclick = () => (current ? renderList() : onBack());

export function openTeacher({ back }) {
  onBack = back;
  show('teacher');
  renderList();
}
