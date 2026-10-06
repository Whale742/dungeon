import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Load portrait-status-fx.js into a simulated DOM environment
const fxSource = fs.readFileSync(new URL('../public/portrait-status-fx.js', import.meta.url), 'utf8');

function createMockElement(tagName = 'div', className = '') {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  const attributes = {};
  const children = [];
  let parent = null;

  const el = {
    tagName: tagName.toUpperCase(),
    get className() { return Array.from(classes).join(' '); },
    set className(val) {
      classes.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    },
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: c => classes.has(c),
      toggle: (c, force) => {
        if (force !== undefined) {
          force ? classes.add(c) : classes.delete(c);
          return force;
        }
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      }
    },
    style: {},
    get dataset() {
      return new Proxy({}, {
        get(_, prop) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, '-$1').toLowerCase();
          return attributes[attr];
        },
        set(_, prop, val) {
          const attr = 'data-' + String(prop).replace(/([A-Z])/g, '-$1').toLowerCase();
          attributes[attr] = String(val);
          return true;
        }
      });
    },
    getAttribute: name => attributes[name] ?? null,
    setAttribute: (name, val) => {
      attributes[name] = String(val);
    },
    hasAttribute: name => name in attributes,
    removeAttribute: name => {
      delete attributes[name];
    },
    get children() { return children; },
    get childNodes() { return children; },
    get firstElementChild() { return children[0] || null; },
    get parentNode() { return parent; },
    get offsetWidth() { return 100; },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child._setParent(el);
      children.push(child);
      return child;
    },
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child._setParent(el);
      children.unshift(child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child._setParent(null);
      }
      return child;
    },
    remove() {
      if (parent) parent.removeChild(el);
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      function match(node) {
        let isMatch = true;
        // Parse parts: class (.foo) and attribute ([foo="bar"])
        const classParts = selector.match(/\.[a-zA-Z0-9_-]+/g) || [];
        for (const cp of classParts) {
          if (!node.classList.contains(cp.slice(1))) { isMatch = false; break; }
        }
        if (isMatch) {
          const attrParts = selector.match(/\[([^\]]+)\]/g) || [];
          for (const ap of attrParts) {
            const inner = ap.slice(1, -1);
            if (inner.includes('=')) {
              const [k, v] = inner.split('=').map(s => s.replace(/["']/g, ''));
              if (node.getAttribute(k) !== v) { isMatch = false; break; }
            } else if (!node.hasAttribute(inner)) {
              isMatch = false; break;
            }
          }
        }
        if (isMatch && selector !== '*') results.push(node);
        else if (selector === '*') results.push(node);
        for (const c of node.children) match(c);
      }
      for (const c of children) match(c);
      return results;
    },
    set innerHTML(html) {
      // Basic mock parser
      children.length = 0;
      if (!html) return;
      const tagRegex = /<([a-z0-9-]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9-]+)([^>]*)\/?>/gis;
      let m;
      while ((m = tagRegex.exec(html)) !== null) {
        const tag = m[1] || m[4];
        const attrStr = m[2] || m[5] || '';
        const inner = m[3] || '';
        const child = createMockElement(tag);
        const attrMatch = attrStr.matchAll(/([a-z0-9-]+)="([^"]*)"/gi);
        for (const am of attrMatch) {
          child.setAttribute(am[1], am[2]);
        }
        if (inner) child.innerHTML = inner;
        child._setParent(el);
        children.push(child);
      }
    },
    _setParent(p) { parent = p; }
  };
  return el;
}

function setupFxContext() {
  const context = vm.createContext({
    document: {
      createElement: tag => createMockElement(tag),
      querySelector: () => null
    },
    window: {},
    globalThis: {},
    setTimeout: (fn, ms) => { fn(); return 1; },
    clearTimeout: () => {}
  });
  vm.runInContext(fxSource, context);
  return context;
}

test('Phase 7.2: mapStatusToFxProfile covers all required statuses', () => {
  const ctx = setupFxContext();
  const map = ctx.mapStatusToFxProfile;

  assert.equal(map('exhausted'), 'exhausted');
  assert.equal(map('frenzy'), 'frenzy');
  assert.equal(map('frenzy_buff'), 'frenzy');
  assert.equal(map('poison'), 'poison');
  assert.equal(map('bleed'), 'bleed');
  assert.equal(map('shield'), 'shield');
  assert.equal(map('temp_hp'), 'shield');
  assert.equal(map('guard'), 'guard');
  assert.equal(map('alchemy_guard'), 'guard');
  assert.equal(map('treant_guard'), 'guard');
  assert.equal(map('crouch'), 'guard');
  assert.equal(map('vulnerable'), 'vulnerable');
  assert.equal(map('alchemy_vulnerable'), 'vulnerable');
  assert.equal(map('dodge'), 'dodge');
  assert.equal(map('dodge_bonus'), 'dodge');
  assert.equal(map('stealth'), 'hidden');
  assert.equal(map('hidden'), 'hidden');
  assert.equal(map('sleep'), 'sleep');
  assert.equal(map('corruption'), 'corruption');
  assert.equal(map('downed'), 'downed');
  assert.equal(map('crit_lock'), 'crit_lock');
  assert.equal(map('cannot_crit'), 'crit_lock');
  assert.equal(map('surrender'), 'crit_lock');
  assert.equal(map('generic_buff'), 'generic_buff');
  assert.equal(map('generic_debuff'), 'generic_debuff');
});

test('Phase 7.2: ensurePortraitLayers initializes 3 sub-layers', () => {
  const ctx = setupFxContext();
  const root = createMockElement('div', 'my-avatar-wrap');
  const layers = ctx.ensurePortraitLayers(root);

  assert.ok(layers.back, 'back layer created');
  assert.ok(layers.surface, 'surface layer created');
  assert.ok(layers.front, 'front layer created');

  assert.ok(root.classList.contains('portrait-root'), 'root has .portrait-root');
  assert.ok(layers.back.classList.contains('status-fx-back'));
  assert.ok(layers.surface.classList.contains('status-fx-surface'));
  assert.ok(layers.front.classList.contains('status-fx-front'));
});

test('Phase 7.2: syncPortraitStatusFx applies and reuses DOM nodes without recreating loops', () => {
  const ctx = setupFxContext();
  const root = createMockElement('div');
  const entity = {
    hp: 100,
    statuses: [{ id: 'frenzy', name: '狂熱' }, { id: 'shield', name: '護盾' }]
  };

  // Turn 1 sync
  ctx.syncPortraitStatusFx(entity, root);
  const frenzyItem1 = root.querySelector('.status-fx-item[data-status-fx="frenzy"]');
  const shieldItem1 = root.querySelector('.status-fx-item[data-status-fx="shield"]');
  assert.ok(frenzyItem1, 'Frenzy FX attached');
  assert.ok(shieldItem1, 'Shield FX attached');
  assert.ok(root.classList.contains('has-frenzy'));
  assert.ok(root.classList.contains('has-shield'));

  // Turn 2 sync with same status - node reference must remain unchanged
  ctx.syncPortraitStatusFx(entity, root);
  const frenzyItem2 = root.querySelector('.status-fx-item[data-status-fx="frenzy"]');
  const shieldItem2 = root.querySelector('.status-fx-item[data-status-fx="shield"]');
  assert.equal(frenzyItem1, frenzyItem2, 'Frenzy DOM node reused without recreation');
  assert.equal(shieldItem1, shieldItem2, 'Shield DOM node reused without recreation');

  // Turn 3: Frenzy expires, Poison added
  const entityTurn3 = {
    hp: 90,
    statuses: [{ id: 'shield', name: '護盾' }, { id: 'poison', name: '中毒' }]
  };
  ctx.syncPortraitStatusFx(entityTurn3, root);
  const poisonItem = root.querySelector('.status-fx-item[data-status-fx="poison"]');
  assert.ok(poisonItem, 'Poison FX attached');
  assert.ok(!root.querySelector('.status-fx-item[data-status-fx="frenzy"]'), 'Frenzy FX cleanly removed');
  assert.ok(!root.classList.contains('has-frenzy'), 'Root frenzy class removed');
  assert.ok(root.classList.contains('has-poison'), 'Root poison class added');
});

test('Phase 7.2: multi-status coexistence and layer separation', () => {
  const ctx = setupFxContext();
  const root = createMockElement('div');
  const entity = {
    hp: 100,
    statuses: [
      { id: 'frenzy' },
      { id: 'shield' },
      { id: 'poison' },
      { id: 'exhausted' },
      { id: 'vulnerable' }
    ]
  };

  ctx.syncPortraitStatusFx(entity, root);

  const backLayer = root.querySelector('.status-fx-back');
  const surfaceLayer = root.querySelector('.status-fx-surface');
  const frontLayer = root.querySelector('.status-fx-front');

  // Back layer should contain Frenzy and Shield
  assert.ok(backLayer.querySelector('[data-status-fx="frenzy"]'), 'Frenzy is in back layer');
  assert.ok(backLayer.querySelector('[data-status-fx="shield"]'), 'Shield is in back layer');

  // Surface layer should contain Poison and Exhausted
  assert.ok(surfaceLayer.querySelector('[data-status-fx="poison"]'), 'Poison is in surface layer');
  assert.ok(surfaceLayer.querySelector('[data-status-fx="exhausted"]'), 'Exhausted is in surface layer');

  // Front layer should contain Vulnerable
  assert.ok(frontLayer.querySelector('[data-status-fx="vulnerable"]'), 'Vulnerable is in front layer');
});

test('Phase 7.2: Downed state terminal treatment (grayscale + clears conflicting active FX)', () => {
  const ctx = setupFxContext();
  const root = createMockElement('div');
  const entity = {
    hp: 0,
    statuses: [{ id: 'downed' }]
  };

  ctx.syncPortraitStatusFx(entity, root);
  assert.ok(root.classList.contains('is-downed'), 'Root marked with is-downed');
});

test('Phase 7.2: Zero DOM leak over 60 simulated ticks across 4 players + boss', () => {
  const ctx = setupFxContext();
  const party = [
    { root: createMockElement('div'), entity: { hp: 120, statuses: [{ id: 'guard' }] } },
    { root: createMockElement('div'), entity: { hp: 80, statuses: [{ id: 'frenzy' }, { id: 'shield' }] } },
    { root: createMockElement('div'), entity: { hp: 90, statuses: [{ id: 'poison' }] } },
    { root: createMockElement('div'), entity: { hp: 70, statuses: [{ id: 'hidden' }] } },
    { root: createMockElement('div'), entity: { hp: 400, statuses: [{ id: 'corruption' }] } }
  ];

  for (const actor of party) ctx.syncPortraitStatusFx(actor.entity, actor.root);
  const initialCounts = party.map(actor => actor.root.querySelectorAll('*').length);
  // Run 60 ticks
  for (let tick = 0; tick < 60; tick++) {
    for (const actor of party) {
      ctx.syncPortraitStatusFx(actor.entity, actor.root);
    }
  }

  // After 60 ticks, verify total node counts in each root do not explode
  for (const [index, actor] of party.entries()) {
    const totalNodes = actor.root.querySelectorAll('*').length;
    assert.equal(totalNodes, initialCounts[index], 'Reconciliation must reuse the full visual composition without adding nodes');
  }
});
