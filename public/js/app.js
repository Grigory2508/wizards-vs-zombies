import { BUILDINGS, CARDS, ZOMBIES, TOPICS, DECK_SIZE, openCards, deckSize } from '../shared/balance.js';
import { Battle } from './battle.js';
import { battleArt, homeArt, iconHtml, artUrl, loadSprites, loadSpritesWithin, nextUpgradeArt } from './sprites.js';
import { isMuted, setMuted, unlockAudio, sfx } from './audio.js';
import { CastleView } from './castle-view.js';

import { tg, $, params, haptic, api, show, toast, el, esc, ask, startClassCode } from './ui.js';
import { openRating } from './rating.js';
import { openTeacher } from './teacher.js';

// ---------- Telegram ----------
if (tg) {
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.(); // чтобы свайп в бою не закрывал игру
  tg.lockOrientation?.(); // игра только вертикальная
  tg.setHeaderColor?.('#1f1840');
  tg.setBackgroundColor?.('#15102b');
}
// ---------- Состояние ----------
let state = null;

const castleView = new CastleView($('castle-view'));
if (params.has('dev')) window.__castleView = castleView;
window.addEventListener('resize', () => state && castleView.show(state.buildings));

function renderCastle() {
  const s = state;
  $('wiz-name').textContent = s.name;
  $('wiz-level').textContent = s.level;
  $('xp-fill').style.width = `${Math.min(100, (s.xp / s.xpNext) * 100)}%`;
  $('xp-text').textContent = `${s.xp} / ${s.xpNext} опыта`;
  $('gold').textContent = s.gold;
  $('gold-icon').innerHTML = iconHtml('icon-gold', '🪙');
  const heroBg = artUrl('bg-castle');
  if (heroBg) $('castle-hero').style.backgroundImage = `linear-gradient(180deg, #0000 40%, #15102bcc), url(${heroBg})`;
  $('night-num').textContent = s.wave;
  $('btn-battle').textContent = `⚔️ В бой! Ночь ${s.wave}`;
  $('best-night').textContent = `Лучшая ночь: ${s.bestWave || '—'}`;
  $('night-enemies').textContent =
    'Придут: ' + Object.entries(s.nextWave).map(([t, n]) => `${ZOMBIES[t].icon}×${n}`).join('  ') + (s.nextWave.boss ? ' — БОСС!' : '');
  $('grade-label').textContent = `Задания для ${s.grade} класса`;
  $('myclass-label').innerHTML = s.class
    ? `${esc(s.class.name)}<small>учитель: ${esc(s.class.teacher)}</small>`
    : 'Мой класс<small>вступить по коду</small>';
  castleView.show(s.buildings);

  const bWrap = $('buildings');
  bWrap.innerHTML = '';
  for (const [key, b] of Object.entries(BUILDINGS)) {
    const lvl = s.buildings[key];
    const cost = s.upgradeCosts[key];
    const card = el(`
      <div class="card">
        <div class="card-icon">${iconHtml(`icon-${key}`, b.icon)}</div>
        <div class="card-body">
          <div class="card-title">${b.name}<span class="lvl">ур. ${lvl}</span></div>
          <div class="card-text">${b.effectText(lvl)}${cost != null ? ` → <b>${b.effectText(lvl + 1).split(': ')[1]}</b>` : ''}</div>
        </div>
        <button class="btn-up" ${cost == null || cost > s.gold ? 'disabled' : ''}>${cost == null ? 'MAX' : `⬆ ${cost}🪙`}</button>
      </div>`);
    card.querySelector('button').onclick = () => upgrade(key);
    bWrap.append(card);
  }

  renderDeck();
  renderSound();
}

// ---------- Колода ----------
let deckDraft = null; // пока собирается: сохраняем, только когда заполнены все слоты

function renderDeck() {
  const s = state;
  const deck = deckDraft ?? s.deck;
  const open = openCards(s.buildings.library);
  const need = deckSize(open.length);
  // Выбирать есть из чего, только когда открытых карт больше, чем мест в колоде
  const canEdit = open.length > DECK_SIZE;
  $('deck-count').textContent = `${deck.length} из ${DECK_SIZE}`;

  const slots = $('deck-slots');
  slots.innerHTML = '';
  for (let i = 0; i < DECK_SIZE; i++) {
    const key = deck[i];
    const slot = el(`<button class="deck-slot ${key ? '' : 'empty'}" ${key && canEdit ? '' : 'disabled'}>${key ? `${iconHtml(`card-${key}`, iconHtml(`icon-${key}`, CARDS[key].icon))}<span class="cost mini">${CARDS[key].cost}</span>` : ''}</button>`);
    if (key && canEdit) slot.onclick = () => changeDeck(deck.filter((_, n) => n !== i));
    slots.append(slot);
  }

  const wrap = $('spells');
  wrap.innerHTML = '';
  for (const [key, card] of Object.entries(CARDS)) {
    const locked = !open.includes(key);
    const tier = s.skills[card.topic];
    const copies = deck.filter((k) => k === key).length;
    const canAdd = !locked && canEdit && deck.length < need && copies === 0;
    const row = el(`
      <div class="card ${locked ? 'locked' : ''}">
        <div class="card-icon">${locked ? '🔒' : iconHtml(`card-${key}`, iconHtml(`icon-${key}`, card.icon))}</div>
        <div class="card-body">
          <div class="card-title">${card.name}<span class="lvl">${card.cost} маны</span></div>
          <div class="card-text">${locked ? `Откроется на ${card.library} уровне библиотеки` : card.desc}</div>
          ${!locked ? `<span class="tier">${tier ? `${TOPICS[card.topic]}: уровень ${tier}` : 'Пока на сложении'}</span>` : ''}
        </div>
        ${locked ? '' : `<button class="btn-add" ${canAdd ? '' : 'disabled'}>${copies ? '✓ в колоде' : '+'}</button>`}
      </div>`);
    const add = row.querySelector('.btn-add');
    if (add && canAdd) add.onclick = () => changeDeck([...deck, key]);
    wrap.append(row);
  }
  $('deck-hint').hidden = canEdit && deck.length === need;
  $('deck-hint').textContent = canEdit
    ? `Нажми на карту в колоде, чтобы убрать её, и добавь другую. Собери ${need} разных карт.`
    : 'В колоде все открытые карты, каждая по одной. Улучшай библиотеку, чтобы открывать новые.';
}

async function changeDeck(deck) {
  haptic.tap();
  sfx('tap');
  deckDraft = deck;
  if (deck.length === deckSize(openCards(state.buildings.library).length)) {
    try {
      state = await api('deck', { deck });
      deckDraft = null;
    } catch (e) {
      toast(e.message);
    }
  }
  renderDeck();
  $('btn-battle').disabled = Boolean(deckDraft);
}

// ---------- Звук ----------
function renderSound() {
  $('btn-sound').textContent = isMuted() ? 'звук выкл' : 'звук вкл';
}
$('btn-sound').onclick = () => {
  setMuted(!isMuted());
  unlockAudio();
  sfx('tap');
  renderSound();
};

const ART_WAIT_MS = 8000;

/** В фоне: картинки для боя и для следующего улучшения, чтобы потом не ждать */
function loadAhead() {
  loadSprites(battleArt(state.buildings)).then(() => loadSprites(nextUpgradeArt(state.buildings)));
}

async function upgrade(key) {
  haptic.tap();
  try {
    unlockAudio();
    const levelsBefore = { ...state.buildings };
    const before = openCards(state.buildings.library);
    state = await api('upgrade', { building: key });
    haptic.ok();
    deckDraft = null;
    // Показать стройку: карточка замка должна быть на экране
    $('castle-hero').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Новая стадия обычно уже загружена заранее; иначе ждём её, чтобы стройка показала настоящую картинку
    await loadSpritesWithin([...homeArt(state.buildings), 'scaffold'], ART_WAIT_MS);
    castleView.playUpgrade(key, levelsBefore, state.buildings);
    renderCastle();
    loadAhead();
    const fresh = openCards(state.buildings.library).filter((k) => !before.includes(k));
    if (fresh.length) toast(`Новая карта: ${CARDS[fresh[0]].name}! Она уже в колоде.`);
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Бой ----------
let battle = null;

async function startBattle() {
  unlockAudio();
  haptic.tap();
  $('btn-battle').disabled = true;
  try {
    await loadSpritesWithin(battleArt(state.buildings), ART_WAIT_MS);
    const data = await api('battleStart');
    show('battle');
    battle = new Battle({
      root: $('screen-battle'),
      state,
      data,
      haptic,
      onEnd: finishBattle,
    });
    if (params.has('dev')) window.__battle = battle; // для автопроверки в браузере
  } catch (e) {
    toast(e.message);
  } finally {
    $('btn-battle').disabled = false;
  }
}

async function finishBattle(report) {
  battle = null;
  window.__battle = null;
  let res;
  try {
    res = await api('battleFinish', report);
  } catch (e) {
    toast(e.message);
    show('castle');
    return;
  }
  state = res.state;
  renderCastle();
  loadAhead();
  const r = res.result;
  (r.victory ? haptic.ok : haptic.err)();
  $('result-icon').textContent = r.victory ? '🏆' : '💀';
  $('result-title').textContent = r.victory ? `Ночь ${r.wave} пройдена!` : 'Замок пал…';
  const lostNames = { castle: 'замок', towerL: 'левая башня', towerR: 'правая башня' };
  const rows = [
    `<div class="result-row"><span>Золото</span><b>+${r.gold} 🪙</b></div>`,
    `<div class="result-row"><span>Опыт</span><b>+${r.xp} ✨</b></div>`,
    `<div class="result-row"><span>Верных ответов</span><b>${r.correct} из ${r.total}</b></div>`,
    `<div class="result-row"><span>Повержено зомби</span><b>${r.kills}</b></div>`,
    `<div class="result-row"><span>Набрано маны</span><b>${r.manaEarned}</b></div>`,
    `<div class="result-row"><span>Разыграно карт</span><b>${r.cardsPlayed}</b></div>`,
    `<div class="result-row"><span>Потеряно</span><b>${r.lost.length ? r.lost.map((k) => lostNames[k]).join(', ') : 'ничего'}</b></div>`,
  ];
  if (r.levelsUp) rows.push(`<div class="result-row note">🎉 Новый уровень волшебника: ${state.level}!</div>`);
  for (const [topic, dir] of Object.entries(r.tierChanges || {}))
    rows.push(`<div class="result-row note">${dir === 'up' ? '📈 Задания посложнее' : '📉 Задания попроще'}: ${TOPICS[topic]}</div>`);
  if (!r.victory) rows.push('<div class="result-row note">Улучши стены и башню — и попробуй снова!</div>');
  $('result-rows').innerHTML = rows.join('');
  $('result').hidden = false;
}

$('result-ok').onclick = () => {
  haptic.tap();
  $('result').hidden = true;
  show('castle');
  castleView.show(state.buildings);
};

// ---------- Выбор класса ----------
document.querySelectorAll('[data-grade]').forEach((b) => {
  b.onclick = async () => {
    haptic.tap();
    try {
      state = await api('grade', { grade: Number(b.dataset.grade) });
      show('castle');
      renderCastle();
    } catch (e) {
      toast(e.message);
    }
  };
});
$('btn-change-grade').onclick = () => {
  const go = () => show('grade');
  if (tg?.showConfirm) tg.showConfirm('Сменить класс? Уровни сложности заданий начнутся заново.', (ok) => ok && go());
  else if (confirm('Сменить класс? Уровни сложности заданий начнутся заново.')) go();
};
$('btn-battle').onclick = startBattle;

// ---------- Рейтинг, классы, учитель ----------
const backToCastle = async () => {
  try {
    state = await api('state'); // класс мог поменяться (учитель убрал, переименовал)
  } catch {
    // покажем то, что есть
  }
  show('castle');
  renderCastle();
};

$('btn-rating').onclick = () => {
  haptic.tap();
  openRating({ back: backToCastle, scope: 'all' });
};
$('btn-teacher').onclick = () => {
  haptic.tap();
  openTeacher({ back: backToCastle });
};
$('btn-myclass').onclick = async () => {
  haptic.tap();
  if (!state.class) {
    openCodeModal();
    return;
  }
  const choice = await chooseClassAction();
  if (choice === 'rating') openRating({ back: backToCastle, scope: 'class' });
  if (choice === 'leave' && (await ask(`Выйти из класса ${state.class.name}? Прогресс в игре сохранится.`))) {
    try {
      state = await api('leaveClass');
      renderCastle();
      toast('Ты вышел из класса');
    } catch (e) {
      toast(e.message);
    }
  }
};

/** Что сделать со своим классом: окно Telegram с кнопками, вне Telegram — по очереди спрашиваем */
function chooseClassAction() {
  const c = state.class;
  return new Promise((resolve) => {
    if (tg?.showPopup && tg.initData) {
      tg.showPopup(
        {
          title: c.name.slice(0, 60),
          message: `Учитель: ${c.teacher}`,
          buttons: [{ id: 'rating', type: 'default', text: 'Рейтинг класса' }, { id: 'leave', type: 'destructive', text: 'Выйти из класса' }, { type: 'cancel' }],
        },
        (id) => resolve(id || null),
      );
    } else resolve(confirm(`${c.name} (учитель: ${c.teacher}).\nОткрыть рейтинг класса? («Отмена» — выйти из класса)`) ? 'rating' : 'leave');
  });
}

function openCodeModal() {
  const form = $('code-form');
  form.reset();
  $('code-modal').hidden = false;
  form.code.focus();
}
$('code-cancel').onclick = () => ($('code-modal').hidden = true);
$('code-form').onsubmit = async (e) => {
  e.preventDefault();
  const code = String(new FormData(e.target).get('code') || '').trim();
  if (await joinByCode(code)) $('code-modal').hidden = true;
};

/** Вступить в класс: показываем, что это за класс, и спрашиваем подтверждение */
async function joinByCode(code) {
  try {
    const info = await api('classInfo', { code });
    if (state.class?.code === info.code) {
      toast(`Ты уже в классе ${info.name}`);
      return true;
    }
    const moving = state.class ? `\nСейчас ты в классе ${state.class.name} — перейдёшь в новый.` : '';
    if (!(await ask(`Вступить в класс ${info.name}? Учитель: ${info.teacher}.${moving}`))) return false;
    state = await api('joinClass', { code: info.code });
    haptic.ok();
    toast(`Ты в классе ${info.name}!`);
    if (state.grade) renderCastle();
    return true;
  } catch (e) {
    haptic.err();
    toast(e.message);
    return false;
  }
}

// ---------- Старт ----------
(async () => {
  try {
    state = await api('state');
    // Открыли по ссылке-приглашению учителя — предложим вступить в класс
    const invite = startClassCode();
    if (invite && state.class?.code !== invite) await joinByCode(invite);
    await loadSprites(homeArt(state.buildings));
    if (!state.grade) show('grade');
    else {
      show('castle');
      renderCastle();
    }
    loadAhead();
  } catch (e) {
    document.querySelector('.loading-text').textContent = e.message;
  }
})();
