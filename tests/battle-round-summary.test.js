import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/battle-log.js', import.meta.url), 'utf8');

function createHarness() {
  const children = [];
  const el = {
    children,
    textContent: '',
    replaceChildren(...nodes) {
      children.length = 0;
      nodes.forEach(n => children.push(n));
      this.textContent = children.map(c => c.textContent).join('\n');
    },
    append(...nodes) {
      nodes.forEach(n => children.push(n));
      this.textContent = children.map(c => c.textContent).join('\n');
    }
  };

  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (id === 'battleRoundSummary') return el;
        return null;
      },
      createElement(tag) {
        return { tag, textContent: '' };
      }
    },
    roomState: null,
    window: {}
  });

  vm.runInContext(source, context);

  return {
    context,
    summaryEl: el,
    render(history) {
      vm.runInContext(`renderBattleRoundSummary(${JSON.stringify(history || [])})`, context);
    },
    setRoomState(state) {
      context.roomState = state;
    }
  };
}

test('round summary starts with placeholder on empty round', () => {
  const h = createHarness();
  h.setRoomState({ code: 'TEST', floor: 1, battleRound: 1, currentHex: { id: 'h1' } });

  h.render([]);
  assert.equal(h.summaryEl.children[0].textContent, '第 1 回合摘要');
  assert.equal(h.summaryEl.children[1].textContent, '等待本回合戰況');
});

test('round summary extracts up to 4 important events and strips markdown and emojis', () => {
  const h = createHarness();
  h.setRoomState({ code: 'TEST', floor: 1, battleRound: 1, currentHex: { id: 'h1' } });

  const logs = [
    { type: 'chat', text: '隊友：快打！' },
    { type: 'damage', text: '🗡️ **戰士** 使出【斬擊】，對 **暗影狼** 造成 25 點傷害！' },
    { type: 'buff', text: '🛡️ **壁壘守護** 為全隊提供 30 點護盾。' },
    { type: 'heal', text: '✨ **聖騎士** 回復了 20 點生命值。' },
    { type: 'damage', text: '🔥 **暗影狼** 受到灼燒傷害 10 點。' },
    { type: 'combat', text: '💥 **法師** 發動暴擊！' }
  ];

  h.render(logs);
  assert.equal(h.summaryEl.children[0].textContent, '第 1 回合摘要');
  // 1 heading + 4 items
  assert.equal(h.summaryEl.children.length, 5);
  assert.equal(h.summaryEl.children[1].textContent.includes('**'), false);
  assert.equal(h.summaryEl.children[1].textContent.includes('🛡️'), false);
  assert.equal(h.summaryEl.children[4].textContent.includes('法師 發動暴擊！'), true);
});

test('advancing battleRound creates clean boundary for new round', () => {
  const h = createHarness();
  h.setRoomState({ code: 'TEST', floor: 1, battleRound: 1, currentHex: { id: 'h1' } });

  const round1Logs = [
    { type: 'damage', text: '第 1 輪攻擊 20 點傷害' }
  ];
  h.render(round1Logs);
  assert.equal(h.summaryEl.children[0].textContent, '第 1 回合摘要');
  assert.equal(h.summaryEl.children[1].textContent, '第 1 輪攻擊 20 點傷害');

  // Advance to round 2 with no new logs yet
  h.setRoomState({ code: 'TEST', floor: 1, battleRound: 2, currentHex: { id: 'h1' } });
  h.render(round1Logs);
  assert.equal(h.summaryEl.children[0].textContent, '第 2 回合摘要');
  assert.equal(h.summaryEl.children[1].textContent, '等待本回合戰況');

  // New logs arrive for round 2
  const round2Logs = [
    ...round1Logs,
    { type: 'damage', text: '第 2 輪反擊 40 點傷害' }
  ];
  h.render(round2Logs);
  assert.equal(h.summaryEl.children[0].textContent, '第 2 回合摘要');
  assert.equal(h.summaryEl.children[1].textContent, '第 2 輪反擊 40 點傷害');
});

test('scene change resets cursor and shows round 1 summary for new battle', () => {
  const h = createHarness();
  h.setRoomState({ code: 'TEST', floor: 1, battleRound: 1, currentHex: { id: 'h1' } });

  h.render([{ type: 'damage', text: '狼人造成 15 點傷害' }]);
  assert.equal(h.summaryEl.children[1].textContent, '狼人造成 15 點傷害');

  // Move to next floor/battle
  h.setRoomState({ code: 'TEST', floor: 2, battleRound: 1, currentHex: { id: 'h2' } });
  h.render([{ type: 'damage', text: '石像鬼造成 30 點傷害' }]);
  assert.equal(h.summaryEl.children[0].textContent, '第 1 回合摘要');
  assert.equal(h.summaryEl.children[1].textContent, '石像鬼造成 30 點傷害');
});
