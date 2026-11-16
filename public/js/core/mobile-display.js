// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - 手機橫向與沉浸式全螢幕管理系統 (mobile-display.js)
// ==========================================================================
(() => {
  'use strict';

  const API_TIMEOUT_MS = 2500;
  const VIEWPORT_SETTLE_MS = 90;
  const LOCK_SETTLE_TIMEOUT_MS = 900;

  const COPY = {
    initial: {
      title: '為了您的最佳體驗',
      desc: '我們建議您將手機旋轉至橫向',
      hint: '點擊空白區域繼續',
      iosGuide: 'iPhone 請確認已關閉控制中心的「直向鎖定」，並將手機旋轉至橫向。'
    },
    iosWaiting: {
      title: '請將手機旋轉至橫向',
      desc: '請關閉「直向鎖定」後將手機橫放，偵測到橫向畫面後將自動進入遊戲。',
      hint: '旋轉完成後將自動繼續',
      iosGuide: '提示：從螢幕右上角（或底部）滑出控制中心，確認直向鎖定圖示為關閉狀態。'
    },
    requesting: {
      title: '正在切換橫向顯示',
      desc: '請稍候，正在為您準備橫向全螢幕畫面…',
      hint: '若未自動旋轉，請手動橫放手機'
    },
    manualFallback: {
      title: '請將手機旋轉至橫向',
      desc: '目前無法自動切換方向，請手動將手機橫放即可繼續遊玩。',
      hint: '偵測到橫向畫面後將自動繼續'
    }
  };

  function safeMatchMedia(query) {
    if (typeof window.matchMedia !== 'function') return false;
    try {
      return Boolean(window.matchMedia(query).matches);
    } catch {
      return false;
    }
  }

  function detectCapabilities() {
    const ua = String(window.navigator?.userAgent || '');
    const platform = String(window.navigator?.platform || '');
    const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);

    const coarsePointer =
      safeMatchMedia('(pointer: coarse)') || safeMatchMedia('(any-pointer: coarse)');
    const noHover = safeMatchMedia('(hover: none)');
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

    const isIPhone = /iPhone|iPod/i.test(ua);
    const isIOS = isIPhone || /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);

    // 避免僅靠 UA 判斷；桌面瀏覽器（具 fine pointer 與 hover）不受影響
    const isMobile = (coarsePointer && noHover) || (uaMobile && maxTouchPoints > 0);

    const root = document.documentElement;
    const hasRequestFullscreen = Boolean(
      root && (typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function')
    );
    const fullscreenEnabled = document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
    // iPhone Safari 不依賴 Element Fullscreen API
    const supportsFullscreen = isMobile && !isIPhone && hasRequestFullscreen && fullscreenEnabled;

    const orientationObj = window.screen?.orientation;
    // iPhone / iOS Safari 不依賴 screen.orientation.lock()
    const supportsOrientationLock =
      isMobile && !isIOS && Boolean(orientationObj && typeof orientationObj.lock === 'function');

    return {
      isMobile,
      isIOS,
      isIPhone,
      supportsFullscreen,
      supportsOrientationLock
    };
  }

  function isFormInputFocused() {
    const el = document.activeElement;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  function readViewportInfo() {
    const layoutWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
    const layoutHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
    const vv = window.visualViewport;
    const vvHeight = vv && Number.isFinite(vv.height) ? vv.height : layoutHeight;

    // 虛擬鍵盤開啟時 visualViewport.height 會大幅變短，避免以 visualViewport 誤判方向
    const keyboardLikelyOpen =
      isFormInputFocused() && layoutHeight > 0 && vvHeight < layoutHeight * 0.72;

    const width = layoutWidth;
    const height = layoutHeight;

    let isLandscape;
    if (keyboardLikelyOpen) {
      isLandscape = safeMatchMedia('(orientation: landscape)') || width >= height;
    } else if (width > 0 && height > 0) {
      isLandscape = width >= height;
    } else {
      isLandscape = safeMatchMedia('(orientation: landscape)');
    }

    return {
      width,
      height,
      isLandscape,
      keyboardLikelyOpen
    };
  }

  function readFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error('Operation timed out');
        err.name = 'TimeoutError';
        reject(err);
      }, ms);

      Promise.resolve(promise).then(
        (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  const state = {
    initialized: false,
    isMobile: false,
    isIOS: false,
    isIPhone: false,
    orientation: 'landscape',
    isFullscreen: false,
    phase: 'desktop-bypass',
    fullscreenUnavailable: false,
    orientationLockUnavailable: false,
    lastError: null,
    capabilities: {
      supportsFullscreen: false,
      supportsOrientationLock: false
    }
  };

  let dom = {
    overlay: null,
    title: null,
    desc: null,
    iosGuide: null,
    hint: null,
    fsSection: null,
    fsBtn: null,
    fsBtnLabel: null
  };

  let settleTimer = null;
  let lockWaitTimer = null;
  let listenersBound = false;

  function queryDom() {
    dom.overlay = document.getElementById('mobileOrientationOverlay');
    dom.title = document.getElementById('mobileOrientationTitle');
    dom.desc = document.getElementById('mobileOrientationDesc');
    dom.iosGuide = document.getElementById('mobileOrientationIosGuide');
    dom.hint = document.getElementById('mobileOrientationHint');
    dom.fsSection = document.getElementById('burgerDisplaySection');
    dom.fsBtn = document.getElementById('btnToggleFullscreen');
    dom.fsBtnLabel = document.getElementById('btnToggleFullscreenLabel');
  }

  function dispatchDisplayChange() {
    try {
      window.dispatchEvent(new CustomEvent('mobile-display:change', {
        detail: getState()
      }));
    } catch {
      // Ignore environments without CustomEvent
    }
  }

  function updateOverlayCopy(mode) {
    const copy = COPY[mode] || COPY.initial;
    if (dom.title) dom.title.textContent = copy.title;
    if (dom.desc) dom.desc.textContent = copy.desc;
    if (dom.hint) dom.hint.textContent = copy.hint;
    if (dom.iosGuide) {
      const showIosGuide = state.isIOS && Boolean(copy.iosGuide);
      dom.iosGuide.hidden = !showIosGuide;
      if (showIosGuide) {
        dom.iosGuide.textContent = copy.iosGuide;
      }
    }
  }

  function setOverlayVisible(visible) {
    if (!dom.overlay) return;
    if (visible) {
      dom.overlay.hidden = false;
      dom.overlay.setAttribute('aria-hidden', 'false');
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          if (state.orientation === 'portrait' && state.isMobile && dom.overlay) {
            dom.overlay.classList.add('is-visible');
          }
        });
      } else {
        dom.overlay.classList.add('is-visible');
      }
    } else {
      dom.overlay.classList.remove('is-visible');
      dom.overlay.setAttribute('aria-hidden', 'true');
      dom.overlay.hidden = true;
    }
  }

  function syncFullscreenButton() {
    if (!dom.fsBtn || !dom.fsSection) return;
    const showControl = state.isMobile && state.capabilities.supportsFullscreen && !state.fullscreenUnavailable;
    dom.fsSection.classList.toggle('hidden', !showControl);
    dom.fsBtn.classList.toggle('hidden', !showControl);
    if (!showControl) return;

    dom.fsBtn.setAttribute('aria-pressed', state.isFullscreen ? 'true' : 'false');
    if (dom.fsBtnLabel) {
      dom.fsBtnLabel.textContent = state.isFullscreen ? '退出全螢幕' : '進入全螢幕';
    }
    dom.fsBtn.title = state.isFullscreen ? '退出全螢幕顯示' : '進入全螢幕橫向顯示';
  }

  function clearTimers() {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (lockWaitTimer) {
      clearTimeout(lockWaitTimer);
      lockWaitTimer = null;
    }
  }

  function evaluateViewport() {
    if (!state.isMobile) {
      state.phase = 'desktop-bypass';
      setOverlayVisible(false);
      return;
    }

    const vp = readViewportInfo();
    const nextOrientation = vp.isLandscape ? 'landscape' : 'portrait';
    const prevOrientation = state.orientation;
    const prevPhase = state.phase;

    state.orientation = nextOrientation;
    state.isFullscreen = readFullscreenActive();
    syncFullscreenButton();

    if (nextOrientation === 'landscape') {
      if (lockWaitTimer) {
        clearTimeout(lockWaitTimer);
        lockWaitTimer = null;
      }
      state.phase = 'landscape-ready';
      setOverlayVisible(false);
      if (prevOrientation !== nextOrientation || prevPhase !== state.phase) {
        dispatchDisplayChange();
      }
      return;
    }

    // 直向處理：若正在進行異步全螢幕/方向請求，先維持請求狀態不閃爍
    if (state.phase === 'requesting-fullscreen' || state.phase === 'requesting-orientation') {
      setOverlayVisible(true);
      return;
    }

    if (state.phase === 'landscape-ready' || state.phase === 'desktop-bypass') {
      state.phase = 'portrait-prompt';
      updateOverlayCopy('initial');
    } else if (state.phase === 'waiting-for-landscape') {
      updateOverlayCopy(state.isIOS ? 'iosWaiting' : 'manualFallback');
    } else {
      state.phase = 'portrait-prompt';
      updateOverlayCopy('initial');
    }

    setOverlayVisible(true);
    if (prevOrientation !== nextOrientation || prevPhase !== state.phase) {
      dispatchDisplayChange();
    }
  }

  function scheduleViewportCheck() {
    if (!state.isMobile) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      evaluateViewport();
    }, VIEWPORT_SETTLE_MS);
  }

  async function requestElementFullscreen() {
    const root = document.documentElement;
    if (!root) throw new Error('Missing documentElement');

    if (typeof root.requestFullscreen === 'function') {
      return withTimeout(root.requestFullscreen(), API_TIMEOUT_MS);
    }
    if (typeof root.webkitRequestFullscreen === 'function') {
      return withTimeout(Promise.resolve(root.webkitRequestFullscreen()), API_TIMEOUT_MS);
    }
    const err = new Error('Fullscreen API not supported');
    err.name = 'NotSupportedError';
    throw err;
  }

  async function lockLandscapeOrientation() {
    const orientationObj = window.screen?.orientation;
    if (!orientationObj || typeof orientationObj.lock !== 'function') {
      const err = new Error('Screen Orientation Lock API not supported');
      err.name = 'NotSupportedError';
      throw err;
    }
    return withTimeout(orientationObj.lock('landscape'), API_TIMEOUT_MS);
  }

  async function handleOverlayTap(event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (!state.isMobile) return;
    if (state.phase === 'requesting-fullscreen' || state.phase === 'requesting-orientation') {
      return;
    }

    // iPhone Safari：不依賴 Element Fullscreen 與 orientation.lock，引導手動旋轉
    if (state.isIOS || !state.capabilities.supportsFullscreen) {
      state.phase = 'waiting-for-landscape';
      updateOverlayCopy(state.isIOS ? 'iosWaiting' : 'manualFallback');
      dispatchDisplayChange();
      evaluateViewport();
      return;
    }

    // Android / 支援 Fullscreen API：必須在使用者操作事件內直接觸發 requestFullscreen()
    state.lastError = null;
    state.phase = 'requesting-fullscreen';
    updateOverlayCopy('requesting');
    dispatchDisplayChange();

    try {
      await requestElementFullscreen();
      state.isFullscreen = readFullscreenActive();
      syncFullscreenButton();
    } catch (err) {
      state.lastError = err?.name || err?.message || 'fullscreen-rejected';
      state.fullscreenUnavailable = true;
      state.isFullscreen = readFullscreenActive();
      syncFullscreenButton();
      state.phase = 'waiting-for-landscape';
      updateOverlayCopy('manualFallback');
      dispatchDisplayChange();
      evaluateViewport();
      return;
    }

    // 全螢幕成功後，再請求鎖定橫向
    if (!state.capabilities.supportsOrientationLock) {
      state.phase = 'waiting-for-landscape';
      updateOverlayCopy('manualFallback');
      dispatchDisplayChange();
      evaluateViewport();
      return;
    }

    state.phase = 'requesting-orientation';
    dispatchDisplayChange();

    try {
      await lockLandscapeOrientation();
      state.phase = 'waiting-for-landscape';
      dispatchDisplayChange();

      // 等待實際 viewport 更新為橫向，不可假設 lock 完成即已旋轉
      evaluateViewport();
      if (state.orientation !== 'landscape') {
        if (lockWaitTimer) clearTimeout(lockWaitTimer);
        lockWaitTimer = setTimeout(() => {
          lockWaitTimer = null;
          evaluateViewport();
          if (state.orientation !== 'landscape') {
            updateOverlayCopy('manualFallback');
          }
        }, LOCK_SETTLE_TIMEOUT_MS);
      }
    } catch (err) {
      state.lastError = err?.name || err?.message || 'orientation-lock-rejected';
      state.orientationLockUnavailable = true;
      state.phase = 'waiting-for-landscape';
      updateOverlayCopy('manualFallback');
      dispatchDisplayChange();
      evaluateViewport();
    }
  }

  async function toggleFullscreen() {
    if (!state.isMobile || !state.capabilities.supportsFullscreen) return;

    if (readFullscreenActive()) {
      try {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
        } else if (typeof document.webkitExitFullscreen === 'function') {
          await document.webkitExitFullscreen();
        }
      } catch {
        // Ignore exit failures
      }
      return;
    }

    try {
      await requestElementFullscreen();
      state.isFullscreen = readFullscreenActive();
      syncFullscreenButton();
      if (state.capabilities.supportsOrientationLock && !state.orientationLockUnavailable) {
        try {
          await lockLandscapeOrientation();
        } catch {
          // 橫向遊玩中若鎖定被拒，仍允許繼續全螢幕遊玩
        }
      }
    } catch (err) {
      state.lastError = err?.name || err?.message || 'fullscreen-rejected';
      if (typeof window.showToast === 'function') {
        window.showToast('目前無法進入全螢幕，您仍可繼續橫向遊玩', 'info');
      }
    }
  }

  function blockUnderlyingInteraction(event) {
    if (!state.isMobile || state.orientation === 'landscape') return;
    event.stopPropagation();
  }

  function onFullscreenChange() {
    if (!state.isMobile) return;
    state.isFullscreen = readFullscreenActive();
    syncFullscreenButton();
    // 不可在 fullscreenchange 中未經使用者操作自動重新請求全螢幕
    scheduleViewportCheck();
    dispatchDisplayChange();
  }

  function onVisibilityChange() {
    if (!state.isMobile || document.hidden) return;
    scheduleViewportCheck();
  }

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    window.addEventListener('resize', scheduleViewportCheck, { passive: true });
    window.addEventListener('orientationchange', scheduleViewportCheck, { passive: true });
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', scheduleViewportCheck, { passive: true });
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (dom.overlay) {
      dom.overlay.addEventListener('click', handleOverlayTap);
      dom.overlay.addEventListener('pointerdown', blockUnderlyingInteraction);
      dom.overlay.addEventListener('touchstart', blockUnderlyingInteraction, { passive: true });
      dom.overlay.addEventListener('mousedown', blockUnderlyingInteraction);
    }

    if (dom.fsBtn) {
      dom.fsBtn.addEventListener('click', toggleFullscreen);
    }
  }

  function unbindListeners() {
    if (!listenersBound) return;
    listenersBound = false;

    window.removeEventListener('resize', scheduleViewportCheck);
    window.removeEventListener('orientationchange', scheduleViewportCheck);
    if (window.visualViewport && typeof window.visualViewport.removeEventListener === 'function') {
      window.visualViewport.removeEventListener('resize', scheduleViewportCheck);
    }
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    if (dom.overlay) {
      dom.overlay.removeEventListener('click', handleOverlayTap);
      dom.overlay.removeEventListener('pointerdown', blockUnderlyingInteraction);
      dom.overlay.removeEventListener('touchstart', blockUnderlyingInteraction);
      dom.overlay.removeEventListener('mousedown', blockUnderlyingInteraction);
    }

    if (dom.fsBtn) {
      dom.fsBtn.removeEventListener('click', toggleFullscreen);
    }
  }

  function init() {
    queryDom();
    const caps = detectCapabilities();

    state.initialized = true;
    state.isMobile = caps.isMobile;
    state.isIOS = caps.isIOS;
    state.isIPhone = caps.isIPhone;
    state.capabilities = {
      supportsFullscreen: caps.supportsFullscreen,
      supportsOrientationLock: caps.supportsOrientationLock
    };
    state.isFullscreen = readFullscreenActive();

    if (!state.isMobile) {
      state.phase = 'desktop-bypass';
      document.documentElement?.classList?.remove('mobile-display-active');
      setOverlayVisible(false);
      syncFullscreenButton();
      return getState();
    }

    document.documentElement?.classList?.add('mobile-display-active');
    bindListeners();

    const vp = readViewportInfo();
    state.orientation = vp.isLandscape ? 'landscape' : 'portrait';

    if (vp.isLandscape) {
      state.phase = 'landscape-ready';
      setOverlayVisible(false);
    } else {
      state.phase = 'portrait-prompt';
      updateOverlayCopy('initial');
      setOverlayVisible(true);
    }

    syncFullscreenButton();
    dispatchDisplayChange();
    return getState();
  }

  function destroy() {
    clearTimers();
    unbindListeners();
    state.initialized = false;
    document.documentElement?.classList?.remove('mobile-display-active');
    setOverlayVisible(false);
  }

  function getState() {
    return {
      initialized: state.initialized,
      isMobile: state.isMobile,
      isIOS: state.isIOS,
      isIPhone: state.isIPhone,
      orientation: state.orientation,
      isFullscreen: state.isFullscreen,
      phase: state.phase,
      fullscreenUnavailable: state.fullscreenUnavailable,
      orientationLockUnavailable: state.orientationLockUnavailable,
      lastError: state.lastError,
      capabilities: { ...state.capabilities }
    };
  }

  window.MobileDisplay = {
    init,
    destroy,
    getState,
    evaluateViewport,
    handleOverlayTap,
    toggleFullscreen
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
