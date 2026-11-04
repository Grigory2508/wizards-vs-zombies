import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waveSummary, waveSpawns } from '../public/shared/balance.js';
import { table } from '../tools/balance-sim.mjs';

const row = (rows, night) => rows.find((r) => r.night === night);

test('состав ночи не прыгает: зомби не убывает, кроме ночи босса, вёдра появляются с 5-й', () => {
  const total = (w) => waveSpawns(w).length;
  for (let w = 2; w <= 30; w++) {
    if (w % 10 !== 0 && (w - 1) % 10 !== 0) assert.ok(total(w) >= total(w - 1), `ночь ${w}`);
  }
  assert.equal(waveSummary(4).bucket, undefined);
  assert.ok(waveSummary(5).bucket >= 1);
  assert.equal(waveSummary(20).boss, 1);
  assert.ok(total(20) < total(19), 'в ночь босса обычных зомби меньше');
});

test('цели баланса: ночи 1–3 почти всегда; первые поражения на 5–7 без улучшений; с улучшениями дальше 15-й', () => {
  const without = table(false, 60);
  const withUp = table(true, 60);
  for (const n of [1, 2, 3]) {
    assert.ok(row(without, n).firstWin >= 0.95, `без улучшений, ночь ${n}`);
    assert.ok(row(withUp, n).firstWin >= 0.95, `с улучшениями, ночь ${n}`);
  }
  assert.ok(row(without, 4).firstWin >= 0.9, 'до 5-й ночи поражений почти нет');
  assert.ok(row(without, 5).firstWin < 0.95 && row(without, 5).firstWin > 0.4, 'на 5-й появляются поражения, но это не стена');
  assert.ok(row(without, 7).firstWin < row(without, 5).firstWin, 'к 7-й без улучшений заметно труднее');
  assert.ok(row(withUp, 16).reached >= 0.9, 'с улучшениями дальше 15-й доходит большинство');
});
