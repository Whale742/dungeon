import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CLASSES,ROLE_DETAILS,LOOT_TABLE} from '../game/constants.js';

const skill=fs.readFileSync(new URL('../public/sage-skill-presentation.js',import.meta.url),'utf8');
const equation=fs.readFileSync(new URL('../public/sage-equation-presentation.js',import.meta.url),'utf8');
function element(){return {style:{},children:[],classList:{add(){}},remove(){},appendChild(n){this.children.push(n);},querySelector(){return element();}};}
test('Sage induce solve presentation uses server delta and operands, preserving addition in reduced motion',async()=>{
  for(const reduced of [false,true])for(const [operandBefore,operandAfter,operandDelta] of [[15,35,20],[16,37,21]]){
    const context=vm.createContext({});vm.runInContext(skill,context);
    const nodes=[],anchor={node:element(),number:element()};
    const stage={root:{dataset:{}},reduced,signal:{aborted:false},el(tag,cls){const n=element();n.className=cls;nodes.push(n);return n;},position(){},animate(){},wait:async()=>{}};
    await context.sageOperandFeedback(stage,{actionId:'sge_induce'},{sagePhase:'solve',operandBefore,operandAfter,operandDelta},anchor);
    assert.equal(anchor.number.textContent,String(operandAfter));assert.equal(stage.root.dataset.operandOperation,'add');
    assert.equal(nodes.find(n=>n.className==='sage-momentum-cue').textContent,`${operandBefore} + ${operandDelta} = ${operandAfter}`);
    assert(!nodes.some(n=>n.className==='sage-momentum-copy'));assert(!skill.includes('×2'));
  }
});
test('Sage X presentation shows authoritative decay/fixed/bonus/debt for all three resolutions',async()=>{
  for(const resolution of ['SUCCESS','CONFUSION','NOTHING']){
    const context=vm.createContext({});vm.runInContext(skill,context);const nodes=[],beats=[];
    const stage={signal:{aborted:false},el(tag,cls,html,parent){const n=element();nodes.push(n);parent?.appendChild(n);return n;},animate(){},wait:async()=>{}};
    // Deliberately non-formula values prove this view renders the server payload.
    const outcome={resolution,xBefore:130,xAfter:999,decayAmount:14,baseXGain:4,bonusXGain:77,debtScheduled:20};
    await context.playSageEquationOutcome(stage,{outcome},{onTiming:name=>beats.push(name)});
    const texts=nodes.map(n=>n.textContent);for(const value of ['變量 X：130','自然衰減：-14','固定成長：+4','推演額外：+77','最終 X：999','下次可行動支付 20 X'])assert(texts.includes(value));
    assert(beats.includes('sage_variable_outcome'));
  }
});
test('Sage confusion branch ends at the authoritative target anchor, including self',async()=>{
  for(const self of [false,true]){
    const context=vm.createContext({});vm.runInContext(equation,context);const nodes=[],beats=[];
    const targetId=self?'sage':'ally',stage={anchors:new Map([[targetId,{x:321,y:654}]]),el(){const n=element();n.dataset={};nodes.push(n);return n;},animate(){},wait:async()=>{}};
    await context.playSageConfusionBranch(stage,{sourceId:'sage',outcome:{confusionTargetId:targetId}},{onTiming:(name,data)=>beats.push({name,data})});
    assert.equal(nodes[0].dataset.targetId,targetId);assert(nodes[0].innerHTML.includes('321 654'));assert.equal(beats[0].data.self,self);
  }
  assert(equation.includes("cutin.src='assets/sage-error.png'"));assert(equation.includes('0.4 +'));assert(!equation.includes('0.25 +'));
  assert(!/Math\.random|applyDamage/.test(equation));
});
test('Sage role, skills and equipment full copy contain v3 rules with no stale mechanics',()=>{
  assert.equal(ROLE_DETAILS.sage.hp,70);
  const passive=CLASSES.sage.passive;for(const required of ['0.4','X60','20%','10 點真實伤害'.replace('伤','傷'),'最高 25%','持續 2 回合'])assert(passive.includes(required));
  assert(CLASSES.sage.skills[0].desc.includes('固定 10 X'));assert(CLASSES.sage.skills[1].desc.includes('固定 14 X'));assert(CLASSES.sage.skills[2].desc.includes('奇數 +20，偶數 +21'));
  const text=[passive,...CLASSES.sage.skills.map(s=>s.desc),...LOOT_TABLE.filter(e=>e.role==='sage').map(e=>e.desc)].join('\n');
  for(const stale of ['演算精通','0.25','運算元 ×2','下一輪初始擾動','先驗防壁','慣性緩衝','殘餘衝量','取代【思緒紊亂】'])assert(!text.includes(stale));
  assert(fs.existsSync(new URL('../public/assets/sage-error.png',import.meta.url)));
});
