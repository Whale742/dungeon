// Deterministic Lab fixtures; playback calls the production dispatcher directly.
const SAMURAI_LAB_SCENES=(()=>{
 const clone=s=>structuredClone(s),single=(id,label,action)=>({label,role:'samurai',steps:[clone(PHASE6_LAB_SCENES[id].steps.find(s=>s.actionId===action))]});
 const scenes={samurai_basic:single('basic_samurai','Samurai · Basic','basic'),samurai_cut:single('p8_samurai_burst','Samurai · 一刀兩斷','sa_cut'),samurai_burst:single('p8_samurai_burst','Samurai · 一刀兩斷 · 武魂爆發','sa_cut'),samurai_tsubame:single('p8_samurai_tsubame','Samurai · 秘劍 • 燕返','sa_tsubame')};
 const cut=scenes.samurai_cut.steps[0];cut.outcome={type:'normal'};cut.isCritical=false;cut.finalDamage=15;cut.results[0].finalDamage=15;cut.results[0].outcome={type:'normal'};cut.results[0].targetAfter.hp=cut.results[0].targetBefore.hp-15;cut.hpSnapshot.monster=clone(cut.results[0].targetAfter);cut.results[0].hpSnapshot=clone(cut.hpSnapshot);
 function parryFixture(count,variant){
  const original=PHASE6_LAB_SCENES.p8_samurai_counter.steps,boss=clone(original[0]),counter=clone(original[1]);
  boss.results=boss.results.filter(r=>r.targetId==='hero').slice(0,count);boss.samuraiPresentation={murasame:variant==='murasame'};
  const before=boss.hpSnapshotBefore.players.find(p=>p.id==='hero'),soul=variant==='haori'?2:1,hp=variant==='murasame'?65:variant==='haori'?100:80;
  Object.assign(before,{hp,maxHp:hp,soul:0});
  boss.results.forEach((r,i)=>{
   r.finalDamage=variant==='murasame'?4:0;r.value=r.finalDamage;r.hpDmg=r.finalDamage;r.outcome={type:variant==='murasame'?'normal':'block',parry:true};
   r.targetBefore={...clone(before),hp:hp-i*r.finalDamage,soul:i?soul:0};r.targetAfter={...clone(before),hp:hp-(i+1)*r.finalDamage,soul};
   r.hpSnapshot=clone(boss.hpSnapshotBefore);r.hpSnapshot.players[0]=clone(r.targetAfter);
  });
  boss.hpSnapshot=clone(boss.results.at(-1).hpSnapshot);counter.hpSnapshotBefore=clone(boss.hpSnapshot);counter.hpSnapshot=clone(boss.hpSnapshot);
  const value=variant==='murasame'?28:variant==='haori'?5:count===1?11:14;
  const r=counter.results[0];r.finalDamage=value;r.targetBefore=clone(counter.hpSnapshotBefore.monster);r.targetAfter={...clone(r.targetBefore),hp:r.targetBefore.hp-value};counter.hpSnapshot.monster=clone(r.targetAfter);r.hpSnapshot=clone(counter.hpSnapshot);counter.finalDamage=value;
  return {role:'samurai',steps:[boss,counter]};
 }
 scenes.samurai_parry1={label:'Samurai · 狂刀 · 1 Parry',...parryFixture(1)};
 scenes.samurai_parry4={label:'Samurai · 狂刀 · 4 Parry',...parryFixture(4)};
 scenes.samurai_murasame={label:'Samurai · 狂刀 · 村雨',...parryFixture(4,'murasame')};
 scenes.samurai_haori={label:'Samurai · 狂刀 · 殘心羽織',...parryFixture(4,'haori')};
 return Object.freeze(scenes);
})();
