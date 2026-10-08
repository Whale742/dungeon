import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../game/Room.js';
import { ROUTE_BOSS_STORIES, getRouteBossStory, ROUTES, ENCOUNTERS } from '../game/constants.js';

test('ROUTE_BOSS_STORIES provides unique narratives for all 6 routes and 10 bosses (60 combinations)', () => {
  for (const route of ROUTES) {
    for (const boss of ENCOUNTERS) {
      const story = getRouteBossStory(route.id, boss.name);
      assert.ok(story, `Missing story for route: ${route.id}, boss: ${boss.name}`);
      assert.ok(story.length >= 20, `Story too short for route: ${route.id}, boss: ${boss.name}`);
      assert.equal(ROUTE_BOSS_STORIES[route.id]?.[boss.name], story);
    }
  }
});

test('Room.handleBattleEvent assigns encounterStory based on current route and selected monster', () => {
  const events = [];
  const room = new Room('ENTRY_TEST', { id: 'p0', join() {} }, 'Leader', {
    to: () => ({ emit: (name, data) => events.push({ name, data }) })
  });
  room.addPlayer({ id: 'p1', join() {} }, 'Member');
  room.selectRole('p0', 'warrior');
  room.selectRole('p1', 'mage');
  room.state = 'TRANSITION';
  room.floor = 2;
  room.currentTransition = {
    floor: 2,
    routeId: 'route_cave',
    routeName: '洞穴深處'
  };

  room.handleBattleEvent();
  assert.equal(room.state, 'IN_BATTLE');
  assert.ok(room.currentMonster);
  assert.ok(room.currentMonster.encounterStory);
  assert.equal(room.currentMonster.routeId, 'route_cave');
  assert.equal(
    room.currentMonster.encounterStory,
    getRouteBossStory('route_cave', room.currentMonster.originalName)
  );
  room.clearTimer();
});

test('Room.handleBattleEvent appends weakened note when boss is weakened', () => {
  const room = new Room('ENTRY_WEAK', { id: 'p0', join() {} }, 'Leader', {
    to: () => ({ emit: () => {} })
  });
  room.addPlayer({ id: 'p1', join() {} }, 'Member');
  room.selectRole('p0', 'warrior');
  room.selectRole('p1', 'mage');
  room.state = 'TRANSITION';
  room.floor = 3;
  room.currentTransition = {
    floor: 3,
    routeId: 'route_forest',
    routeName: '森林深處'
  };

  room.handleBattleEvent(null, true);
  assert.ok(room.currentMonster.isWeakened);
  assert.ok(room.currentMonster.encounterStory.includes('負傷') || room.currentMonster.encounterStory.includes('重創'));
  assert.ok(room.currentMonster.encounterStory.includes('75%'));
  room.clearTimer();
});

test('public/battle-phase.js defines client-side resolveRouteBossStory with consistent stories', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const bpSource = fs.readFileSync(new URL('../public/battle-phase.js', import.meta.url), 'utf8');
  const context = {
    document: {
      getElementById: () => ({ appendChild: () => {} }),
      createElement: () => ({ style: { setProperty: () => {} }, querySelector: () => ({ querySelector: () => ({}) }) })
    },
    window: {},
    matchMedia: () => ({ matches: false }),
    performance: { now: () => Date.now() },
    PRESENTATION_CONFIG: {
      bossEncounter: {
        darkenDuration: 10, warningRevealAt: 20, warningEntry: 5, warningHold: 5,
        warningExit: 5, preBossBeat: 5, bossSettle: 5, bossHold: 10
      }
    },
    sfxManager: { preload: async () => {}, duck: () => {} },
    createSfxPresentationScope: () => ({ play: async () => {}, hold: async () => {} }),
    waitForPresentation: async () => {}
  };
  vm.createContext(context);
  vm.runInContext(bpSource, context);
  assert.equal(typeof context.resolveRouteBossStory, 'function');
  for (const route of ROUTES) {
    for (const boss of ENCOUNTERS) {
      assert.equal(
        context.resolveRouteBossStory(route.id, boss.name),
        getRouteBossStory(route.id, boss.name)
      );
    }
  }
});

test('typeBossStoryParagraphs triggers onHalfway at 50% and continues typing to completion', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const bpSource = fs.readFileSync(new URL('../public/battle-phase.js', import.meta.url), 'utf8');

  class MockElement {
    constructor() { this.children = []; this.textContent = ''; }
    replaceChildren() { this.children = []; this.textContent = ''; }
    appendChild(child) {
      this.children.push(child);
      if (typeof child === 'string') this.textContent += child;
      else if (child?.textContent) this.textContent += child.textContent;
    }
  }

  const context = {
    document: {
      getElementById: () => new MockElement(),
      createElement: () => new MockElement(),
      createTextNode: text => ({ textContent: text })
    },
    window: {},
    matchMedia: () => ({ matches: false }),
    performance: { now: () => Date.now() },
    PRESENTATION_CONFIG: {
      bossEncounter: {
        character: 1, comma: 1, sentence: 1, newline: 1, paragraph: 1
      }
    },
    waitForPresentation: async () => {},
    playTypewriterClick: () => {}
  };
  vm.createContext(context);
  vm.runInContext(bpSource, context);

  const container = new MockElement();
  const text = '小隊沿著狹窄的碎石小徑攀爬，整段山道化為滾滾熔岩，黑曜石巨拳破壁而出！';
  let halfwayCalled = false;
  let charsAtHalfway = 0;

  await context.typeBossStoryParagraphs(container, [text], null, { character: 1 }, () => {
    halfwayCalled = true;
    charsAtHalfway = container.children[0]?.textContent?.length || 0;
  }, 100);

  assert.equal(halfwayCalled, true, 'onHalfway should be called');
  assert.ok(charsAtHalfway >= Math.floor(text.length / 2), 'Halfway called at or after 50% of characters');
  assert.equal(container.children[0].textContent, text, 'Typewriter must finish full text without stopping');
});

test('app.js includes battle view in is-exploring and removes encounter-scene-snapshot', async () => {
  const fs = await import('node:fs');
  const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

  assert.ok(
    appSource.includes("['route', 'transition', 'event', 'battle'].includes(viewName)") ||
    appSource.includes('["route", "transition", "event", "battle"].includes(viewName)'),
    'is-exploring must include battle'
  );
  assert.ok(
    !appSource.includes('function captureEncounterScene()'),
    'captureEncounterScene should be removed'
  );
});

test('public/battle-phase.css and public/phase8.css maintain transparent stage and no ghosting pseudo-element', async () => {
  const fs = await import('node:fs');
  const bpCss = fs.readFileSync(new URL('../public/battle-phase.css', import.meta.url), 'utf8');
  const p8Css = fs.readFileSync(new URL('../public/phase8.css', import.meta.url), 'utf8');

  assert.ok(bpCss.includes('.boss-encounter-impact-stage::before { display: none !important; }'));
  assert.ok(p8Css.includes('.boss-encounter-stage{background:transparent;}'));
  assert.ok(p8Css.includes('.boss-encounter-impact-stage::before{display:none!important;}'));
});

test('playBossIntro delays warning strip slide-in by warningRevealAt (3000ms) after warning audio starts', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const bpSource = fs.readFileSync(new URL('../public/battle-phase.js', import.meta.url), 'utf8');

  class MockElement {
    constructor() {
      this.children = [];
      this.textContent = '';
      this.classList = { add() {}, remove() {} };
      this.style = { setProperty() {} };
      this.dataset = {};
    }
    replaceChildren() { this.children = []; this.textContent = ''; }
    appendChild(child) { this.children.push(child); }
    querySelector() { return new MockElement(); }
    remove() {}
  }

  const beats = [];
  let virtualTime = 0;

  const context = {
    document: {
      getElementById: () => new MockElement(),
      createElement: () => new MockElement(),
      createTextNode: text => ({ textContent: text }),
      querySelector: () => new MockElement()
    },
    window: { matchMedia: () => ({ matches: false }) },
    matchMedia: () => ({ matches: false }),
    performance: { now: () => virtualTime },
    PRESENTATION_CONFIG: {
      bossEncounter: {
        darkenDuration: 100,
        warningRevealAt: 3000,
        warningEntry: 50,
        warningHold: 50,
        warningExit: 50,
        preBossBeat: 50,
        bossSettle: 50,
        bossHold: 50,
        character: 1
      }
    },
    sfxManager: { preload: async () => {}, duck: () => {} },
    createSfxPresentationScope: () => ({ play: async () => {}, hold: async () => {} }),
    waitForPresentation: async (ms) => {
      virtualTime += ms;
    },
    playTypewriterClick: () => {}
  };
  vm.createContext(context);
  vm.runInContext(bpSource, context);

  const timingLog = [];
  await context.playBossIntro(
    { name: '古代守護魔偶', encounterStory: '小隊沿著小徑攀爬，齒輪瘋狂運轉！' },
    {
      ...context,
      segment: 'warning',
      onTiming: (name) => {
        timingLog.push({ name, time: virtualTime });
      }
    }
  );

  const audioBeat = timingLog.find(b => b.name === 'warning_audio_start');
  const entryBeat = timingLog.find(b => b.name === 'warning_entry');

  assert.ok(audioBeat, 'warning_audio_start beat must occur');
  assert.ok(entryBeat, 'warning_entry beat must occur');
  assert.ok(
    entryBeat.time - audioBeat.time >= 3000,
    `warning_entry should occur at least 3000ms after warning_audio_start (actual difference: ${entryBeat.time - audioBeat.time}ms)`
  );
});



