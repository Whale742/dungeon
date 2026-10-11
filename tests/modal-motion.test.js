import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/modal-motion.js',import.meta.url),'utf8');
function fixture() {
  let now=0,id=0;const timers=new Map(),classes=new Set(['hidden']);
  const card=new EventTarget();
  const modal={offsetWidth:400,inert:false,attributes:{},querySelector:()=>card,
    classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},contains(name){return classes.has(name);}},
    setAttribute(key,value){this.attributes[key]=value;}};
  const window={};
  vm.runInNewContext(source,{window,getComputedStyle:()=>({getPropertyValue:()=> '300ms'}),
    setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id;},clearTimeout(key){timers.delete(key);}});
  return {modal,...window.ModalMotion,tick(ms){const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}};
}
test('Modal stays displayed but inert until the entire close animation ends',()=>{
  const f=fixture();f.show(f.modal);f.tick(10);
  assert.equal(f.modal.classList.contains('is-open'),true);
  f.hide(f.modal);assert.equal(f.modal.inert,true);
  assert.equal(f.modal.classList.contains('hidden'),false);
  f.tick(10);assert.equal(f.modal.classList.contains('is-open'),false);
  f.tick(349);assert.equal(f.modal.classList.contains('hidden'),false);
  f.tick(1);assert.equal(f.modal.classList.contains('hidden'),true);
});
test('Reopening during close cancels the stale hide timer',()=>{
  const f=fixture();f.show(f.modal);f.tick(20);f.hide(f.modal);f.tick(100);f.show(f.modal);f.tick(500);
  assert.equal(f.modal.classList.contains('hidden'),false);
  assert.equal(f.modal.classList.contains('is-open'),true);
  assert.equal(f.modal.classList.contains('is-closing'),false);
  assert.equal(f.modal.inert,false);
});
test('Closing before the opening delay cancels the open; repeated close calls cannot delay hiding',()=>{
  const f=fixture();f.show(f.modal);f.hide(f.modal);f.tick(100);f.hide(f.modal);f.tick(260);
  assert.equal(f.modal.classList.contains('is-open'),false);
  assert.equal(f.modal.classList.contains('hidden'),true);
  f.show(f.modal);f.show(f.modal);f.tick(10);
  assert.equal(f.modal.classList.contains('is-open'),true);
});
test('Only the modal card scale completion finishes closing; child or unrelated transitions do not',()=>{
  const f=fixture();f.show(f.modal);f.tick(10);f.hide(f.modal);f.tick(10);
  const card=f.modal.querySelector('.modal-card');
  const event=property=>{const e=new Event('transitionend');e.propertyName=property;return e;};
  card.dispatchEvent(event('opacity'));assert.equal(f.modal.classList.contains('hidden'),false);
  card.dispatchEvent(event('scale'));assert.equal(f.modal.classList.contains('hidden'),true);
  f.show(f.modal);f.tick(500);assert.equal(f.modal.classList.contains('hidden'),false);
});
