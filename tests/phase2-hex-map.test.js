import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';

function createRoom(t) {
  const emitted = [];
  const io = { to: () => ({ emit: (name, data) => emitted.push({ name, data }) }) };
  const socket = id => ({ id, join() {} });
  const room = new Room('HEX01', socket('p1'), 'Leader', io);
  room.addPlayer(socket('p2'), 'Member');
  room.selectRole('p1', 'warrior');
  room.selectRole('p2', 'mage');
  t.after(() => room.clearTimer());
  return { room, emitted };
}

test('Phase 2.1: Hex Grid Map has 10 columns (col 0..9), gradually expanding up to 7 layers (1, 3, 5, 7, 7, 7, 7, 5, 3, 1) with center row = 3', t => {
  const { room } = createRoom(t);
  assert.equal(Array.isArray(room.hexMap), true);
  assert.equal(room.hexMap.length, 10);

  assert.equal(room.hexMap[0].length, 1, 'col 0 must have a single start node at center row 3');
  assert.equal(room.hexMap[0][0].col, 0);
  assert.equal(room.hexMap[0][0].row, 3);
  assert.equal(room.hexMap[0][0].type, 'START');

  const expectedRowsByCol = {
    1: [2, 3, 4],
    2: [1, 2, 3, 4, 5],
    3: [0, 1, 2, 3, 4, 5, 6],
    4: [0, 1, 2, 3, 4, 5, 6],
    5: [0, 1, 2, 3, 4, 5, 6],
    6: [0, 1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5],
    8: [2, 3, 4]
  };
  for (let col = 1; col <= 8; col++) {
    assert.deepEqual(room.hexMap[col].map(n => n.row), expectedRowsByCol[col], `col ${col} rows should match gradual 7-layer expansion`);
  }

  assert.equal(room.hexMap[9].length, 1, 'col 9 must converge to a single node at center row 3');
  assert.equal(room.hexMap[9][0].col, 9);
  assert.equal(room.hexMap[9][0].row, 3);
  assert.equal(room.hexMap[9][0].type, 'END_ELITE');
});

test('Phase 2.2: Fog of war defaults all nodes to isRevealed = false until stepped into', t => {
  const { room } = createRoom(t);
  const allNodes = room.hexMap.flat();
  assert.equal(allNodes.every(n => n.isRevealed === false), true);

  room.startRouteSelection({ skipIntro: true });
  const targetRoute = room.currentRoutes[0];
  room.resolveRouteChoice(targetRoute);
  room.clearTimer();

  const steppedNode = room.getHexNodeById(targetRoute.id);
  assert.equal(steppedNode.isRevealed, true);
  assert.equal(steppedNode.isVisited, true);
  assert.deepEqual(room.currentHex, { col: steppedNode.col, row: steppedNode.row });
});

test('Phase 2.3: Forward-only adjacency restrictions across 7-layer grid (col + 1 adjacent rows only; no backward or same-col or >1 row jumps)', t => {
  const { room } = createRoom(t);

  // From (0, 3) -> can move to (1, 2), (1, 3), (1, 4)
  assert.deepEqual(room.getAdjacentNextHexes(0, 3).map(n => n.id), ['hex_1_2', 'hex_1_3', 'hex_1_4']);

  // From (1, 2) -> can move to (2, 1), (2, 2), (2, 3), NOT (2, 4) or (2, 5)
  assert.deepEqual(room.getAdjacentNextHexes(1, 2).map(n => n.id), ['hex_2_1', 'hex_2_2', 'hex_2_3']);

  // From (3, 0) [top edge of 7-layer col 3] -> can only move to (4, 0), (4, 1)
  assert.deepEqual(room.getAdjacentNextHexes(3, 0).map(n => n.id), ['hex_4_0', 'hex_4_1']);

  // From (3, 6) [bottom edge of 7-layer col 3] -> can only move to (4, 5), (4, 6)
  assert.deepEqual(room.getAdjacentNextHexes(3, 6).map(n => n.id), ['hex_4_5', 'hex_4_6']);

  // From (8, 2), (8, 3), (8, 4) -> all converge to (9, 3)
  assert.deepEqual(room.getAdjacentNextHexes(8, 2).map(n => n.id), ['hex_9_3']);
  assert.deepEqual(room.getAdjacentNextHexes(8, 3).map(n => n.id), ['hex_9_3']);
  assert.deepEqual(room.getAdjacentNextHexes(8, 4).map(n => n.id), ['hex_9_3']);

  // Voting validation: place squad at (1, 2) and start route selection for col = 2
  room.currentHex = { col: 1, row: 2 };
  room.startRouteSelection({ skipIntro: true });

  // Backward (col 0), same col (col 1), and non-adjacent row (hex_2_5) must be rejected
  assert.equal(room.voteRoute('p1', 'hex_0_3').success, false);
  assert.equal(room.voteRoute('p1', 'hex_1_3').success, false);
  assert.equal(room.voteRoute('p1', 'hex_2_5').success, false);

  // Valid forward adjacent hex (hex_2_1) succeeds
  assert.equal(room.voteRoute('p1', 'hex_2_1').success, true);
});

test('Phase 2.4: 40% pre-scouting at col = 3, 6, 8 reveals SHOP and CHEST as isScouted without leaking shady merchant or mimic', t => {
  const { room } = createRoom(t);

  // Non-scoutable column (e.g. col = 2) does not trigger scouting
  const nonScoutRes = room.tryScoutColumn(2, { rng: () => 0.1 });
  assert.equal(nonScoutRes.triggered, false);

  // Roll >= 0.40 on col = 3 fails scouting
  const failRes = room.tryScoutColumn(3, { rng: () => 0.45 });
  assert.equal(failRes.triggered, false);
  assert.equal(room.hexMap[3].every(n => n.isScouted === false), true);

  // Roll < 0.40 on col = 6 succeeds and marks SHOP and CHEST as isScouted = true
  const successRes = room.tryScoutColumn(6, { rng: () => 0.39 });
  assert.equal(successRes.triggered, true);
  assert.ok(successRes.scoutedNodes.length >= 2);
  for (const node of room.hexMap[6]) {
    if (node.type === 'SHOP' || node.type === 'CHEST') {
      assert.equal(node.isScouted, true);
      assert.equal(node.isRevealed, false);
    } else {
      assert.equal(node.isScouted, false);
    }
  }

  // Client state exposes SHOP/CHEST icon for scouted nodes but never leaks isShadyMerchant or isMimic
  const clientCol6 = room.getClientHexMap()[6];
  for (const cNode of clientCol6) {
    assert.equal('isShadyMerchant' in cNode, false);
    assert.equal('isMimic' in cNode, false);
    if (cNode.isScouted) {
      assert.ok(cNode.type === 'SHOP' || cNode.type === 'CHEST');
      assert.ok(cNode.icon === '🛒' || cNode.icon === '📦');
    }
  }
});

test('Phase 2.5: All player decision timers are removed (no time limit on route voting, battle selection, or checkpoint)', t => {
  const { room } = createRoom(t);

  // 1. Route selection has no timer
  room.startRouteSelection({ skipIntro: true });
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);

  // 2. Battle skill selection has no timer
  room.handleBattleEvent(null, false, { col: 1 });
  room.selectionState = 'SELECTING';
  room.isWaitingForSelectionReady = true;
  room.pendingSelectionAcks = new Set(['p1', 'p2']);
  room.handleSelectionReady('p1', 1);
  room.handleSelectionReady('p2', 1);
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);

  // 3. Checkpoint has no timer
  room.floor = 5;
  room.advanceToNextFloorOrCheckpoint();
  assert.equal(room.state, 'CHECKPOINT');
  assert.equal(room.turnTimer, null);
  assert.equal(room.getClientState().timerRemaining, null);
});

test('Phase 2.6: UI renders 7 honeycomb layers and displays route selection arrow (curved up, flipped curved down, straight right)', async t => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const { room } = createRoom(t);
  room.startRouteSelection({ skipIntro: true });
  const clientState = room.getClientState();

  const container = { innerHTML: '' };
  const sandbox = {
    roomState: clientState,
    elements: { hexMapContainer: container },
    escapeHtml: s => String(s ?? ''),
    playSound: () => {},
    presentationManager: { isBlocking: false },
    socket: { emit: () => {} }
  };
  const code = fs.readFileSync(new URL('../public/exploration.js', import.meta.url), 'utf8');
  vm.runInNewContext(code, sandbox);

  const me = clientState.players[0];

  // 1. Select upper-right hex_1_2 from (0, 3) -> curved arrow with scaleY(1)
  sandbox.renderHexGridMap(me, true, 'hex_1_2');
  for (let r = 0; r <= 6; r++) {
    assert.equal(container.innerHTML.includes(`data-row="${r}"`), true, `should render row ${r}`);
  }
  assert.equal(container.innerHTML.includes('data-direction="up"'), true);
  assert.equal(container.innerHTML.includes('hex-arrow-normal-y'), true);
  assert.equal(container.innerHTML.includes('/assets/hex-arrow-curved.png'), true);
  assert.equal(container.innerHTML.includes('scaleY(1)'), true);

  // 2. Select lower-right hex_1_4 from (0, 3) -> curved arrow flipped vertically scaleY(-1)
  sandbox.roomState = { ...clientState, routePresentationId: 99 };
  sandbox.renderHexGridMap(me, true, 'hex_1_4');
  assert.equal(container.innerHTML.includes('data-direction="down"'), true);
  assert.equal(container.innerHTML.includes('hex-arrow-flip-y'), true);
  assert.equal(container.innerHTML.includes('/assets/hex-arrow-curved.png'), true);
  assert.equal(container.innerHTML.includes('scaleY(-1)'), true);

  // 3. Select straight-right hex_1_3 from (0, 3) -> hand-drawn straight arrow SVG
  sandbox.roomState = { ...clientState, routePresentationId: 100 };
  sandbox.renderHexGridMap(me, true, 'hex_1_3');
  assert.equal(container.innerHTML.includes('data-direction="straight"'), true);
  assert.equal(container.innerHTML.includes('hex-arrow-straight'), true);
  assert.equal(container.innerHTML.includes('hex-straight-arrow-svg'), true);
});

