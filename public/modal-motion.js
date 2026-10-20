(function(global) {
  'use strict';
  const states=new WeakMap();
  const delay=10;
  function stateFor(modal) {
    if(!states.has(modal))states.set(modal,{phase:'closed',trigger:null,finish:null,card:null,onEnd:null});
    return states.get(modal);
  }
  function cancel(state) {
    clearTimeout(state.trigger);clearTimeout(state.finish);
    if(state.onEnd)state.card?.removeEventListener('transitionend',state.onEnd);
    state.trigger=null;state.finish=null;
    state.onEnd=null;state.card=null;
  }
  function duration(modal) {
    const value=getComputedStyle(modal).getPropertyValue('--modal-motion-duration').trim();
    const number=parseFloat(value);
    return Number.isFinite(number)?number*(value.endsWith('ms')?1:1000):300;
  }
  function show(modal) {
    if(!modal)return;
    const state=stateFor(modal);
    if(state.phase==='open'||state.phase==='opening')return;
    const reopening=state.phase==='closing';
    cancel(state);state.phase='opening';
    modal.classList.remove('hidden','is-closing');
    modal.inert=false;modal.setAttribute('aria-hidden','false');
    if(!reopening)modal.classList.remove('is-open');
    if(modal.id==='inventoryModal'&&typeof global.updateHudInventoryButtonState==='function')global.updateHudInventoryButtonState();
    // Commit the initial blur/scale before the delayed transition starts.
    void modal.offsetWidth;
    state.trigger=setTimeout(()=>{
      modal.classList.add('is-open');state.phase='open';state.trigger=null;
      if(modal.id==='inventoryModal'&&typeof global.updateHudInventoryButtonState==='function')global.updateHudInventoryButtonState();
    },delay);
  }
  function hide(modal) {
    if(!modal)return;
    const state=stateFor(modal);
    if(modal.classList.contains('hidden')||state.phase==='closing')return;
    cancel(state);state.phase='closing';
    modal.classList.add('is-closing');
    modal.inert=true;modal.setAttribute('aria-hidden','true');
    if(modal.id==='inventoryModal'&&typeof global.updateHudInventoryButtonState==='function')global.updateHudInventoryButtonState();
    void modal.offsetWidth;
    state.trigger=setTimeout(()=>{
      const finish=()=>{
        cancel(state);
        modal.classList.add('hidden');modal.classList.remove('is-closing');
        state.phase='closed';
        if(modal.id==='inventoryModal'&&typeof global.updateHudInventoryButtonState==='function')global.updateHudInventoryButtonState();
      };
      state.card=modal.querySelector('.modal-card');
      state.onEnd=event=>{
        if(event.target===state.card&&event.propertyName==='scale')finish();
      };
      state.card?.addEventListener('transitionend',state.onEnd);
      modal.classList.remove('is-open');state.trigger=null;
      // No transition event fires when closed before opening, or when animations are disabled.
      state.finish=setTimeout(finish,duration(modal)+50);
    },delay);
  }
  global.ModalMotion={show,hide};
})(window);
