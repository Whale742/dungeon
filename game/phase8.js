// Phase 8 hooks in Room's existing action, damage, shield and lifecycle owners.
import { getFloorDifficultyMultiplier } from './constants.js';
export const P8_ROLES = ['dreamweaver','stargazer','gladiator','samurai','sage'];
export const countEquip = (p,id) => (p.equips || []).filter(e=>e.id===id).length;
const alive = room => Object.values(room.players).filter(p=>p.hp>0);
const roll = list => list[Math.min(list.length-1,Math.floor(Math.random()*list.length))];
export const isPrime = n => Number.isInteger(n) && n>=2 && !Array.from({length:Math.max(0,Math.floor(Math.sqrt(n))-1)},(_,i)=>i+2).some(d=>n%d===0);
export const eta = x => .25+1.75*x/(x+80);
export function p8State(p,room) {
  const effects=Object.entries(p.p8Effects || {}).filter(([,s])=>s.until>=room.battleRound).map(([id,s])=>({id,icon:s.icon||'buff',label:s.label,turns:s.until-room.battleRound+1,value:s.value}));
  if(p.hp>0) {
    if(p.soul)effects.push({id:'soul',icon:'buff',label:'劍魂',stacks:p.soul});
    if(p.kyoutou)effects.push({id:'kyoutou',icon:'guard',label:'鏡頭',turns:1});
    if(p.rage)effects.push({id:'rage',icon:'buff',label:'怒氣',stacks:p.rage});
    if(p.bloodStacks)effects.push({id:'blood_stacks',icon:'buff',label:'獻血',stacks:p.bloodStacks});
    if(p.role==='sage')effects.push({id:'sage_equation',icon:'buff',label:p.sagePhase==='solve'?'求解':'假設',value:p.sageOperand??0});
  }
  const resource=p.role==='sage'?`X ${p.sageX ?? 10} · Operand ${p.sageOperand ?? 0} · ${p.sagePhase==='solve'?'求解':'假設'}`:
    p.role==='samurai'?`劍魂 ${p.soul||0}/8${p.kyoutou?' · 鏡頭':''}`:
    p.role==='gladiator'?`怒氣 ${p.rage||0} · 獻血 ${p.bloodStacks||0}${room.arena?.playerId===p.id?' · 死亡競技場':''}`:
    p.role==='warrior'?`受傷攻擊 +${p.warriorStacks||0}/15`:'';
  return {resourceSummary:resource, sageX:p.sageX, sageOperand:p.sageOperand,sagePhase:p.sagePhase,
    soul:p.soul||0, rage:p.rage||0, bloodStacks:p.bloodStacks||0, warriorStacks:p.warriorStacks||0,
    arenaBlocked:!!room.arena && room.arena.playerId!==p.id, noReviveThisFloor:p.noReviveFloor===room.floor,
    phase8Statuses:effects};
}
export const phase8Methods = {
  p8Log(text,type='buff') { (this.p8LogBuffer || this.logs).push(this.p8LogBuffer?{text,type}:{id:Date.now()+Math.random().toString(36),time:new Date().toLocaleTimeString(),text,type}); },
  p8Effect(target,id,label,turns=1,extra={}) {
    target.p8Effects ||= {}; target.p8Effects[id]={label,until:this.battleRound+turns-1,...extra};
  },
  p8Has(target,id) { return target?.p8Effects?.[id]?.until>=this.battleRound ? target.p8Effects[id] : null; },
  p8GrantShield(p,value,turns=1,kind='shield',ownerId=null) {
    value=Math.max(0,Math.floor(value)); if(!value||p.hp<=0)return;
    p.tempHp=(p.tempHp||0)+value; p.p8Shields ||= [];
    p.p8Shields.push({kind,value,initial:value,broken:false,until:this.battleRound+turns-1,ownerId});
  },
  p8ConsumeShield(p,absorbed) {
    let remaining=absorbed;
    for(const shield of p.p8Shields || []) {
      const used=Math.min(shield.value,remaining); shield.value-=used; remaining-=used;
      if(used)shield.broken=true;
    }
  },
  p8RefreshEquipment() {
    const corrosion=this.roundModifiers?.equipmentEffectMultiplier ?? 1;
    const teamHp=Object.values(this.players).reduce((n,p)=>n+countEquip(p,'dw_loom')*Math.floor(20*corrosion),0);
    for(const p of Object.values(this.players)) {
      const corroded=(p.equips||[]).filter(e=>/^(dw_|sg_|g_|sa_|sge_)/.test(e.id)).reduce((n,e)=>n+(e.bonusHp||0)-Math.floor((e.bonusHp||0)*corrosion),0);
      const disabled=countEquip(p,'sa_murasame')?countEquip(p,'sa_haori')*Math.floor(20*corrosion):0;
      const delta=teamHp-(p.p8TeamHp||0)-disabled+(p.p8DisabledHp||0)-corroded+(p.p8CorrodedHp||0);
      p.maxHp=Math.max(1,p.maxHp+delta); if(p.hp>0)p.hp=Math.max(1,Math.min(p.maxHp,p.hp+delta));
      p.p8TeamHp=teamHp; p.p8DisabledHp=disabled;p.p8CorrodedHp=corroded;
    }
  },
  p8ResetBattle() {
    this.p8ExitArena(); this.arenaPending=null;
    for(const p of Object.values(this.players)) {
      p.p8Effects={}; p.p8Shields=[]; p.warriorStacks=0;p.warriorRoundDamage=0;
      p.rage=0;p.bloodStacks=0;p.soul=0;p.kyoutou=false;p.parryChecked=false;
      p.sageX=10;p.sageOperand=Math.floor(Math.random()*30)+1;p.sagePhase='hypothesis';p.sageCycleRound=0;p.sageMomentum=0;
    }
    if(this.currentMonster)this.currentMonster.p8Effects={};
    this.p8RefreshEquipment();
  },
  p8ExitArena() {
    if(!this.arena)return;
    const p=this.players[this.arena.playerId];
    if(p) {const ratio=p.hp/p.maxHp; p.maxHp=this.arena.originalMaxHp;p.hp=ratio>0?Math.max(1,Math.round(p.maxHp*ratio)):0;p.bloodStacks=0;p.arenaActive=false;}
    this.arena=null;
  },
  p8Expire(target) {
    if(!target)return;
    for(const [id,s] of Object.entries(target.p8Effects||{})) {
      if(s.until>=this.battleRound)continue;
      if(id==='nightmare_weak' && s.originalMaxHp) {
        const ratio=target.hp/target.maxHp;target.maxHp=s.originalMaxHp;target.hp=Math.round(target.maxHp*ratio);
      }
      if(id==='false_history' && s.originalMaxHp) {
        const ratio=target.hp/target.maxHp;target.maxHp=s.originalMaxHp;target.hp=Math.round(target.maxHp*ratio);target.attack=s.originalAttack;
      }
      delete target.p8Effects[id];
    }
  },
  p8RoundStart() {
    this.p8RefreshEquipment();this.p8Expire(this.currentMonster);
    if(this.arena && this.arena.until<this.battleRound) {this.p8ExitArena();this.p8Log('死亡競技場落幕，隊伍重返戰場。');}
    if(this.arenaPending && this.arenaPending.round===this.battleRound) {
      const p=this.players[this.arenaPending.playerId];
      if(p?.hp>0) {
        const originalMaxHp=p.maxHp,ratio=p.hp/p.maxHp;
        p.maxHp=Math.max(1,Math.round(p.maxHp*.6*(this.memberIds.length+1)));p.hp=Math.max(1,Math.round(p.maxHp*ratio));
        this.arena={playerId:p.id,originalMaxHp,until:this.battleRound};p.arenaActive=true;
        this.p8Log(`${p.name}踏入【死亡競技場】，其餘隊員本輪無法行動。`);
      }
      this.arenaPending=null;
    }
    for(const p of Object.values(this.players)) {
      this.p8Expire(p);p.parryChecked=false;p.kyoutou=false;p.parriedCount=0;p.parryChance=.4;p.rageRoundGain=false;p.warriorRoundDamage=0;p.sageInduction=false;
      p.p8Shields=(p.p8Shields||[]).filter(s=>{
        if(s.until>=this.battleRound)return true;
        p.tempHp=Math.max(0,(p.tempHp||0)-s.value);
        if(s.kind==='sage'&&!s.broken&&s.value>0) {
          const sage=this.players[s.ownerId];if(sage)sage.sageMomentum=(sage.sageMomentum||0)+Math.floor(s.value*.2);
        }
        return false;
      });
    }
    // Shield expiry for every ally precedes drawing any Sage's next cycle.
    for(const p of Object.values(this.players)) {
      if(p.role==='sage'&&p.hp>0) {
        if(!p.sageCycleRound) {p.sageOperand=Math.floor(Math.random()*30)+1+(p.sageMomentum||0);p.sageMomentum=0;}
        p.sagePhase=p.sageCycleRound?'solve':'hypothesis';
      }
    }
  },
  p8DreamDamage(target,raw) {
    const effect=this.p8Has(target,'dream_butterfly');if(!effect||raw<=0)return null;
    if(Math.random()<.6) {
      let healed;
      if(target===this.currentMonster) {
        const before=target.hp;target.hp=Math.min(target.maxHp,target.hp+raw);healed=target.hp-before;
        this.actionHeals?.push({targetId:'monster',actualHeal:healed,targetAfter:this.getHpSnapshot().monster});
      } else healed=this.applyHealCapped(target,raw);
      this.p8Log('夢蝶振翅！現實化為【美夢化生】（傷害轉為治療）！');
      return {damage:0,heal:healed,outcome:'dream_heal'};
    }
    this.p8Log('夢蝶振翅！現實化為【惡夢侵襲】（無視抗性的真實傷害）！');
    return {damage:raw,outcome:'nightmare',ownerId:effect.ownerId};
  },
  p8NightmareHeal(p,ownerId) {
    const owner=this.players[ownerId], count=countEquip(owner||{},'dw_loom');
    if(count&&p!==this.currentMonster&&p.hp>0)this.applyHealCapped(p,Math.floor(p.maxHp*.05*count*(this.roundModifiers?.equipmentEffectMultiplier??1)));
  },
  p8RecordDamage(p,result,context={}) {
    if(result.hpDmg>0&&p.role==='warrior') {
      p.warriorStacks=Math.min(15,(p.warriorStacks||0)+(context.hpEvents||1));
      this.p8Log(`${p.name}受傷積累攻擊 +${p.warriorStacks}/15。`);
    }
    if(this.p8Has(p,'warrior_resolve'))p.warriorRoundDamage=(p.warriorRoundDamage||0)+result.hpDmg+result.tempAbsorbed;
    if(result.hpDmg>0&&p.role==='gladiator'&&!p.rageRoundGain) {p.rage=(p.rage||0)+1;p.rageRoundGain=true;this.p8Log(`${p.name}實際受傷，怒氣 ${p.rage}。`);}
    if(context.kind==='enemy_direct'&&p.sageInduction)p.sageOperand+=result.hpDmg+result.tempAbsorbed;
  },
  p8Incoming(p,raw,mitigate,context={kind:'enemy_direct'}) {
    if(this.arena&&this.arena.playerId!==p.id&&context.kind==='enemy_direct')return {damage:0,outcome:'arena_absent'};
    const dream=this.p8DreamDamage(p,raw);if(dream)return dream;
    let damage=raw,parry=false;
    if(p.role==='samurai'&&context.kind==='enemy_direct'&&raw>0) {
      if(!p.parryChecked) {
        p.parryChecked=true;p.kyoutou=Math.random()<(p.parryChance??.4);
        if(p.kyoutou) {p.soul=Math.min(8,(p.soul||0)+1+(!countEquip(p,'sa_murasame')&&countEquip(p,'sa_haori')?1:0));this.p8Log(`${p.name}進入【鏡頭】，劍魂 ${p.soul}/8。`);}
      }
      if(p.kyoutou) {p.parriedCount=(p.parriedCount||0)+1;parry=true;damage=countEquip(p,'sa_murasame')?Math.floor(raw*.5):0;}
    }
    if(!this.arena && !parry)damage=mitigate?mitigate(damage):damage;
    if(!this.arena&&this.p8Has(p,'warrior_resolve'))damage=Math.floor(damage*.4);
    return {damage:Math.max(0,damage),outcome:parry?'parry':'normal'};
  },
  p8MitigateFriendly(p,raw) {
    let n=raw;
    if(p.role==='assassin')n=Math.floor(n*1.25);
    if(p.warriorVulnerableTurns)n=Math.floor(n*1.2);
    if(this.alcShieldTurns)n=Math.floor(n*.3);
    if(this.alcVulnerableTurns)n=Math.floor(n*1.2);
    if(p.isCrouchedThisRound)n=Math.floor(n*.8);
    if(['treant','tree'].includes(p.druidForm))n=Math.floor(n*.7);
    return n;
  },
  p8DamageMonster(p,raw,type,resistance,extra={}) {
    const before=this.getHpSnapshot();const {dmg}=resistance(raw,type,{...extra,actor:p});
    const actual=Math.min(this.currentMonster.hp,dmg);this.currentMonster.hp=Math.max(0,this.currentMonster.hp-dmg);
    const after=this.getHpSnapshot();const outcome={type:extra.critical?'critical':'normal'};
    const result={kind:this.p8BossOutcome==='dream_heal'?'heal':'damage',targetId:'monster',actualHeal:Math.max(0,after.monster.hp-before.monster.hp),finalDamage:actual,damageType:type==='mag'?'magic':type==='true'?'true':'physical',outcome,targetBefore:before.monster,targetAfter:after.monster,hpSnapshot:after};
    this.p8Results?.push(result);this.p8Visuals?.push({type:'player_attack',sourceId:p.id,target:'monster',dmgType:type,value:actual,isCrit:!!extra.critical});
    return actual;
  },
  p8ResolveBossHits(p,rawParts,mitigate,hits,treant) {
    for(let i=0;i<rawParts.length && p.hp>0;i++) {
      const before=this.getHpSnapshot(),targetBefore=before.players.find(a=>a.id===p.id);
      const incoming=this.p8Incoming(p,rawParts[i],mitigate);
      let damage=incoming.damage;
      if(damage>0 && !this.arena && treant?.hp>0 && treant.id!==p.id) {
        const shared=Math.floor(damage*.5);damage-=shared;
        const rootBefore=this.getHpSnapshot().players.find(a=>a.id===treant.id);
        const result=this.applyDamageToPlayer(treant,Math.floor(shared*.7),{kind:'secondary'});
        if(treant.hp<=0){treant.hp=1;treant.druidForm='tree';treant.druidFormTurns=1;treant.stunnedNextTurn=true;}
        const snapshot=this.getHpSnapshot();
        hits.push({kind:'damage',targetId:treant.id,sharedFrom:p.id,value:result.actualDmg,finalDamage:result.actualDmg,hpDmg:result.hpDmg,tempAbsorbed:result.tempAbsorbed,absorbed:result.tempAbsorbed,
          targetBefore:rootBefore,targetAfter:snapshot.players.find(a=>a.id===treant.id),hpSnapshot:snapshot,outcome:{type:result.hpDmg===0?'block':'normal'},segment:'direct'});
      }
      const result=this.applyDamageToPlayer(p,damage,{kind:'enemy_direct'});
      if(incoming.outcome==='nightmare')this.p8NightmareHeal(p,incoming.ownerId);
      if(p.hp<=0)this.clearPlayerDebuffs(p);
      if(result.hpDmg>0 && this.currentMonster.baseHp<100)p.bleedTurns=2;
      const snapshot=this.getHpSnapshot();
      hits.push({kind:incoming.outcome==='dream_heal'?'heal':'damage',targetId:p.id,role:p.role,
        value:result.actualDmg,finalDamage:result.actualDmg,hpDmg:result.hpDmg,tempAbsorbed:result.tempAbsorbed,absorbed:result.tempAbsorbed,
        actualHeal:incoming.heal||0,damageType:incoming.outcome==='nightmare'?'true':'physical',guard:incoming.outcome==='parry',
        outcome:{type:incoming.outcome==='dream_heal'?'dream_heal':result.actualDmg===0?'block':'normal',parry:incoming.outcome==='parry'},
        targetBefore,targetAfter:snapshot.players.find(a=>a.id===p.id),hpSnapshot:snapshot,
        shieldBreak:targetBefore.tempHp>0&&p.tempHp===0,segment:'direct',isDead:p.hp<=0});
      this.p8Log(`${p.name}【${incoming.outcome==='parry'?'招架':incoming.outcome==='dream_heal'?'美夢化生':incoming.outcome==='nightmare'?'惡夢侵襲':'直接攻擊'}】${incoming.heal?'+ '+incoming.heal:result.actualDmg}。`,'combat');
    }
  },
  p8Action(p,resistance,bardMultiplier,visuals,log) {
    if(!P8_ROLES.includes(p.role))return null;
    this.p8Results=[];this.p8Visuals=visuals;this.p8LogBuffer=log;
    const damage=(n,type='phys',extra={})=>this.p8DamageMonster(p,n,type,resistance,extra);
    const stat=this.getEffectiveBonusAtk(p),m=this.currentMonster;
    let outcome={type:'normal'},category=null;
    const effect=(target,id,label,turns=1,extra={})=>{
      const before=this.getHpSnapshot();this.p8Effect(target,id,label,turns,extra);
      const after=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:target===m?'monster':target.id,targetBefore:target===m?before.monster:before.players.find(x=>x.id===target.id),targetAfter:target===m?after.monster:after.players.find(x=>x.id===target.id),hpSnapshot:after});
    };
    if(p.role==='dreamweaver') {
      const turns=1+(countEquip(p,'dw_history')?1:0);
      if(p.action==='basic') {
        damage(Math.floor((10+stat)*bardMultiplier),'mag');
        const rate=countEquip(p,'dw_spindle')?.75:.5;
        if(Math.random()<rate) {
          const id=roll(['mirror','dissociate','nightmare_weak','frenzy_backfire']);
          const names={mirror:'鏡像錯置',dissociate:'現實解離',nightmare_weak:'夢魘虛弱',frenzy_backfire:'狂亂反噬'};
          if(id==='nightmare_weak'&&!this.p8Has(m,id)) {
            const max=m.maxHp;m.maxHp=Math.max(1,Math.round(m.maxHp*.9));m.hp=Math.max(1,Math.round(m.hp*.9));effect(m,id,names[id],turns,{originalMaxHp:max});
          } else effect(m,id,names[id],turns,id==='nightmare_weak'?{originalMaxHp:this.p8Has(m,id)?.originalMaxHp}:{});
          outcome={type:id,label:names[id]};this.p8Log(`織夢術士撥動夢境纖維，魔物陷入【${names[id]}】狀態！`);
        }
      } else if(p.action==='dw_butterfly') {effect(this.players[p.targetPlayerId]||m,'dream_butterfly','夢蝶',turns,{ownerId:p.id});outcome={type:'butterfly',label:'夢蝶振翅'};}
      else if(p.action==='dw_false_dream') {
        const id=roll(['shallow','deep','lone','horde']),living=alive(this).length;
        const floor=id==='shallow'?Math.floor((this.floor-1)/5)*5+1:id==='deep'?Math.floor((this.floor-1)/5)*5+5:this.floor;
        const players=id==='lone'?Math.max(1,living-3):id==='horde'?living+3:this.memberIds.length;
        const old=this.p8Has(m,'false_history');const originalMaxHp=old?.originalMaxHp||m.maxHp,originalAttack=old?.originalAttack||m.attack;
        const hpScale=getFloorDifficultyMultiplier(floor)/getFloorDifficultyMultiplier(this.floor)*players/this.memberIds.length;
        const atkScale=getFloorDifficultyMultiplier(floor)/getFloorDifficultyMultiplier(this.floor)*(1+(players-1)*.5)/(1+(this.memberIds.length-1)*.5);
        const ratio=m.hp/m.maxHp;m.maxHp=Math.max(1,Math.round(originalMaxHp*hpScale));m.hp=Math.max(1,Math.round(m.maxHp*ratio));m.attack=Math.max(1,Math.round(originalAttack*atkScale));
        const label={shallow:'淺夢',deep:'深夢',lone:'孤影',horde:'群影'}[id];effect(m,'false_history',label,turns,{originalMaxHp,originalAttack,floor,players});outcome={type:id,label};
        this.p8Log(`虛構的歷史覆蓋了戰場！魔物陷入【${label}】的幻覺之中！`);
      }
    } else if(p.role==='stargazer') {
      if(p.action==='basic')damage(Math.floor((10+stat)*bardMultiplier),'mag');
      else if(p.action==='sg_observe') {
        const enhanced=['sg_eyepiece','sg_tube','sg_mount'].every(id=>countEquip(p,id));const r=Math.random();
        const id=enhanced?['planet','galaxy','blackhole','boundary'][Math.min(3,Math.floor(r*4))]:r<.6?'star':r<.7?'planet':r<.8?'galaxy':r<.9?'blackhole':'boundary';
        outcome={type:id,label:{star:'恆星',planet:'行星',galaxy:'銀河',blackhole:'黑洞',boundary:'邊界'}[id],enhanced};
        if(id==='star'||id==='planet') {damage(Math.floor(((id==='star'?15:enhanced?35:25)+stat)*bardMultiplier),'mag');if(id==='planet'&&Math.random()<(enhanced?.3:.1)){this.monsterStunnedThisRound=true;outcome.stunned=true;}}
        if(id==='galaxy')for(const ally of alive(this))effect(ally,'galaxy','銀河引導',1,{value:enhanced?10:5});
        if(id==='blackhole') {
          damage(enhanced?10:5,'true');
          if(!enhanced)for(const ally of alive(this)) {
            const before=this.getHpSnapshot(),res=this.applyDamageToPlayer(ally,5,{kind:'friendly',trueDamage:true});const after=this.getHpSnapshot();
            this.p8Results.push({kind:'damage',targetId:ally.id,finalDamage:res.hpDmg+res.tempAbsorbed,hpDmg:res.hpDmg,absorbed:res.tempAbsorbed,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===ally.id),targetAfter:after.players.find(x=>x.id===ally.id),hpSnapshot:after});
          }
        }
        if(id==='boundary') {
          const ally=alive(this).sort((a,b)=>a.hp-b.hp)[0];if(ally){if(enhanced)this.applyHealCapped(ally,ally.maxHp);effect(ally,'boundary','星光邊界',1,{barrier:enhanced});}
        }
        this.p8Log(`${p.name}完成天體觀測：【${outcome.label}】${enhanced?'・克卜勒的深空天眼':''}${outcome.stunned?'，魔物本輪暈眩':''}。`);
      } else if(p.action==='sg_clock') {
        const r=Math.random(),id=r<.7?'accelerate':r<.8?'reset':r<.9?'overload':'nothing';outcome={type:id,label:{accelerate:'時流加速',reset:'時計歸零',overload:'星軌超負荷',nothing:'星軌沉寂'}[id]};
        // Deferred until the common cooldown owner has charged this round's casts.
        (this.p8ClockEvents ||= []).push(id);if(id==='overload')for(const ally of alive(this))effect(ally,'overload','星軌超負荷',1,{value:5});
        this.p8Log(`${p.name}重塑時計：【${outcome.label}】。`);
      }
    } else if(p.role==='gladiator') {
      const inArena=this.arena?.playerId===p.id;
      if(p.action==='basic')damage(Math.floor((10+stat)*bardMultiplier));
      if(p.action==='g_sacrifice') {
        if(inArena){category='OFFENSIVE';damage(Math.floor((15+this.memberIds.length*10+(p.rage||0)*25+stat)*bardMultiplier));}
        else {
          const before=this.getHpSnapshot();p.hp=Math.max(0,p.hp-20);p.rage=(p.rage||0)+1;
          if(countEquip(p,'g_xiphos'))p.bloodStacks=(p.bloodStacks||0)+1;
          if(p.hp<30&&countEquip(p,'g_cuirass'))effect(p,'blood_heal','染血受療 +20%',2);
          const after=this.getHpSnapshot();this.p8Results.push({kind:'damage',targetId:p.id,finalDamage:before.players.find(x=>x.id===p.id).hp-p.hp,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===p.id),targetAfter:after.players.find(x=>x.id===p.id),hpSnapshot:after});
          outcome={type:'sacrifice',label:'鮮血獻祭'};this.p8Log(`${p.name}支付 20 生命，怒氣 ${p.rage}，獻血 ${p.bloodStacks||0}。`);
        }
      }
      if(p.action==='g_arena') {
        if(inArena) {
          category='OFFENSIVE';const cost=p.hp;damage(cost+(p.rage||0)*(countEquip(p,'g_cingulum')?15:10));
          const before=this.getHpSnapshot();p.hp=0;p.noReviveFloor=this.floor;
          const after=this.getHpSnapshot();this.p8Results.push({kind:'damage',targetId:p.id,finalDamage:cost,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===p.id),targetAfter:after.players.find(x=>x.id===p.id),hpSnapshot:after});outcome={type:'suicide',label:'同歸於盡'};this.p8Log(`${p.name}以全部 ${cost} 生命發動【同歸於盡】，本層不能甦生。`);
        } else {this.arenaPending={playerId:p.id,round:this.battleRound+1};outcome={type:'challenge',label:'死鬥宣告'};this.p8Log(`${p.name}發出死鬥宣告，下回合進入競技場。`);effect(p,'arena_challenge','死鬥宣告');}
      }
    } else if(p.role==='samurai') {
      const soul=p.soul||0, missing=1-p.hp/p.maxHp, corrosion=this.roundModifiers?.equipmentEffectMultiplier??1;
      const mult=1+.10*countEquip(p,'sa_oboro')*corrosion+(countEquip(p,'sa_murasame')?missing*.25*corrosion:0);
      if(p.action==='sa_tsubame') {
        if(soul<4){this.p8Log(`${p.name}劍魂不足，燕返未施放。`);outcome={type:'invalid',label:'劍魂不足'};}
        else {p.soul-=4;for(let i=0;i<4&&m.hp>0;i++)damage(Math.floor((10+stat)*bardMultiplier*mult),'phys',{penetration:1});outcome={type:'tsubame',label:'秘劍・燕返'};}
      } else {
        const burst=p.action==='sa_cut'&&soul>0&&Math.random()<Math.min(.7,.3+.05*soul);
        if(p.action==='sa_cut'&&soul===0)p.parryChance=.7;
        damage(Math.floor(((p.action==='sa_cut'?15:10)+stat)*bardMultiplier*mult*(burst?2:1)),'phys',{critical:burst});
        p.soul=Math.min(8,soul+1);outcome={type:burst?'soul_burst':'normal',label:burst?'劍魂爆發':undefined};
      }
      this.p8Log(`${p.name}【${outcome.label||'居合攻擊'}】，劍魂 ${p.soul||0}/8。`);
    } else if(p.role==='sage') {
      p.sageX ??=10;p.sageOperand ??=Math.floor(Math.random()*30)+1;p.sagePhase ||= 'hypothesis';
      const actual=damage(Math.floor((10+stat)*bardMultiplier),'phys',{penetration:p.action==='sge_deduce'?.5:0});
      if(p.sagePhase==='hypothesis') {
        if(p.action==='basic')p.sageOperand=actual;
        else if(p.action==='sge_deduce')p.sageOperand+=actual;
        else p.sageInduction=true;
      } else p.sageOperand=p.action==='sge_induce'?p.sageOperand*2:p.sageOperand+(p.action==='sge_deduce'?5:2);
      p.sageLastAction=p.action;this.p8Log(`${p.name}【${p.sagePhase==='solve'?'求解':'假設'}】X=${p.sageX}，Operand=${p.sageOperand}。`);
    }
    if(!this.p8Results.length){const snap=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:p.id,targetBefore:snap.players.find(x=>x.id===p.id),targetAfter:snap.players.find(x=>x.id===p.id),hpSnapshot:snap});}
    for(const r of this.p8Results){r.monsterName=m.name;r.monsterAvatar=m.avatar;}
    this.p8Visuals=null;return {outcome,category};
  },
  p8Cooldowns() {
    for(const id of this.p8ClockEvents||[])for(const p of alive(this))for(const key of Object.keys(p.cooldowns||{})) {
      if(id==='reset')p.cooldowns[key]=0;
      else if(p.cooldowns[key]>0)p.cooldowns[key]=Math.max(0,p.cooldowns[key]+(id==='accelerate'?-1:id==='overload'?1:0));
    }
    this.p8ClockEvents=[];
  },
  p8EndRound(queue,log,resistance) {
    this.p8LogBuffer=log;
    const m=this.currentMonster;
    const event=(p,name,id,resolve,outcome={type:'normal'})=>{
      const before=this.getHpSnapshot();this.p8Results=[];this.p8Visuals=[];resolve();const after=this.getHpSnapshot();
      queue.push({type:'player_action',category:'OFFENSIVE',sourceId:p.id,sourceName:p.name,sourceRole:p.role,actionId:id,skillName:name,monsterName:m.name,monsterAvatar:m.avatar,
        targetId:'monster',targetName:m.name,hpSnapshotBefore:before,hpSnapshot:after,results:this.p8Results,finalDamage:this.p8Results.filter(r=>r.targetId==='monster'&&r.kind==='damage').reduce((n,r)=>n+r.finalDamage,0),damageType:'physical',outcome,detail:name});
      this.p8Results=null;this.p8Visuals=null;
    };
    for(const p of alive(this)) {
      if(m.hp>0&&p.role==='warrior'&&this.p8Has(p,'warrior_resolve')&&p.warriorRoundDamage>0)event(p,'堅定反擊','w_counter',()=>{this.p8DamageMonster(p,p.warriorRoundDamage,'phys',resistance);this.p8Log(`${p.name}【堅定反擊】返還本輪實受 ${p.warriorRoundDamage} 傷害。`);});
      p.warriorRoundDamage=0;
      if(m.hp>0&&p.role==='samurai'&&p.parriedCount>0) {
        const n=countEquip(p,'sa_murasame')?20+p.parriedCount*2:countEquip(p,'sa_haori')?5:10+p.parriedCount;
        event(p,'鏡頭反擊','sa_counter',()=>this.p8DamageMonster(p,n,'phys',resistance));this.p8Log(`${p.name}統一反擊 ${n}（招架 ${p.parriedCount} 次）。`);
      }
      if(p.role==='sage' && (!this.arena||this.arena.playerId===p.id)) {
        if(p.sagePhase==='solve'&&m.hp>0) {
          const operand=Math.round(p.sageOperand), x=p.sageX??10, lens=countEquip(p,'sge_lens'),rule=countEquip(p,'sge_rule');
          const even=operand%2===0,prime=isPrime(operand),square=Number.isInteger(Math.sqrt(operand));
          const raw=Math.round(Math.abs(operand*eta(x))*(1+(rule?.10+(rule-1)*.05:0)*(this.roundModifiers?.equipmentEffectMultiplier??1)));
          const properties=[even?'EVEN':'ODD',...(prime?['PRIME']:[]),...(square?['SQUARE']:[])];
          const outcome={type:'equation',label:'方程解析',operand,x,eta:eta(x),equationDamage:raw,properties};
          event(p,'方程解析','sge_equation',()=>{
            const actual=this.p8DamageMonster(p,raw,'phys',resistance,{penetration:even?0:1,equation:true});
            if(even)for(const ally of alive(this))this.p8GrantShield(ally,actual*.4,2,'sage',p.id);
            else this.p8Effect(m,'sage_exposed','ODD 承傷 +10%',2,{starts:this.battleRound+1});
            if(prime){if(m.hp>0)this.p8DamageMonster(p,15,'true',resistance,{equation:true});for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=0;}
            if(square)this.p8Effect(m,'sage_square','SQUARE 直接傷害 -25%',2,{starts:this.battleRound+1});
            for(const ally of alive(this)){const snap=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:ally.id,targetBefore:snap.players.find(a=>a.id===ally.id),targetAfter:snap.players.find(a=>a.id===ally.id),hpSnapshot:snap});}
          },outcome);
          const action=p.sageLastAction||'basic',base=action==='basic'?.6:action==='sge_deduce'?.5:.4,confusion=action==='basic'?.15:action==='sge_deduce'?.25:.35;
          const success=Math.min(1,base+(lens?.10+(lens-1)*.05:0)*(this.roundModifiers?.equipmentEffectMultiplier??1)),r=Math.random();
          if(r<success){p.sageX=Math.round(x+(action==='sge_induce'?operand/4:operand));outcome.resolution='SUCCESS';}
          else if(r<success+Math.min(confusion,1-success)){p.sageX=Math.max(10,Math.round(x*.75));outcome.resolution='CONFUSION';}
          else outcome.resolution='NOTHING';
          queue[queue.length-1].hpSnapshot=this.getHpSnapshot();
          this.p8Log(`${p.name}方程 ${operand} × η(${x}) = ${raw}【${properties.join(' / ')}】，${outcome.resolution}，X=${p.sageX}。`);
          p.sageCycleRound=0;
        } else p.sageCycleRound=1;
      }
    }
    // The arena restores its original maximum using the exit ratio, including death.
    if(this.arena){this.p8ExitArena();queue.push({type:'status_cleanup',hpSnapshot:this.getHpSnapshot(),narrative:'死亡競技場落幕。'});}
    this.p8LogBuffer=null;
  }
};
