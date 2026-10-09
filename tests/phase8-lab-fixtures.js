import {equipItemToPlayer,LOOT_TABLE} from '../game/constants.js';
const equip=(p,id)=>equipItemToPlayer(p,structuredClone(LOOT_TABLE.find(e=>e.id===id)));
export function addPhase8LabFixtures(fixtures,scene,add) {
  const sageNames={basic:'普通攻擊',sge_deduce:'向量定軌・貫穿演算',sge_induce:'動量回授・慣性取樣'};
  for(const action of ['basic','sge_deduce','sge_induce'])for(const phase of ['hypothesis','solve']) {
    add(`sage_${action}_${phase}`,`${sageNames[action]}｜${phase==='solve'?'求解':'假設'}`,'sage',action,.9,room=>{
      Object.assign(room.players.hero,{sageOperand:17,sageX:24,sagePhase:phase});room.currentMonster.resistance='phys';
    });
  }
  {
    const {wire}=scene('sage','sge_induce',.9,room=>{room.players.hero.sageOperand=17;room.currentMonster.attack=12;});
    fixtures.sage_sampling_capture={role:'sage',label:'動量回授・慣性取樣｜Boss 傷害取樣',steps:wire.queue.filter(s=>s.sourceId==='hero'||s.type==='boss_action'||s.type==='status_cleanup')};
  }
  {
    const {wire}=scene('sage','sge_induce',.1,room=>{room.battleRound=3;room.players.hero.sageOperand=17;room.currentMonster.attack=12;});
    fixtures.sage_sampling_multi={role:'sage',label:'動量回授・慣性取樣｜多段攻擊／伺服器合計取樣',steps:wire.queue.filter(s=>s.sourceId==='hero'||s.type==='boss_action'||s.type==='status_cleanup')};
  }
  for(const [id,r] of [['success',.3],['confusion',.01]]) {
    const {room,wire}=scene('sage','sge_induce',.9,room=>{Object.assign(room.players.hero,{sageOperand:17,sageX:130});room.currentMonster.attack=6;});
    const first=wire.queue.filter(s=>s.sourceId==='hero'||s.type==='boss_action'||s.type==='status_cleanup');
    let second;room.io={to:()=>({emit(name,data){if(name==='battle:presentation_queue')second=data;}})};
    const old=Math.random;Math.random=()=>r;
    try {room.state='IN_BATTLE';room.battleRound=2;room.p8RoundStart();room.players.hero.action='sge_deduce';room.players.ally.action='skip';room.resolveTurnActions();}
    finally {Math.random=old;room.clearTimer();}
    fixtures['sage_full_cycle_'+id]={role:'sage',label:'演算週期｜慣性取樣 → 求解 → 方程結算 → '+(id==='success'?'推演成功':'思緒紊亂'),steps:[...first,...second.queue.filter(s=>s.sourceId==='hero'||s.type==='boss_action'||s.type==='status_cleanup')]};
  }
  add('sage_induce_even_solve','動量回授・慣性取樣｜偶數 +21 求解','sage','sge_induce',.9,room=>{
    Object.assign(room.players.hero,{sageOperand:16,sageX:120,sagePhase:'solve'});room.currentMonster.attack=0;
  });
  add('sage_confusion_self','方程結算｜思緒紊亂自傷','sage','sge_induce',.01,room=>{
    room.players.ally.hp=0;Object.assign(room.players.hero,{sageOperand:15,sageX:130,sagePhase:'solve'});room.currentMonster.attack=0;
  });
  for(const [r,id] of [[0,'mirror'],[.25,'dissociate'],[.5,'nightmare'],[.75,'frenzy']]) {
    let n=0;add('p8_dream_'+id,'夢境混亂・'+id,'dreamweaver','basic',()=>++n===1?0:r);
  }
  for(const [r,id] of [[.1,'heal'],[.9,'true']]) {
    const {wire}=scene('dreamweaver','dw_butterfly',r,room=>{room.players.hero.targetPlayerId='hero';room.players.hero.hp=30;});
    fixtures['p8_butterfly_'+id]={label:'清醒夢・薛丁格之蝶｜'+(id==='heal'?'美夢化生':'夢魘成真'),steps:wire.queue.filter(s=>s.category)};
  }
  for(const [r,id] of [[.01,'shallow'],[.26,'deep'],[.51,'lone'],[.76,'horde']])add('p8_false_'+id,'偽造殘夢・'+id,'dreamweaver','dw_false_dream',r,room=>{room.floor=8;});
  for(const [r,id] of [[.1,'star'],[.65,'planet'],[.75,'galaxy'],[.85,'blackhole'],[.95,'boundary']])add('p8_observe_'+id,'天體觀測・'+id,'stargazer','sg_observe',r);
  for(const [r,id] of [[.01,'planet'],[.26,'galaxy'],[.51,'blackhole'],[.76,'boundary']])add('p8_kepler_'+id,'克卜勒天眼・'+id,'stargazer','sg_observe',r,room=>['sg_eyepiece','sg_tube','sg_mount'].forEach(id=>equip(room.players.hero,id)));
  for(const [r,id] of [[.1,'accelerate'],[.75,'reset'],[.85,'overload'],[.95,'nothing']])add('p8_clock_'+id,'時計重塑・'+id,'stargazer','sg_clock',r,room=>{room.players.ally.cooldowns.w_shield=3;});
  add('p8_gladiator_sacrifice','角鬥士・鮮血獻祭','gladiator','g_sacrifice');
  add('p8_gladiator_challenge','角鬥士・死鬥宣告','gladiator','g_arena');
  for(const action of ['g_sacrifice','g_arena'])add('p8_arena_'+action,action==='g_arena'?'競技場・同歸於盡':'競技場・血砂重擊','gladiator',action,.9,room=>{
    const p=room.players.hero;p.rage=3;p.hp=100;p.maxHp=153;p.arenaActive=true;room.arena={playerId:p.id,originalMaxHp:85,until:1};
  });
  for(const [id,action,configure,r] of [
    ['parry','basic',()=>{},.1],['counter','skip',()=>{},.1],['burst','sa_cut',room=>{room.players.hero.soul=6;},.1],['tsubame','sa_tsubame',room=>{room.players.hero.soul=4;},.9]]) {
    const {wire}=scene('samurai',action,r,configure);fixtures['p8_samurai_'+id]={role:'samurai',label:{parry:'狂刀・招架',counter:'狂刀・反擊',burst:'一刀兩斷・武魂爆發',tsubame:'秘劍 • 燕返'}[id],steps:wire.queue.filter(s=>s.category)};
  }
  for(const [id,action,configure,r] of [
    ['reference_17_24','basic',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:15,sageX:24});},.9],
    ['hypothesis','basic',room=>{room.players.hero.sageOperand=8;},.9],
    ['solve','sge_induce',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:8,sageX:80});},.9],
    ['even_square','basic',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:14,sageX:80});},.9],
    ['odd_prime','basic',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:11,sageX:80});},.9],
    ['success','basic',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:8,sageX:20});},.1],
    ['confusion','basic',room=>{Object.assign(room.players.hero,{sagePhase:'solve',sageOperand:8,sageX:20});},.01]])add('p8_sage_'+id,{reference_17_24:'方程結算・運算元 17／變量 24',hypothesis:'普通攻擊・假設',solve:'動量回授・慣性取樣・求解',even_square:'方程結算・偶數與平方數',odd_prime:'方程結算・奇數與質數',success:'方程結算・推演成功',confusion:'方程結算・思緒紊亂'}[id],'sage',action,r,configure);
  for(const n of [1,3,5,6,30])fixtures['p8_logs_'+n]={label:'日誌・'+n+' 筆／完整可捲動日誌',logs:Array.from({length:n},(_,i)=>({id:'log-'+i,time:'12:00',type:'combat',text:'第 '+(i+1)+' 筆戰鬥紀錄：這是一筆包含完整內容的事件，最新訊息位於底部，完整文字保留供查看。'}))};
}
