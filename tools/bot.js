// «Ребёнок» для боя без отрисовки: отвечает за 5±2 с с заданной точностью и разумно разыгрывает карты.
import { CARDS, rng } from '../public/shared/balance.js';
import { BattleSim } from '../public/shared/sim.js';

const AFTER_RIGHT = 0.25; // столько клиент показывает зелёный ответ
const AFTER_WRONG = 1; // столько показывается правильный ответ
const PLAY_TIME = 1.2; // секунд на то, чтобы найти и перетащить карту
const AIM_ERROR = 30; // на сколько логических пикселей может промахнуться палец

/** Куда бросить карту по области: туда, где зомби ближе всего к постройкам и их больше */
function bestSpot(sim, radius) {
  let best = null;
  let bestScore = -1;
  for (const a of sim.zombies) {
    let score = 0;
    for (const b of sim.zombies) if (Math.hypot(a.x - b.x, a.y - b.y) < radius * 0.8) score += 1 + b.t;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function chooseMove(sim) {
  const hurt = sim.buildings().some((b) => b.alive && b.hp / b.maxHp < 0.6);
  const front = sim.zombies.reduce((m, z) => (!m || z.t > m.t ? z : m), null);
  let choice = null;
  sim.hand.forEach((key, slot) => {
    const card = CARDS[key];
    if (card.cost > sim.mana) return;
    let value = 0;
    let x = 360;
    let y = 660;
    if (key === 'heal') {
      value = hurt ? 9 : 0;
    } else if (!front) {
      value = 0;
    } else if (key === 'guardian') {
      const ahead = sim.guards.some((g) => g.lane === front.lane && g.t > front.t);
      value = front.t > 0.35 && !ahead ? 5 : 0;
      x = front.x;
      y = front.y + 50;
    } else if (key === 'ice') {
      value = front.slowed || front.t < 0.3 ? 0 : 3;
      x = front.x;
      y = front.y + 15;
    } else {
      const spot = bestSpot(sim, card.radius);
      value = key === 'meteor' ? 8 : key === 'lightning' ? 6 : 7;
      x = spot.x;
      y = spot.y;
    }
    if (value > (choice?.value ?? 0)) choice = { slot, value, x, y };
  });
  return choice;
}

export function playNight({ wave, buildings, level = 1, deck, seed = 1, meanAnswer = 5, spread = 2, accuracy = 0.8, playTime = PLAY_TIME, aimError = AIM_ERROR, maxTime = 900 }) {
  const rand = rng(seed * 7919 + 13);
  const sim = new BattleSim({ wave, buildings, level, deck, seed });
  const nextDelay = () => meanAnswer + (rand() * 2 - 1) * spread;
  let wait = nextDelay(); // до ответа на текущий пример
  let shown = 0; // сколько секунд пример уже на экране: от этого зависит мана за быстрый ответ
  let pause = 0; // показ результата ответа: пример сейчас не на экране
  let busy = 0; // ребёнок перетаскивает карту
  let answered = 0;
  let correct = 0;
  const dt = 1 / 30;
  while (!sim.ended && sim.time < maxTime) {
    sim.step(dt);
    busy = Math.max(0, busy - dt);
    if (pause > 0) {
      pause -= dt;
    } else {
      shown += dt;
      wait -= dt;
      if (wait <= 0) {
        const ok = rand() < accuracy;
        sim.answer(ok, shown * 1000);
        answered++;
        if (ok) correct++;
        pause = ok ? AFTER_RIGHT : AFTER_WRONG;
        shown = 0;
        wait = nextDelay();
      }
    }
    if (busy > 0) continue;
    const move = chooseMove(sim);
    if (move) {
      // Рука одна: пока тянем карту, пример не решается, а бросок ложится не идеально точно
      const x = move.x + (rand() * 2 - 1) * aimError;
      const y = move.y + (rand() * 2 - 1) * aimError;
      if (!sim.play(move.slot, x, y)) {
        busy = playTime;
        wait += playTime;
      }
    }
  }
  return {
    victory: sim.victory,
    time: sim.time,
    kills: sim.killCount,
    total: sim.total,
    answered,
    correct,
    manaEarned: sim.manaEarned,
    lost: sim.lostBuildings(),
    castleHp: sim.castle.hp / sim.castle.maxHp,
    killsByType: sim.kills,
    plays: sim.plays,
  };
}
