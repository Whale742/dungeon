import test from 'node:test';
import assert from 'node:assert/strict';
import { eta, sageEquationAttack, sageEquationPreview } from './role-mechanics.js';

test('sage equation uses base, physical equipment and victory growth only', () => {
  const sage = { role: 'sage', sageX: 30, sageOperand: 8, equips: [] };
  assert.equal(sageEquationAttack(sage), 14);
  assert.equal(eta(0, sageEquationAttack(sage)), 0.42);
  Object.assign(sage, { victoryAtkBonus: 5, equips: [{ bonusPhysAtk: 10, bonusMagAtk: 50 }], enemyEffects: { attack_down: { value: 9 } } });
  assert.equal(sageEquationAttack(sage), 29);
  const preview = sageEquationPreview(sage, { getAttackableEnemies: () => [], roundModifiers: {} });
  assert.equal(preview.eta, eta(30, 29));
  assert.equal(preview.options[0].baseEquationDamage, Math.round(10 * eta(30, 29)));
});
