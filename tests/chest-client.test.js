import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './client-fixture.js';

function setupChest(hasDrop = true, isSpecial = false) {
  const f = fixture();
  const snapshot = hp => ({ players: [{ id: 'a', hp, maxHp: 100 }] });
  const drop = hasDrop ? {
    id: isSpecial ? 'w_greatsword' : 'w_sword',
    name: isSpecial ? '雙手劍' : '鋼鐵聖劍',
    isSpecial,
    desc: '攻擊力提升'
  } : null;

  f.context.myId = 'a';
  f.context.roomState = {
    state: 'EVENT',
    players: [{ id: 'a', hp: 75, maxHp: 100 }],
    pendingDrop: hasDrop ? {
      drop,
      ownerId: 'a',
      ownerName: 'Leader',
      source: 'treasure'
    } : null,
    currentEvent: {
      type: 'treasure',
      presentationId: 42,
      story: '石壁深處有一只寶箱。',
      healAmt: 25,
      hpBefore: snapshot(75),
      hpAfter: snapshot(100),
      drop,
      ownerName: 'Leader',
      ownerId: 'a'
    }
  };

  vm.runInContext(fs.readFileSync(new URL('../public/chest.js', import.meta.url), 'utf8'), f.context);
  return f;
}

test('complete chest flow: discovery story -> hold -> visual & button reveal -> player click -> open beats -> reward reveal -> hold -> exit -> equipment:interaction_ready', async () => {
  const f = setupChest(true, false);
  const promise = vm.runInContext('playChestPresentation(roomState.currentEvent)', f.context);

  // 1. Discovery section enters
  assert.equal(f.elements.chestDiscoverySection.classList.contains('enter'), true);
  assert.equal(f.elements.btnOpenChest.disabled, true);
  assert.equal(f.elements.btnOpenChest.classList.contains('ready'), false);

  // Before typewriter paints: 600ms sectionEnter + 400ms narrativeDelay = 1000ms + 32ms RAFs
  await f.advance(1031);
  assert.equal(f.elements.chestDiscoveryStory.textContent, '');

  // First character paints after 40ms, then rest of the characters:
  // 10 chars * 40ms + 280ms sentence pause = 680ms
  await f.advance(700);
  assert.notEqual(f.elements.chestDiscoveryStory.textContent, '');
  assert.equal(f.elements.chestInteractionArea.classList.contains('hidden'), true);

  // 2. Narrative Hold (1200ms)
  await f.advance(1200);

  // 3. Chest Visual & Button Reveal (chestReveal: 450ms)
  assert.equal(f.elements.chestInteractionArea.classList.contains('hidden'), false);
  assert.equal(f.elements.chestDiscoveryStory.classList.contains('dimmed'), true);
  await f.advance(450);

  // Button is now revealed and ready!
  assert.equal(f.elements.btnOpenChest.classList.contains('ready'), true);
  assert.equal(f.elements.btnOpenChest.disabled, false);
  assert.equal(f.manager.isBlocking, false); // interaction enabled

  // Sounds up to reveal
  assert.ok(!f.sounds.some(s => s.name === 'chest_reveal'));

  // 4. Player clicks "開啟寶箱"
  f.elements.btnOpenChest.click();
  await f.flush();

  // Button is immediately locked!
  assert.equal(f.elements.btnOpenChest.disabled, true);
  assert.equal(f.elements.btnOpenChest.classList.contains('ready'), false);
  assert.equal(f.manager.isBlocking, true); // interaction locked

  // 5. Presentation root overlay is shown
  assert.equal(f.elements.chestPresentationOverlay.classList.contains('hidden'), false);

  // 6. Anticipation (150ms) -> Shake (260ms) -> Lid Open -> Open Hold (400ms)
  await f.advance(150);
  assert.equal(f.elements.presentationChestVisual.classList.contains('is-shaking'), true);
  await f.advance(260);
  assert.equal(f.elements.presentationChestVisual.classList.contains('is-shaking'), false);
  assert.equal(f.elements.presentationChestVisual.classList.contains('is-open'), true);
  assert.ok(f.sounds.some(s => s.name === 'chest_reveal'));
  assert.ok(f.sounds.some(s => s.name === 'heal'));

  // 7. Reward Reveal (Common: 400ms reveal + 1000ms hold)
  await f.advance(400); // openHold
  assert.equal(f.elements.presentationRewardContent.classList.contains('hidden'), false);
  assert.ok(f.sounds.some(s => s.name === 'reward_common'));

  await f.advance(1500); // reward 1400ms + remaining 100ms MP3 identity

  // 8. Settle / Exit (500ms)
  assert.equal(f.elements.chestPresentationOverlay.classList.contains('exit'), true);
  await f.advance(500);

  await promise;

  // 9. Owner emits equipment:interaction_ready
  assert.equal(f.emissions.some(e => e.name === 'equipment:interaction_ready'), true);
  assert.equal(f.elements.chestPresentationOverlay.classList.contains('hidden'), true);
  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.errors.length, 0);
});

test('rare drop plays reward_rare sound and holds for 1500ms', async () => {
  const f = setupChest(true, true); // isSpecial = true (Rare)
  const promise = vm.runInContext('playChestPresentation(roomState.currentEvent)', f.context);

  await f.advance(1032 + 700 + 1200); // Typewriter + Narrative Hold
  await f.advance(450);  // Chest Reveal
  f.elements.btnOpenChest.click(); // Click
  await f.flush();

  await f.advance(150 + 260 + 400); // Anticipation + Shake + OpenHold
  assert.ok(f.sounds.some(s => s.name === 'reward_rare'));

  await f.advance(550 + 1500 + 500); // Rare reveal + hold + exit
  await promise;

  assert.equal(f.emissions.some(e => e.name === 'equipment:interaction_ready'), true);
  assert.equal(f.errors.length, 0);
});

test('abort cleanly terminates without false ACKs or hanging blocking state', async () => {
  const f = setupChest(true, false);
  const promise = vm.runInContext('playChestPresentation(roomState.currentEvent)', f.context);

  await f.advance(1000);
  vm.runInContext('chestPresentationController.abort()', f.context);

  await f.advance(5000);
  await promise;

  assert.equal(f.manager.isBlocking, false);
  assert.equal(f.elements.chestPresentationOverlay.classList.contains('hidden'), true);
  assert.equal(f.emissions.filter(e => e.name === 'equipment:interaction_ready' || e.name === 'chest:presentation_complete').length, 0);
  assert.equal(f.errors.length, 0);
});
