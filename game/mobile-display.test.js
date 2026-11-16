import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach(n => set.add(n)),
    remove: (...names) => names.forEach(n => set.delete(n)),
    toggle: (name, force) => {
      if (force === undefined) {
        if (set.has(name)) { set.delete(name); return false; }
        set.add(name); return true;
      }
      if (force) set.add(name); else set.delete(name);
      return Boolean(force);
    },
    contains: (name) => set.has(name)
  };
}

function createNode(id, initialClasses = []) {
  const attrs = {};
  const listeners = {};
  return {
    id,
    hidden: false,
    textContent: '',
    title: '',
    tagName: 'DIV',
    classList: createClassList(initialClasses),
    attributes: attrs,
    listeners,
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatch(type, eventObj = {}) {
      const ev = {
        type,
        stopped: false,
        prevented: false,
        stopPropagation() { this.stopped = true; },
        preventDefault() { this.prevented = true; },
        ...eventObj
      };
      for (const fn of (listeners[type] || [])) {
        fn(ev);
      }
      return ev;
    }
  };
}

function createHarness({
  ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
  platform = 'Linux armv8l',
  maxTouchPoints = 5,
  coarse = true,
  noHover = true,
  innerWidth = 390,
  innerHeight = 844,
  fullscreenImpl = null,
  orientationLockImpl = null,
  hasFullscreen = true,
  hasOrientationLock = true
} = {}) {
  const nodes = new Map([
    ['mobileOrientationOverlay', createNode('mobileOrientationOverlay')],
    ['mobileOrientationTitle', createNode('mobileOrientationTitle')],
    ['mobileOrientationDesc', createNode('mobileOrientationDesc')],
    ['mobileOrientationIosGuide', createNode('mobileOrientationIosGuide')],
    ['mobileOrientationHint', createNode('mobileOrientationHint')],
    ['burgerDisplaySection', createNode('burgerDisplaySection', ['hidden'])],
    ['btnToggleFullscreen', createNode('btnToggleFullscreen', ['hidden'])],
    ['btnToggleFullscreenLabel', createNode('btnToggleFullscreenLabel')]
  ]);
  nodes.get('mobileOrientationOverlay').hidden = true;
  nodes.get('mobileOrientationIosGuide').hidden = true;

  const winListeners = {};
  const docListeners = {};
  const vvListeners = {};
  const calls = { fullscreen: 0, exitFullscreen: 0, orientationLock: [], toasts: [], events: [] };

  const documentElement = {
    clientWidth: innerWidth,
    clientHeight: innerHeight,
    classList: createClassList()
  };

  const windowObj = {
    innerWidth,
    innerHeight,
    navigator: { userAgent: ua, platform, maxTouchPoints },
    matchMedia(q) {
      if (q.includes('pointer: coarse')) return { matches: coarse };
      if (q.includes('hover: none')) return { matches: noHover };
      if (q.includes('orientation: landscape')) return { matches: windowObj.innerWidth >= windowObj.innerHeight };
      return { matches: false };
    },
    visualViewport: {
      width: innerWidth,
      height: innerHeight,
      addEventListener(type, fn) {
        vvListeners[type] = vvListeners[type] || [];
        vvListeners[type].push(fn);
      },
      removeEventListener(type, fn) {
        if (!vvListeners[type]) return;
        vvListeners[type] = vvListeners[type].filter(f => f !== fn);
      }
    },
    screen: {
      orientation: hasOrientationLock ? {
        type: innerWidth >= innerHeight ? 'landscape-primary' : 'portrait-primary',
        lock(mode) {
          calls.orientationLock.push(mode);
          if (orientationLockImpl) return orientationLockImpl(mode, windowObj, documentObj);
          return Promise.resolve();
        }
      } : undefined
    },
    requestAnimationFrame(cb) { cb(); return 1; },
    addEventListener(type, fn) {
      winListeners[type] = winListeners[type] || [];
      winListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!winListeners[type]) return;
      winListeners[type] = winListeners[type].filter(f => f !== fn);
    },
    dispatchEvent(ev) {
      calls.events.push(ev);
      return true;
    },
    showToast(msg, type) {
      calls.toasts.push({ msg, type });
    }
  };

  if (hasFullscreen) {
    documentElement.requestFullscreen = () => {
      calls.fullscreen++;
      if (fullscreenImpl) return fullscreenImpl(windowObj, documentObj);
      documentObj.fullscreenElement = documentElement;
      return Promise.resolve();
    };
  }

  const documentObj = {
    readyState: 'complete',
    hidden: false,
    activeElement: null,
    fullscreenEnabled: hasFullscreen,
    fullscreenElement: null,
    documentElement,
    getElementById: (id) => nodes.get(id) || null,
    exitFullscreen() {
      calls.exitFullscreen++;
      documentObj.fullscreenElement = null;
      return Promise.resolve();
    },
    addEventListener(type, fn) {
      docListeners[type] = docListeners[type] || [];
      docListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(f => f !== fn);
    },
    dispatchEvent(type) {
      for (const fn of (docListeners[type] || [])) fn({ type });
    }
  };

  const scope = {
    window: windowObj,
    document: documentObj,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    setTimeout,
    clearTimeout,
    console
  };
  windowObj.window = windowObj;
  windowObj.document = documentObj;

  vm.createContext(scope);
  vm.runInContext(readFileSync(new URL('../public/js/core/mobile-display.js', import.meta.url), 'utf8'), scope);

  return {
    api: windowObj.MobileDisplay,
    nodes,
    calls,
    window: windowObj,
    document: documentObj,
    setViewport(w, h, vvH = h) {
      windowObj.innerWidth = w;
      windowObj.innerHeight = h;
      documentElement.clientWidth = w;
      documentElement.clientHeight = h;
      windowObj.visualViewport.width = w;
      windowObj.visualViewport.height = vvH;
    },
    triggerResize() {
      for (const fn of (winListeners.resize || [])) fn();
    },
    triggerFullscreenChange() {
      documentObj.dispatchEvent('fullscreenchange');
    }
  };
}

test('desktop browser is untouched even with portrait viewport', () => {
  const h = createHarness({
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
    platform: 'Win32',
    maxTouchPoints: 0,
    coarse: false,
    noHover: false,
    innerWidth: 500,
    innerHeight: 900
  });
  const st = h.api.getState();
  assert.equal(st.isMobile, false);
  assert.equal(st.phase, 'desktop-bypass');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
  assert.equal(h.nodes.get('btnToggleFullscreen').classList.contains('hidden'), true);
});

test('Android portrait entry shows overlay and transitions through fullscreen + lock to landscape only after viewport updates', async () => {
  const h = createHarness({
    innerWidth: 390,
    innerHeight: 844,
    orientationLockImpl: () => Promise.resolve()
  });

  let st = h.api.getState();
  assert.equal(st.isMobile, true);
  assert.equal(st.orientation, 'portrait');
  assert.equal(st.phase, 'portrait-prompt');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);
  assert.equal(h.nodes.get('mobileOrientationTitle').textContent, '為了您的最佳體驗');
  assert.equal(h.nodes.get('mobileOrientationHint').textContent, '點擊空白區域繼續');

  // Tap overlay: requests fullscreen then orientation lock, but viewport is still portrait
  await h.api.handleOverlayTap({ stopPropagation() {}, preventDefault() {} });
  assert.equal(h.calls.fullscreen, 1);
  assert.deepEqual(h.calls.orientationLock, ['landscape']);
  st = h.api.getState();
  // Must NOT assume landscape before viewport actually updates
  assert.equal(st.phase, 'waiting-for-landscape');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);

  // Now simulate actual viewport rotation
  h.setViewport(844, 390);
  h.api.evaluateViewport();
  st = h.api.getState();
  assert.equal(st.orientation, 'landscape');
  assert.equal(st.phase, 'landscape-ready');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
});

test('Android handles requestFullscreen rejection gracefully without getting stuck', async () => {
  const h = createHarness({
    innerWidth: 390,
    innerHeight: 844,
    fullscreenImpl: () => Promise.reject(Object.assign(new Error('Denied'), { name: 'NotAllowedError' }))
  });

  await h.api.handleOverlayTap({ stopPropagation() {}, preventDefault() {} });
  let st = h.api.getState();
  assert.equal(st.fullscreenUnavailable, true);
  assert.equal(st.phase, 'waiting-for-landscape');
  assert.equal(h.calls.orientationLock.length, 0);
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);

  // User rotates manually -> playable even without fullscreen
  h.setViewport(844, 390);
  h.api.evaluateViewport();
  st = h.api.getState();
  assert.equal(st.phase, 'landscape-ready');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
});

test('Android handles screen.orientation.lock rejection without infinite retry', async () => {
  const h = createHarness({
    innerWidth: 390,
    innerHeight: 844,
    orientationLockImpl: () => Promise.reject(Object.assign(new Error('Unsupported'), { name: 'NotSupportedError' }))
  });

  await h.api.handleOverlayTap({ stopPropagation() {}, preventDefault() {} });
  const st = h.api.getState();
  assert.equal(h.calls.fullscreen, 1);
  assert.equal(h.calls.orientationLock.length, 1);
  assert.equal(st.orientationLockUnavailable, true);
  assert.equal(st.phase, 'waiting-for-landscape');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);
});

test('Android entering directly in landscape shows game immediately without forcing fullscreen', () => {
  const h = createHarness({ innerWidth: 844, innerHeight: 390 });
  const st = h.api.getState();
  assert.equal(st.orientation, 'landscape');
  assert.equal(st.phase, 'landscape-ready');
  assert.equal(h.calls.fullscreen, 0);
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
  assert.equal(h.nodes.get('btnToggleFullscreen').classList.contains('hidden'), false);
});

test('iPhone Safari guides manual rotation, never calls fullscreen or orientation.lock, and auto-hides on landscape', async () => {
  const h = createHarness({
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    innerWidth: 390,
    innerHeight: 844
  });

  let st = h.api.getState();
  assert.equal(st.isIOS, true);
  assert.equal(st.isIPhone, true);
  assert.equal(st.capabilities.supportsFullscreen, false);
  assert.equal(st.capabilities.supportsOrientationLock, false);
  assert.equal(h.nodes.get('mobileOrientationIosGuide').hidden, false);
  assert.equal(h.nodes.get('btnToggleFullscreen').classList.contains('hidden'), true);

  await h.api.handleOverlayTap({ stopPropagation() {}, preventDefault() {} });
  st = h.api.getState();
  assert.equal(h.calls.fullscreen, 0);
  assert.equal(h.calls.orientationLock.length, 0);
  assert.equal(st.phase, 'waiting-for-landscape');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);

  h.setViewport(844, 390);
  h.api.evaluateViewport();
  st = h.api.getState();
  assert.equal(st.phase, 'landscape-ready');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
});

test('mid-game orientation switch landscape -> portrait -> landscape toggles overlay without resetting state', () => {
  const h = createHarness({ innerWidth: 844, innerHeight: 390 });
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);

  h.setViewport(390, 844);
  h.api.evaluateViewport();
  assert.equal(h.api.getState().orientation, 'portrait');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, false);

  // Underlying touch/pointer events are stopped when overlay is active
  const ev = h.nodes.get('mobileOrientationOverlay').dispatch('pointerdown');
  assert.equal(ev.stopped, true);

  h.setViewport(844, 390);
  h.api.evaluateViewport();
  assert.equal(h.api.getState().orientation, 'landscape');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
});

test('exiting fullscreen while landscape keeps game playable and does not auto-re-request fullscreen', async () => {
  const h = createHarness({ innerWidth: 844, innerHeight: 390 });
  await h.api.toggleFullscreen();
  assert.equal(h.calls.fullscreen, 1);
  assert.equal(h.api.getState().isFullscreen, true);
  assert.equal(h.nodes.get('btnToggleFullscreenLabel').textContent, '退出全螢幕');

  // Simulate user exiting fullscreen via system gesture
  h.document.fullscreenElement = null;
  h.triggerFullscreenChange();
  assert.equal(h.calls.fullscreen, 1); // No auto re-request
  assert.equal(h.api.getState().isFullscreen, false);
  assert.equal(h.api.getState().phase, 'landscape-ready');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
  assert.equal(h.nodes.get('btnToggleFullscreenLabel').textContent, '進入全螢幕');
});

test('virtual keyboard shrinking visualViewport in landscape does not trigger portrait overlay', () => {
  const h = createHarness({ innerWidth: 844, innerHeight: 390 });
  h.document.activeElement = { tagName: 'INPUT', isContentEditable: false };
  h.setViewport(844, 390, 160);
  h.api.evaluateViewport();
  assert.equal(h.api.getState().orientation, 'landscape');
  assert.equal(h.nodes.get('mobileOrientationOverlay').hidden, true);
});
