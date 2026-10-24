(function(global) {
  'use strict';
  function getBagUrls() {
    return {
      closed: global.assetRegistry?.resolve('ui.bag.closed', '/assets/ui/inventory/bag1.webp') || '/assets/ui/inventory/bag1.webp',
      open: global.assetRegistry?.resolve('ui.bag.open', '/assets/ui/inventory/bag2.webp') || '/assets/ui/inventory/bag2.webp'
    };
  }
  function wait(ms, signal) {
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, ms);
      signal?.addEventListener('abort', finish, { once: true });
      if (signal?.aborted) finish();
    });
  }
  async function preload(url, fallback, signal) {
    for (const candidate of [...new Set([url, fallback].filter(Boolean))]) {
      if (signal?.aborted) return null;
      const loaded = await new Promise(resolve => {
        const img = new Image();
        const finish = ok => { clearTimeout(timer); img.onload = img.onerror = null; signal?.removeEventListener('abort', abort); resolve(ok); };
        const abort = () => finish(false);
        const timer = setTimeout(abort, 5000);
        img.onload = () => finish(true);
        img.onerror = abort;
        signal?.addEventListener('abort', abort, { once: true });
        img.src = candidate;
      });
      if (loaded) return candidate;
      if (candidate === url && url !== fallback && global.assetRegistry?.markFailed) {
        global.assetRegistry.markFailed(url);
      }
    }
    return null;
  }
  async function playLootCollection({ sourceElement, container = document.body, signal, speed = 1, onStep } = {}) {
    const source = sourceElement?.matches('img,svg') ? sourceElement : sourceElement?.querySelector('img,svg');
    if (!source || signal?.aborted) return;
    const urls = getBagUrls();
    const [closed, open] = await Promise.all([
      preload(urls.closed, '/assets/ui/inventory/bag1.webp', signal), preload(urls.open, '/assets/ui/inventory/bag2.webp', signal)
    ]);
    if (!closed || !open || signal?.aborted) return;
    const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    const pause = ms => wait((reduced ? Math.min(ms, 160) : ms) / Math.max(.1, speed), signal);
    const stage = document.createElement('div');
    stage.className = 'bag-collection-stage';
    stage.setAttribute('aria-hidden', 'true');
    const actor = document.createElement('div');
    actor.className = 'bag-collection-actor';
    const bag = new Image(); bag.className = 'bag-collection-img'; bag.src = closed; bag.alt = '';
    actor.append(bag); stage.append(actor); container.append(stage);
    let animation, placeholder, oldStyle;
    const cancel = () => animation?.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    const beat = name => { stage.dataset.phase = name; onStep?.(name); };
    try {
      beat('bag_appearing');
      await pause(30); actor.classList.add('is-visible'); await pause(450);
      if (signal?.aborted) return;
      bag.src = open; actor.classList.add('is-open'); beat('bag_opening'); await pause(280);
      if (signal?.aborted) return;
      const start = source.getBoundingClientRect(), target = bag.getBoundingClientRect();
      // Coordinates are within the contained artwork, including its transparent padding.
      const natW = bag.naturalWidth || target.width || 1200;
      const natH = bag.naturalHeight || target.height || 1536;
      const scale = Math.min(target.width / natW, target.height / natH);
      const width = natW * scale, height = natH * scale;
      const dx = target.left + (target.width - width) / 2 + width * .52 - (start.left + start.width / 2);
      const dy = target.top + (target.height - height) / 2 + height * .38 - (start.top + start.height / 2);
      placeholder = document.createComment('reward artwork'); source.before(placeholder);
      oldStyle = source.getAttribute('style'); stage.append(source);
      source.classList.add('bag-flying-item');
      Object.assign(source.style, {position:'fixed', left:start.left+'px', top:start.top+'px', width:start.width+'px', height:start.height+'px', margin:'0', objectFit:'contain'});
      beat('items_flying');
      animation = source.animate(reduced ? [{opacity:1},{opacity:0}] : [
        {transform:'translate(0,0) scale(1)', opacity:1},
        {transform:`translate(${dx*.45}px,${dy*.25-35}px) scale(.75)`, opacity:1, offset:.42},
        {transform:`translate(${dx}px,${dy}px) scale(.15)`, opacity:1, offset:.86},
        {transform:`translate(${dx}px,${dy+height*.06}px) scale(.02)`, opacity:0}
      ], {duration:(reduced?160:850)/Math.max(.1,speed), easing:'cubic-bezier(.3,.05,.35,1)',fill:'forwards'});
      await animation.finished.catch(()=>{});
      if (signal?.aborted) return;
      beat('items_stored'); await pause(180);
      bag.src = closed; actor.classList.remove('is-open'); beat('bag_closing'); await pause(420);
      actor.classList.remove('is-visible'); beat('bag_disappearing'); await pause(380);
      beat('complete');
    } finally {
      signal?.removeEventListener('abort', cancel);
      animation?.cancel();
      if (placeholder) { placeholder.replaceWith(source); source.classList.remove('bag-flying-item'); if(oldStyle===null)source.removeAttribute('style');else source.setAttribute('style',oldStyle); source.style.visibility='hidden'; }
      stage.remove();
    }
  }
  async function play(options = {}) {
    const sourceElement = options.sourceElement || options.source;
    return playLootCollection({ ...options, sourceElement });
  }
  global.BagPresentation = { play, playLootCollection, getBagUrls, preload, wait };
})(window);
