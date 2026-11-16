// Экран рейтинга: эта неделя / за всё время, все игроки / мой класс.
// Место считается по лучшей ночи, при равенстве — по числу верных ответов.
import { $, api, show, esc, haptic } from './ui.js';

let view = { period: 'week', scope: 'all' };
let onBack = () => {};

const medal = (rank) => ['🥇', '🥈', '🥉'][rank - 1] ?? rank;
const row = (r) => `
  <li class="${r.me ? 'me' : ''}">
    <span class="rank">${medal(r.rank)}</span>
    <span class="who">${esc(r.name)}${r.me ? ' <small>(это ты)</small>' : ''}</span>
    <span class="score" title="Лучшая ночь">🌙 ${r.best}</span>
    <span class="score muted" title="Верных ответов">✓ ${r.correct}</span>
  </li>`;

async function load() {
  const list = $('rating-list');
  const note = $('rating-note');
  const meBox = $('rating-me');
  document.querySelectorAll('#rating-period button').forEach((b) => b.classList.toggle('on', b.dataset.period === view.period));
  document.querySelectorAll('#rating-scope button').forEach((b) => b.classList.toggle('on', b.dataset.scope === view.scope));
  list.innerHTML = '<li class="empty">Загружаем…</li>';
  meBox.hidden = true;
  let b;
  try {
    b = await api('leaderboard', view);
  } catch (e) {
    list.innerHTML = `<li class="empty">${esc(e.message)}</li>`;
    return;
  }
  note.textContent = view.period === 'week'
    ? 'Неделя начинается в понедельник. Место — по лучшей пройденной ночи за неделю, при равенстве — по верным ответам.'
    : 'Место — по лучшей пройденной ночи, при равенстве — по верным ответам.';
  if (b.noClass) {
    list.innerHTML = '<li class="empty">Ты пока не в классе. Попроси у учителя ссылку или код класса.</li>';
    return;
  }
  list.innerHTML = b.rows.length ? b.rows.map(row).join('') : `<li class="empty">${view.period === 'week' ? 'На этой неделе ещё никто не играл. Стань первым!' : 'Пока никто не играл.'}</li>`;
  // Себя показываем отдельно, если не попал в первые 50
  if (b.me && !b.rows.some((r) => r.me)) {
    meBox.innerHTML = `<ol class="board">${row(b.me)}</ol>`;
    meBox.hidden = false;
  } else if (!b.me) {
    meBox.innerHTML = `<p class="hint">${view.period === 'week' ? 'Сыграй ночь на этой неделе, чтобы попасть в рейтинг.' : 'Сыграй первую ночь, чтобы попасть в рейтинг.'}</p>`;
    meBox.hidden = false;
  }
}

document.querySelectorAll('#rating-period button').forEach((btn) => {
  btn.onclick = () => {
    haptic.tap();
    view.period = btn.dataset.period;
    load();
  };
});
document.querySelectorAll('#rating-scope button').forEach((btn) => {
  btn.onclick = () => {
    haptic.tap();
    view.scope = btn.dataset.scope;
    load();
  };
});
$('screen-rating').querySelector('[data-back]').onclick = () => onBack();

/** scope — с какой вкладки открыть: 'all' или 'class' */
export function openRating({ back, scope = 'all' }) {
  onBack = back;
  view = { period: view.period, scope };
  show('rating');
  load();
}
