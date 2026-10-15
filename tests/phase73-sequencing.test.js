import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const waitSource = source.slice(source.indexOf('function isRoundStartPresentationState('), source.indexOf('async function runPresentationQueue('));
function fixture() {
  const listeners = new Set();
  const context = { roomState: { state: 'LOBBY' }, pendingAuthoritativeState: null, DOMException, Promise,
    socket: { on: (_,fn) => listeners.add(fn), off: (_,fn) => listeners.delete(fn) } };
  vm.createContext(context); vm.runInContext(waitSource, context);
  return { context, listeners, update: state => [...listeners].forEach(fn => fn(state)) };
}
test('initial status queue waits for matching battle state before starting the encounter', async () => {
  const f = fixture(); let resolved = false;
  const promise = f.context.waitForBattleRoundState(1).then(state => { resolved = true; return state; });
  f.update({ state: 'LOBBY' });
  f.update({ state: 'IN_BATTLE', battleRound: 2, currentMonster: {} });
  await Promise.resolve(); assert.equal(resolved, false);
  const state = { state: 'IN_BATTLE', battleRound: 1, currentMonster: {name:'Boss'} };
  f.update(state); assert.equal(await promise, state); assert.equal(f.listeners.size, 0);
});
test('a later round cannot borrow the previous round state', async () => {
  const f = fixture(); f.context.roomState = {state:'IN_BATTLE',battleRound:1,currentMonster:{}};
  const promise = f.context.waitForBattleRoundState(2);
  assert.equal(f.listeners.size, 1);
  const state = {state:'IN_BATTLE',battleRound:2,currentMonster:{}};
  f.update(state); assert.equal(await promise, state); assert.equal(f.listeners.size, 0);
});
test('buffered matching state resolves immediately without another event', async () => {
  const f = fixture(); const state = {state:'IN_BATTLE',battleRound:1,currentMonster:{}};
  f.context.pendingAuthoritativeState = state;
  assert.equal(await f.context.waitForBattleRoundState(1), state); assert.equal(f.listeners.size, 0);
});
test('a TRANSITION update does not count as an authoritative battle state', async () => {
  const f = fixture();
  const promise = f.context.waitForBattleRoundState(1);
  f.update({state:'TRANSITION',battleRound:1,selectionState:'SELECTING',currentMonster:{}});
  assert.equal(f.listeners.size, 1);
  f.update({state:'TRANSITION',battleRound:1,selectionState:'RESOLVING',currentMonster:{}});
  assert.equal(f.listeners.size, 1);
  const state = {state:'IN_BATTLE',battleRound:1,selectionState:'RESOLVING',currentMonster:{}};
  f.update(state); assert.equal(await promise,state); assert.equal(f.listeners.size,0);
});
test('leaving during the state wait releases the socket listener', async () => {
  const f = fixture(); const controller = new AbortController();
  const promise = f.context.waitForBattleRoundState(1,controller.signal);
  controller.abort(); await assert.rejects(promise,{name:'AbortError'}); assert.equal(f.listeners.size, 0);
});

function observationQueueFixture(state) {
  const f=fixture(),events=[],errors=[];
  let finishOpening;
  const opening=new Promise(resolve=>{finishOpening=()=>{events.push('round_complete');resolve();};});
  const node={replaceChildren(){},classList:{remove(){}},inert:false};
  Object.assign(f.context,{
    AbortController,roomState:state,isPlayingBattleNarrative:false,
    presentationManager:{setBlocking(){}},document:{getElementById:()=>node},
    mergePresentationSnapshot:(state,snapshot)=>({...state,players:snapshot.players}),
    renderApp(){events.push('render');},
    ensureBattlePhase(round){
      assert.equal(f.context.roomState.state,'IN_BATTLE');
      assert.equal(f.context.roomState.battleRound,round);
      events.push('round_start');return opening;
    },
    async enterCombatStage(){events.push('combat_enter');},
    async playPresentationStep(step){events.push(step.actionId);},
    async exitCombatStage(){events.push('combat_exit');},
    console:{error:(...args)=>errors.push(args)}
  });
  f.context.socket.emit=(event)=>events.push(event);
  vm.runInContext(source.slice(source.indexOf('let isProcessingPresentationQueue = false;'),
    source.indexOf("socket.on('battle:presentation_queue'")),f.context);
  const snapshot={players:[],monster:{name:'Boss',hp:100}};
  const queue=[{type:'player_action',category:'BUFF',actionId:'aug_observe',hpSnapshotBefore:snapshot,hpSnapshot:snapshot}];
  return {...f,events,errors,finishOpening,queue,flush:async()=>{for(let i=0;i<12;i++)await Promise.resolve();}};
}

for(const initialState of ['TRANSITION','IN_BATTLE'])test(`Augur observation waits for the Round 1 banner from ${initialState}`,async()=>{
  const state={code:'AUGUR',state:'IN_BATTLE',battleRound:1,currentMonster:{name:'Boss'},players:[]};
  const f=observationQueueFixture({...state,state:initialState});
  const playback=f.context.runPresentationQueue(f.queue,1,false,1);
  await f.flush();
  if(initialState==='TRANSITION') {
    assert.deepEqual(f.events,[]);
    f.update({...state,state:'TRANSITION'});await f.flush();assert.deepEqual(f.events,[]);
    f.update(state);await f.flush();
  }
  assert.deepEqual(f.events,['render','round_start']);
  f.finishOpening();await playback;
  assert.deepEqual(f.events,['render','round_start','round_complete','combat_enter','aug_observe','combat_exit','render','battle:presentation_complete']);
  await f.context.runPresentationQueue(f.queue,1,false,1);
  assert.equal(f.events.filter(event=>event==='aug_observe').length,1);
  assert.deepEqual(f.errors,[]);
});

test('Augur reselection waits for its own round banner',async()=>{
  const state={code:'AUGUR',state:'IN_BATTLE',battleRound:1,currentMonster:{name:'Boss'},players:[]};
  const f=observationQueueFixture(state);
  const playback=f.context.runPresentationQueue(f.queue,2,false,2);await f.flush();
  assert.deepEqual(f.events,[]);
  f.update({...state,battleRound:2});await f.flush();
  assert.deepEqual(f.events,['render','round_start']);
  f.finishOpening();await playback;
  assert(f.events.indexOf('round_complete')<f.events.indexOf('aug_observe'));
  assert.deepEqual(f.errors,[]);
});

test('cancelling a pending observation never plays or acknowledges it',async()=>{
  const f=observationQueueFixture({code:'AUGUR',state:'TRANSITION'});
  const playback=f.context.runPresentationQueue(f.queue,1,false,1);await f.flush();
  vm.runInContext('combatQueueController.abort()',f.context);await playback;
  assert.deepEqual(f.events,[]);assert.equal(f.listeners.size,0);assert.deepEqual(f.errors,[]);
});
