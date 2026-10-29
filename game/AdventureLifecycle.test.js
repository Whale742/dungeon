import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { CLASSES } from './constants.js';
import { AdventurePersistence } from './AdventurePersistence.js';
import { MemoryAdventureStore, LEASE_MS } from './AdventureStore.js';
import { Spectators } from './Spectators.js';
import { disconnectPlayer, reconnectPlayer } from './player-connection.js';
import { CareerStats } from './CareerStats.js';
import { MemoryCareerStore } from './CareerStore.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const io = { to: () => ({ emit() {} }) };
const socket = id => ({ id, data: { identity: { display_name: id } }, join() {}, leave() {}, emit() {} });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, { count = 1, intercept = (_, run) => run() } = {}) {
  let time = Date.now(); const now = () => time;
  const memory = new MemoryAdventureStore({ now }), calls = [];
  const store = { durable: false, list: (...args) => memory.list(...args), call: (action, x) => {
    calls.push(action); return intercept(action, () => memory.call(action, x), x);
  } };
  const persistence = new AdventurePersistence(store, { now });
  const members = Array.from({ length: count }, (_, i) => socket('member-' + i));
  const room = new Room('TRACE', members[0], 'Leader', io);
  members.slice(1).forEach(s => room.addPlayer(s, s.id));
  members.forEach((s, i) => room.selectRole(s.id, Object.keys(CLASSES)[i]));
  room.persistence = persistence;
  room.startAdventure(room.leaderId, { skipPrepShop: true });
  room.startRouteSelection({ skipIntro: true }); await persistence.saveBoundary(room);
  room.spectators = new Spectators(room, io);
  t.after(() => { room.spectators.close(); room.clearTimer(); persistence.close(); });
  return { room, members, persistence, memory, calls, store, advance: ms => { time += ms; } };
}

for (const [count, observers] of [[1, 1], [4, 1], [10, 5]]) {
  for (const phase of ['CHOOSING_ROUTE', 'IN_BATTLE', 'ABYSS_DIALOGUE', 'EVENT']) {
    test(`${count} members/${observers} observers: ${phase} joining and reconnecting never writes or fences authority`, async t => {
      const h = await fixture(t, { count }), { room, persistence } = h;
      room.state = phase;
      if (phase === 'EVENT') room.currentEvent = { type: 'shop', items: [] };
      const before = structuredClone(h.memory.rows.get(room.adventureId)), checkpoint = { ...room.checkpoint };
      const calls = h.calls.length, members = [...room.memberIds], roster = room.stageRoster;
      for (let i = 0; i < observers; i++) assert.equal(room.spectators.join(socket('observer-' + i)).success, true);
      room.spectators.leave('observer-0'); assert.equal(room.spectators.join(socket('observer-0')).success, true);
      assert.equal(h.calls.length, calls);
      assert.deepEqual(h.memory.rows.get(room.adventureId), before);
      assert.deepEqual(room.checkpoint, checkpoint); assert.deepEqual(room.memberIds, members);
      assert.equal(room.stageRoster, roster); assert.equal(!!persistence.blocked(room), false);
      assert.equal(persistence.active.get(room.adventureId), room);
      if (phase === 'CHOOSING_ROUTE') assert.equal(room.voteRoute(room.leaderId, room.currentRoutes[0].id).success, true);
      room.state = 'EVENT'; room.routeVotes = {}; room.startRouteSelection({ skipIntro: true });
      await persistence.saveBoundary(room); assert.equal(room.checkpoint.status, 'saved');
      assert.equal(room.checkpoint.saveVersion, 2);
    });
  }
}

test('release is serialized; observers cannot enter during suspension and renewal cannot follow release', async t => {
  const releasing = deferred(), gate = deferred(); let releasingNow = false;
  const h = await fixture(t, { intercept: async (action, run) => {
    if (action === 'release') { const row = await run(); releasingNow = true; releasing.resolve(); await gate.promise; return row; }
    return run();
  } });
  disconnectPlayer(h.room, h.room.leaderId);
  const suspending = h.persistence.suspend(h.room); await releasing.promise;
  assert.equal(releasingNow, true);
  assert.equal(h.room.spectators.join(socket('late')).code, 'ROOM_INACTIVE');
  await h.persistence.renewAll(); gate.resolve(); assert.equal(await suspending, true);
  assert.equal(h.calls.at(-1), 'release');
  assert.equal(h.room.spectators.members.size, 0);
  assert.equal(h.memory.rows.get(h.room.adventureId).save_version, 1);
  assert.equal(h.room.checkpoint.status, 'saved'); assert.equal(h.persistence.diagnostics(h.room).firstFailure, null);
});

test('save and renewal use one CAS queue, including a renewal queued before suspension', async t => {
  const gate = deferred(), entered = deferred(); let delay = false;
  const h = await fixture(t, { intercept: async (action, run) => {
    if (action === 'save' && delay) { entered.resolve(); await gate.promise; }
    return run();
  } });
  delay = true; h.room.state = 'EVENT'; h.room.startRouteSelection({ skipIntro: true });
  const saving = h.persistence.saveBoundary(h.room); await entered.promise;
  const renewing = h.persistence.renewAll();
  gate.resolve(); await Promise.all([saving, renewing]);
  assert.equal(h.room.checkpoint.status, 'saved'); assert.equal(h.room.checkpoint.saveVersion, 2);
  assert.deepEqual(h.calls.slice(-2), ['save', 'renew']);
});

for (const count of [1, 4]) for (const phase of ['CHOOSING_ROUTE', 'IN_BATTLE', 'EVENT']) {
  test(`${count} members: ${phase} termination waits for cloud and settles once with observers online`, async t => {
    const gate = deferred(), entered = deferred(); let finishes = 0;
    const h = await fixture(t, { count, intercept: async (action, run) => {
      if (action === 'finish') { finishes++; entered.resolve(); await gate.promise; }
      return run();
    } });
    h.room.state = phase;
    const career = new CareerStats(new MemoryCareerStore()); t.after(() => career.close());
    career.attach(h.room); await career.flush(h.room);
    const before = (await career.read(h.room.leaderId)).stats;
    h.room.spectators.join(socket('watcher'));
    if (count > 1) assert.equal((await h.room.endBattle(h.members[1].id)).success, false);
    const first = h.room.endBattle(h.room.leaderId), duplicate = h.room.endBattle(h.room.leaderId);
    await entered.promise;
    assert.equal(h.room.state, phase); assert.equal(h.room.checkpoint.status, 'ending');
    assert.ok(h.persistence.blocked(h.room)); assert.equal(h.room.spectators.members.size, 1);
    h.room.startRouteSelection(); h.room.advanceToNextFloorOrCheckpoint(); h.room.finishTurnPresentation(); h.room.resolveTurnActions();
    assert.equal(h.room.state, phase);
    assert.notEqual(h.memory.rows.get(h.room.adventureId).checkpoint, null);
    assert.equal(await h.persistence.saveBoundary(h.room), false);
    gate.resolve(); assert.equal((await first).success, true); assert.equal((await duplicate).success, true);
    assert.equal(finishes, 1); assert.equal(h.room.checkpoint.status, 'ended');
    assert.equal(h.room.state, 'GAME_OVER'); assert.equal(h.room.spectators.members.size, 0);
    assert.equal(h.memory.rows.get(h.room.adventureId).checkpoint, null);
    assert.deepEqual((await career.read(h.room.leaderId)).stats, before);
    await assert.rejects(h.persistence.restore(h.room.adventureId, h.room.leaderId, { Room, io, code: () => 'OTHER' }), /結束/);
    await assert.rejects(h.memory.call('save', h.persistence.payload(h.room)), /結束/);
  });
}

test('termination queues behind a save; a cloud outage leaves the live phase pending until retry', async t => {
  const gate = deferred(), entered = deferred(); let delay = false, fail = true;
  const h = await fixture(t, { intercept: async (action, run) => {
    if (action === 'save' && delay) { entered.resolve(); await gate.promise; }
    if (action === 'finish' && fail) throw Object.assign(new Error('private cloud details'), { code: 'UNAVAILABLE' });
    return run();
  } });
  delay = true; h.room.state = 'EVENT'; h.room.startRouteSelection({ skipIntro: true });
  const saving = h.persistence.saveBoundary(h.room); await entered.promise;
  const ending = h.room.endBattle(h.room.leaderId); gate.resolve(); await saving;
  assert.equal((await ending).code, 'TERMINATION_PENDING');
  assert.equal(h.room.state, 'CHOOSING_ROUTE'); assert.equal(h.room.checkpoint.status, 'failed');
  assert.equal(h.memory.rows.get(h.room.adventureId).save_version, 2);
  assert.ok(h.memory.rows.get(h.room.adventureId).checkpoint);
  const first = h.persistence.diagnostics(h.room).firstFailure;
  assert.equal(first.operation, 'finish'); assert.equal(first.errorCode, 'UNAVAILABLE');
  assert.equal(JSON.stringify(h.persistence.diagnostics(h.room)).includes('private cloud details'), false);
  fail = false; assert.equal((await h.persistence.retry(h.room, h.room.leaderId)).success, true);
  assert.deepEqual(h.persistence.diagnostics(h.room).firstFailure, first);
});

test('expired lease requires an authorized claim; simultaneous restores share one authority and stale end cannot delete it', async t => {
  const h = await fixture(t, { count: 4 }); h.advance(LEASE_MS + 1);
  assert.equal((await h.room.endBattle(h.room.leaderId)).code, 'RESTORE_REQUIRED');
  assert.equal(h.calls.includes('finish'), false);
  const next = new AdventurePersistence(h.store, { now: h.persistence.now }); t.after(() => next.close());
  const options = { Room, io, code: () => 'NEWER' };
  const [a, b] = await Promise.all(h.members.slice(0, 2).map(s => next.restore(h.room.adventureId, s.id, options)));
  t.after(() => a.clearTimer()); assert.equal(a, b);
  assert.equal(h.calls.filter(action => action === 'claim').length, 1);
  assert.equal((await h.room.endBattle(h.room.leaderId)).code, 'RESTORE_REQUIRED');
  assert.equal(h.memory.rows.get(a.adventureId).status, 'active');
  reconnectPlayer(a, h.members[0]); assert.equal((await a.endBattle(a.leaderId)).success, true);
});

test('career outage blocks terminal commit and retry preserves pending statistics', async t => {
  const h = await fixture(t); let fail = true;
  const careerStore = new MemoryCareerStore(), career = new CareerStats({
    read: (...args) => careerStore.read(...args),
    commit: (...args) => fail ? Promise.reject(new Error('career unavailable')) : careerStore.commit(...args)
  }); t.after(() => career.close());
  career.attach(h.room);
  assert.equal((await h.room.endBattle(h.room.leaderId)).code, 'TERMINATION_PENDING');
  assert.equal(h.calls.includes('finish'), false); assert.ok(career.status(h.room).pending);
  fail = false; assert.equal((await h.room.endBattle(h.room.leaderId)).success, true);
  assert.equal(career.status(h.room).pending, false);
  assert.equal((await career.read(h.room.leaderId)).stats.adventures, 1);
});

test('lost terminal response retries the same CAS without repeating settlements', async t => {
  let drop = true; const payloads = [];
  const h = await fixture(t, { intercept: async (action, run, payload) => {
    const result = await run();
    if (action === 'finish') { payloads.push(structuredClone(payload)); if (drop) { drop = false; throw new Error('lost response'); } }
    return result;
  } });
  assert.equal((await h.room.endBattle(h.room.leaderId)).code, 'TERMINATION_PENDING');
  assert.equal(h.room.state, 'CHOOSING_ROUTE'); assert.equal(h.memory.rows.get(h.room.adventureId).checkpoint, null);
  assert.equal((await h.room.endBattle(h.room.leaderId)).success, true);
  assert.deepEqual(payloads[0], payloads[1]);
});

test('retreat UI sends only end, deduplicates clicks and offers authoritative restore after lost lease', async () => {
  const source = readFileSync(new URL('../public/js/core/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('if (elements.btnConfirmRetreat) {');
  const end = source.indexOf('// ==========================================', start);
  const callbacks = [], notices = []; let click;
  const button = { disabled: false, addEventListener: (_, handler) => { click = handler; } };
  const scope = { elements: { btnConfirmRetreat: button }, ModalMotion: { hide() {} }, playSound() {},
    showToast: text => notices.push(text), socket: { timeout() { return this; }, emit: (...args) => callbacks.push(args) } };
  vm.runInNewContext(source.slice(start, end), scope);
  const first = click(); await click(); assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0][0], 'game:end_battle');
  callbacks[0][2](null, { success: false, code: 'RESTORE_REQUIRED', adventureId: 'safe-id' });
  await Promise.resolve(); assert.equal(callbacks[1][0], 'adventure:restore');
  callbacks[1][2](null, { success: true }); await first;
  assert.equal(button.disabled, false); assert.match(notices[0], /確認目前隊長/);
});
