import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, ATLASES } from '../art/assets.js';

const md = readFileSync(new URL('../art/PROMPTS.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const section = (name) => {
  const m = md.match(new RegExp(`^### ${name}\\n(.*?)\\n\\n\`\`\`\\n(.*?)\\n\`\`\`$`, 'ms'));
  return m ? { note: m[1], prompt: m[2] } : null;
};

test('у каждого ассета есть промпт одной строкой и указан референс', () => {
  for (const a of ASSETS) {
    const s = section(a.atlas || a.name);
    assert.ok(s, `нет промпта: ${a.name}`);
    assert.ok(!s.prompt.includes('\n'), `перевод строки: ${a.name}`);
    assert.ok(a.ref, `нет референса: ${a.name}`);
    assert.ok(s.note.includes(`Референс: **${a.ref}**`), `референс не совпадает: ${a.name}`);
  }
});

test('атласы: каждый участник есть в списке ассетов, сетка сходится', () => {
  const names = new Set(ASSETS.map((a) => a.name));
  for (const [name, atlas] of Object.entries(ATLASES)) {
    assert.equal(atlas.members.length, atlas.rows * atlas.cols, name);
    for (const m of atlas.members.filter(Boolean)) {
      assert.ok(names.has(m), `${name}: нет ассета ${m}`);
      assert.equal(ASSETS.find((a) => a.name === m).atlas, name);
    }
  }
});

test('референс ссылается на существующий ассет более ранней или той же волны', () => {
  const byName = new Map(ASSETS.map((a) => [a.name, a]));
  for (const a of ASSETS) {
    if (a.ref.startsWith('layout/') || a.ref.startsWith('old/')) continue;
    assert.ok(byName.has(a.ref), `${a.name}: нет ассета ${a.ref}`);
    assert.ok(byName.get(a.ref).wave <= a.wave, `${a.name}: референс ${a.ref} из более поздней волны`);
  }
});

test('правила промптов: пурпурный фон у спрайтов, запреты, без названий чужих игр', () => {
  for (const a of ASSETS) {
    const { prompt } = section(a.atlas || a.name);
    assert.ok(!/clash|royale|supercell/i.test(prompt), `чужое название: ${a.name}`);
    assert.ok(/inset views/.test(prompt) && /second copies/.test(prompt) && /\btext\b/.test(prompt), `нет запретов: ${a.name}`);
    if (a.kind !== 'bg') assert.ok(prompt.includes('#FF00FF'), `нет пурпурного фона: ${a.name}`);
  }
});
