import test from 'node:test';
import assert from 'node:assert/strict';
import { getBossResistance } from './boss-resistance.js';
import { attachTalisman, clearTalismans } from './onmyoji.js';

test('敵霸符 lowers both damage resistances while active, without stacking', () => {
  const enemy = { hp: 100, resistances: { physical: 50, magic: 15, effect: 40 }, talismans: [] };
  attachTalisman(enemy, 'blind');
  attachTalisman(enemy, 'blind');
  assert.equal(getBossResistance(enemy, 'physical'), 30);
  assert.equal(getBossResistance(enemy, 'magic'), 0);
  assert.equal(getBossResistance(enemy, 'effect'), 40);
  enemy.activeTalismans = [];
  assert.equal(getBossResistance(enemy, 'physical'), 50);
  enemy.activeTalismans = ['blind'];
  clearTalismans(enemy);
  assert.equal(getBossResistance(enemy, 'magic'), 15);
});
