// Бой: связывает логику (shared/sim.js), отрисовку (render.js) и интерфейс на экране.
import { artUrl, iconHtml } from './sprites.js';
import { sfx, unlockAudio } from './audio.js';
import { ArenaRenderer } from './render.js';
import { CARDS, HAND_SIZE, MANA_MAX, ARCHMAGE_STREAK } from '../shared/balance.js';
import { ARENA, BattleSim } from '../shared/sim.js';

const STAGE_W = 720;
const STAGE_H = 1280;
const MAX_STRETCH = 1.35;
const AFTER_RIGHT_MS = 250;
const AFTER_WRONG_MS = 1000;
const DRAG_THRESHOLD = 14; // логических пикселей

export class Battle {
  constructor({ root, state, data, haptic, onEnd }) {
    this.root = root;
    this.state = state;
    this.data = data;
    this.haptic = haptic;
    this.onEnd = onEnd;

    this.stage = root.querySelector('#stage');
    this.canvas = root.querySelector('#field');
    this.ui = {
      wave: root.querySelector('#hud-wave'),
      left: root.querySelector('#hud-left'),
      combo: root.querySelector('#combo'),
      flee: root.querySelector('#btn-flee'),
      quiz: root.querySelector('#quiz'),
      q: root.querySelector('#quiz-q'),
      options: root.querySelector('#quiz-options'),
      mana: root.querySelector('#mana-bar'),
      manaNum: root.querySelector('#mana-num'),
      manaGain: root.querySelector('#mana-gain'),
      hand: root.querySelector('#hand'),
      next: root.querySelector('#next-card'),
      ghost: root.querySelector('#card-ghost'),
    };

    this.sim = new BattleSim({
      wave: data.wave,
      buildings: state.buildings,
      level: state.level,
      deck: data.deck,
      seed: data.seed,
      on: (name, a, b, c) => this.onSimEvent(name, a, b, c),
    });
    this.renderer = new ArenaRenderer(this.canvas, this.sim, { buildings: state.buildings });
    this.renderer.showHint('Реши пример — получи ману!', 4);

    this.answers = [];
    this.problemIdx = {};
    this.current = null;
    this.selected = -1; // карта, выбранная касанием
    this.drag = null;
    this.ended = false;
    this.endTimer = 0;
    this.timers = [];
    this.manaShown = -1;

    this.buildUi();
    this.nextProblem();
    this.renderCards();
    this.updateHud();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    window.Telegram?.WebApp?.onEvent?.('viewportChanged', this.onResize);
    this.resize();

    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- Экран ----------
  /**
   * Логический экран шириной 720 и высотой от 1280 вписывается в безопасную область.
   * На вытянутых телефонах (уже 9:16) сцена удлиняется до +35%: сверху появляется полоса
   * под HUD, снизу — больше места картам. Само поле боя (720×800) не меняется.
   */
  resize() {
    const host = this.stage.parentElement.getBoundingClientRect();
    const kW = host.width / STAGE_W;
    const kH = host.height / STAGE_H;
    let k = Math.min(kW, kH);
    let h = STAGE_H;
    if (kH > kW) {
      k = kW;
      h = Math.min(host.height / k, STAGE_H * MAX_STRETCH);
    }
    // Лишняя высота: полоса под HUD → крупнее панель примера → чуть выше карты → остаток наверх
    const extra = Math.round(h - STAGE_H);
    let rest = extra;
    let top = Math.min(rest, 70);
    rest -= top;
    const quiz = Math.min(rest, 120);
    rest -= quiz;
    const hand = Math.min(rest, 36);
    rest -= hand;
    top += rest;
    this.top = top;
    this.k = k;
    const st = this.stage.style;
    st.height = `${STAGE_H + extra}px`;
    st.setProperty('--top', `${top}px`);
    st.setProperty('--quiz', `${quiz}px`);
    st.setProperty('--hand', `${hand}px`);
    st.setProperty('--fade', extra > 20 ? '1' : '0');
    const offX = (host.width - STAGE_W * k) / 2;
    const offY = (host.height - (STAGE_H + extra) * k) / 2;
    st.transform = `translate(${offX}px, ${offY}px) scale(${k})`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(k * dpr);
  }

  /** Экранные координаты → логические координаты поля боя (без верхней полосы) */
  toStage(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.k, y: (e.clientY - r.top) / this.k - this.top };
  }

  buildUi() {
    const { ui } = this;
    ui.wave.textContent = `Ночь ${this.data.wave}`;
    ui.flee.onclick = () => this.flee();
    const manaArt = artUrl('icon-mana');
    this.root.querySelector('#mana-icon').innerHTML = manaArt ? `<img src="${manaArt}" alt="" draggable="false">` : '';
    this.root.querySelector('#mana-icon').classList.toggle('painted', Boolean(manaArt));
    ui.mana.innerHTML = '';
    this.manaCells = [];
    for (let i = 0; i < MANA_MAX; i++) {
      const cell = document.createElement('div');
      cell.className = 'mana-cell';
      ui.mana.append(cell);
      this.manaCells.push(cell);
    }
    // Кнопки ответов создаются один раз и переиспользуются
    ui.options.innerHTML = '';
    this.optionButtons = [];
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.onpointerdown = (e) => {
        e.preventDefault();
        unlockAudio();
        this.answer(b);
      };
      ui.options.append(b);
      this.optionButtons.push(b);
    }
    const frame = artUrl('card-frame');
    ui.hand.classList.toggle('framed', Boolean(frame));
    if (frame) ui.hand.style.setProperty('--card-frame', `url(${frame})`);
    ui.hand.innerHTML = '';
    this.cardEls = [];
    for (let slot = 0; slot < HAND_SIZE; slot++) {
      const el = document.createElement('div');
      el.className = 'game-card';
      el.onpointerdown = (e) => this.cardDown(e, slot);
      ui.hand.append(el);
      this.cardEls.push(el);
    }
    this.canvas.onpointerdown = (e) => this.arenaDown(e);
  }

  // ---------- Примеры ----------
  /** Тема выбирается по картам в руке: чем больше карт темы, тем чаще её примеры */
  pickTopic() {
    const hand = this.sim.hand;
    const pick = hand[Math.floor(Math.random() * hand.length)];
    return CARDS[pick].topic;
  }

  nextProblem() {
    if (this.ended) return;
    const topic = this.pickTopic();
    const list = this.data.problems[topic];
    const i = this.problemIdx[topic] ?? 0;
    this.problemIdx[topic] = i + 1;
    const p = list[i % list.length];
    this.current = { topic, i, p, opened: performance.now(), locked: false };
    const { ui } = this;
    ui.q.textContent = p.q;
    ui.q.classList.remove('wrong-answer');
    ui.options.classList.toggle('three', p.options.length === 3);
    this.optionButtons.forEach((b, idx) => {
      const text = p.options[idx];
      b.hidden = text === undefined;
      b.textContent = text ?? '';
      b.dataset.value = text ?? '';
      b.className = '';
    });
  }

  answer(btn) {
    const c = this.current;
    if (!c || c.locked || this.ended) return;
    c.locked = true;
    const given = btn.dataset.value;
    const ms = Math.round(performance.now() - c.opened);
    this.answers.push({ slot: c.topic, i: c.i, given, ms });
    const ok = given === c.p.answer;
    this.sim.answer(ok, ms);
    if (ok) {
      btn.classList.add('right');
      this.haptic.ok();
      this.later(() => this.nextProblem(), AFTER_RIGHT_MS);
    } else {
      btn.classList.add('wrong');
      this.haptic.err();
      this.optionButtons.find((b) => b.dataset.value === c.p.answer)?.classList.add('right');
      this.ui.q.textContent = c.p.q.replace('?', c.p.answer);
      this.ui.q.classList.add('wrong-answer');
      this.later(() => this.nextProblem(), AFTER_WRONG_MS);
    }
    this.updateHud();
  }

  later(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  // ---------- Карты ----------
  renderCards() {
    const { sim } = this;
    this.cardEls.forEach((el, slot) => {
      const key = sim.hand[slot];
      const card = CARDS[key];
      // Пустое место в руке (карт меньше четырёх) — карты просто нет
      el.hidden = !card;
      if (!card) return;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.innerHTML = `<span class="cost">${card.cost}</span><span class="pic">${iconHtml(`card-${key}`, iconHtml(`icon-${key}`, card.icon))}</span><span class="name">${card.name}</span><span class="need"></span>`;
        el.classList.remove('dealt');
        void el.offsetWidth; // перезапуск анимации раздачи
        el.classList.add('dealt');
      }
    });
    const next = CARDS[sim.queue[0]];
    this.ui.next.innerHTML = next
      ? `<small>Дальше</small><span class="pic">${iconHtml(`card-${sim.queue[0]}`, iconHtml(`icon-${sim.queue[0]}`, next.icon))}</span><span class="cost mini">${next.cost}</span>`
      : '';
    // Карт в колоде меньше, чем мест в руке: следующей нет, рамку не показываем
    this.ui.next.classList.toggle('empty', !next);
    this.updateMana();
  }

  updateMana() {
    const { sim, ui } = this;
    if (sim.mana === this.manaShown) return;
    this.manaShown = sim.mana;
    this.manaCells.forEach((cell, i) => cell.classList.toggle('on', i < sim.mana));
    ui.manaNum.textContent = sim.mana;
    this.cardEls.forEach((el, slot) => {
      const card = CARDS[sim.hand[slot]];
      if (!card) return;
      const lacking = card.cost - sim.mana;
      el.classList.toggle('poor', lacking > 0);
      el.querySelector('.need').textContent = lacking > 0 ? `ещё ${lacking}` : '';
    });
    if (this.selected >= 0 && sim.mana < CARDS[sim.hand[this.selected]].cost) this.select(-1);
  }

  select(slot) {
    if (this.selected >= 0) this.cardEls[this.selected].classList.remove('selected');
    this.selected = slot;
    if (slot >= 0) {
      this.cardEls[slot].classList.add('selected');
      this.renderer.showHint('Нажми на арену', 2);
    } else {
      this.renderer.preview = null;
    }
  }

  cardDown(e, slot) {
    e.preventDefault();
    unlockAudio();
    const key = this.sim.hand[slot];
    if (this.sim.mana < CARDS[key].cost) {
      sfx('noMana');
      const el = this.cardEls[slot];
      el.classList.remove('denied');
      void el.offsetWidth;
      el.classList.add('denied');
      return;
    }
    const p = this.toStage(e);
    this.drag = { slot, key, startX: p.x, startY: p.y, moved: false, pointerId: e.pointerId };
    sfx('tap');
  }

  arenaDown(e) {
    unlockAudio();
    if (this.selected < 0) return;
    const p = this.toStage(e);
    this.drag = { slot: this.selected, key: this.sim.hand[this.selected], startX: p.x, startY: p.y, moved: true, fromArena: true, pointerId: e.pointerId };
    this.setPreview(this.drag.key, p);
  }

  setPreview(key, p) {
    const over = p.y < ARENA.H;
    this.renderer.preview = over
      ? { key, x: Math.max(0, Math.min(ARENA.W, p.x)), y: Math.max(ARENA.PLAY_TOP, Math.min(ARENA.PLAY_BOTTOM, p.y)) }
      : null;
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const p = this.toStage(e);
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > DRAG_THRESHOLD) {
      d.moved = true;
      this.select(-1);
      this.cardEls[d.slot].classList.add('dragging');
      const { ghost } = this.ui;
      ghost.innerHTML = this.cardEls[d.slot].querySelector('.pic').innerHTML;
      ghost.hidden = false;
    }
    if (!d.moved) return;
    if (!d.fromArena) this.ui.ghost.style.transform = `translate(${p.x - 55}px, ${p.y + this.top - 55}px)`;
    this.setPreview(d.key, p);
  }

  pointerUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    this.ui.ghost.hidden = true;
    this.cardEls[d.slot].classList.remove('dragging');
    if (!d.moved) {
      // Просто нажатие: выбрать карту, следующим нажатием указать точку
      this.select(this.selected === d.slot ? -1 : d.slot);
      return;
    }
    const pv = this.renderer.preview;
    this.renderer.preview = null;
    if (pv) this.playCard(d.slot, pv.x, pv.y);
    if (d.fromArena) this.select(-1);
  }

  playCard(slot, x, y) {
    const result = this.sim.play(slot, x, y);
    if (result === 'target') this.renderer.showHint('Некого бить', 1.2);
    else if (result === 'mana') sfx('noMana');
    if (result) return;
    this.haptic.tap();
    this.manaShown = -1;
    this.renderCards();
  }

  // ---------- События логики ----------
  onSimEvent(name, a, b, c) {
    this.renderer?.onEvent(name, a, b, c);
    switch (name) {
      case 'correct': {
        sfx('correct');
        const el = this.ui.manaGain;
        el.textContent = `+${a}`;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        break;
      }
      case 'wrong':
        sfx('wrong');
        break;
      case 'zombieDead':
      case 'spawn':
        this.hudDirty = true;
        break;
      case 'buildingDestroyed':
        this.haptic.err();
        break;
      case 'end':
        this.onSimEnd(a);
        break;
      default:
    }
  }

  onSimEnd(victory) {
    this.ended = true;
    sfx(victory ? 'win' : 'lose');
    this.select(-1);
    this.renderer.showHint(victory ? 'Победа!' : 'Замок пал…', 2);
    this.endTimer = victory ? 1.1 : 1.6; // дать доиграть эффектам
  }

  updateHud() {
    const { sim, ui } = this;
    ui.left.textContent = `🧟 ${sim.total - sim.killCount}`;
    const streak = sim.streak;
    ui.combo.textContent = streak >= 2 ? `Серия ${streak}${streak >= ARCHMAGE_STREAK ? ' · АРХИМАГ!' : ''}` : '';
    ui.combo.classList.toggle('big', streak >= ARCHMAGE_STREAK);
    this.hudDirty = false;
  }

  // ---------- Цикл ----------
  loop(now) {
    const realDt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { renderer } = this;
    let dt = realDt;
    if (renderer.hitstop > 0) {
      // Стоп-кадр: на мгновение замирает всё, кроме тряски
      renderer.hitstop -= realDt;
      dt = 0;
    }
    if (!this.ended) this.sim.step(dt);
    renderer.update(dt, realDt);
    renderer.draw();
    this.updateMana();
    if (this.hudDirty) this.updateHud();
    if (this.ended) {
      this.endTimer -= realDt;
      if (this.endTimer <= 0) {
        this.finish();
        return;
      }
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- Завершение ----------
  flee() {
    const go = () => {
      if (this.ended) return;
      this.sim.finish(false);
    };
    const tg = window.Telegram?.WebApp;
    const text = 'Отступить? Золото за побеждённых зомби сохранится.';
    if (tg?.showConfirm && tg.initData) tg.showConfirm(text, (ok) => ok && go());
    else if (confirm(text)) go();
  }

  finish() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    window.removeEventListener('resize', this.onResize);
    window.Telegram?.WebApp?.offEvent?.('viewportChanged', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.current = null;
    this.onEnd({
      battleId: this.data.battleId,
      victory: this.sim.victory,
      kills: this.sim.kills,
      answers: this.answers,
      plays: this.sim.plays,
      lost: this.sim.lostBuildings(),
    });
  }
}
