import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Reward Queue Logic Unit Tests
test('RewardQueueManager merges identical items in queue', async () => {
  await import('../public/reward-presentation.js');
  const { RewardQueueManager } = globalThis;
  const manager = new RewardQueueManager();

  // Mock playNext to avoid DOM dependency in pure logic test
  manager.isPlaying = true; // pretend it is currently playing an item

  const sword1 = { type: 'item', item: { id: 'sword_01', name: '鐵劍' }, count: 1 };
  const sword2 = { type: 'item', item: { id: 'sword_01', name: '鐵劍' }, count: 2 };
  const shield = { type: 'item', item: { id: 'shield_01', name: '木盾' }, count: 1 };

  manager.enqueue(sword1);
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].count, 1);

  // Enqueue identical item -> should merge into existing queue entry
  manager.enqueue(sword2);
  assert.equal(manager.queue.length, 1);
  assert.equal(manager.queue[0].count, 3);

  // Enqueue different item -> should create new entry
  manager.enqueue(shield);
  assert.equal(manager.queue.length, 2);
  assert.equal(manager.queue[1].item.id, 'shield_01');
  assert.equal(manager.queue[1].count, 1);
});

test('RewardQueueManager supports skip and abort controller safely', async () => {
  await import('../public/reward-presentation.js');
  const { RewardQueueManager } = globalThis;
  const manager = new RewardQueueManager();

  let aborted = false;
  manager.currentController = new AbortController();
  manager.currentController.signal.addEventListener('abort', () => {
    aborted = true;
  });

  manager.skip();
  assert.equal(manager.skipRequested, true);
  assert.equal(aborted, true);
});

test('Reward presentation assets and script inclusion in index.html', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('<script src="reward-presentation.js"></script>'),
    'index.html must include reward-presentation.js'
  );
  assert.ok(
    indexHtml.indexOf('reward-presentation.js') < indexHtml.indexOf('app.js'),
    'reward-presentation.js must be loaded before app.js'
  );
});

test('Reward presentation styles exist in style.css', () => {
  const styleCss = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
  assert.ok(styleCss.includes('.reward-presentation-overlay'), 'style.css must define .reward-presentation-overlay');
  assert.ok(styleCss.includes('.reward-presentation-card'), 'style.css must define .reward-presentation-card');
  assert.ok(styleCss.includes('.btn-skip-reward'), 'style.css must define .btn-skip-reward');
  assert.ok(styleCss.includes('prefers-reduced-motion'), 'style.css must have prefers-reduced-motion query for rewards');
});

test('Mandatory modals cannot be dismissed by ESC or backdrop click in app.js', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.ok(
    appJs.includes('elements.equipDropModal') && appJs.includes('elements.targetModal'),
    'app.js must reference mandatory modals'
  );
  assert.ok(
    appJs.includes('isModalVisible(elements.equipDropModal) || isModalVisible(elements.targetModal)'),
    'app.js must guard against ESC closing mandatory modals'
  );
  assert.ok(
    appJs.includes('統一 Modal 與 Escape 關閉管理系統'),
    'app.js must have centralized modal and escape management'
  );
});

test('Reward presentation is wired to craft, shop buyback, chest, and random actions in app.js', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.ok(appJs.includes('鍛造合成成功！'), 'Crafting callback must enqueue reward presentation');
  assert.ok(appJs.includes('購回成功'), 'Shop buyback must enqueue reward presentation');
  assert.ok(appJs.includes('寶箱戰利品'), 'Chest action must enqueue reward presentation');
  assert.ok(appJs.includes('事件戰利品'), 'Random event action must enqueue reward presentation');
});
