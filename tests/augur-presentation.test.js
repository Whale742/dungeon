import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildAugurLabScenes} from '../scripts/build-augur-lab.mjs';

const source=fs.readFileSync(new URL('../public/augur-presentation.js',import.meta.url),'utf8');
function fixture(reduced=false) {
  const context=vm.createContext({});vm.runInContext(source,context);
  const image={style:{},getAttribute(name){return this[name];}},label={};
  const engine=Object.create(vm.runInContext('AugurPresentationEngine.prototype',context));
  const frames=[];
  Object.assign(engine,{reduced,container:{querySelector:selector=>selector==='#augurOrbTarget'?image:label},
    runFrames(duration,render){return new Promise(resolve=>frames.push({duration,render,resolve}));}});
  return {context,engine,image,label,frames};
}

test('opening observation starts with an empty orb; binding and reselection preserve the old target',()=>{
  const {context}=fixture(),scenes=buildAugurLabScenes();
  for(const [id,initial] of [['augur_observe',true],['augur_bind',false],['augur_reobserve',false],['augur_bind_solo',false]]) {
    const plan=context.buildAugurPresentationPlan(scenes[id].steps[0]);
    assert.equal(plan.initialObservation,initial,id);
  }
});

for(const reduced of [false,true])test(`target dissolves before the replacement gathers (reduced=${reduced})`,async()=>{
  const {engine,image,label,frames}=fixture(reduced);
  const snapshot={players:[{id:'old',name:'戰士',role:'warrior'},{id:'new',name:'智者',role:'sage'}]};
  engine.setObservedTarget('old',snapshot);
  const playback=engine.transitionObservedTarget('new',snapshot),frame=frames[0];
  const sample=ms=>frame.render(ms/frame.duration,ms/1000),dissolve=reduced?120:360;
  assert(image.src.includes('Warrior'));assert.equal(Number(image.style.opacity),.82);
  sample(dissolve/2);
  assert(image.src.includes('Warrior'));assert(Number(image.style.opacity)>0 && Number(image.style.opacity)<.82);
  assert.equal(parseFloat(image.style.filter.slice(5))>0,!reduced);
  sample(dissolve);
  assert(image.src.includes('智者'));assert.equal(Number(image.style.opacity),0);assert.equal(label.textContent,'智者');
  sample(dissolve+70+(frame.duration-dissolve-70)/2);
  assert(Number(image.style.opacity)>0 && Number(image.style.opacity)<.82);
  assert.equal(parseFloat(image.style.filter.slice(5))>0,!reduced);
  sample(frame.duration);frame.resolve();await playback;
  assert.equal(Number(image.style.opacity),.82);assert.equal(image.style.filter,'');assert.equal(image.style.transform,'');
});

test('first observation gathers from an invisible image and same-target binding does not replace it',async()=>{
  const {engine,image,frames}=fixture();
  const snapshot={players:[{id:'ally',name:'戰士',role:'warrior'}]};
  engine.setObservedTarget(null,snapshot);
  const playback=engine.transitionObservedTarget('ally',snapshot),frame=frames[0];
  assert.equal(Number(image.style.opacity),0);
  frame.render(0,0);assert.equal(Number(image.style.opacity),0);assert(image.src.includes('Warrior'));
  frame.render(.5,frame.duration/2000);assert(Number(image.style.opacity)>0 && Number(image.style.opacity)<.82);
  frame.render(1,frame.duration/1000);frame.resolve();await playback;
  await engine.transitionObservedTarget('ally',snapshot);assert.equal(frames.length,1);
});

test('disposed observation cannot swap the target after its frames stop',async()=>{
  const {engine,image,frames}=fixture();
  const snapshot={players:[{id:'old',name:'戰士',role:'warrior'},{id:'new',name:'智者',role:'sage'}]};
  engine.setObservedTarget('old',snapshot);
  const playback=engine.transitionObservedTarget('new',snapshot);
  engine.disposed=true;frames[0].resolve();await playback;
  assert(image.src.includes('Warrior'));
  await engine.transitionObservedTarget('new',snapshot);assert.equal(frames.length,1);
});
