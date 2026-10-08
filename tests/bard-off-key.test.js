import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/presentation-core.js',import.meta.url),'utf8');
const scope=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function bardOffKeyDetuneCurve'),source.indexOf('class SFXManager')),scope);
test('off-key pitch bends span more than eight semitones peak to peak',()=>{
 const values=scope.bardOffKeyDetuneCurve(4.6);
 assert(Math.max(...values)>410);assert(Math.min(...values)<-410);
});
test('off-key rises and falls slowly in 2.4 second cycles, with smooth edges',()=>{
 const values=scope.bardOffKeyDetuneCurve(4.8),interval=4.8/(values.length-1);
 assert.equal(values[0],0);assert.equal(Math.abs(values.at(-1)),0);
 const valueAt=t=>values[Math.round(t/interval)];
 assert(valueAt(.6)>410);assert(valueAt(1.8)<-410);assert(valueAt(3)>410);
 assert(Math.abs(valueAt(2.4))<1);
 assert(values.every((v,i)=>i===0||Math.abs(v-values[i-1])<40));
});
