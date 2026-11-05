// Логика боя без отрисовки: одна и та же в игре, в тестах и в симуляции баланса.
// Всё, что должно быть видно или слышно, уходит наружу событиями через on(name, a, b, c).
import {
  BUILDINGS, CARDS, ZOMBIES, HAND_SIZE, MANA_MAX, TOWER_PERIOD, TOWER_RANGE,
  damageStage, manaForAnswer, rng, waveSpawns, wizardPower,
} from './balance.js';

// Арена занимает верх логического экрана 720×1280.
export const ARENA = { W: 720, H: 800, PLAY_TOP: 130, PLAY_BOTTOM: 790 };
export const CASTLE_POS = { x: 360, y: 790 };
export const TOWER_POS = [{ x: 125, y: 665 }, { x: 595, y: 665 }];
export const WIZARD_POS = { x: 360, y: 640 };
export const GATE_POS = { x: 360, y: 130 };

const LEFT_PATH = [[335, 150], [250, 215], [195, 330], [185, 470], [205, 610], [270, 745]];
const TOWER_STOP_POINT = 4;
const Y_SQUASH = 0.72; // области на арене — эллипсы: вид сверху под углом

function buildPath(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  return { points, cum, total, towerStop: cum[TOWER_STOP_POINT] / total };
}

export const PATHS = [
  buildPath(LEFT_PATH),
  buildPath(LEFT_PATH.map(([x, y]) => [ARENA.W - x, y])),
];

/** Точка на дорожке; результат пишется в out, чтобы не создавать объекты каждый кадр */
export function pathPoint(lane, t, out) {
  const p = PATHS[lane];
  const d = Math.min(1, Math.max(0, t)) * p.total;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const k = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1]);
  out.x = p.points[i - 1][0] + (p.points[i][0] - p.points[i - 1][0]) * k;
  out.y = p.points[i - 1][1] + (p.points[i][1] - p.points[i - 1][1]) * k;
  return out;
}

/** Ближайшее к точке место на дорожке — туда встаёт каменный страж */
export function snapToLane(x, y) {
  const tmp = { x: 0, y: 0 };
  const best = { lane: 0, t: 0.5, x: 0, y: 0 };
  let bestD = Infinity;
  for (let lane = 0; lane < PATHS.length; lane++) {
    for (let t = 0.12; t <= 0.96; t += 0.02) {
      pathPoint(lane, t, tmp);
      const d = (tmp.x - x) ** 2 + (tmp.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best.lane = lane;
        best.t = t;
        best.x = tmp.x;
        best.y = tmp.y;
      }
    }
  }
  return best;
}

export const inArea = (cx, cy, r, x, y) => {
  const dx = x - cx;
  const dy = (y - cy) / Y_SQUASH;
  return dx * dx + dy * dy <= r * r;
};

export class BattleSim {
  constructor({ wave, buildings, level = 1, deck, seed = 1, on }) {
    this.wave = wave;
    this.emit = on || (() => {});
    this.rand = rng(seed);
    this.time = 0;
    this.ended = false;
    this.victory = false;

    this.power = BUILDINGS.library.effect(buildings.library).spellPower * wizardPower(level);
    this.towerDps = BUILDINGS.tower.effect(buildings.tower).dps;
    const walls = BUILDINGS.walls.effect(buildings.walls);
    this.castle = { id: 'castle', x: CASTLE_POS.x, y: CASTLE_POS.y, hp: walls.hp, maxHp: walls.hp, alive: true, stage: 0 };
    this.towers = TOWER_POS.map((pos, lane) => ({
      id: lane === 0 ? 'towerL' : 'towerR',
      lane,
      x: pos.x,
      y: pos.y,
      hp: walls.towerHp,
      maxHp: walls.towerHp,
      alive: true,
      stage: 0,
      timer: TOWER_PERIOD * (0.3 + lane * 0.5),
    }));

    this.spawns = waveSpawns(wave);
    this.spawnIdx = 0;
    this.total = this.spawns.length;
    this.zombies = [];
    this.guards = [];
    this.zones = [];
    this.pending = []; // отложенные попадания (снаряд ещё летит)
    this.kills = {};
    this.killCount = 0;

    // Рука и колода
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.hand = shuffled.slice(0, HAND_SIZE);
    this.queue = shuffled.slice(HAND_SIZE);

    this.mana = 0;
    this.manaEarned = 0;
    this.streak = 0;
    this.plays = [];
    this.tmp = { x: 0, y: 0 };
  }

  // ---------- Примеры и мана ----------
  /** Ответ на пример. Возвращает, сколько маны начислено */
  answer(ok, ms) {
    if (!ok) {
      this.streak = 0;
      this.emit('wrong');
      return 0;
    }
    this.streak++;
    const gain = manaForAnswer(ms, this.streak);
    this.manaEarned += gain;
    this.mana = Math.min(MANA_MAX, this.mana + gain);
    this.emit('correct', gain);
    return gain;
  }

  // ---------- Карты ----------
  /** Разыграть карту из руки. Возвращает '' или причину отказа */
  play(slot, x, y) {
    if (this.ended) return 'ended';
    const key = this.hand[slot];
    const card = CARDS[key];
    if (!card) return 'empty';
    if (this.mana < card.cost) return 'mana';
    if (key === 'lightning' && !this.nearestZombies(x, y, card.targets).length) return 'target';

    this.mana -= card.cost;
    this.plays.push({ card: key, t: Math.round(this.time * 10) / 10 });
    if (this.queue.length) {
      this.hand[slot] = this.queue.shift();
      this.queue.push(key);
    }
    this.emit('cast', key, x, y);

    if (key === 'guardian') {
      const spot = snapToLane(x, y);
      const guard = {
        kind: 'guard', lane: spot.lane, t: spot.t, x: spot.x, y: spot.y,
        hp: card.hp * this.power, maxHp: card.hp * this.power, until: this.time + card.duration, dead: false, flash: 0,
      };
      this.guards.push(guard);
      this.emit('guardSummon', guard);
    } else if (key === 'lightning') {
      const targets = this.nearestZombies(x, y, card.targets);
      this.emit('lightning', targets, x, y);
      for (const z of targets) this.hurt(z, card.damage * this.power, key);
    } else {
      this.pending.push({ key, x, y, at: this.time + card.delay });
    }
    return '';
  }

  nearestZombies(x, y, n) {
    return this.zombies
      .filter((z) => !z.dead)
      .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
      .slice(0, n);
  }

  impact(key, x, y) {
    const card = CARDS[key];
    this.emit('impact', key, x, y);
    if (key === 'heal') {
      for (const b of this.buildings()) {
        if (b.alive && inArea(x, y, card.radius, b.x, b.y)) {
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * card.healShare);
          b.stage = damageStage(b.hp / b.maxHp);
          this.emit('healed', b);
        }
      }
      return;
    }
    if (key === 'ice') this.zones.push({ x, y, r: card.radius, until: this.time + card.duration, slow: card.slow });
    const dmg = card.damage * this.power;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (!z.dead && inArea(x, y, card.radius, z.x, z.y)) this.hurt(z, dmg, key);
    }
  }

  buildings() {
    return [this.castle, ...this.towers];
  }

  // ---------- Урон ----------
  hurt(z, dmg, source) {
    if (z.dead) return;
    z.hp -= dmg;
    z.flash = 0.12;
    this.emit('zombieHit', z, dmg, source);
    if (z.hp <= 0) {
      z.dead = true;
      this.kills[z.type] = (this.kills[z.type] || 0) + 1;
      this.killCount++;
      this.emit('zombieDead', z);
    }
  }

  hurtBuilding(b, dmg, z) {
    if (!b.alive) return;
    b.hp -= dmg;
    this.emit('buildingHit', b, dmg, z);
    const stage = damageStage(b.hp / b.maxHp);
    if (stage !== b.stage) {
      b.stage = stage;
      this.emit('buildingStage', b);
    }
    if (b.hp <= 0) {
      b.hp = 0;
      b.alive = false;
      this.emit('buildingDestroyed', b);
    }
  }

  // ---------- Шаг симуляции ----------
  step(dt) {
    if (this.ended) return;
    this.time += dt;

    while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].time <= this.time) {
      const s = this.spawns[this.spawnIdx++];
      const z = {
        kind: 'zombie', type: s.type, lane: s.lane, hp: s.hp, maxHp: s.hp,
        t: 0, x: 0, y: 0, dx: (this.rand() - 0.5) * 44, dead: false, flash: 0, slowed: false,
        biting: null, biteTimer: 0.4, phase: this.rand() * 6.28,
      };
      this.placeZombie(z);
      this.zombies.push(z);
      this.emit('spawn', z);
    }

    for (let i = 0; i < this.zombies.length; i++) this.stepZombie(this.zombies[i], dt);
    this.stepTowers(dt);
    this.stepGuards(dt);

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at <= this.time) {
        this.pending[i] = this.pending[this.pending.length - 1];
        this.pending.pop();
        if (p.tower) this.hurt(p.tower, p.dmg, 'tower');
        else this.impact(p.key, p.x, p.y);
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].until <= this.time) {
        this.zones[i] = this.zones[this.zones.length - 1];
        this.zones.pop();
      }
    }
    // Убираем повергнутых без создания нового массива
    let w = 0;
    for (let i = 0; i < this.zombies.length; i++) if (!this.zombies[i].dead) this.zombies[w++] = this.zombies[i];
    this.zombies.length = w;

    if (!this.castle.alive) this.finish(false);
    else if (this.spawnIdx >= this.spawns.length && w === 0) this.finish(true);
  }

  placeZombie(z) {
    pathPoint(z.lane, z.t, this.tmp);
    z.x = this.tmp.x + z.dx;
    z.y = this.tmp.y;
  }

  /** Кого зомби сейчас грызёт: страж, потом башня своей дорожки, потом замок */
  blockerFor(z) {
    for (let i = 0; i < this.guards.length; i++) {
      const g = this.guards[i];
      if (!g.dead && g.lane === z.lane && z.t <= g.t && g.t - z.t < 0.03) return g;
    }
    const tower = this.towers[z.lane];
    if (tower.alive && z.t >= PATHS[z.lane].towerStop) return tower;
    if (z.t >= 1) return this.castle;
    return null;
  }

  stepZombie(z, dt) {
    if (z.dead) return;
    const def = ZOMBIES[z.type];
    z.flash = Math.max(0, z.flash - dt);
    z.phase += dt * (z.biting ? 9 : 8 + def.speed * 60);
    z.slowed = false;
    let slow = 1;
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      if (inArea(zone.x, zone.y, zone.r, z.x, z.y)) {
        slow = zone.slow;
        z.slowed = true;
      }
    }
    const target = this.blockerFor(z);
    z.biting = target;
    if (target) {
      z.biteTimer -= dt * slow;
      if (z.biteTimer <= 0) {
        z.biteTimer += 1;
        if (target.kind === 'guard') {
          target.hp -= def.dps;
          target.flash = 0.12;
          this.emit('guardHit', target, z);
          if (target.hp <= 0) {
            target.dead = true;
            this.emit('guardDead', target);
          }
        } else {
          this.hurtBuilding(target, def.dps, z);
        }
      }
    } else {
      z.t = Math.min(1, z.t + def.speed * slow * dt);
      this.placeZombie(z);
    }
  }

  stepTowers(dt) {
    for (let i = 0; i < this.towers.length; i++) {
      const tower = this.towers[i];
      if (!tower.alive) continue;
      tower.timer -= dt;
      if (tower.timer > 0) continue;
      let best = null;
      let bestScore = Infinity;
      for (let j = 0; j < this.zombies.length; j++) {
        const z = this.zombies[j];
        if (z.dead) continue;
        const d = Math.hypot(z.x - tower.x, z.y - tower.y);
        if (d > TOWER_RANGE) continue;
        const score = d + (z.lane === tower.lane ? 0 : 160); // своя дорожка важнее
        if (score < bestScore) {
          bestScore = score;
          best = z;
        }
      }
      if (best) {
        tower.timer = TOWER_PERIOD;
        const delay = 0.18;
        this.pending.push({ tower: best, dmg: this.towerDps * TOWER_PERIOD, at: this.time + delay });
        this.emit('towerShot', tower, best, delay);
      } else {
        tower.timer = 0.1;
      }
    }
  }

  stepGuards(dt) {
    const dps = CARDS.guardian.dps * this.power;
    for (let i = this.guards.length - 1; i >= 0; i--) {
      const g = this.guards[i];
      g.flash = Math.max(0, g.flash - dt);
      if (!g.dead && g.until <= this.time) {
        g.dead = true;
        this.emit('guardDead', g);
      }
      if (g.dead) {
        this.guards[i] = this.guards[this.guards.length - 1];
        this.guards.pop();
        continue;
      }
      // Страж отбивается от того, кто стоит рядом
      for (let j = 0; j < this.zombies.length; j++) {
        const z = this.zombies[j];
        if (!z.dead && z.biting === g) {
          z.hp -= dps * dt;
          if (z.hp <= 0) this.hurt(z, 0.01, 'guardian');
          break;
        }
      }
    }
  }

  finish(victory) {
    this.ended = true;
    this.victory = victory;
    this.emit('end', victory);
  }

  /** Что потеряно к концу боя — уходит в отчёт */
  lostBuildings() {
    return this.buildings().filter((b) => !b.alive).map((b) => b.id);
  }
}
