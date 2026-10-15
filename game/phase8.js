// Phase 8 hooks in Room's existing action, damage, shield and lifecycle owners.
import { getFloorDifficultyMultiplier } from './constants.js';
export const P8_ROLES = ['dreamweaver','stargazer','gladiator','samurai','sage','augur'];
export const countEquip = (p,id) => (p.equips || []).filter(e=>e.id===id).length;
const alive = room => Object.values(room.players).filter(p=>p.hp>0);
const roll = list => list[Math.min(list.length-1,Math.floor(Math.random()*list.length))];
export const isPrime = n => Number.isInteger(n) && n>=2 && !Array.from({length:Math.max(0,Math.floor(Math.sqrt(n))-1)},(_,i)=>i+2).some(d=>n%d===0);
export const eta = x => .4+1.75*x/(x+80);
export const sageConfusionChance = x => Math.min(.25,.05+Math.floor(Math.max(0,x-60)/10)*.01);
export const sageDecay = x => Math.ceil(Math.max(0,x-60)*.20);
const sageGrowth = {
  basic:{base:10,success:.6,bonus:o=>Math.round(5+o*.30)},
  sge_deduce:{base:14,success:.5,bonus:o=>Math.round(7+o*.30)},
  sge_induce:{base:4,success:.4,bonus:o=>Math.round(2+o*.15)}
};
export function sageEquationPreview(p,room) {
  const x=Math.max(0,p.sageX??30),operand=p.sageOperand||0;
  const corrosion=room.roundModifiers?.equipmentEffectMultiplier??1;
  const rule=countEquip(p,'sge_rule'),lens=countEquip(p,'sge_lens');
  const ruleMultiplier=1+(rule ? .10+(rule-1)*.05 : 0)*corrosion;
  const confusionChance=sageConfusionChance(x),lensBonus=(lens ? .10+(lens-1)*.05 : 0)*corrosion;
  return {eta:eta(x),confusionChance,decayAmount:sageDecay(x),options:Object.entries(sageGrowth).map(([id,growth])=>{
    const op=operand+(id==='sge_induce'?(operand%2===0?9:8):id==='sge_deduce'?5:2);
    const baseEquationDamage=Math.round(Math.abs(op*eta(x)));
    return {id,operand:op,properties:[op%2===0?'EVEN':'ODD',...(isPrime(op)?['PRIME']:[]),...(Number.isInteger(Math.sqrt(op))?['SQUARE']:[])],
      baseEquationDamage,damageAfterEquipment:Math.round(baseEquationDamage*ruleMultiplier),damageAfterConfusion:Math.round(baseEquationDamage*ruleMultiplier*.8),
      blocked:id===p.sagePreviousAction,cooldown:p.cooldowns?.[id]||0,baseXGain:growth.base,bonusXGain:growth.bonus(op),
      successChance:Math.min(growth.success+lensBonus,1-confusionChance),debtScheduled:id==='sge_induce'?20:0};
  })};
}
export function p8State(p,room) {
  const effects=Object.entries(p.p8Effects || {}).filter(([,s])=>s.until>=room.battleRound).map(([id,s])=>({id,icon:s.icon||'buff',label:s.label,turns:s.permanent?null:Math.min(s.duration||Infinity,s.until-room.battleRound+1),value:s.value}));
  if(p.hp>0) {
    if(p.soul)effects.push({id:'soul',icon:'buff',label:'武魂',stacks:p.soul});
    if(p.kyoutou)effects.push({id:'kyoutou',icon:'guard',label:'狂刀',turns:1});
    if(p.rage)effects.push({id:'rage',icon:'buff',label:'怒氣',stacks:p.rage});
    if(p.bloodStacks)effects.push({id:'blood_stacks',icon:'buff',label:'血祭',stacks:p.bloodStacks});
    if(p.role==='sage') {
      effects.push({id:'sage_equation',icon:'buff',label:p.sagePhase==='solve'?'求解':'假設',value:p.sageOperand??0});
      if(p.sageDebt)effects.push({id:'sage_debt',icon:'debuff',label:'變量透支・下次可行動支付',value:p.sageDebt});
    }
    if(p.role==='augur') {
      const cardLabels = { empty: '空象', upright: '正位', reversed: '逆位' };
      effects.push({id:'augur_card',icon:'buff',label:cardLabels[p.augurCardState] || '空象'});
    }
  }
  const x = p.sageX ?? 30;
  const augurTotalDebt = (p.augurFateDebts || []).reduce((n, d) => n + d.amount, 0);
  const augurTarget = room.players[p.observedTargetId];
  const augurTargetName = augurTarget ? (augurTarget.id === p.id ? '自身' : augurTarget.name) : '尚未建立觀測';
  const resource=p.role==='sage'?`變量(X) ${x}${p.sageDebt?` · 待付透支 ${p.sageDebt}`:''} · 運算元 ${p.sageOperand ?? 0} · ${p.sagePhase==='solve'?'求解':'假設'}`:
    p.role==='samurai'?`武魂 ${p.soul||0}/8${p.kyoutou?' · 狂刀':''}`:
    p.role==='gladiator'?`怒氣 ${p.rage||0} · 血祭 ${p.bloodStacks||0}${room.arena?.playerId===p.id?' · 死亡角鬥場':''}`:
    p.role==='augur'?`命債 ${augurTotalDebt}/60 · ${ {empty:'空象',upright:'正位',reversed:'逆位'}[p.augurCardState]||'空象' } · 觀測【${augurTargetName}】${p.augurBindingBoostRound === room.battleRound ? ' · 繫結加成' : ''}`:
    p.role==='warrior'?`受傷攻擊 +${p.warriorStacks||0}/15`:'';
  return {resourceSummary:resource, sageX:x, sageOperand:p.sageOperand,sagePhase:p.sagePhase,
    sageDebt:p.sageDebt||0,sageConfusionChance:sageConfusionChance(x),
    ...(p.role==='sage'?{sageEquationPreview:sageEquationPreview(p,room)}:{}),
    sageSampling:!!p.sageInduction&&!p.sageSamplingEnded&&p.hp>0,
    soul:p.soul||0, rage:p.rage||0, bloodStacks:p.bloodStacks||0, warriorStacks:p.warriorStacks||0,
    augurDebt: augurTotalDebt, augurDebts: p.augurFateDebts || [],
    augurCardState: p.augurCardState || 'empty', augurObservedTargetId: p.observedTargetId || null,
    augurBindingBoost: p.augurBindingBoostRound === room.battleRound,
    arenaActive:!!room.arena && room.arena.playerId===p.id,
    arenaBlocked:!!room.arena && room.arena.playerId!==p.id, noReviveThisFloor:p.noReviveFloor===room.floor,
    phase8Statuses:effects};
}
export const phase8Methods = {
  p8SplitDreamPresentation(queue,p) {
    const action=queue.at(-1);if(action?.sourceId!==p.id)return;
    const statuses=(action.results||[]).filter(r=>r.kind==='status');if(!statuses.length)return;
    const result={...action,actionId:action.actionId+'_result',category:'DEBUFF',skillName:action.outcome?.label||action.skillName,
      results:statuses,finalDamage:0,damageDealt:0,hpDamage:0};
    action.results=action.results.filter(r=>r.kind!=='status');
    action.hpSnapshot=action.results.at(-1)?.hpSnapshot||action.hpSnapshotBefore;
    action.outcome={type:'normal'};action.finalDamage=action.results.reduce((n,r)=>n+(r.kind==='damage'?r.finalDamage||0:0),0);
    result.hpSnapshotBefore=action.hpSnapshot;
    queue.push(result);
  },
  p8Log(text,type='buff') { (this.p8LogBuffer || this.logs).push(this.p8LogBuffer?{text,type}:{id:Date.now()+Math.random().toString(36),time:new Date().toLocaleTimeString(),text,type}); },
  p8Effect(target,id,label,turns=1,extra={},resistanceChecked=false) {
    if (target === this.currentMonster && !resistanceChecked && !this.monsterAllowsEffect(label)) return false;
    target.p8Effects ||= {}; target.p8Effects[id]={label,until:this.battleRound+turns-1,...extra};
    return true;
  },
  p8Has(target,id) { return target?.p8Effects?.[id]?.until>=this.battleRound ? target.p8Effects[id] : null; },
  p8GrantShield(p,value,turns=1,kind='shield',ownerId=null) {
    value=Math.max(0,Math.floor(value)); if(p.hp<=0)return;
    if(kind==='sage') {
      // All Sages share one equation shield slot; other sources keep their own pools.
      const existing=(p.p8Shields||[]).filter(s=>s.kind==='sage');
      const oldTotal=existing.reduce((n,s)=>n+s.value,0);
      value=Math.max(value,...existing.map(s=>s.value));
      p.p8Shields=(p.p8Shields||[]).filter(s=>s.kind!=='sage');
      p.tempHp=Math.max(0,(p.tempHp||0)-oldTotal);
    }
    if(!value)return;
    const until = (turns === Infinity || turns == null) ? Infinity : this.battleRound+turns-1;
    p.tempHp=(p.tempHp||0)+value; p.p8Shields ||= [];
    p.p8Shields.push({kind,value,initial:value,broken:false,until,ownerId});
  },
  p8ConsumeShield(p,absorbed) {
    let remaining=absorbed;
    for(const shield of p.p8Shields || []) {
      const used=Math.min(shield.value,remaining); shield.value-=used; remaining-=used;
      if(used&&shield.value===0)shield.broken=true;
    }
  },
  getAugurTotalDebt(p) {
    return (p?.augurFateDebts || []).reduce((n, d) => n + d.amount, 0);
  },
  addAugurDebt(augur, amount) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    const current = this.getAugurTotalDebt(augur);
    const actual = Math.max(0, Math.min(amount, 60 - current));
    if (actual <= 0) return 0;
    const hasForbiddenTome = (augur.equips || []).some(e => e.id === 'aug_forbidden_tome');
    const duration = hasForbiddenTome ? 1 : 2;
    augur.augurFateDebts ||= [];
    augur.augurFateDebts.push({ amount: actual, createdRound: this.battleRound, dueRound: this.battleRound + duration });
    if (hasForbiddenTome && this.currentMonster && this.currentMonster.hp > 0) {
      const trueDmg = Math.round(actual * 0.5);
      if (trueDmg > 0) {
        this.currentMonster.hp = Math.max(0, this.currentMonster.hp - trueDmg);
        this.p8Log(`📖💥 **${augur.name}**【禁忌厄運聖契】共鳴！新增命債轉化為 **${trueDmg}** 點真傷直擊 Boss！`, 'damage');
      }
    }
    return actual;
  },
  repayAugurDebt(augur, amount, source = 'skill') {
    amount = Math.round(amount);
    if (amount <= 0 || !augur?.augurFateDebts || augur.augurFateDebts.length === 0) return 0;
    augur.augurFateDebts.sort((a, b) => a.dueRound - b.dueRound);
    let remaining = amount;
    let paid = 0;
    while (remaining > 0 && augur.augurFateDebts.length > 0) {
      const front = augur.augurFateDebts[0];
      const deduct = Math.min(remaining, front.amount);
      front.amount -= deduct;
      remaining -= deduct;
      paid += deduct;
      if (front.amount <= 0) augur.augurFateDebts.shift();
    }
    if (paid > 0 && source === 'skill') {
      const hasForbiddenTome = (augur.equips || []).some(e => e.id === 'aug_forbidden_tome');
      if (hasForbiddenTome && this.currentMonster && this.currentMonster.hp > 0) {
        const trueDmg = Math.round(paid * 0.5);
        if (trueDmg > 0) {
          this.currentMonster.hp = Math.max(0, this.currentMonster.hp - trueDmg);
          this.p8Log(`📖💥 **${augur.name}**【禁忌厄運聖契】共鳴！清償命債轉化為 **${trueDmg}** 點真傷直擊 Boss！`, 'damage');
        }
      }
    }
    return paid;
  },
  deductAugurDebtPassive(player, healAmount) {
    if (!player || player.role !== 'augur' || !player.augurFateDebts || player.augurFateDebts.length === 0 || healAmount <= 0) {
      return { remainingHeal: healAmount, debtPaid: 0 };
    }
    player.augurFateDebts.sort((a, b) => a.dueRound - b.dueRound);
    let remainingHeal = healAmount;
    let debtPaid = 0;
    while (remainingHeal > 0 && player.augurFateDebts.length > 0) {
      const front = player.augurFateDebts[0];
      const deduct = Math.min(remainingHeal, front.amount);
      front.amount -= deduct;
      remainingHeal -= deduct;
      debtPaid += deduct;
      if (front.amount <= 0) player.augurFateDebts.shift();
    }
    if (debtPaid > 0) {
      this.p8Log(`🔮 **${player.name}** 接受治療，優先抵銷了 **${debtPaid}** 點【命債】！剩餘命債：**${this.getAugurTotalDebt(player)}** 點。`, 'heal');
    }
    return { remainingHeal, debtPaid };
  },
  selectDefaultObservedTarget(augur) {
    const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0 && pl.id !== augur.id);
    if (!livingAllies.length) return augur.id;
    const tier1Roles = ['mage', 'sage', 'assassin', 'samurai', 'archer', 'alchemist'];
    const tier2Roles = ['bard', 'warrior', 'paladin'];
    const tier3Roles = ['gladiator', 'druid', 'stargazer', 'dreamweaver'];
    const t1 = livingAllies.filter(pl => tier1Roles.includes(pl.role));
    if (t1.length) return t1[Math.floor(Math.random() * t1.length)].id;
    const t2 = livingAllies.filter(pl => tier2Roles.includes(pl.role));
    if (t2.length) return t2[Math.floor(Math.random() * t2.length)].id;
    const t3 = livingAllies.filter(pl => tier3Roles.includes(pl.role));
    if (t3.length) return t3[Math.floor(Math.random() * t3.length)].id;
    return livingAllies[Math.floor(Math.random() * livingAllies.length)].id;
  },
  getFateBlessing(player) {
    if (!player) return 0;
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id);
    if (!augurs.length) return 0;
    let maxB = 0;
    for (const augur of augurs) {
      let b = (augur.augurBindingBoostRound === this.battleRound) ? 0.25 : 0.20;
      const n = countEquip(augur, 'aug_amethyst');
      b += 0.05 * n;
      if (b > maxB) maxB = b;
    }
    return maxB;
  },
  applyFateBlessing(player, originalBaseValue) {
    const b = this.getFateBlessing(player);
    if (b <= 0) return originalBaseValue;
    return Math.round(originalBaseValue * (1 + b));
  },
  checkAlchemistFateInterference(player) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id && !pl.augurIntervenedThisRound);
    if (!augurs.length) {
      return { isSuccess: Math.random() < 0.50, intercepted: false };
    }
    const augur = augurs[0];
    const P_neg = 50;
    const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 25 : 20;
    const D = Math.min(P_neg, M_red);
    const R = Math.random() * 100;
    if (R < 50) {
      return { isSuccess: true, intercepted: false };
    } else if (R < 50 + D) {
      augur.augurIntervenedThisRound = true;
      augur.augurCardState = 'reversed';
      let debt = Math.min(20, D);
      if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
      this.addAugurDebt(augur, debt);
      this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${player.name}** 攔截【命運煉成試劑・煉金失敗】的負面失誤，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
      return { isSuccess: true, intercepted: true, debt };
    } else {
      return { isSuccess: false, intercepted: false };
    }
  },
  checkNegativeFateInterference(player, baseNegChance, skillName) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id && !pl.augurIntervenedThisRound);
    if (!augurs.length) {
      return { occurred: Math.random() < baseNegChance / 100, intercepted: false };
    }
    const augur = augurs[0];
    const P_neg = baseNegChance;
    const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 25 : 20;
    const D = Math.min(P_neg, M_red);
    const R = Math.random() * 100;
    if (R < P_neg - D) {
      return { occurred: true, intercepted: false };
    } else if (R < P_neg) {
      augur.augurIntervenedThisRound = true;
      augur.augurCardState = 'reversed';
      let debt = Math.min(20, D);
      if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
      this.addAugurDebt(augur, debt);
      this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${player.name}** 攔截【${skillName}】的負面失誤，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
      return { occurred: false, intercepted: true, debt };
    } else {
      return { occurred: false, intercepted: false };
    }
  },
  checkPositiveFateInterference(player, basePosChance, skillName) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id && !pl.augurIntervenedThisRound);
    if (!augurs.length) {
      return { success: Math.random() < basePosChance / 100, boosted: false };
    }
    const augur = augurs[0];
    let M_pos = (augur.augurBindingBoostRound === this.battleRound) ? 20 : 15;
    if (countEquip(augur, 'aug_gilded_box')) M_pos += 5;
    const finalChance = Math.min(100, basePosChance + M_pos);
    const R = Math.random() * 100;
    const success = R < finalChance;
    if (success) {
      augur.augurIntervenedThisRound = true;
      augur.augurCardState = 'upright';
      this.p8Log(`🃏🌟 **${augur.name}** 水晶球光芒凝聚，諭示牌轉為【正位】！順應命運使 **${player.name}** 的【${skillName}】正面機率提升至 **${finalChance}%** 並成功觸發！`, 'buff');
      return { success: true, boosted: true };
    }
    return { success: false, boosted: true };
  },
  p8RefreshEquipment() {
    const globalCorrosion = this.roundModifiers?.equipmentEffectMultiplier ?? 1;
    const teamHp = Object.values(this.players).reduce((n, p) => {
      const c = (p.corrosionTurns > 0) ? 0.5 : globalCorrosion;
      return n + countEquip(p, 'dw_loom') * Math.floor(20 * c);
    }, 0);
    for (const p of Object.values(this.players)) {
      const corrosion = (p.corrosionTurns > 0) ? 0.5 : globalCorrosion;
      const corroded = (p.equips || []).filter(e => /^(dw_|sg_|g_|sa_|sge_|pal_|aug_)/.test(e.id)).reduce((n, e) => n + (e.bonusHp || 0) - Math.floor((e.bonusHp || 0) * corrosion), 0);
      const disabled = countEquip(p, 'sa_murasame') ? countEquip(p, 'sa_haori') * Math.floor(20 * corrosion) : 0;
      const delta = teamHp - (p.p8TeamHp || 0) - disabled + (p.p8DisabledHp || 0) - corroded + (p.p8CorrodedHp || 0);
      p.maxHp = Math.max(1, p.maxHp + delta); if (p.hp > 0) p.hp = Math.max(1, Math.min(p.maxHp, p.hp + delta));
      p.p8TeamHp = teamHp; p.p8DisabledHp = disabled; p.p8CorrodedHp = corroded;
    }
  },
  p8ResetBattle() {
    this.p8ExitArena(); this.arenaPending=null;
    for(const p of Object.values(this.players)) {
      p.p8Effects={}; p.p8Shields=[]; p.warriorStacks=0;p.warriorRoundDamage=0;
      p.rage=0;p.bloodStacks=0;p.soul=0;p.kyoutou=false;p.parryChecked=false;
      p.paladinGrace=null;p.paladinGloryTrackedDamage=0;p.paladinGloryCastedRound=0;
      p.sageX=p.sageX??30;p.sageOperand=0;p.sagePhase='hypothesis';p.sageCycleRound=0;
      delete p.sageDebtScheduledRound; // Pending payment survives; next battle is eligible.
      delete p.sagePreviousAction;delete p.sageLastAction;p.sagePrimeResetPending=false;
      p.sageInduction=false;p.sageSamplingEnded=true;p.sageEquationResolved=false;p.sageSolvedThisRound=false;
      if (p.role === 'augur') {
        p.augurFateDebts = [];
        p.augurCardState = 'empty';
        p.augurIntervenedThisRound = false;
        delete p.augurBindingBoostRound;
        p.observedTargetId = this.selectDefaultObservedTarget(p);
      }
    }
    if(this.currentMonster)this.currentMonster.p8Effects={};
    this.p8RefreshEquipment();
  },
  p8ExitArena(queue,reason='round_end') {
    if(!this.arena)return;
    const arena=this.arena,p=this.players[arena.playerId],m=this.currentMonster;
    const before=this.getHpSnapshot(),consumedRage=p?.rage||0;
    const triumphApplied=!!p&&p.hp>0;
    const triumphBonus=triumphApplied?Math.round(200*consumedRage/(consumedRage+5.6)):0;
    if(p){p.rage=0;p.bloodStacks=0;p.arenaActive=false;}
    const rageConsumedSnapshot=this.getHpSnapshot();
    this.arena=null;
    if(triumphApplied)for(const ally of Object.values(this.players)) {
      if(ally.id===p.id)continue;
      // Applied at round end: the next two rounds are the two playable turns.
      this.p8Effect(ally,'triumph','凱旋',2,{value:triumphBonus,until:this.battleRound+2,duration:2});
    }
    const triumphSnapshot=this.getHpSnapshot();
    if(p){const ratio=p.hp/p.maxHp;p.maxHp=arena.originalMaxHp;p.hp=ratio>0?Math.max(1,Math.round(p.maxHp*ratio)):0;}
    if(m&&arena.originalMonsterMaxHp){const ratio=m.hp/m.maxHp;m.maxHp=arena.originalMonsterMaxHp;m.hp=ratio>0?Math.max(1,Math.round(m.maxHp*ratio)):0;}
    const after=this.getHpSnapshot();
    const step={type:'arena_exit',category:'ARENA_EXIT',sourceId:p?.id||arena.playerId,sourceRole:'gladiator',sourceName:p?.name,
      skillName:'死亡角鬥場落幕',monsterName:m?.name,monsterAvatar:m?.avatar,
      hpSnapshotBefore:before,hpSnapshot:after,results:[],
      arenaPresentation:{phase:'exit',reason,playerId:arena.playerId,consumedRage,triumphApplied,triumphBonus,triumphDuration:triumphApplied?2:0,
        actorSurvived:triumphApplied,rageConsumedSnapshot,triumphSnapshot,hpRestoredSnapshot:after}};
    queue?.push(step);return step;
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
  p8RoundStart(queue=[]) {
    this.p8RefreshEquipment();this.p8Expire(this.currentMonster);
    if(this.arena && this.arena.until<this.battleRound) {this.p8ExitArena(queue);this.p8Log('死亡角鬥場落幕，隊伍重返戰場。');}
    if(this.arenaPending && this.arenaPending.round===this.battleRound) {
      const p=this.players[this.arenaPending.playerId];
      if(p?.hp>0) {
        const before=this.getHpSnapshot(),originalMaxHp=p.maxHp,ratio=p.hp/p.maxHp,m=this.currentMonster;
        const originalMonsterMaxHp=m?.maxHp;
        p.maxHp=Math.max(1,Math.round(p.maxHp*.6*(this.memberIds.length+1)));p.hp=Math.max(1,Math.round(p.maxHp*ratio));
        if(m){const monsterRatio=m.hp/m.maxHp;m.maxHp=Math.max(1,Math.round(m.maxHp*.6*(this.memberIds.length+1)));m.hp=monsterRatio>0?Math.max(1,Math.round(m.maxHp*monsterRatio)):0;}
        this.arena={playerId:p.id,originalMaxHp,originalMonsterMaxHp,until:this.battleRound};p.arenaActive=true;
        delete p.p8Effects?.arena_challenge;
        const after=this.getHpSnapshot();
        queue.push({type:'arena_enter',category:'ARENA_ENTER',sourceId:p.id,sourceRole:p.role,sourceName:p.name,
          skillName:'死亡角鬥場',monsterName:m?.name,monsterAvatar:m?.avatar,results:[],hpSnapshotBefore:before,hpSnapshot:after,
          arenaPresentation:{phase:'enter',playerId:p.id,noMitigation:true,
            combatants:[{targetId:p.id,hpBeforeArena:before.players.find(a=>a.id===p.id).hp,maxHpBeforeArena:originalMaxHp,hpAfterScale:p.hp,maxHpAfterScale:p.maxHp},
              ...(m?[{targetId:'monster',hpBeforeArena:before.monster.hp,maxHpBeforeArena:originalMonsterMaxHp,hpAfterScale:m.hp,maxHpAfterScale:m.maxHp}]:[])]}});
        this.p8Log(`${p.name}踏入【死亡角鬥場】，其餘隊員本輪無法行動。`);
      }
      this.arenaPending=null;
    }
    for(const p of Object.values(this.players)) {
      this.p8Expire(p);p.parryChecked=false;p.kyoutou=false;p.parriedCount=0;p.parryChance=.4;p.rageRoundGain=false;p.warriorRoundDamage=0;p.sageInduction=false;p.sageEquationResolved=false;p.sageSolvedThisRound=false;
      p.p8Shields=(p.p8Shields||[]).filter(s=>{
        if(s.until>=this.battleRound)return true;
        p.tempHp=Math.max(0,(p.tempHp||0)-s.value);
        return false;
      });
    }
    for(const p of Object.values(this.players)) {
      if(p.role==='paladin'&&p.hp>0) {
        if(p.paladinGloryCastedRound && this.battleRound === p.paladinGloryCastedRound + 1) {
          const tracked = p.paladinGloryTrackedDamage || 0;
          let gloryShield = Math.floor(tracked * 0.70);
          const penaltyRate = (p.equips || []).some(e => e.id === 'pal_cuirass') ? 0.15 : 0.40;
          const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
          const augur = augurs[0];
          const r = Math.random();
          let hasPenalty = false;
          if (!augur) {
            hasPenalty = r < penaltyRate;
          } else {
            const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 0.25 : 0.20;
            const D = Math.min(penaltyRate, M_red);
            if (r < penaltyRate - D) {
              hasPenalty = true;
            } else if (r < penaltyRate) {
              hasPenalty = false;
              augur.augurIntervenedThisRound = true;
              augur.augurCardState = 'reversed';
              let debt = Math.min(20, Math.round(D * 100));
              if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
              this.addAugurDebt(augur, debt);
              this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${p.name}** 攔截【榮耀讚歌・殘缺祝福】，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
            } else {
              hasPenalty = false;
            }
          }
          if (hasPenalty) gloryShield = Math.floor(gloryShield * 0.50);
          gloryShield = Math.min(gloryShield, p.maxHp);
          if (gloryShield > 0) {
            for (const ally of Object.values(this.players).filter(pl => pl.hp > 0)) {
              this.p8GrantShield(ally, gloryShield, 2, 'paladin_glory');
            }
          }
          this.p8Log(`🛡️✨ **【榮耀讚歌】** 迴響！全隊獲得 **${gloryShield}** 點護盾（轉化本隊造成的 ${tracked} 點傷害${hasPenalty ? '，負面減半' : ''}，持續 2 回合）！持有護盾期間全體傷害提高 20%！`, 'buff');
          p.paladinGloryCastedRound = 0;
          p.paladinGloryTrackedDamage = 0;
        }
        if(p.paladinGrace && this.battleRound >= p.paladinGrace.startRound + 2) {
          const intercepted = p.paladinGrace.interceptedDamage || 0;
          const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
          const augur = augurs[0];
          const r = Math.random();
          let gainShield = false;
          if (!augur) {
            gainShield = r < 0.50;
          } else {
            const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 0.25 : 0.20;
            const threshold = 0.50 + M_red;
            if (r < 0.50) {
              gainShield = true;
            } else if (r < threshold) {
              gainShield = true;
              augur.augurIntervenedThisRound = true;
              augur.augurCardState = 'reversed';
              let debt = Math.min(20, Math.round(M_red * 100));
              if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
              this.addAugurDebt(augur, debt);
              this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${p.name}** 攔截【代受恩典・不獲護盾】，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
            } else {
              gainShield = false;
            }
          }
          if (gainShield && intercepted > 0) {
            const shieldVal = Math.floor(intercepted * 0.50);
            if (shieldVal > 0) {
              this.p8GrantShield(p, shieldVal, 2, 'paladin_grace');
              this.p8Log(`🛡️✨ **${p.name}**【代受恩典】持續時間結束，獲得承受傷害 50% 的護盾（**${shieldVal}** 點，持續 2 回合）！`, 'buff');
            }
          } else {
            this.p8Log(`🛡️ **${p.name}**【代受恩典】持續時間結束，未能獲得護盾（50% 機率判定）。`, 'info');
          }
          p.paladinGrace = null;
        }
      }
      if(p.role==='augur'&&p.hp>0) {
        p.augurIntervenedThisRound = false;
        p.augurCardState = 'empty';
        const target = this.players[p.observedTargetId];
        if (!target || target.hp <= 0) {
          p.observedTargetId = this.selectDefaultObservedTarget(p);
          const newTarget = this.players[p.observedTargetId];
          this.p8Log(`🔮 **${p.name}** 水晶球感應重聚，選定 **${newTarget ? newTarget.name : '自身'}** 作為【觀測目標】！`, 'buff');
        }
      }
    }
    // Operands are local to a two-turn cycle; expired shields never feed them.
    for(const p of Object.values(this.players)) {
      if(p.role==='sage'&&p.hp>0) {
        if(!p.sageCycleRound) {
          p.sageOperand=Math.floor(Math.random()*30)+1;
        }
        p.sagePhase=p.sageCycleRound?'solve':'hypothesis';
      }
    }
  },
  p8PaySageDebt(p) {
    if(p.role!=='sage'||!p.sageDebt||p.sageDebtScheduledRound===this.battleRound||p.hp<=0||p.stunnedNextTurn||p.isSurrendered||p.druidForm==='tree'||(this.arena&&this.arena.playerId!==p.id))return;
    const debt=p.sageDebt;p.sageDebt=0;
    delete p.sageDebtScheduledRound;
    p.sageX=Math.max(0,(p.sageX??30)-debt);
    this.p8Log(`${p.name}支付變量透支 ${debt}，X=${p.sageX}。`);
  },
  p8DreamDamage(target,raw) {
    const effect=this.p8Has(target,'dream_butterfly');if(!effect||raw<=0)return null;
    const dream = effect.dreamOutcome || (Math.random()<.6 ? 'dream_heal' : 'nightmare');
    if(dream==='dream_heal') {
      let healed;
      if(target===this.currentMonster) {
        const before=target.hp;target.hp=Math.min(target.maxHp,target.hp+raw);healed=target.hp-before;
        this.actionHeals?.push({targetId:'monster',actualHeal:healed,outcome:{type:'dream_heal'},targetAfter:this.getHpSnapshot().monster});
      } else healed=this.applyHealCapped(target,raw);
      this.p8Log('清醒夢・薛丁格之蝶！現實化為【美夢化生】（傷害轉為治療）！');
      return {damage:0,heal:healed,outcome:'dream_heal'};
    }
    this.p8Log('清醒夢・薛丁格之蝶！現實化為【夢魘成真】（無視抗性的真實傷害）！');
    return {damage:raw,outcome:'nightmare',ownerId:effect.ownerId};
  },
  p8NightmareHeal(p,ownerId) {
    const owner=this.players[ownerId], count=countEquip(owner||{},'dw_loom');
    if(count&&p!==this.currentMonster&&p.hp>0)this.applyHealCapped(p,Math.floor(p.maxHp*.05*count*(this.roundModifiers?.equipmentEffectMultiplier??1)));
  },
  p8RecordDamage(p,result,context={}) {
    if(context.kind==='sage_confusion')return;
    if(result.hpDmg>0&&p.role==='warrior') {
      p.warriorStacks=Math.min(15,(p.warriorStacks||0)+(context.hpEvents||1));
      this.p8Log(`${p.name}受傷積累攻擊 +${p.warriorStacks}/15。`);
    }
    if(this.p8Has(p,'warrior_resolve'))p.warriorRoundDamage=(p.warriorRoundDamage||0)+result.hpDmg+result.tempAbsorbed;
    if(result.hpDmg>0&&p.role==='gladiator'&&!p.rageRoundGain) {p.rage=(p.rage||0)+1;p.rageRoundGain=true;this.p8Log(`${p.name}實際受傷，怒氣 ${p.rage}。`);}
    if(context.kind==='enemy_direct'&&p.sageInduction) {
      const operandBefore=p.sageOperand;
      p.sageOperand+=result.hpDmg+result.tempAbsorbed;
      if(p.sageOperand!==operandBefore)result.sageMomentumCapture={operandBefore,operandAfter:p.sageOperand,delta:result.hpDmg+result.tempAbsorbed};
    }
  },
  p8Incoming(p,raw,mitigate,context={kind:'enemy_direct'}) {
    if((this.arena||this.arenaRoundLock)&& (this.arena||this.arenaRoundLock).playerId!==p.id&&context.kind==='enemy_direct')return {damage:0,outcome:'arena_absent'};
    const dream=this.p8DreamDamage(p,raw);if(dream)return dream;
    let damage=raw,parry=false;
    if(p.role==='samurai'&&context.kind==='enemy_direct'&&raw>0) {
      if(!p.parryChecked) {
        p.parryChecked=true;p.kyoutou=Math.random()<(p.parryChance??.4);
        if(p.kyoutou) {p.soul=Math.min(8,(p.soul||0)+1+(!countEquip(p,'sa_murasame')&&countEquip(p,'sa_haori')?1:0));this.p8Log(`${p.name}進入【狂刀】，武魂 ${p.soul}/8。`);}
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
    if(p.role==='paladin'&&p.paladinGrace)n=Math.floor(n*.85);
    if(p.role==='paladin'&&((p.tempHp>0)||(p.p8Shields||[]).some(s=>s.value>0))&&(p.equips||[]).some(e=>e.id==='pal_banner'))n=Math.floor(n*.85);
    return n;
  },
  p8DamageMonster(p,raw,type,resistance,extra={}) {
    const before=this.getHpSnapshot();
    // A completed solving attack can already be lethal. Keep the equation event
    // and its resource effects, without allowing a dream to resurrect the Boss.
    if(extra.equation&&this.currentMonster.hp<=0)this.p8BossOutcome=null;
    const {dmg}=extra.equation&&this.currentMonster.hp<=0?{dmg:0}:resistance(raw,type,{...extra,actor:p});
    const actual=Math.min(this.currentMonster.hp,dmg);this.currentMonster.hp=Math.max(0,this.currentMonster.hp-dmg);
    const after=this.getHpSnapshot();const outcome={type:this.p8BossOutcome|| (extra.critical?'critical':'normal')};
    const result={kind:this.p8BossOutcome==='dream_heal'?'heal':'damage',targetId:'monster',actualHeal:Math.max(0,after.monster.hp-before.monster.hp),finalDamage:actual,damageType:this.p8BossOutcome==='nightmare'?'true':type==='mag'?'magic':type==='true'?'true':'physical',outcome,targetBefore:before.monster,targetAfter:after.monster,hpSnapshot:after};
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
        value:result.actualDmg,finalDamage:result.actualDmg,hpDmg:result.hpDmg,tempAbsorbed:result.tempAbsorbed,absorbed:result.tempAbsorbed,sageMomentumCapture:result.sageMomentumCapture,
        actualHeal:incoming.heal||0,damageType:incoming.outcome==='nightmare'?'true':'physical',guard:incoming.outcome==='parry',
        outcome:{type:['dream_heal','nightmare'].includes(incoming.outcome)?incoming.outcome:result.actualDmg===0?'block':'normal',parry:incoming.outcome==='parry'},
        targetBefore,targetAfter:snapshot.players.find(a=>a.id===p.id),hpSnapshot:snapshot,
        shieldBreak:targetBefore.tempHp>0&&p.tempHp===0,segment:'direct',isDead:p.hp<=0});
      this.p8Log(`${p.name}【${incoming.outcome==='parry'?'招架':incoming.outcome==='dream_heal'?'美夢化生':incoming.outcome==='nightmare'?'夢魘成真':'直接攻擊'}】${incoming.heal?'+ '+incoming.heal:result.actualDmg}。`,'combat');
    }
  },
  p8Action(p,resistance,bardMultiplier,visuals,log) {
    if(!P8_ROLES.includes(p.role))return null;
    this.p8Results=[];this.p8Visuals=visuals;this.p8LogBuffer=log;
    const damage=(n,type='phys',extra={})=>this.p8DamageMonster(p,n,type,resistance,extra);
    const stat=this.getEffectiveBonusAtk(p),m=this.currentMonster;
    let outcome={type:'normal'},category=null,bloodHealApplied=false;
    const effect=(target,id,label,turns=1,extra={},resistanceChecked=false)=>{
      const before=this.getHpSnapshot();if (!this.p8Effect(target,id,label,turns,extra,resistanceChecked)) return false;
      const after=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:target===m?'monster':target.id,targetBefore:target===m?before.monster:before.players.find(x=>x.id===target.id),targetAfter:target===m?after.monster:after.players.find(x=>x.id===target.id),hpSnapshot:after});
      return true;
    };
    if(p.role==='dreamweaver') {
      const turns=1+(countEquip(p,'dw_history')?1:0);
      if(p.action==='basic') {
        damage(Math.floor((10+stat)*bardMultiplier),'mag');
        const rate=countEquip(p,'dw_spindle')?.75:.5;
        const dwCheck = this.checkPositiveFateInterference(p, Math.round(rate * 100), '潛意識混淆');
        if(m.hp>0 && dwCheck.success && this.monsterAllowsEffect('夢境混亂')) {
          const id=roll(['mirror','dissociate','nightmare_weak','frenzy_backfire']);
          const names={mirror:'鏡像夢境',dissociate:'解離痛楚',nightmare_weak:'萎靡夢魘',frenzy_backfire:'狂亂夢遊'};
          if(id==='nightmare_weak'&&!this.p8Has(m,id)) {
            const max=m.maxHp;m.maxHp=Math.max(1,Math.round(m.maxHp*.9));m.hp=Math.max(1,Math.round(m.hp*.9));effect(m,id,names[id],turns,{originalMaxHp:max},true);
          } else effect(m,id,names[id],turns,id==='nightmare_weak'?{originalMaxHp:this.p8Has(m,id)?.originalMaxHp}:{},true);
          outcome={type:id,label:names[id]};this.p8Log(`織夢術士撥動夢境纖維，魔物陷入【${names[id]}】狀態！`);
        }
      } else if(p.action==='dw_butterfly') {
        const dreamOutcome=Math.random()<.6?'dream_heal':'nightmare';
        const applied=effect(this.players[p.targetPlayerId]||m,'dream_butterfly','夢蝶迷思',turns,{ownerId:p.id,dreamOutcome});
        outcome=applied?{type:dreamOutcome,label:dreamOutcome==='dream_heal'?'美夢化生':'夢魘成真'}:{type:'immune',label:'效果免疫'};
      }
      else if(p.action==='dw_false_dream' && this.monsterAllowsEffect('虛構歷史')) {
        const id=roll(['shallow','deep','lone','horde']),living=alive(this).length;
        const floor=id==='shallow'?Math.floor((this.floor-1)/5)*5+1:id==='deep'?Math.floor((this.floor-1)/5)*5+5:this.floor;
        const players=id==='lone'?Math.max(1,living-3):id==='horde'?living+3:this.memberIds.length;
        const old=this.p8Has(m,'false_history');const originalMaxHp=old?.originalMaxHp||m.maxHp,originalAttack=old?.originalAttack||m.attack;
        const hpScale=getFloorDifficultyMultiplier(floor)/getFloorDifficultyMultiplier(this.floor)*players/this.memberIds.length;
        const atkScale=getFloorDifficultyMultiplier(floor)/getFloorDifficultyMultiplier(this.floor)*(1+(players-1)*.5)/(1+(this.memberIds.length-1)*.5);
        const ratio=m.hp/m.maxHp;m.maxHp=Math.max(1,Math.round(originalMaxHp*hpScale));m.hp=Math.max(1,Math.round(m.maxHp*ratio));m.attack=Math.max(1,Math.round(originalAttack*atkScale));
        const label={shallow:'淺層清夢',deep:'深淵墜夢',lone:'孤影殘夢 (-3人)',horde:'百鬼夜行 (+3人)'}[id];effect(m,'false_history',label,turns,{originalMaxHp,originalAttack,floor,players},true);outcome={type:id,label};
        this.p8Log(`虛構的歷史覆蓋了戰場！魔物陷入【${label}】的幻覺之中！`);
      } else if(p.action==='dw_false_dream') outcome={type:'immune',label:'效果免疫'};
    } else if(p.role==='stargazer') {
      if(p.action==='basic')damage(Math.floor((10+stat)*bardMultiplier),'mag');
      else if(p.action==='sg_observe') {
        const enhanced=['sg_eyepiece','sg_tube','sg_mount'].every(id=>countEquip(p,id));const r=Math.random();
        const id=enhanced?['planet','galaxy','blackhole','boundary'][Math.min(3,Math.floor(r*4))]:r<.6?'star':r<.7?'planet':r<.8?'galaxy':r<.9?'blackhole':'boundary';
        outcome={type:id,label:{star:'發現星座',planet:'發現星球',galaxy:'發現星系',blackhole:'發現黑洞',boundary:'發現宇宙邊界'}[id],enhanced};
        if(id==='star'||id==='planet') {
          damage(Math.floor(((id==='star'?15:enhanced?35:25)+stat)*bardMultiplier),'mag');
          const stunBase = enhanced ? 30 : 10;
          const stunCheck = this.checkPositiveFateInterference(p, stunBase, '天體觀測・行星暈眩');
          if(id==='planet'&&stunCheck.success&&this.monsterAllowsEffect('暈眩')){this.monsterStunnedThisRound=true;outcome.stunned=true;}
        }
        if(id==='galaxy')for(const ally of alive(this))effect(ally,'galaxy','發現星系',1,{value:enhanced?10:5});
        if(id==='blackhole') {
          damage(enhanced?10:5,'true');
          if(!enhanced)for(const ally of alive(this)) {
            const before=this.getHpSnapshot(),res=this.applyDamageToPlayer(ally,5,{kind:'friendly',trueDamage:true});const after=this.getHpSnapshot();
            this.p8Results.push({kind:'damage',targetId:ally.id,finalDamage:res.hpDmg+res.tempAbsorbed,hpDmg:res.hpDmg,absorbed:res.tempAbsorbed,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===ally.id),targetAfter:after.players.find(x=>x.id===ally.id),hpSnapshot:after});
          }
        }
        if(id==='boundary') {
          const ally=alive(this).sort((a,b)=>a.hp-b.hp)[0];
          if(ally&&!this.p8Has(ally,'boundary'))effect(ally,'boundary','邊界鎖定',Infinity,{permanent:true,barrier:enhanced&&ally.hp===ally.maxHp});
        }
        this.p8Log(`${p.name}完成天體觀測：【${outcome.label}】${enhanced?'・克卜勒的深空天眼':''}${outcome.stunned?'，魔物本輪暈眩':''}。`);
      } else if(p.action==='sg_clock') {
        const r=Math.random(),id=r<.7?'accelerate':r<.8?'reset':r<.9?'overload':'nothing';outcome={type:id,label:{accelerate:'軌道微調',reset:'超新星重啟',overload:'過載躍遷',nothing:'星軌虛耗'}[id]};
        // Deferred until the common cooldown owner has charged this round's casts.
        (this.p8ClockEvents ||= []).push(id);if(id==='overload')for(const ally of alive(this))effect(ally,'overload','過載躍遷',1,{value:5});
        this.p8Log(`${p.name}重塑時計：【${outcome.label}】。`);
      }
    } else if(p.role==='gladiator') {
      const inArena=this.arena?.playerId===p.id;
      if(p.action==='basic')damage(Math.floor((10+stat)*bardMultiplier));
      if(p.action==='g_sacrifice') {
        if(p.hp<=1){this.p8Log(`${p.name}生命不足，無法施放一技能。`);}
        else if(inArena){category='OFFENSIVE';damage(Math.floor((15+this.memberIds.length*10+(p.rage||0)*25+stat)*bardMultiplier));outcome={type:'arena_assault',label:'血殺重擊'};}
        else {
          const before=this.getHpSnapshot();p.hp=Math.max(1,p.hp-Math.max(1,Math.round(p.maxHp*.2)));
          const paid=this.getHpSnapshot(),selfDamage=before.players.find(x=>x.id===p.id).hp-p.hp;
          this.p8Results.push({kind:'damage',targetId:p.id,finalDamage:selfDamage,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===p.id),targetAfter:paid.players.find(x=>x.id===p.id),hpSnapshot:paid,presentationBeat:'self_damage'});
          p.rage=(p.rage||0)+1;
          if(selfDamage>0&&countEquip(p,'g_xiphos'))p.bloodStacks=(p.bloodStacks||0)+1;
          if(p.hp>0&&p.hp<30&&countEquip(p,'g_cuirass'))bloodHealApplied=effect(p,'blood_heal','死線喘息 +20%',2);
          const after=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:p.id,targetBefore:paid.players.find(x=>x.id===p.id),targetAfter:after.players.find(x=>x.id===p.id),hpSnapshot:after,presentationBeat:'rage_gain'});
          outcome={type:'sacrifice',label:'鮮血獻祭'};this.p8Log(`${p.name}獻祭 ${selfDamage} 生命（最大生命20%，最低保留1），怒氣 ${p.rage}，血祭 ${p.bloodStacks||0}。`);
        }
      }
      if(p.action==='g_arena') {
        if(inArena) {
          category='OFFENSIVE';const cost=p.hp;
          const before=this.getHpSnapshot();p.hp=0;p.noReviveFloor=this.floor;
          const after=this.getHpSnapshot();this.p8Results.push({kind:'damage',targetId:p.id,finalDamage:cost,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===p.id),targetAfter:after.players.find(x=>x.id===p.id),hpSnapshot:after,presentationBeat:'self_zero'});
          damage(cost+(p.rage||0)*(countEquip(p,'g_cingulum')?15:10));outcome={type:'suicide',label:'同歸於盡'};this.p8Log(`${p.name}以全部 ${cost} 生命發動【同歸於盡】，本層不能甦生。`);
        } else {this.arenaPending={playerId:p.id,round:this.battleRound+1};outcome={type:'challenge',label:'死鬥宣告'};this.p8Log(`${p.name}發出死鬥宣告，下回合進入競技場。`);effect(p,'arena_challenge','死鬥宣告');}
      }
    } else if(p.role==='samurai') {
      const soul=p.soul||0, missing=1-p.hp/p.maxHp, corrosion=this.roundModifiers?.equipmentEffectMultiplier??1;
      const mult=1+.10*countEquip(p,'sa_oboro')*corrosion+(countEquip(p,'sa_murasame')?missing*.25*corrosion:0);
      if(p.action==='sa_tsubame') {
        if(soul<4){this.p8Log(`${p.name}武魂不足，燕返未施放。`);outcome={type:'invalid',label:'武魂不足'};}
        else {p.soul-=4;for(let i=0;i<4&&m.hp>0;i++)damage(Math.floor((10+stat)*bardMultiplier*mult),'phys',{penetration:1});outcome={type:'tsubame',label:'秘劍・燕返'};}
      } else {
        const burstChance = Math.round(Math.min(0.7, 0.3 + 0.05 * soul) * 100);
        const burst = p.action === 'sa_cut' && soul > 0 && this.checkPositiveFateInterference(p, burstChance, '一刀兩斷・武魂爆發').success;
        if(p.action==='sa_cut'&&soul===0)p.parryChance=.7;
        damage(Math.floor(((p.action==='sa_cut'?15:10)+stat)*bardMultiplier*mult*(burst?2:1)),'phys',{critical:burst});
        p.soul=Math.min(8,soul+1);outcome={type:burst?'soul_burst':'normal',label:burst?'武魂爆發':undefined};
      }
      this.p8Log(`${p.name}【${outcome.label||'居合攻擊'}】，武魂 ${p.soul||0}/8。`);
    } else if(p.role==='sage') {
      p.sageX ??=30;p.sageOperand ??=Math.floor(Math.random()*30)+1;p.sagePhase ||= 'hypothesis';
      const actual=damage(Math.floor((10+stat)*bardMultiplier),'phys',{penetration:p.action==='sge_deduce'?.5:0});
      if(p.sagePhase==='hypothesis') {
        if(p.action==='basic')p.sageOperand=actual;
        else if(p.action==='sge_deduce')p.sageOperand+=actual;
        else {
          p.sageInduction=true;p.sageSamplingEnded=false;
        }
      } else {
        p.sageOperand+=p.action==='sge_induce'?(p.sageOperand%2===0?9:8):(p.action==='sge_deduce'?5:2);
        p.sageSolvedThisRound=true;
      }
      if(p.sagePhase==='hypothesis')p.sagePreviousAction=p.action;
      p.sageLastAction=p.action;this.p8Log(`${p.name}【${p.sagePhase==='solve'?'求解':'假設'}】X=${p.sageX}，Operand=${p.sageOperand}。`);
    } else if(p.role==='augur') {
      if(p.action==='basic') {
        let baseDmg = 10;
        if(p.observedTargetId === p.id) baseDmg = this.applyFateBlessing(p, baseDmg);
        const actual = damage(Math.floor((baseDmg+stat)*bardMultiplier), 'mag');
        if(actual > 0 && m.hp >= 0) {
          this.p8Effect(m, 'star_break', '星芒破障・效抗 -15%', 2, { value: 15 }, true);
          this.p8Log(`🔮 **${p.name}** 觸發被動【星芒破障】，使 Boss 效果抗性降低 15%（持續 2 回合）！`, 'buff');
        }
        const n = countEquip(p, 'aug_amethyst');
        const repayAmount = 8 + (n > 0 ? 4 + (n - 1) * 2 : 0);
        const paid = this.repayAugurDebt(p, repayAmount, 'skill');
        if(paid > 0) {
          this.p8Log(`🔮 **${p.name}** 施放【水晶折光】，清償自身最早到期的 **${paid}** 點【命債】！`, 'heal');
        }
        outcome = { type: 'normal', label: '水晶折光', debtPaid: paid, damage: actual };
      } else if(p.action==='aug_bind') {
        const targetId = p.targetPlayerId;
        const target = this.players[targetId];
        if (target && target.hp > 0 && target.id !== p.id) {
          p.observedTargetId = target.id;
        } else {
          p.observedTargetId = this.selectDefaultObservedTarget(p);
        }
        p.augurCardState = 'empty';
        p.augurIntervenedThisRound = false;
        p.augurBindingBoostRound = this.battleRound;
        const newTarget = this.players[p.observedTargetId] || p;
        this.p8Log(`🤲🔮 **${p.name}** 施放【命運繫結】，將觀測目標切換為 **${newTarget.name}**，本回合享有強化加護（數值 +25%，干涉加成提升）！`, 'buff');
        category = 'BUFF';
        outcome = { type: 'bind', label: '命運繫結', targetId: p.observedTargetId, targetName: newTarget.name };
      } else if(p.action==='aug_reckon') {
        let baseDmg = 15;
        if(p.observedTargetId === p.id) baseDmg = this.applyFateBlessing(p, baseDmg);
        const actual = damage(Math.floor((baseDmg+stat)*bardMultiplier), 'mag');
        if(actual > 0 && m.hp >= 0) {
          this.p8Effect(m, 'star_break', '星芒破障・效抗 -15%', 2, { value: 15 }, true);
        }
        const hasForbiddenTome = (p.equips || []).some(e => e.id === 'aug_forbidden_tome');
        const omenBonus = hasForbiddenTome ? 18 : 10;
        this.p8Effect(m, 'reversed_omen', `凶兆逆位・易傷 +${omenBonus}%`, 2, { value: omenBonus }, true);
        this.p8Log(`🃏⚖️ **${p.name}** 烙印【凶兆逆位】，使 Boss 受到我方全體傷害提高 **${omenBonus}%**（持續 2 回合）！`, 'debuff');
        const paid = this.repayAugurDebt(p, 25, 'skill');
        if(paid > 0) {
          this.p8Log(`⚖️ **${p.name}** 命債清償，清償了 **${paid}** 點【命債】！`, 'heal');
        }
        let bonusHealAugur = 0, bonusHealTarget = 0;
        if(paid >= 15) {
          bonusHealAugur = this.applyHealWithOverheal(p, 10, { directHp: true });
          const obs = this.players[p.observedTargetId];
          if(obs && obs.hp > 0 && obs.id !== p.id) {
            bonusHealTarget = this.applyHealWithOverheal(obs, 10);
          }
          this.p8Log(`✨ **${p.name}** 清償滿 15 點命債，額外為自身與觀測目標各回復 10 點生命！`, 'heal');
        }
        category = 'DEBUFF';
        outcome = { type: 'reckon', label: '命運清算・凶兆逆位', debtPaid: paid, bonusHealAugur, bonusHealTarget, omenBonus, damage: actual };
      }
    }
    if(!this.p8Results.length){const snap=this.getHpSnapshot(),target=outcome.type==='immune'?snap.monster:snap.players.find(x=>x.id===p.id);this.p8Results.push({kind:'status',targetId:outcome.type==='immune'?'monster':p.id,outcome,targetBefore:target,targetAfter:target,hpSnapshot:snap});}
    for(const r of this.p8Results){r.monsterName=m.name;r.monsterAvatar=m.avatar;}
    this.p8Visuals=null;return {outcome,category,bloodHealApplied};
  },
  p8Cooldowns() {
    for(const id of this.p8ClockEvents||[])for(const p of alive(this))for(const key of Object.keys(p.cooldowns||{})) {
      if(id==='reset')p.cooldowns[key]=0;
      else if(p.cooldowns[key]>0)p.cooldowns[key]=Math.max(0,p.cooldowns[key]+(id==='accelerate'?-1:id==='overload'?1:0));
    }
    this.p8ClockEvents=[];
  },
  p8ResolveEquation(p,queue,log,resistance,bardMultiplier=1.0) {
    if(p.sageEquationResolved)return;
    const m=this.currentMonster;this.p8LogBuffer=log;
    const event=(p,name,id,resolve,outcome={type:'normal'})=>{
      const before=this.getHpSnapshot();this.p8Results=[];this.p8Visuals=[];resolve();const after=this.getHpSnapshot();
      queue.push({type:'player_action',category:'OFFENSIVE',sourceId:p.id,sourceName:p.name,sourceRole:p.role,actionId:id,skillName:name,monsterName:m.name,monsterAvatar:m.avatar,
        targetId:'monster',targetName:m.name,hpSnapshotBefore:before,hpSnapshot:after,results:this.p8Results,finalDamage:this.p8Results.filter(r=>r.targetId==='monster'&&r.kind==='damage').reduce((n,r)=>n+r.finalDamage,0),damageType:'physical',outcome,detail:name});
      this.p8Results=null;this.p8Visuals=null;
    };
      if(p.role==='sage' && (!this.arena||this.arena.playerId===p.id)) {
        if(p.sagePhase==='solve') {
          // Lock the resources before decay, growth, debt or friendly damage.
          const operand=Math.round(p.sageOperand), x=Math.max(0,p.sageX??30), lens=countEquip(p,'sge_lens'),rule=countEquip(p,'sge_rule');
          const even=operand%2===0,prime=isPrime(operand),square=Number.isInteger(Math.sqrt(operand));
          const etaVal=eta(x),growth=sageGrowth[p.sageLastAction]||sageGrowth.basic;
          const R=1+(rule?0.10+(rule-1)*0.05:0)*(this.roundModifiers?.equipmentEffectMultiplier??1);
          const confusionChance=sageConfusionChance(x);
          const lensBonus=(lens?0.10+(lens-1)*0.05:0)*(this.roundModifiers?.equipmentEffectMultiplier??1);
          const successChance=Math.min(growth.success+lensBonus,1-confusionChance);
          const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
          const augur = augurs[0];
          const r = Math.random();
          let resolution;
          if (!augur) {
            resolution = r < confusionChance ? 'CONFUSION' : r < confusionChance + successChance ? 'SUCCESS' : 'NOTHING';
          } else {
            const P_neg = confusionChance;
            const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 0.25 : 0.20;
            const D = Math.min(P_neg, M_red);
            if (r < P_neg - D) {
              resolution = 'CONFUSION';
            } else if (r < P_neg) {
              augur.augurIntervenedThisRound = true;
              augur.augurCardState = 'reversed';
              let debt = Math.min(20, Math.round(D * 100));
              if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
              this.addAugurDebt(augur, debt);
              this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${p.name}** 攔截【方程結算・思緒紊亂】的負面失誤，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
              resolution = 'NOTHING';
            } else {
              let M_pos = (augur.augurBindingBoostRound === this.battleRound) ? 0.20 : 0.15;
              if (countEquip(augur, 'aug_gilded_box')) M_pos += 0.05;
              const boostedSuccessChance = Math.min(1 - confusionChance, successChance + M_pos);
              if (r < confusionChance + boostedSuccessChance) {
                augur.augurIntervenedThisRound = true;
                augur.augurCardState = 'upright';
                this.p8Log(`🃏🌟 **${augur.name}** 水晶球光芒凝聚，諭示牌轉為【正位】！順應命運使 **${p.name}** 的【推演演算・成功】正面機率提升並成功觸發！`, 'buff');
                resolution = 'SUCCESS';
              } else {
                resolution = 'NOTHING';
              }
            }
          }
          const baseEquationDamage=Math.round(Math.abs(operand*etaVal));
          const damageAfterEquipment=Math.round(baseEquationDamage*R);
          // Round the combined modifiers once, never the intermediate ruler value.
          const raw=Math.round(baseEquationDamage*R*(resolution==='CONFUSION'?.8:1));
          const properties=[even?'EVEN':'ODD',...(prime?['PRIME']:[]),...(square?['SQUARE']:[])];
          const outcome={type:'equation',label:'方程結算',operand,x,xBefore:x,eta:etaVal,
            baseEquationDamage,damageAfterEquipment,damageAfterConfusion:raw,equationDamage:raw,ruleMultiplier:R,properties,
            resolution,confusionTriggered:resolution==='CONFUSION',confusionChance,successChance,nothingChance:Math.max(0,1-confusionChance-successChance),
            confusionTargetId:null,confusionDamage:0,confusionHpDamage:0,confusionAbsorbed:0,debtScheduled:0};
          // Claim before resolving so the round-end fallback cannot replay this event.
          p.sageEquationResolved=true;
          event(p,'方程結算','sge_equation',()=>{
            const actual=this.p8DamageMonster(p,raw,'phys',resistance,{penetration:even?0.4:1,equation:true});
            outcome.actualBossDamage=actual;
            if(resolution==='CONFUSION') {
              const candidates=alive(this).filter(ally=>ally.id!==p.id),target=candidates.length?roll(candidates):p;
              const before=this.getHpSnapshot();
              const hit=this.applyDamageToPlayer(target,10,{kind:'sage_confusion'});
              const after=this.getHpSnapshot();
              Object.assign(outcome,{confusionTargetId:target.id,confusionDamage:10,confusionHpDamage:hit.hpDmg,confusionAbsorbed:hit.tempAbsorbed});
              this.p8Results.push({kind:'damage',targetId:target.id,damageType:'true',finalDamage:hit.actualDmg,hpDmg:hit.hpDmg,
                tempAbsorbed:hit.tempAbsorbed,absorbed:hit.tempAbsorbed,label:'思緒紊亂',presentationBeat:'sage_confusion',
                outcome:{type:'sage_confusion'},targetBefore:before.players.find(a=>a.id===target.id),targetAfter:after.players.find(a=>a.id===target.id),hpSnapshot:after});
              this.p8Effect(p,'sage_confusion','思緒紊亂・本次方程 -20%',1,{icon:'debuff'});
            }
            if(prime){this.p8DamageMonster(p,15,'true',resistance,{equation:true});for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=0;p.sagePrimeResetPending=true;}
            if(even) {
              const allies=alive(this),totalShield=Math.floor(actual*.4),cap=Math.floor(p.maxHp*.20);
              const each=allies.length?Math.floor(totalShield/allies.length):0,remainder=allies.length?totalShield%allies.length:0;
              outcome.totalShield=totalShield;outcome.shieldCap=cap;outcome.shields=[];
              allies.forEach((ally,i)=>{
                const before=this.getHpSnapshot(),value=Math.min(each+(i<remainder?1:0),cap);
                this.p8GrantShield(ally,value,2,'sage',p.id);
                const after=this.getHpSnapshot();outcome.shields.push({targetId:ally.id,value});
                this.p8Results.push({kind:'status',targetId:ally.id,presentationBeat:'sage_shield',
                  targetBefore:before.players.find(a=>a.id===ally.id),targetAfter:after.players.find(a=>a.id===ally.id),hpSnapshot:after});
              });
            } else {
              const active=this.p8Has(m,'sage_exposed');
              this.p8Effect(m,'sage_exposed','ODD 承傷 +10%',2,{starts:active?.starts<=this.battleRound?active.starts:this.battleRound+1});
            }
            if(square){
              const active=this.p8Has(m,'sage_square');
              this.p8Effect(m,'sage_square','SQUARE 直接傷害 -25%',2,{starts:active?.starts<=this.battleRound?active.starts:this.battleRound+1});
            }
            // Finish all combat effects before paying decay and granting growth.
            outcome.decayAmount=sageDecay(x);outcome.baseXGain=growth.base;
            outcome.bonusXGain=resolution==='SUCCESS'?growth.bonus(operand):0;
            outcome.bonusX=outcome.bonusXGain;
            outcome.variableContribution=outcome.baseXGain+outcome.bonusXGain;
            p.sageX=Math.max(0,x-outcome.decayAmount)+outcome.variableContribution;
            if(p.sageLastAction==='sge_induce'){p.sageDebt=(p.sageDebt||0)+20;p.sageDebtScheduledRound=this.battleRound;outcome.debtScheduled=20;}
            outcome.xAfter=p.sageX;p.sageCycleRound=0;p.sageSolvedThisRound=false;
          },outcome);
          this.p8Log(`${p.name}方程 ${operand} × η(${x}) = ${raw}【${properties.join(' / ')}】，${resolution}（衰減 -${outcome.decayAmount}，固定 +${outcome.baseXGain}，額外 +${outcome.bonusXGain}），X=${p.sageX}。`);
        } else p.sageCycleRound=1;
      }
    p.sageEquationResolved=true;this.p8LogBuffer=log;
  },
  p8EndRound(queue,log,resistance,bardMultiplier=1.0) {
    this.p8LogBuffer=log;
    const m=this.currentMonster;
    const event=(p,name,id,resolve,outcome={type:'normal'})=>{
      const before=this.getHpSnapshot();this.p8Results=[];this.p8Visuals=[];resolve();const after=this.getHpSnapshot();
      queue.push({type:'player_action',category:'OFFENSIVE',sourceId:p.id,sourceName:p.name,sourceRole:p.role,actionId:id,skillName:name,monsterName:m.name,monsterAvatar:m.avatar,
        targetId:'monster',targetName:m.name,hpSnapshotBefore:before,hpSnapshot:after,results:this.p8Results,finalDamage:this.p8Results.filter(r=>r.targetId==='monster'&&r.kind==='damage').reduce((n,r)=>n+r.finalDamage,0),damageType:'physical',outcome,detail:name});
      this.p8Results=null;this.p8Visuals=null;
    };
    for(const p of alive(this)) {
      p.sageSamplingEnded=true;
      if(m.hp>0&&p.role==='warrior'&&this.p8Has(p,'warrior_resolve')&&p.warriorRoundDamage>0)event(p,'堅定反擊','w_counter',()=>{this.p8DamageMonster(p,p.warriorRoundDamage,'phys',resistance);this.p8Log(`${p.name}【堅定反擊】返還本輪實受 ${p.warriorRoundDamage} 傷害。`);});
      p.warriorRoundDamage=0;
      if(m.hp>0&&p.role==='samurai'&&p.parriedCount>0) {
        const n=countEquip(p,'sa_murasame')?20+p.parriedCount*2:countEquip(p,'sa_haori')?5:10+p.parriedCount;
        event(p,'狂刀反擊','sa_counter',()=>this.p8DamageMonster(p,n,'phys',resistance));this.p8Log(`${p.name}統一反擊 ${n}（招架 ${p.parriedCount} 次）。`);
      }
      if(p.role==='sage'&&!p.sageEquationResolved&&(p.sagePhase==='hypothesis'||p.sageSolvedThisRound))this.p8ResolveEquation(p,queue,log,resistance,bardMultiplier);
      if(p.role==='augur' && p.augurFateDebts && p.augurFateDebts.length > 0) {
        const expired = p.augurFateDebts.filter(d => d.dueRound <= this.battleRound);
        p.augurFateDebts = p.augurFateDebts.filter(d => d.dueRound > this.battleRound);
        const expiredDebt = expired.reduce((n, d) => n + d.amount, 0);
        if (expiredDebt > 0) {
          const before = this.getHpSnapshot();
          p.hp = Math.max(0, p.hp - expiredDebt);
          const after = this.getHpSnapshot();
          this.p8Log(`💀💥 **${p.name}** 的 ${expiredDebt} 點【命債】到期清算反噬！無視護盾直接扣除 **${expiredDebt}** 點生命！（❤️ ${p.hp}/${p.maxHp}）`, 'damage');
          queue.push({
            type: 'player_action', category: 'DEBT_EXPIRY', sourceId: p.id, sourceName: p.name, sourceRole: 'augur',
            actionId: 'aug_expiry', skillName: '命債到期反噬', monsterName: m?.name, monsterAvatar: m?.avatar,
            targetId: p.id, targetName: p.name, hpSnapshotBefore: before, hpSnapshot: after,
            results: [{ kind: 'damage', targetId: p.id, damageType: 'true', finalDamage: expiredDebt, hpDmg: expiredDebt,
              targetBefore: before.players.find(x => x.id === p.id), targetAfter: after.players.find(x => x.id === p.id),
              hpSnapshot: after }],
            finalDamage: expiredDebt, damageType: 'true', outcome: { type: 'expiry', debtExpired: expiredDebt }, detail: '命債到期反噬'
          });
          if (p.hp <= 0) {
            this.clearPlayerDebuffs(p);
            this.p8Log(`💀 **${p.name}** 因命運因果反噬過重倒地隕落！`, 'damage');
          }
        }
      }
    }
    // The arena restores its original maximum using the exit ratio, including death.
    if(this.arena)this.p8ExitArena(queue);
    this.arenaRoundLock=null;
    this.p8LogBuffer=null;
  }
};
