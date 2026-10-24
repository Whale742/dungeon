(function(global) {
  'use strict';

  class RewardQueueManager {
    constructor() {
      this.queue = [];
      this.isPlaying = false;
      this.currentController = null;
      this.skipRequested = false;
    }

    enqueue(rewardData) {
      if (!rewardData) return Promise.resolve();
      return new Promise(resolve => {
        this.queue.push({ ...rewardData, complete: resolve });
        if (!this.isPlaying) void this.playNext();
      });
    }
    skip() { this.currentController?.abort(); }
    cancel() {
      this.queue.splice(0).forEach(reward => reward.complete());
      this.skip();
    }
    async playNext() {
      if (this.isPlaying) return;
      this.isPlaying = true;
      try {
        while (this.queue.length) {
          const reward = this.queue.shift();
          const controller = new AbortController();
          this.currentController = controller;
          const abort = () => controller.abort();
          reward.signal?.addEventListener('abort', abort, {once:true});
          try {
            if (!reward.signal?.aborted) await this.present(reward, controller.signal);
          } catch (error) {
            if (error.name !== 'AbortError') console.error('RewardPresentation:', error);
          } finally {
            reward.signal?.removeEventListener('abort', abort);
            reward.complete();
            this.currentController = null;
          }
        }
      } finally { this.isPlaying = false; }
    }

    async present(reward, signal) {
      const reducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let overlay = document.getElementById('rewardPresentationOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rewardPresentationOverlay';
        overlay.className = 'reward-presentation-overlay hidden';
        overlay.innerHTML = `
          <div class="reward-presentation-card" role="dialog" aria-modal="true" aria-label="獲得獎勵">
            <div class="reward-beams">
              <span class="reward-beam"></span>
              <span class="reward-beam"></span>
              <span class="reward-beam"></span>
            </div>
            <div class="reward-halo"></div>
            <button type="button" class="btn-skip-reward" aria-label="跳過演出">跳過演出 ›</button>
            <div class="reward-visual"></div>
            <div class="reward-rarity-badge"></div>
            <h2 class="reward-title"></h2>
            <div class="reward-desc"></div>
            <div class="reward-meta"></div>
          </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.btn-skip-reward')?.addEventListener('click', () => this.skip());
      }

      const card = overlay.querySelector('.reward-presentation-card');
      const visualEl = overlay.querySelector('.reward-visual');
      const rarityBadge = overlay.querySelector('.reward-rarity-badge');
      const titleEl = overlay.querySelector('.reward-title');
      const descEl = overlay.querySelector('.reward-desc');
      const metaEl = overlay.querySelector('.reward-meta');

      const isRare = Boolean(reward.item && (reward.item.isSpecial || reward.item.rarity === 'rare' || reward.item.tier === 2 || reward.item.slot === 'CLASS_EXCLUSIVE'));
      const countSuffix = (reward.count && reward.count > 1) ? ` × ${reward.count}` : '';

      if (reward.type === 'gold') {
        if (visualEl) {
          visualEl.innerHTML = `<svg class="svg-icon" style="width:72px;height:72px;color:var(--gold,#dfcf9e);"><use href="#icon-gold"></use></svg>`;
        }
        rarityBadge.textContent = '冒險財富';
        rarityBadge.className = 'reward-rarity-badge is-gold';
        titleEl.textContent = `+${reward.amount} G 金幣`;
        descEl.textContent = reward.desc || '獲得了戰利品金幣！';
        metaEl.textContent = reward.meta || '已存入小隊金庫';
        if (typeof global.playSound === 'function') global.playSound('reward_common');
      } else {
        const fallback = reward.item?.icon?.startsWith('/')
          ? reward.item.icon.replace(/^\/?assets\/assets\//, '/assets/')
          : '/assets/Equipments/' + encodeURIComponent(reward.item?.name || '') + '.webp';
        const url = global.assetRegistry?.resolvePath(fallback) || fallback;
        const loaded = await global.BagPresentation.preload(url, fallback, signal);
        visualEl.replaceChildren();
        if (loaded) {
          const image = new Image(); image.src = loaded; image.alt = reward.item?.name || '';
          visualEl.append(image);
        } else {
          visualEl.innerHTML = '<svg class="svg-icon"><use href="#icon-chest"></use></svg>';
        }
        rarityBadge.textContent = isRare ? 'RARE LOOT ACQUIRED' : 'EQUIPMENT ACQUIRED';
        rarityBadge.className = `reward-rarity-badge ${isRare ? 'is-rare' : 'is-common'}`;
        titleEl.textContent = `${reward.item?.name || '神秘物品'}${countSuffix}`;
        descEl.textContent = reward.item?.desc || reward.desc || '';
        metaEl.textContent = reward.depositTarget === 'overflow' ? '背包已滿，待整理' : (reward.meta || reward.title || '獲得戰利品');
        if (typeof global.playSound === 'function') global.playSound(isRare ? 'reward_rare' : 'reward_common');
      }

      if (signal.aborted) return;
      overlay.classList.remove('hidden');
      overlay.classList.add('is-open');
      const wait = ms => global.BagPresentation.wait(ms / (reward.speed || 1), signal);
      try {
        reward.onStep?.('reward_reveal');
        await wait(reducedMotion ? 200 : (reward.type === 'gold' ? 800 : (isRare ? 1600 : 1100)));
        if (!signal.aborted && reward.type !== 'gold' && (['squad','personal'].includes(reward.depositTarget) || !reward.depositTarget)) {
          await global.BagPresentation.playLootCollection({ sourceElement:visualEl, container:overlay,
            signal, speed:reward.speed, onStep:reward.onStep });
        }
      } finally {
        overlay.remove();
      }

    }
  }

    global.RewardQueueManager = RewardQueueManager;
    global.RewardPresentation = new RewardQueueManager();
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { RewardQueueManager, RewardPresentation: global.RewardPresentation };
    }
  })(typeof window !== 'undefined' ? window : globalThis);
