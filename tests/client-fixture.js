import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual client owner with a virtual clock, including both RAFs.
// No duplicate implementation of its timing or lifecycle lives in this fixture.
const appSource = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const ownerSource = appSource.slice(
  appSource.indexOf('// Phase 1: one owner'),
  appSource.indexOf('// 1.8 渲染')
);
const typewriterSource = appSource.slice(
  appSource.indexOf('// 支援單一元素字串打字'),
  appSource.indexOf('let cinematicBannerTimeout')
);

export function fixture() {
  let now = 0;
  let nextId = 0;
  const tasks = new Map();
  const activeIntervals = new Set();
  const writes = [];
  const emissions = [];
  const errors = [];
  const sounds = [];
  const schedule = (callback, delay) => {
    const id = ++nextId;
    tasks.set(id, { callback, at: now + delay });
    return id;
  };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const advance = async duration => {
    const end = now + duration;
    await flush();
    while (true) {
      const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      tasks.delete(next[0]);
      now = next[1].at;
      next[1].callback(now);
      await flush();
    }
    now = end;
    await flush();
  };
  class Element {
    constructor() {
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.inert = false;
      this.disabled = false;
      this.listeners = new Map();
      this.closest = () => this;
      const classes = new Set(['hidden']);
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => {
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name); else classes.delete(name);
          return enabled;
        },
        contains: name => classes.has(name)
      };
    }
    set textContent(value) { this.children = [{ textContent: String(value) }]; }
    get textContent() { return this.children.map(child => child.textContent).join(''); }
    appendChild(child) {
      this.children.push(child);
      writes.push({ at: now, text: child.textContent });
    }
    replaceChildren() { this.children = []; writes.push({ at: now, text: '' }); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, fn, options) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      const wrapper = options?.once ? (...args) => { this.removeEventListener(name, wrapper); fn(...args); } : fn;
      wrapper._orig = fn;
      this.listeners.get(name).add(wrapper);
    }
    removeEventListener(name, fn) {
      const set = this.listeners.get(name);
      if (!set) return;
      for (const listener of set) {
        if (listener === fn || listener._orig === fn) {
          set.delete(listener);
        }
      }
    }
    click() {
      if (this.disabled) return;
      const set = this.listeners.get('click');
      if (set) {
        for (const fn of Array.from(set)) fn({ type: 'click' });
      }
    }
  }
  const app = new Element();
  const body = new Element();
  const elements = Object.fromEntries([
    'gameStartOverlay', 'gameTitleContainer', 'prologuePresentationContainer',
    'narrativeControls', 'btnSkipPrologue', 'btnNarrativeSpeed',
    'prologuePresBody', 'prologueSkipHint', 'floatingChatContainer', 'stageCinematicBanner',
    'floorIntroOverlay', 'floorIntroNumber', 'floorIntroTitle', 'routeAtmosphereText',
    'routeStatusText', 'routeOptionsGrid', 'routeVotersStatusList', 'routeTimerBar',
    'transitionTypewriterTitle', 'transitionRouteTag', 'transitionStoryTitle', 'transitionStoryText', 'transitionSpeedHint',
    'trapDiscoverySection', 'trapDiscoveryStory', 'trapPresentationOverlay', 'trapVictimsContainer',
    'chestDiscoverySection', 'chestDiscoveryStory', 'chestInteractionArea', 'btnOpenChest',
    'chestPresentationOverlay', 'presentationChestVisual', 'presentationRewardContent',
    'presentationRewardRarity', 'presentationRewardTitle', 'presentationRewardDesc', 'presentationRewardMeta'
  ].map(key => [key, new Element()]));
  elements.views = { route: new Element() };
  const manager = {
    isBlocking: false,
    keys: new Set(),
    hasPlayed(key) { return this.keys.has(key); },
    markPlayed(key) { this.keys.add(key); },
    setBlocking(value) { this.isBlocking = value; }
  };
  const context = vm.createContext({
    AbortController, DOMException,
    performance: { now: () => now },
    sfxManager: { play(name) { sounds.push({ name, at: now }); } },
    setTimeout: schedule,
    clearTimeout: id => tasks.delete(id),
    setInterval: (callback, delay) => {
      const intervalId = ++nextId;
      activeIntervals.add(intervalId);
      const tick = () => {
        if (!activeIntervals.has(intervalId)) return;
        callback();
        if (activeIntervals.has(intervalId)) {
          tasks.set(intervalId, { callback: tick, at: now + delay });
        }
      };
      tasks.set(intervalId, { callback: tick, at: now + delay });
      return intervalId;
    },
    clearInterval: id => {
      activeIntervals.delete(id);
      tasks.delete(id);
    },
    requestAnimationFrame: callback => schedule(callback, 16),
    cancelAnimationFrame: id => tasks.delete(id),
    document: {
      body,
      getElementById: id => elements[id] || app,
      createElement: () => new Element(),
      createTextNode: textContent => ({ textContent })
    },
    elements,
    myId: 'a',
    roomState: { state: 'PROLOGUE', leaderId:'a', currentPrologue: { paragraphs: ['甲，乙。', '丙丁！'] } },
    presentationManager: manager,
    gateDestinationView() { elements.views.route.classList.add('view-gated-hidden'); },
    revealDestinationView() { elements.views.route.classList.remove('view-gated-hidden'); },
    playSound(name) { sounds.push({ name, at: now }); }, playTypewriterClick() {},
    spawnFloatingText() {},
    renderPendingDropModal() {},
    getClassPortraitHtml: role => '<img class="portrait" alt="' + role + '">',
    getClassDisplayName: role => role,
    socket: {
      emit: (name, data, callback) => {
        emissions.push({ name, data, at: now });
        (typeof data === 'function' ? data : callback)?.({ success:true, ...data });
      },
      on() {}
    },
    console: { error: (...args) => errors.push(args) }
  });
  vm.runInContext(fs.readFileSync(new URL('../public/sfx-assets.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../public/narrative-controls.js', import.meta.url), 'utf8'), context);
  vm.runInContext(`
    let prologueCompleted = false;
    let isPrologueTyping = false;
    let prologueController = null;
    let cinematicBannerTimeout = null;
    let routePresentationController = null;
    let routeInteractionReadyKey = null;
    let trapPresentationController = null;
    let trapDisplay = null;
    let chestPresentationController = null;
    let chestDisplay = null;
    let chestRewardCompletedId = null;
    let activeNarrativeResolvers = new Set();
    let isTransitionAccelerated = false;
    let currentTypewriterTimer = null;
    let currentTypewriterContext = null;
    function showCinematicBanner() {
      cinematicBannerTimeout = setTimeout(() => { cinematicBannerTimeout = null; }, 2200);
    }
    ${typewriterSource}
    ${ownerSource}
    function waitForPresentation(...args) { return waitForPrologue(...args); }
  `, context);
  return { context, app, body, elements, manager, emissions, errors, sounds, tasks, writes, advance, flush };
}
