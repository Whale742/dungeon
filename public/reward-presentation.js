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
      if (!rewardData) return;
      // Item merging: identical items in queue are grouped with count
      const existing = this.queue.find(r => (
        r.type === 'item' &&
        rewardData.type === 'item' &&
        ((r.item?.id && r.item?.id === rewardData.item?.id) || (r.item?.name && r.item?.name === rewardData.item?.name))
      ));

      if (existing) {
        existing.count = (existing.count || 1) + (rewardData.count || 1);
      } else {
        this.queue.push({ ...rewardData, count: rewardData.count || 1 });
      }

      if (!this.isPlaying) {
        this.playNext();
      }
    }

    skip() {
      this.skipRequested = true;
      if (this.currentController) {
        this.currentController.abort();
      }
    }

    async playNext() {
      if (this.queue.length === 0) {
        this.isPlaying = false;
        return;
      }
      this.isPlaying = true;
      const current = this.queue.shift();
      this.currentController = new AbortController();
      this.skipRequested = false;

      try {
        await this.present(current, this.currentController.signal);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('RewardPresentation error:', err);
      } finally {
        this.currentController = null;
        this.playNext();
      }
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
            <button type="button" class="btn-skip-reward" aria-label="跳過演出">跳過演出 ›</button>
            <div class="reward-rarity-badge"></div>
            <div class="reward-title"></div>
            <div class="reward-desc"></div>
            <div class="reward-meta"></div>
          </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.btn-skip-reward')?.addEventListener('click', () => this.skip());
      }

      const card = overlay.querySelector('.reward-presentation-card');
      const rarityBadge = overlay.querySelector('.reward-rarity-badge');
      const titleEl = overlay.querySelector('.reward-title');
      const descEl = overlay.querySelector('.reward-desc');
      const metaEl = overlay.querySelector('.reward-meta');

      const isRare = Boolean(reward.item && (reward.item.isSpecial || reward.item.rarity === 'rare' || reward.item.tier === 2 || reward.item.slot === 'CLASS_EXCLUSIVE'));
      const countSuffix = (reward.count && reward.count > 1) ? ` × ${reward.count}` : '';

      if (reward.type === 'gold') {
        rarityBadge.textContent = '【冒險財富】';
        rarityBadge.className = 'reward-rarity-badge is-gold';
        titleEl.textContent = `+${reward.amount} G 金幣`;
        descEl.textContent = reward.desc || '獲得了戰利品金幣！';
        metaEl.textContent = reward.meta || '';
        if (typeof global.playSound === 'function') global.playSound('victory');
      } else {
        rarityBadge.textContent = isRare ? '【稀有戰利品】' : '【獲得物品】';
        rarityBadge.className = `reward-rarity-badge ${isRare ? 'is-rare' : 'is-common'}`;
        titleEl.textContent = `【${reward.item?.name || '神秘物品'}】${countSuffix}`;
        descEl.textContent = reward.item?.desc || reward.desc || '';
        metaEl.textContent = reward.meta || (reward.title || '戰利品已妥善存入背包！');
        if (typeof global.playSound === 'function') global.playSound(isRare ? 'reward_rare' : 'reward_common');
      }

      overlay.classList.remove('hidden');
      overlay.classList.add('is-open');

      const duration = reducedMotion ? 200 : (isRare ? 1600 : 1100);

      const wait = (ms) => new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

      await wait(duration);

      overlay.classList.remove('is-open');
      overlay.classList.add('hidden');
    }
  }

    global.RewardQueueManager = RewardQueueManager;
    global.RewardPresentation = new RewardQueueManager();
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { RewardQueueManager, RewardPresentation: global.RewardPresentation };
    }
  })(typeof window !== 'undefined' ? window : globalThis);
