/**
 * Dungeon Abyss — Bag Loot Collection Presentation
 * Integrates bag1.webp and bag2.webp for reward collection animation.
 */
(function(global) {
  'use strict';

  function getBagUrls() {
    const closed = (global.assetRegistry && typeof global.assetRegistry.resolve === 'function')
      ? global.assetRegistry.resolve('ui.bag.closed', '/assets/bag1.webp')
      : '/assets/bag1.webp';
    const open = (global.assetRegistry && typeof global.assetRegistry.resolve === 'function')
      ? global.assetRegistry.resolve('ui.bag.open', '/assets/bag2.webp')
      : '/assets/bag2.webp';
    return { closed, open };
  }

  function waitMs(ms, signal) {
    if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function playBagSfx(key) {
    if (typeof global.playSound === 'function') {
      try { global.playSound(key); } catch {}
    }
  }

  function createFlyingProxy(item, sourceRect) {
    const proxy = document.createElement('div');
    proxy.className = 'bag-flying-proxy';
    
    const itemName = item?.name || (typeof item === 'string' ? item : '戰利品');
    const itemIcon = item?.icon || (typeof global.renderItemIconHtml === 'function' ? global.renderItemIconHtml(item) : '');
    
    proxy.innerHTML = `
      <div class="flying-card-inner">
        ${itemIcon ? `<span class="flying-card-icon">${itemIcon}</span>` : ''}
        <span>【${itemName}】</span>
      </div>
    `;

    const startX = sourceRect ? (sourceRect.left + sourceRect.width / 2) : (window.innerWidth / 2);
    const startY = sourceRect ? (sourceRect.top + sourceRect.height / 2) : (window.innerHeight / 2 - 50);

    proxy.style.left = `${startX}px`;
    proxy.style.top = `${startY}px`;
    proxy.style.transform = 'translate(-50%, -50%)';

    return { proxy, startX, startY };
  }

  async function playLootCollection(options = {}) {
    const {
      items = [],
      sourceElement = null,
      container = document.body,
      signal = null,
      speed = 1.0,
      pillText = '已收納入行囊',
      onStep = null
    } = options;

    if (signal?.aborted) return;

    const normalizedItems = Array.isArray(items)
      ? items.filter(Boolean)
      : (items ? [items] : []);

    if (normalizedItems.length === 0) return;

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { closed: closedUrl, open: openUrl } = getBagUrls();

    // 預載兩張圖片確保無白塊延遲
    [closedUrl, openUrl].forEach(url => {
      const img = new Image();
      img.src = url;
    });

    const stage = document.createElement('div');
    stage.className = 'bag-collection-stage';
    stage.setAttribute('aria-hidden', 'true');

    const actor = document.createElement('div');
    actor.className = 'bag-collection-actor';

    const aura = document.createElement('div');
    aura.className = 'bag-collection-aura';

    const bagImg = document.createElement('img');
    bagImg.className = 'bag-collection-img';
    bagImg.src = closedUrl;
    bagImg.alt = '';

    const pill = document.createElement('div');
    pill.className = 'bag-storage-pill';
    pill.textContent = pillText;

    actor.appendChild(aura);
    actor.appendChild(bagImg);
    actor.appendChild(pill);
    stage.appendChild(actor);
    container.appendChild(stage);

    const cleanup = () => {
      stage.remove();
    };

    if (signal) {
      signal.addEventListener('abort', cleanup, { once: true });
    }

    const wait = ms => waitMs(Math.round(ms / speed), signal);

    try {
      onStep?.('bag_appearing');
      // STEP 1: 背包從下方平滑滑入 (bag1.webp 關閉狀態)
      await wait(30);
      actor.classList.add('is-visible');
      await wait(380);

      if (signal?.aborted) return;

      onStep?.('bag_opening');
      // STEP 2: 背包開啟 (切換為 bag2.webp，光暈與彈跳)
      bagImg.src = openUrl;
      actor.classList.add('is-open');
      playBagSfx('swoosh');
      await wait(240);

      if (signal?.aborted) return;

      // STEP 3: 物品飛入背包
      onStep?.('items_flying');
      const actorRect = actor.getBoundingClientRect();
      const targetX = actorRect.left + actorRect.width / 2;
      const targetY = actorRect.top + actorRect.height * 0.35; // 開口中心位置

      let sourceRect = null;
      if (sourceElement && typeof sourceElement.getBoundingClientRect === 'function') {
        sourceRect = sourceElement.getBoundingClientRect();
      }

      for (let i = 0; i < normalizedItems.length; i++) {
        if (signal?.aborted) break;
        const item = normalizedItems[i];
        const { proxy, startX, startY } = createFlyingProxy(item, sourceRect);
        stage.appendChild(proxy);

        playBagSfx('reward_common');

        const deltaX = targetX - startX;
        const deltaY = targetY - startY;
        const midX = deltaX * 0.5;
        const midY = deltaY * 0.3 - 60; // 拋物線向上拱弧

        if (!isReducedMotion && typeof proxy.animate === 'function') {
          const anim = proxy.animate([
            { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${midX}px), calc(-50% + ${midY}px)) scale(0.85) rotate(-6deg)`, opacity: 0.95, offset: 0.45 },
            { transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.12) rotate(12deg)`, opacity: 0 }
          ], {
            duration: Math.round(520 / speed),
            easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)',
            fill: 'forwards'
          });
          await anim.finished.catch(() => {});
        } else {
          await wait(220);
        }

        proxy.remove();
        if (i < normalizedItems.length - 1) {
          await wait(120);
        }
      }

      if (signal?.aborted) return;

      onStep?.('bag_closing');
      // STEP 4: 飛入完成，背包關閉 (切換回 bag1.webp，搖晃/收納完成反饋)
      actor.classList.remove('is-open');
      bagImg.src = closedUrl;
      actor.classList.add('is-wobble');
      pill.classList.add('is-visible');
      playBagSfx('click');
      await wait(380);

      if (signal?.aborted) return;

      onStep?.('bag_disappearing');
      // STEP 5: 背包淡出縮回底部
      actor.classList.remove('is-visible', 'is-wobble');
      actor.classList.add('is-exiting');
      pill.classList.remove('is-visible');
      await wait(360);

      onStep?.('complete');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[BagPresentation] Error:', err);
      }
    } finally {
      cleanup();
    }
  }

  global.BagPresentation = {
    playLootCollection,
    getBagUrls
  };
})(window);
