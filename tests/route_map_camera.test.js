import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Hex Map Camera: Scrollbars are hidden via CSS without scrollbars showing', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'public', 'exploration.css'), 'utf8');
  assert.ok(css.includes('scrollbar-width: none;'), 'Firefox scrollbar hidden');
  assert.ok(css.includes('-ms-overflow-style: none;'), 'IE/Edge scrollbar hidden');
  assert.ok(css.includes('.abyss-map-canvas::-webkit-scrollbar'), 'Webkit scrollbar rule defined');
  assert.ok(css.includes('display: none !important;'), 'Webkit scrollbar hidden via display: none');
});

test('Hex Map Camera: Camera tracking logic shifts smoothly rightward as floors advance', () => {
  const js = fs.readFileSync(path.join(process.cwd(), 'public', 'exploration.js'), 'utf8');
  assert.ok(js.includes('updateHexMapCamera'), 'updateHexMapCamera function exists');
  assert.ok(js.includes('targetFocusX = curCenterX * 0.35 + maxSelectX * 0.65;'), 'Focus biases forward towards selectable nodes');
  assert.ok(js.includes('canvas.scrollTo({ left: targetScroll, behavior: \'smooth\' });'), 'Smooth scrolling is used when advancing');

  // Verify camera math simulation
  const simulateCameraScroll = (canvasWidth, boardWidth, currentCol) => {
    const maxScroll = Math.max(0, boardWidth - canvasWidth);
    if (maxScroll <= 0) return 0;

    const hexW = 68;
    const paddingLeft = 24;
    const curCenterX = paddingLeft + currentCol * hexW + hexW / 2;
    const maxSelectX = paddingLeft + (currentCol + 1) * hexW + hexW / 2;
    const targetFocusX = curCenterX * 0.35 + maxSelectX * 0.65;
    const desiredScrollLeft = targetFocusX - canvasWidth / 2;
    return Math.max(0, Math.min(maxScroll, Math.round(desiredScrollLeft)));
  };

  const canvasWidth = 500;
  const boardWidth = 780;

  const scrollCol0 = simulateCameraScroll(canvasWidth, boardWidth, 0); // Floor 1
  const scrollCol3 = simulateCameraScroll(canvasWidth, boardWidth, 3); // Floor 4
  const scrollCol6 = simulateCameraScroll(canvasWidth, boardWidth, 6); // Floor 7 (screenshot floor)
  const scrollCol8 = simulateCameraScroll(canvasWidth, boardWidth, 8); // Floor 9 (boss floor)

  assert.equal(scrollCol0, 0, 'Floor 1 should start at scroll 0');
  assert.ok(scrollCol3 > scrollCol0, 'Floor 4 should scroll further right than Floor 1');
  assert.ok(scrollCol6 > scrollCol3, 'Floor 7 should scroll further right than Floor 4');
  assert.ok(scrollCol8 >= scrollCol6, 'Floor 9 should scroll at or near max scroll');

  // At Floor 7 (currentCol = 6, choices at col 7):
  // Col 7 center is at: 24 + 7 * 68 + 34 = 534px.
  // In the viewport [scrollCol6, scrollCol6 + canvasWidth]:
  const col7Center = 24 + 7 * 68 + 34;
  const visibleLeft = scrollCol6;
  const visibleRight = scrollCol6 + canvasWidth;
  assert.ok(
    col7Center > visibleLeft + 100 && col7Center < visibleRight - 100,
    `Col 7 node (${col7Center}px) must be comfortably inside visible viewport [${visibleLeft}px, ${visibleRight}px] at Floor 7`
  );
});
