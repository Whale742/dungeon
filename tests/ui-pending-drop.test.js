import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('function renderPendingDropModal('), app.indexOf('// Lobby readiness'));
function fixture(drop = { id: 'test', name: '精煉短劍', desc: '攻擊 +5', type: 'weapon' }, equips = []) {
  const node = () => ({ style: {}, classList: { add() {}, remove() {} }, children: [],
    appendChild(n) { this.children.push(n); }, addEventListener(k, fn) { this[k] = fn; } });
  const elements = Object.fromEntries(['equipDropModal', 'equipModalTitle', 'equipModalSubtitle', 'dropItemName', 'dropItemType', 'dropItemDesc', 'currentEquipCount', 'equipReplaceNotice', 'btnEquipItem', 'btnDiscardItem', 'currentEquipsList'].map(k => [k, node()]));
  const me = { id: 'p1', equips };
  const state = { state: 'BATTLE_VICTORY', victoryInteractionReady: true, pendingDrop: { ownerId: 'p1', source: 'battle', drop } };
  const choices = [];
  const context = vm.createContext({ elements, me, roomState: state, myId: 'p1', selectedReplaceIndex: -1, window: {},
    document: { createElement: node }, ModalMotion: { show(n) { n.visible = true; }, hide(n) { n.visible = false; } },
    escapeHtml: s => String(s ?? ''), getIconSvg: () => '', playSound() {}, alert() {}, getMyPlayer: () => me,
    refreshVictoryControls() {}, socket: { emit(event, choice, ack) { choices.push({ event, choice }); state.pendingDrop = null; ack({ success: true }); } } });
  vm.runInContext(source, context);
  return { elements, state, context, choices, render: () => vm.runInContext('renderPendingDropModal(me)', context) };
}
test('pending equipment renders authoritative item and closes after confirmed equip', () => {
  const f = fixture(); f.render();
  assert.equal(f.elements.dropItemName.textContent, '精煉短劍');
  assert.equal(f.elements.dropItemDesc.textContent, '攻擊 +5');
  assert.equal(f.elements.equipDropModal.visible, true);
  f.elements.btnEquipItem.onclick();
  assert.equal(f.choices[0].choice.action, 'equip');
  assert.equal(f.elements.equipDropModal.visible, false);
});
test('missing item is readable and cannot be equipped; discard remains available', () => {
  const f = fixture(null); f.render();
  assert.equal(f.elements.dropItemName.textContent, '未命名裝備');
  assert.equal(f.elements.btnEquipItem.disabled, true);
  f.elements.btnDiscardItem.onclick();
  assert.equal(f.choices[0].choice.action, 'discard');
});
test('full equipment selection passes the chosen replacement index', () => {
  const f = fixture(undefined, [0, 1, 2].map(id => ({ id, name: '舊裝備' }))); f.render();
  f.elements.currentEquipsList.children[1].click(); f.elements.btnEquipItem.onclick();
  assert.equal(f.choices[0].choice.replaceIndex, 1);
});
test('chest waits for reward reveal and non-owner never gets the equipment choice', () => {
  const f = fixture(); f.state.state = 'EVENT'; f.state.currentEvent = { type: 'treasure', presentationId: 'c1' };
  f.context.chestRewardCompletedId = null; f.render(); assert.equal(f.elements.equipDropModal.visible, false);
  f.context.chestRewardCompletedId = 'c1'; f.render(); assert.equal(f.elements.equipDropModal.visible, true);
  f.state.pendingDrop.ownerId = 'p2'; f.render(); assert.equal(f.elements.equipDropModal.visible, false);
});
