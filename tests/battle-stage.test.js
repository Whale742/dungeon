import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Stage 3: BattleEnemiesStage DOM diffing preserves slot nodes and updates properties', () => {
  const appCode = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  // Verify renderBattleEnemiesStage does not just do a naive innerHTML rebuild
  assert.equal(appCode.includes('renderBattleEnemiesStage'), true);
  assert.equal(appCode.includes('tos-hp-fill'), true);
  assert.equal(appCode.includes('enemy-cd-badge'), true);
  assert.equal(appCode.includes('pixel-fx-container'), true);
  assert.equal(appCode.includes('floating-text-container'), true);

  // Verify SVG icon usage and removal of emojis in stage rendering
  assert.equal(appCode.includes('CD 1 💥'), false, 'Stage must not contain emoji 💥');
  assert.equal(appCode.includes("('target', 'ui-icon--md')"), true, 'Target reticle must use SVG icon');

  // Verify keyboard navigation support in enemy slots
  assert.equal(appCode.includes("slot.setAttribute('role', 'button')"), true);
  assert.equal(appCode.includes("e.key === 'Enter' || e.key === ' '"), true);
});

test('Stage 3: showEnemyTooltip renders structured SVG-based card without emojis', () => {
  const appCode = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  // Ensure showEnemyTooltip does not use emojis for status badges
  assert.equal(appCode.includes("'⚠️ 削弱"), false);
  assert.equal(appCode.includes("'🟢 中毒"), false);
  assert.equal(appCode.includes("'🔥 燃燒"), false);
  assert.equal(appCode.includes("'🦴 骨折"), false);
  assert.equal(appCode.includes("'❄️ 寒冷"), false);
  assert.equal(appCode.includes("'🧪 腐蝕"), false);
});

test('Stage 3: handoffBossPortrait targets battleEnemiesStage boss sprite', () => {
  const battlePhaseCode = fs.readFileSync(new URL('../public/battle-phase.js', import.meta.url), 'utf8');

  assert.equal(battlePhaseCode.includes('#battleEnemiesStage'), true);
  assert.equal(battlePhaseCode.includes('.battle-enemy-slot.is-boss-slot'), true);
});

test('Stage 3: index.html has single enemy stage and no duplicate monster-body', () => {
  const indexHtml = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

  assert.equal(indexHtml.includes('id="battleEnemiesStage"'), true);
  assert.equal(indexHtml.includes('class="monster-body"'), false, 'Duplicate monster-body must be removed');
  assert.equal(indexHtml.includes('id="icon-shop"'), true);
  assert.equal(indexHtml.includes('id="icon-camp"'), true);
  assert.equal(indexHtml.includes('id="icon-scroll"'), true);
  assert.equal(indexHtml.includes('id="icon-crit"'), true);
});
