import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Stage 4: exploration.js uses SVG icons for all visited map nodes', () => {
  const expCode = fs.readFileSync(new URL('../public/exploration.js', import.meta.url), 'utf8');

  // Verify emoji removal
  assert.equal(expCode.includes("'🏕️'"), false);
  assert.equal(expCode.includes("'🛒'"), false);
  assert.equal(expCode.includes("'📦'"), false);
  assert.equal(expCode.includes("'👑'"), false);
  assert.equal(expCode.includes("'📜'"), false);

  // Verify SVG icon markup construction
  assert.equal(expCode.includes('hex-visited-svg'), true);
  assert.equal(expCode.includes("node.type === 'START' ? 'camp'"), true);
  assert.equal(expCode.includes("node.type === 'SHOP' ? 'shop'"), true);
  assert.equal(expCode.includes("node.type === 'CHEST' ? 'chest'"), true);
  assert.equal(expCode.includes("node.type === 'EVENT' ? 'scroll'"), true);
});

test('Stage 4: renderInteractiveEvent shop layout is icon-first with category tabs and gold badge', () => {
  const appCode = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.equal(appCode.includes('shop-tabs-nav'), true);
  assert.equal(appCode.includes('shop-goods-grid'), true);
  assert.equal(appCode.includes('shop-gold-badge'), true);
  assert.equal(appCode.includes('btn-shop-sell'), true);
  assert.equal(appCode.includes("b.textContent = '購買中...'"), true, 'Anti-double-click state indicator');
});

test('Stage 4: renderInteractiveEvent uses SVG icons for chest and random events without emojis', () => {
  const appCode = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  // Random event icons must use SVG
  assert.equal(appCode.includes("elements.eventIcon.innerHTML = '🛒'"), false);
  assert.equal(appCode.includes("elements.eventIcon.innerHTML = '📦'"), false);
  assert.equal(appCode.includes("getIconSvg('shop', 'svg-hero-icon')"), true);
  assert.equal(appCode.includes("getIconSvg('chest', 'svg-hero-icon')"), true);
});
