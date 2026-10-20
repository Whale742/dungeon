import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

import { createUiFixtures } from './azure-ui-fixtures.mjs';
const fixtures = createUiFixtures();

const { chromium } = createRequire(import.meta.url)('C:/Users/orgal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--autoplay-policy=no-user-gesture-required']
});

const output = 'artifacts/azure-ui';
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], screenshots: [], errors: [] };

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    const prefix = `${viewport.width}x${viewport.height}`;
    const page = await browser.newPage({ viewport });
    await page.route('**fonts.googleapis.com/**', r => r.abort());
    await page.route('**fonts.gstatic.com/**', r => r.abort());

    const shot = async name => {
      const p = `${output}/${prefix}-${name}.png`;
      await page.screenshot({ path: p, fullPage: true });
      report.screenshots.push(p);
    };
    const check = (name, condition) => {
      assert(condition, `${prefix}: ${name}`);
      report.checks.push(`${prefix}: ${name}`);
    };
    page.on('pageerror', e => report.errors.push(`${prefix}: ${e.message}`));

    // 1. Check HUD Bag Icon and Modal toggle
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof classesData !== 'undefined' && Object.keys(classesData).length >= 15);
    await page.waitForTimeout(300);

    // Switch to gameplay route where HUD bag is active
    await page.evaluate(state => {
      myId = 'qa';
      roomState = state;
      renderApp();
    }, fixtures.route);
    await page.waitForTimeout(300);

    // Initial state: HUD bag is closed (bag1)
    const initialBagSrc = await page.locator('#hudBagIcon').getAttribute('src');
    check('hud bag starts with bag1', initialBagSrc.includes('bag1'));
    check('hud bag button initially not active', !(await page.locator('#btnOpenInventory').evaluate(n => n.classList.contains('active'))));
    await shot('hud-bag-closed');

    // Click HUD bag -> Open modal
    await page.locator('#btnOpenInventory').click();
    await page.waitForTimeout(250);
    const openBagSrc = await page.locator('#hudBagIcon').getAttribute('src');
    check('hud bag switches to bag2 when opened', openBagSrc.includes('bag2'));
    check('hud bag button has active class', await page.locator('#btnOpenInventory').evaluate(n => n.classList.contains('active')));
    check('inventory modal visible', await page.locator('#inventoryModal').isVisible());
    await shot('hud-bag-open-modal');

    // Press ESC -> Close modal
    await page.keyboard.press('Escape');
    await page.locator('#inventoryModal').waitFor({ state: 'hidden' });
    const escBagSrc = await page.locator('#hudBagIcon').getAttribute('src');
    check('hud bag restores bag1 after ESC', escBagSrc.includes('bag1'));
    check('hud bag button loses active class after ESC', !(await page.locator('#btnOpenInventory').evaluate(n => n.classList.contains('active'))));
    check('inventory modal hidden after ESC', !(await page.locator('#inventoryModal').isVisible()));
    await shot('hud-bag-closed-after-esc');

    // Re-open and close with close button
    await page.locator('#btnOpenInventory').click();
    await page.waitForTimeout(200);
    await page.locator('#btnCloseInventoryModal').click();
    await page.locator('#inventoryModal').waitFor({ state: 'hidden' });
    const closeBtnBagSrc = await page.locator('#hudBagIcon').getAttribute('src');
    check('hud bag restores bag1 after close button', closeBtnBagSrc.includes('bag1'));

    // 2. Test Bag Loot Collection Presentation
    const lootPlayed = await page.evaluate(async () => {
      if (!window.BagPresentation) return false;
      const testItem = { name: '遠古蒼藍之刃', desc: '散發著幽藍微光的古代遺物', role: 'warrior', tier: 2 };
      const p = window.BagPresentation.playLootCollection(testItem, { target: 'squad', gold: 50, duration: 800 });
      return !!p;
    });
    check('BagPresentation triggered successfully', lootPlayed);
    await page.waitForTimeout(300);
    await shot('bag-loot-collection-active');
    await page.waitForTimeout(900);
    check('Bag presentation cleans up overlay', !(await page.locator('.bag-loot-presentation-overlay').isVisible()));
    await shot('bag-loot-collection-complete');

    // 3. Test Studio Asset Manager (/asset)
    await page.goto('http://127.0.0.1:3000/asset', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#assetGrid .studio-asset-card').length > 0);
    await page.waitForTimeout(400);

    // Verify UI Category button exists
    const uiCategoryTab = await page.locator('#assetCategories button', { hasText: 'UI 介面素材' }).count();
    check('asset categories includes UI tab', uiCategoryTab >= 1);

    // Click UI Category tab to view bag assets
    await page.locator('#assetCategories button', { hasText: 'UI 介面素材' }).click();
    await page.waitForTimeout(300);

    // Check bag1 and bag2 exist in the asset list
    const bagAssetsCount = await page.locator('#assetGrid .studio-asset-card').count();
    check('UI category displays bag assets', bagAssetsCount >= 2);
    await shot('studio-assets-ui-tab');

    // Click bag1 card to verify detail view
    await page.locator('#assetGrid .studio-asset-card').first().click();
    await page.waitForTimeout(200);
    const assetDetailTitle = await page.locator('#assetDetail h2').textContent();
    check('bag asset details shown', assetDetailTitle.includes('bag1') || assetDetailTitle.includes('bag2'));
    await shot('studio-asset-detail');

    // 4. Test Studio Content Editor (/edit)
    await page.goto('http://127.0.0.1:3000/edit', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#editorList button').length > 0);
    await page.waitForTimeout(400);

    // Check Event Category in dropdown
    const eventOptionCount = await page.locator('#editorCategory option[value="event"]').count();
    check('editor category dropdown includes event stories', eventOptionCount >= 1);

    // Select Event category
    await page.locator('#editorCategory').selectOption('event');
    await page.waitForTimeout(300);
    const eventItemsCount = await page.locator('#editorList button').count();
    check('editor lists registered event stories', eventItemsCount >= 5);
    await shot('studio-editor-event-list');

    // Click first event story (e.g. shop normal or prep)
    await page.locator('#editorList button').first().click();
    await page.waitForTimeout(200);
    check('editor form loads event story fields', await page.locator('#editorForm input, #editorForm textarea').count() >= 2);
    await shot('studio-editor-event-form');

    // 5. Test Presentation Lab (/lab)
    await page.goto('http://127.0.0.1:3000/lab', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const labNavBg = await page.locator('#studioNav').evaluate(n => getComputedStyle(n).borderBottomColor);
    check('lab uses studio dark slate line border', labNavBg.length > 0);
    await shot('studio-lab-azure-ruins');

    await page.close();
  }

  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser.close();
  fs.writeFileSync(`${output}/bag-studio-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.errors.length || report.failure ? 1 : 0);
}
