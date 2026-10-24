import { enemyEffect, afterPlayerDamage, drainEnemyEvents } from './enemy-mechanics.js';
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
export const sageGrowth = {
  basic:{base:10,success:.6,bonus:o=>Math.round(5+o*.30)},
  sge_deduce:{base:14,success:.5,bonus:o=>Math.round(7+o*.30)},
  sge_induce:{base:4,success:.4,bonus:o=>Math.round(2+o*.15)}
};
// The stable server formation order owns remainder allocation, before mitigation.
export function splitEquationDamage(total, enemies) {
  const amount=Math.max(0,Math.round(total));
  if(!enemies.length)return [];
  const each=Math.floor(amount/enemies.length),remainder=amount%enemies.length;
  return enemies.map((enemy,index)=>({enemyId:enemy.instanceId,name:enemy.name,damage:each+(index<remainder?1:0)}));
}
export function sageEquationPreview(p,room) {
  const x=Math.max(0,p.sageX??30),operand=p.sageOperand||0;
  const corrosion=room.roundModifiers?.equipmentEffectMultiplier??1;
  const rule=countEquip(p,'sge_rule'),lens=countEquip(p,'sge_lens');
  const ruleMultiplier=1+(rule ? .10+(rule-1)*.05 : 0)*corrosion;
  const confusionChance=sageConfusionChance(x),lensBonus=(lens ? .10+(lens-1)*.05 : 0)*corrosion;
  const enemies=room.getAttackableEnemies(p);
  return {eta:eta(x),confusionChance,decayAmount:sageDecay(x),livingEnemyCount:enemies.length,options:Object.entries(sageGrowth).map(([id,growth])=>{
    const op=operand+(id==='sge_induce'?(operand%2===0?9:8):id==='sge_deduce'?5:2);
    const baseEquationDamage=Math.round(Math.abs(op*eta(x)));
    return {id,operand:op,properties:[op%2===0?'EVEN':'ODD',...(isPrime(op)?['PRIME']:[]),...(Number.isInteger(Math.sqrt(op))?['SQUARE']:[])],
      baseEquationDamage,damageAfterEquipment:Math.round(baseEquationDamage*ruleMultiplier),damageAfterConfusion:Math.round(baseEquationDamage*ruleMultiplier*.8),
      livingEnemyCount:enemies.length,distribution:splitEquationDamage(Math.round(baseEquationDamage*ruleMultiplier),enemies),
      confusionDistribution:splitEquationDamage(Math.round(baseEquationDamage*ruleMultiplier*.8),enemies),primeDistribution:isPrime(op)?splitEquationDamage(15,enemies):[],
      blocked:id===p.sagePreviousAction,cooldown:p.cooldowns?.[id]||0,baseXGain:growth.base,bonusXGain:growth.bonus(op),
      successChance:Math.min(growth.success+lensBonus,1-confusionChance),debtScheduled:id==='sge_induce'?20:0};
  })};
}
export function p8State(p,room) {
  const effects=Object.entries(p.p8Effects || {}).filter(([,s])=>s.until>=room.battleRound).map(([id,s])=>({id,icon:s.icon||'buff',label:s.label,turns:s.permanent?null:Math.min(s.duration||Infinity,s.until-room.battleRound+1),value:s.value}));
  if (p === room.currentMonster || (room.enemies && room.enemies.includes(p))) {
    if (p.augurResistanceBreak > 0) effects.push({id:'augur_resistance_break',icon:'debuff',label:'星芒破障',turns:p.augurResistanceBreak,value:'效果抗性 −15pp',isNegative:true,category:'DEBUFF'});
    if (p.reversedOmenRemaining > 0) effects.push({id:'reversed_omen',icon:'debuff',label:'凶兆逆位',turns:p.reversedOmenRemaining,value:`受傷 +${p.reversedOmenBonus || 10}%`,isNegative:true,category:'DEBUFF'});
  }
  const fateBlessing = p.id ? room.getFateBlessing?.(p) || 0 : 0;
  if (p.hp > 0 && fateBlessing > 0) effects.push({id:'fate_blessing',icon:'buff',label:'命運加護',value:`基礎數值 +${Math.round(fateBlessing * 100)}%`});
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
      const totalDebt = (p.augurFateDebts || []).reduce((sum, d) => sum + d.amount, 0);
      const targetName = room.players[p.observedTargetId]?.name || '自身';
      const cardText = p.augurCardState === 'reversed' ? '逆位' : p.augurCardState === 'upright' ? '正位' : '空象';
      effects.push({ id: 'augur_card', icon: 'buff', label: `諭示牌・${cardText}`, value: `觀測: ${targetName}` });
      if (totalDebt > 0) {
        effects.push({ id: 'fate_debt', icon: 'debuff', label: '命債', stacks: totalDebt });
      }
      if (p.augurBindingBoostRound === room.battleRound) {
        effects.push({ id: 'fate_binding', icon: 'buff', label: '命運繫結強化', turns: 1 });
      }
    }
  }
  const x = p.sageX ?? 30;
  const resource=p.role==='sage'?`變量(X) ${x}${p.sageDebt?` · 待付透支 ${p.sageDebt}`:''} · 運算元 ${p.sageOperand ?? 0} · ${p.sagePhase==='solve'?'求解':'假設'}`:
    p.role==='samurai'?`武魂 ${p.soul||0}/8${p.kyoutou?' · 狂刀':''}`:
    p.role==='gladiator'?`怒氣 ${p.rage||0} · 血祭 ${p.bloodStacks||0}${room.arena?.playerId===p.id?' · 死亡角鬥場':''}`:
    p.role==='augur'?`命債 ${(p.augurFateDebts || []).reduce((sum, d) => sum + d.amount, 0)}/60 · 牌象: ${p.augurCardState === 'reversed' ? '逆位' : p.augurCardState === 'upright' ? '正位' : '空象'} · 觀測: ${room.players[p.observedTargetId]?.name || '自身'}`:
    p.role==='assassin'?`匿蹤 ${p.stealthStacks||0} · 追擊 ${p.followUpsThisRound||0}/${room.getAssassinFollowUpCap(p)}`:
    p.role==='paladin'&&p.hp>0?'神聖嘲諷・受擊權重 ↑':
    p.role==='warrior'?`受傷攻擊 +${p.warriorStacks||0}/15`:'';
  return {resourceSummary:resource, fateBlessing, sageX:x, sageOperand:p.sageOperand,sagePhase:p.sagePhase,
    ...(p.role === 'augur' ? {
      observedTargetId:p.observedTargetId || null, augurCardState:p.augurCardState || 'empty',
      augurIntervenedThisRound:!!p.augurIntervenedThisRound, augurBindingBoostRound:p.augurBindingBoostRound || 0,
      augurFateDebts:structuredClone(p.augurFateDebts || []),
      augurEquipment:{amethyst:countEquip(p,'aug_amethyst'),gilded:countEquip(p,'aug_gilded_box') > 0,forbidden:countEquip(p,'aug_forbidden_tome') > 0}
    } : {}),
    sageDebt:p.sageDebt||0,sageConfusionChance:sageConfusionChance(x),
    ...(p.role==='sage'?{sageEquationPreview:sageEquationPreview(p,room)}:{}),
    sageSampling:!!p.sageInduction&&!p.sageSamplingEnded&&p.hp>0,
    soul:p.soul||0, rage:p.rage||0, bloodStacks:p.bloodStacks||0, warriorStacks:p.warriorStacks||0,
    // Read-only presentation evidence, including protection on non-Paladin allies.
    paladinFatalGuard:!!p.paladinFatalGuard,
    paladinGrace:p.paladinGrace?{...p.paladinGrace}:null,
    presentationShields:(p.p8Shields||[]).filter(s=>s.value>0&&s.until>=room.battleRound).map(s=>({kind:s.kind,value:s.value})),
    arenaActive:!!(room.arena||room.enemyArena) && (room.arena||room.enemyArena).playerId===p.id,
    arenaBlocked:!!(room.arena||room.enemyArena) && (room.arena||room.enemyArena).playerId!==p.id, noReviveThisFloor:p.noReviveFloor===room.floor,
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
    if ((target === this.currentMonster || (this.enemies && this.enemies.includes(target))) && !resistanceChecked && !this.monsterAllowsEffect(label, target)) return false;
    target.p8Effects ||= {}; target.p8Effects[id]={label,until:this.battleRound+turns-1,...extra};
    return true;
  },
  p8Has(target,id) { return target?.p8Effects?.[id]?.until>=this.battleRound ? target.p8Effects[id] : null; },
  p8GrantShield(p,value,turns=1,kind='shield',ownerId=null) {
    value=Math.max(0,Math.floor(value)); if(p.hp<=0)return;
    const corrosion=enemyEffect(this,p,'shield_decay');if(corrosion)value=Math.floor(value*(1-corrosion.value));
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
  p8RefreshEquipment() {
    const globalCorrosion = this.roundModifiers?.equipmentEffectMultiplier ?? 1;
    const teamHp = Object.values(this.players).reduce((n, p) => {
      const c = (p.corrosionTurns > 0) ? 0.5 : globalCorrosion;
      return n + countEquip(p, 'dw_loom') * Math.floor(20 * c);
    }, 0);
    for (const p of Object.values(this.players)) {
      const corrosion = (p.corrosionTurns > 0) ? 0.5 : globalCorrosion;
      const corroded = (p.equips || []).filter(e => /^(dw_|sg_|g_|sa_|sge_|pal_)/.test(e.id)).reduce((n, e) => n + (e.bonusHp || 0) - Math.floor((e.bonusHp || 0) * corrosion), 0);
      const disabled = countEquip(p, 'sa_murasame') ? countEquip(p, 'sa_haori') * Math.floor(20 * corrosion) : 0;
      const delta = teamHp - (p.p8TeamHp || 0) - disabled + (p.p8DisabledHp || 0) - corroded + (p.p8CorrodedHp || 0);
      p.maxHp = Math.max(1, p.maxHp + delta); if (p.hp > 0) p.hp = Math.max(1, Math.min(p.maxHp, p.hp + delta));
      p.p8TeamHp = teamHp; p.p8DisabledHp = disabled; p.p8CorrodedHp = corroded;
    }
  },
  getAugurTotalDebt(augur) {
    return (augur?.augurFateDebts || []).reduce((sum, d) => sum + d.amount, 0);
  },
  augmentOmenDamage(amount,enemy=this.currentMonster) {
    const bonus = enemy?.reversedOmenRemaining > 0 ? enemy.reversedOmenBonus || 10 : 0;
    return Math.max(0, Math.floor(amount * (1 + bonus / 100)));
  },
  clearAugurBattleDebts() {
    for (const p of Object.values(this.players)) if (p.role === 'augur') p.augurFateDebts = [];
  },
  recordAugurReaction(augur, actionId, targetId, before, outcome = {}, results = []) {
    const names = {aug_reverse:'逆位・違逆命運',aug_upright:'正位・順應命運',aug_tome:'禁忌厄運聖契',aug_debt_heal:'治療抵銷命債'};
    const reaction = {type:'player_action',category:'INTERVENTION',sourceId:augur.id,sourceName:augur.name,sourceRole:'augur',
      actionId,skillName:names[actionId],targetId,outcome,results,monsterName:this.currentMonster?.name,monsterAvatar:this.currentMonster?.avatar,
      hpSnapshotBefore:before,hpSnapshot:this.getHpSnapshot()};
    (this.augurReactions ||= []).push(reaction);
    return reaction;
  },
  augurTomeStrike(augur, changedDebt) {
    const monster = this.currentMonster;
    if (!changedDebt || !countEquip(augur,'aug_forbidden_tome') || !monster || monster.hp <= 0 || monster.untargetableThisRound) return 0;
    const before = this.getHpSnapshot();
    const raw = Math.round(Math.abs(changedDebt) * .5);
    const actual = Math.min(monster.hp, this.augmentOmenDamage(raw));
    monster.hp = Math.max(0, monster.hp - actual);
    const after = this.getHpSnapshot();
    const result = {kind:'damage',targetId:'monster',sourceId:augur.id,sourceRole:'augur',damageType:'true',finalDamage:actual,hpDamage:actual,
      outcome:{type:'augur_tome'},targetBefore:before.monster,targetAfter:after.monster,hpSnapshot:after};
    this.p8Results?.push(result);
    this.augurVisuals?.push({type:'augur_tome',sourceId:augur.id,targetId:'monster',value:actual,dmgType:'true'});
    this.recordAugurReaction(augur,'aug_tome','monster',before,{type:'tome',changedDebt,damage:actual},[result]);
    this.p8Log(`📖💥 **${augur.name}** 的【禁忌厄運聖契】將 ${Math.abs(changedDebt)} 點命債變動化為 **${actual}** 點無視抗性的真實傷害！`,'damage');
    return actual;
  },
  addAugurDebt(augur, amount) {
    if (amount <= 0) return 0;
    augur.augurFateDebts = augur.augurFateDebts || [];
    const currentTotal = this.getAugurTotalDebt(augur);
    const actualAdd = Math.min(amount, Math.max(0, 60 - currentTotal));
    if (actualAdd <= 0) return 0;
    const hasForbidden = countEquip(augur, 'aug_forbidden_tome') > 0;
    const dueRound = this.battleRound + (hasForbidden ? 1 : 2);
    augur.augurFateDebts.push({
      amount: actualAdd,
      createdRound: this.battleRound,
      dueRound
    });
    this.augurTomeStrike(augur, actualAdd);
    return actualAdd;
  },
  repayAugurDebt(augur, maxAmount, source = 'skill') {
    if (maxAmount <= 0 || !augur.augurFateDebts || !augur.augurFateDebts.length) return 0;
    let needed = maxAmount;
    let actualRepaid = 0;
    while (needed > 0 && augur.augurFateDebts.length > 0) {
      const front = augur.augurFateDebts[0];
      const take = Math.min(front.amount, needed);
      front.amount -= take;
      needed -= take;
      actualRepaid += take;
      if (front.amount <= 0) augur.augurFateDebts.shift();
    }
    if (source === 'skill') this.augurTomeStrike(augur, -actualRepaid);
    return actualRepaid;
  },
  deductAugurDebtPassive(augur, healAmount) {
    if (healAmount <= 0 || !augur.augurFateDebts || !augur.augurFateDebts.length) return 0;
    const before=this.getHpSnapshot();
    let needed = healAmount;
    let actualDeducted = 0;
    while (needed > 0 && augur.augurFateDebts.length > 0) {
      const front = augur.augurFateDebts[0];
      const take = Math.min(front.amount, needed);
      front.amount -= take;
      needed -= take;
      actualDeducted += take;
      if (front.amount <= 0) augur.augurFateDebts.shift();
    }
    if(actualDeducted>0)this.recordAugurReaction(augur,'aug_debt_heal',augur.id,before,{type:'debt_heal',repaid:actualDeducted});
    return actualDeducted;
  },
  selectDefaultObservedTarget(augur) {
    const livingAllies = Object.values(this.players).filter(pl => pl.hp > 0 && pl.id !== augur.id);
    if (!livingAllies.length) return augur.id;
    const p1 = ['mage', 'sage', 'assassin', 'samurai', 'archer', 'alchemist'];
    const p2 = ['bard', 'warrior', 'paladin'];
    const p3 = ['gladiator', 'druid', 'stargazer', 'dreamweaver', 'onmyoji'];
    const g1 = livingAllies.filter(pl => p1.includes(pl.role));
    if (g1.length) return g1[Math.floor(Math.random() * g1.length)].id;
    const g2 = livingAllies.filter(pl => p2.includes(pl.role));
    if (g2.length) return g2[Math.floor(Math.random() * g2.length)].id;
    const g3 = livingAllies.filter(pl => p3.includes(pl.role));
    if (g3.length) return g3[Math.floor(Math.random() * g3.length)].id;
    return livingAllies[Math.floor(Math.random() * livingAllies.length)].id;
  },
  getFateBlessing(player) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id);
    if (!augurs.length) return 0;
    let totalBonus = 0;
    for (const augur of augurs) {
      let b = (augur.augurBindingBoostRound === this.battleRound) ? 0.25 : 0.20;
      const n = countEquip(augur, 'aug_amethyst');
      if (n > 0) b += n * 0.05;
      totalBonus += b;
    }
    return totalBonus;
  },
  applyFateBlessing(player, baseValue) {
    const bonus = this.getFateBlessing(player);
    if (!bonus) return baseValue;
    return Math.round(baseValue * (1 + bonus));
  },
  interveneNegative(player, skillName, baseChance) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id && !pl.augurIntervenedThisRound);
    if (!augurs.length) {
      return { failed: Math.random() < (baseChance / 100), intercepted: false };
    }
    const augur = augurs[0];
    const M_red = (augur.augurBindingBoostRound === this.battleRound) ? 25 : 20;
    const D = Math.min(baseChance, M_red);
    const P_low = baseChance - D;
    const roll = Math.random() * 100;
    if (roll < P_low) {
      return { failed: true, intercepted: false, roll };
    } else if (roll < baseChance) {
      const before = this.getHpSnapshot();
      const reactionIndex = this.augurReactions?.length || 0;
      augur.augurIntervenedThisRound = true;
      augur.augurCardState = 'reversed';
      let debt = Math.min(20, D);
      if (countEquip(augur, 'aug_gilded_box')) debt = Math.max(5, debt - 5);
      debt = this.addAugurDebt(augur, debt);
      const reaction = this.recordAugurReaction(augur,'aug_reverse',player.id,before,
        {type:'reverse',skillName,baseChance,finalChance:P_low,roll,reduction:D,debt});
      // Present the intercept before its equipment discharge, within the owning action.
      this.augurReactions.pop(); this.augurReactions.splice(reactionIndex,0,reaction);
      this.p8Log(`🃏🌑 **${augur.name}** 水晶球感應厄運，諭示牌轉為【逆位】！成功為 **${player.name}** 攔截【${skillName}】的負面失誤，封存厄運轉化為 **${debt}** 點【命債】！`, 'buff');
      return { failed: false, intercepted: true, roll, debt };
    } else {
      return { failed: false, intercepted: false, roll };
    }
  },
  intervenePositive(player, skillName, baseChance, rolledPercent) {
    const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === player.id && !pl.augurIntervenedThisRound);
    if (!augurs.length) {
      return { success: (rolledPercent ?? Math.random() * 100) < baseChance, boosted: false, finalChance: baseChance };
    }
    const augur = augurs[0];
    let M_pos = (augur.augurBindingBoostRound === this.battleRound) ? 20 : 15;
    if (countEquip(augur, 'aug_gilded_box')) M_pos += 5;
    const finalChance = Math.min(100, baseChance + M_pos);
    const before = this.getHpSnapshot();
    const roll = rolledPercent ?? Math.random() * 100;
    const success = roll < finalChance;
    // Spending the intervention boosts the chance; it does not guarantee the outcome.
    augur.augurIntervenedThisRound = true;
    augur.augurCardState = 'upright';
    this.recordAugurReaction(augur,'aug_upright',player.id,before,{type:'upright',skillName,baseChance,finalChance,roll,success});
    this.p8Log(`🃏🌟 **${augur.name}** 諭示牌轉為【正位】，使 **${player.name}** 的【${skillName}】機率由 ${baseChance}% 提升至 **${finalChance}%**（${success?'成功觸發':'本次未觸發'}）！`,'buff');
    return { success, boosted:true, roll, finalChance };
  },
  p8ResetBattle() {
    this.p8ExitArena(); this.arenaPending=null;this.enemyArena=null;this.enemyMechanicQueue=[];this.enemyReactionSteps=new WeakSet();
    for(const p of Object.values(this.players)) {
      p.enemyEffects={};p.enemyActionMultiplier=1;
      p.tempHp=Math.max(0,(p.tempHp||0)-(p.temporaryOverheal||0));p.temporaryOverheal=0;
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
        p.augurObservationPending = true;
      }
    }
    if(this.currentMonster)this.currentMonster.p8Effects={};
    for(const e of this.enemies || []) if(e) e.p8Effects={};
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
    for(const e of this.enemies || []) if(e && e !== this.currentMonster) this.p8Expire(e);
    if(this.arena && this.arena.until<this.battleRound) {this.p8ExitArena(queue);this.p8Log('死亡角鬥場落幕，隊伍重返戰場。');}
    if(this.arenaPending && this.arenaPending.round===this.battleRound) {
      const p=this.players[this.arenaPending.playerId];
      if(p?.hp>0) {
        const before=this.getHpSnapshot(),originalMaxHp=p.maxHp,ratio=p.hp/p.maxHp,m=this.currentMonster;
        const originalMonsterMaxHp=m?.maxHp;
        p.maxHp=Math.max(1,Math.round(p.maxHp*.6*(this.memberIds.length+1)));p.hp=Math.max(1,Math.round(p.maxHp*ratio));
        if(m){const monsterRatio=m.hp/m.maxHp;m.maxHp=Math.max(1,Math.round(m.maxHp*.6*(this.memberIds.length+1)));m.hp=monsterRatio>0?Math.max(1,Math.round(m.maxHp*monsterRatio)):0;}
        this.arena={playerId:p.id,enemyId:m?.instanceId,originalMaxHp,originalMonsterMaxHp,until:this.battleRound};p.arenaActive=true;
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
      if(p.role==='augur'&&p.hp>0) {
        const before = this.getHpSnapshot();
        p.augurIntervenedThisRound = false;
        p.augurCardState = 'empty';
        const target = this.players[p.observedTargetId];
        const reselected = !target || target.hp <= 0;
        if (reselected) {
          p.observedTargetId = this.selectDefaultObservedTarget(p);
        }
        if (p.augurObservationPending || reselected) {
          queue.push({type:'player_action',category:'BUFF',sourceId:p.id,sourceName:p.name,sourceRole:'augur',actionId:'aug_observe',
            skillName:reselected && this.battleRound > 1?'命運觀測・重新鎖定':'命運觀測',targetId:p.observedTargetId,
            monsterName:this.currentMonster?.name,monsterAvatar:this.currentMonster?.avatar,
            hpSnapshotBefore:before,hpSnapshot:this.getHpSnapshot(),results:[],outcome:{type:'observe',targetId:p.observedTargetId}});
          p.augurObservationPending = false;
        }
      }
      p.p8Shields=(p.p8Shields||[]).filter(s=>{
        if(s.until>=this.battleRound)return true;
        p.tempHp=Math.max(0,(p.tempHp||0)-s.value);
        return false;
      });
    }
    for(const p of Object.values(this.players)) {
      if(p.role==='paladin'&&p.hp>0) {
        if(p.paladinGloryCastedRound && this.battleRound === p.paladinGloryCastedRound + 1) {
          const presentationBefore=this.getHpSnapshot();
          const tracked = p.paladinGloryTrackedDamage || 0;
          let gloryShield = Math.floor(tracked * 0.70);
          const penaltyRate = (p.equips || []).some(e => e.id === 'pal_cuirass') ? 0.15 : 0.40;
          const hasPenalty = this.roleRandom(p,'pal_glory_echo',()=>this.interveneNegative(p, '榮耀讚歌・護盾減半', Math.round(penaltyRate * 100)).failed?'negative':'normal')==='negative';
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
          this.p8PresentPaladinSupport(queue,p,'pal_glory_echo','榮耀迴響',presentationBefore);
        }
        if(p.paladinGrace && this.battleRound >= p.paladinGrace.startRound + 2) {
          const presentationBefore=this.getHpSnapshot();
          const intercepted = p.paladinGrace.interceptedDamage || 0;
          const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
          const gainShield = this.roleRandom(p,'pal_grace_end',()=> (!augurs.length ? (Math.random() < 0.50) : !this.interveneNegative(p, '代受恩典・不獲護盾', 50).failed)?'success':'failure')==='success';
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
          this.p8PresentPaladinSupport(queue,p,'pal_grace_end','恩典收束',presentationBefore);
        }
      }
    }
    // Operands are local to a two-turn cycle; expired shields never feed them.
    for(const p of Object.values(this.players)) {
      if(p.role==='sage'&&p.hp>0) {
        if(!p.sageCycleRound) {
          p.sageOperand=Number(this.roleRandom(p,'sage_operand',()=>Math.floor(Math.random()*30)+1));
        }
        p.sagePhase=p.sageCycleRound?'solve':'hypothesis';
      }
    }
  },
  p8PresentPaladinSupport(queue,p,actionId,skillName,before) {
    const after=this.getHpSnapshot(),results=[];
    for(const target of after.players){
      const old=before.players.find(v=>v.id===target.id);
      const gained=Math.max(0,(target.tempHp||0)-(old?.tempHp||0));
      if(gained>0)results.push({kind:'shield',targetId:target.id,actualShield:gained,targetBefore:old,targetAfter:target,hpSnapshot:after});
    }
    if(!results.length)results.push({kind:'status',targetId:p.id,targetBefore:before.players.find(v=>v.id===p.id),targetAfter:after.players.find(v=>v.id===p.id),hpSnapshot:after});
    queue.push({type:'player_action',category:'SHIELD',sourceId:p.id,sourceRole:'paladin',actionId,skillName,
      targetId:p.id,outcome:{type:'normal'},hpSnapshotBefore:before,hpSnapshot:after,results});
  },
  p8PaySageDebt(p) {
    if(p.role!=='sage'||!p.sageDebt||p.sageDebtScheduledRound===this.battleRound||p.hp<=0||p.stunnedNextTurn||p.isSurrendered||p.druidForm==='tree'||((this.arena||this.enemyArena)&&(this.arena||this.enemyArena).playerId!==p.id))return;
    const debt=p.sageDebt;p.sageDebt=0;
    delete p.sageDebtScheduledRound;
    p.sageX=Math.max(0,(p.sageX??30)-debt);
    this.p8Log(`${p.name}支付變量透支 ${debt}，X=${p.sageX}。`);
  },
  p8DreamDamage(target,raw) {
    const effect=this.p8Has(target,'dream_butterfly');if(!effect||raw<=0)return null;
    let dream = effect.dreamOutcome;
    if (!dream) {
      if (this.getEffectiveLeaderRole?.() === 'dreamweaver') {
        dream = (target === this.currentMonster) ? 'nightmare' : 'dream_heal';
      } else {
        dream = (Math.random()<.6 ? 'dream_heal' : 'nightmare');
      }
    }
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
    const received=(result.hpDmg||0)+(result.tempAbsorbed||0);
    if(received>0&&p.role==='warrior') {
      p.warriorStacks=Math.min(15,(p.warriorStacks||0)+(context.hpEvents||1));
      this.p8Log(`${p.name}受傷積累攻擊 +${p.warriorStacks}/15。`);
    }
    if(this.p8Has(p,'warrior_resolve'))p.warriorRoundDamage=(p.warriorRoundDamage||0)+result.hpDmg+result.tempAbsorbed;
    if(received>0&&p.role==='gladiator'&&!p.rageRoundGain) {p.rage=(p.rage||0)+1;p.rageRoundGain=true;this.p8Log(`${p.name}受到命中，怒氣 ${p.rage}。`);}
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
        p.parryChecked=true;
        const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
        p.kyoutou = this.roleRandom(p,'sa_parry',()=> (augurs.length ? this.intervenePositive(p, '居合架式・格擋反擊', Math.round((p.parryChance ?? 0.4) * 100)).success : Math.random() < (p.parryChance ?? 0.4))?'success':'failure')==='success';
        if(p.kyoutou) {p.soul=Math.min(8,(p.soul||0)+1+(!countEquip(p,'sa_murasame')&&countEquip(p,'sa_haori')?1:0));this.p8Log(`${p.name}進入【狂刀】，武魂 ${p.soul}/8。`);}
      }
      if(p.kyoutou) {p.parriedCount=(p.parriedCount||0)+1;parry=true;damage=countEquip(p,'sa_murasame')?Math.floor(raw*.5):0;}
    }
    const vulnerable=enemyEffect(this,p,'next_vulnerable');
    if(vulnerable&&damage>0){damage=Math.floor(damage*(1+vulnerable.value));delete p.enemyEffects.next_vulnerable;}
    const curse=enemyEffect(this,p,'vulnerable');if(curse&&damage>0)damage=Math.floor(damage*(1+curse.value));
    if(!context.ignoreReduction && !this.arena && !parry)damage=mitigate?mitigate(damage):damage;
    if(!context.ignoreReduction&&!this.arena&&this.p8Has(p,'warrior_resolve'))damage=Math.floor(damage*.4);
    return {damage:Math.max(0,damage),outcome:parry?'parry':'normal'};
  },
  p8MitigateFriendly(p,raw) {
    let n=raw;
    if(p.role==='assassin')n=Math.floor(n*1.25);
    if(p.warriorVulnerableTurns)n=Math.floor(n*1.2);
    if(this.alcVulnerableTurns)n=Math.floor(n*1.2);
    if(p.isCrouchedThisRound)n=Math.floor(n*.8);
    if(['treant','tree'].includes(p.druidForm))n=Math.floor(n*.7);
    if(p.role==='paladin'&&p.paladinGrace)n=Math.floor(n*.85);
    if(p.role==='paladin'&&((p.tempHp>0)||(p.p8Shields||[]).some(s=>s.value>0))&&(p.equips||[]).some(e=>e.id==='pal_banner'))n=Math.floor(n*.85);
    return n;
  },
  p8DamageMonster(p,raw,type,resistance,extra={}) {
    const enemy=extra.enemy||this.currentMonster;
    if(!enemy||!this.getAttackableEnemies(p).includes(enemy)||raw<=0)return 0;
    const before=this.getHpSnapshot();
    const target=snap=>snap.enemies?.find(e=>e.instanceId===enemy.instanceId)||snap.monster;
    const {dmg}=resistance(raw,type,{...extra,enemy,actor:p});
    const actual=Math.min(enemy.hp,dmg);enemy.hp=Math.max(0,enemy.hp-dmg);
    const after=this.getHpSnapshot(),dream=this.p8BossOutcome;
    const result={kind:dream==='dream_heal'?'heal':'damage',sourceId:p.id,targetId:enemy.instanceId,targetEnemyId:enemy.instanceId,
      actualHeal:Math.max(0,target(after).hp-target(before).hp),finalDamage:actual,
      damageType:dream==='nightmare'?'true':type==='mag'?'magic':type==='true'?'true':'physical',
      outcome:{type:dream||(extra.critical?'critical':'normal')},targetBefore:target(before),targetAfter:target(after),hpSnapshot:after};
    this.p8Results?.push(result);this.p8Visuals?.push({type:'player_attack',sourceId:p.id,target:enemy.instanceId,targetEnemyId:enemy.instanceId,dmgType:type,value:actual,isCrit:!!extra.critical});
    return actual;
  },
  // Enhanced galaxy remains a hit-triggered effect, never an actor attack stat.
  // A result object can trigger once, and its own follow-up cannot recurse.
  p8GalaxyFollowups(queue,resistance,seen) {
    for(const step of [...queue])for(const hit of step.results||[]) {
      if(seen.has(hit))continue;seen.add(hit);
      const actor=this.players[hit.ownerId||hit.sourceId||step.sourceId];
      const galaxy=this.p8Has(actor,'galaxy');
      const targetId=hit.targetEnemyId||hit.targetBefore?.instanceId|| (hit.targetId==='monster'?step.targetEnemyId:hit.targetId);
      const enemy=this.enemies.find(e=>e.instanceId===targetId);
      if(!galaxy?.separate||hit.kind!=='damage'||!(hit.finalDamage>0)||!enemy||enemy.hp<=0||step.actionId==='sg_galaxy')continue;
      const before=this.getHpSnapshot();this.p8Results=[];this.p8Visuals=[];
      this.p8DamageMonster(actor,galaxy.value,'mag',resistance,{enemy,kind:'galaxy'});
      queue.push({type:'player_action',category:'FOLLOW_UP',sourceId:actor.id,sourceName:actor.name,sourceRole:'stargazer',
        actionId:'sg_galaxy',skillName:'星系追擊',targetId:enemy.instanceId,targetEnemyId:enemy.instanceId,
        damageType:'magic',outcome:{type:'galaxy'},hpSnapshotBefore:before,hpSnapshot:this.getHpSnapshot(),results:this.p8Results});
      afterPlayerDamage(this,queue.at(-1));drainEnemyEvents(this,queue);
      this.p8Results=null;this.p8Visuals=null;
    }
  },
  p8CloakRound(queue,resistance,bardMultiplier=1) {
    const boss=this.getLivingEnemies().find(e=>['ELITE','ABYSS'].includes(e.tier));
    if(!boss||!queue.some(s=>s.type==='boss_action'&&(s.enemyId||s.sourceId)===boss.instanceId))return;
    const results=new Set();
    for(const step of queue)for(const [index,r] of (step.results||[]).entries()) {
      const target=r.targetEnemyId||r.targetBefore?.instanceId||(r.targetId==='monster'?step.targetEnemyId:r.targetId);
      const owner=r.ownerId||r.sourceId||step.sourceId;
      // Include player-owned summons/follow-ups. Unattributed environmental DoT
      // is excluded; animation-only visuals are never consulted.
      if(step.actionId!=='sg_cloak'&&r.kind==='damage'&&r.finalDamage>0&&target===boss.instanceId&&this.players[owner])
        results.add(r.resultId||r);
    }
    for(const p of alive(this)) {
      if(p.role!=='stargazer'||!countEquip(p,'sg_cloak')||p.sgCloakRound===`${this.battleCount}:${this.battleRound}`||boss.hp<=0)continue;
      if((this.arena||this.enemyArena)&&(this.arena||this.enemyArena).playerId!==p.id)continue;
      p.sgCloakRound=`${this.battleCount}:${this.battleRound}`;
      const before=this.getHpSnapshot();this.p8Results=[];this.p8Visuals=[];
      this.p8DamageMonster(p,Math.floor(this.applyFateBlessing(p,10+results.size)*bardMultiplier),'mag',resistance,{enemy:boss,kind:'cloak'});
      queue.push({type:'player_action',category:'FOLLOW_UP',sourceId:p.id,sourceName:p.name,sourceRole:p.role,actionId:'sg_cloak',skillName:'星塵回響',
        targetId:boss.instanceId,targetEnemyId:boss.instanceId,damageType:'magic',outcome:{type:'normal',damageSegments:results.size},
        hpSnapshotBefore:before,hpSnapshot:this.getHpSnapshot(),results:this.p8Results});
      afterPlayerDamage(this,queue.at(-1));drainEnemyEvents(this,queue);
      this.p8Results=null;this.p8Visuals=null;
    }
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
      const result=this.applyDamageToPlayer(p,damage,{kind:'enemy_direct',trueDamage:incoming.outcome==='nightmare'});
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
    const m=this.currentMonster;
    const value=key=>this.applyFateBlessing(p,this.skillValue(p,key));
    const augurBefore=p.role==='augur'?this.getHpSnapshot():null;
    let outcome={type:'normal'},category=null,bloodHealApplied=false;
    const effect=(target,id,label,turns=1,extra={},resistanceChecked=false)=>{
      const before=this.getHpSnapshot();if (!this.p8Effect(target,id,label,turns,extra,resistanceChecked)) return false;
      const after=this.getHpSnapshot();this.p8Results.push({kind:'status',targetId:target===m?'monster':target.id,targetBefore:target===m?before.monster:before.players.find(x=>x.id===target.id),targetAfter:target===m?after.monster:after.players.find(x=>x.id===target.id),hpSnapshot:after});
      return true;
    };
    if(p.role==='dreamweaver') {
      const turns=1+(countEquip(p,'dw_history')?1:0);
      if(p.action==='basic') {
        damage(Math.floor(value('basic')*bardMultiplier),'mag');
        const rate=countEquip(p,'dw_spindle')?.75:.5;
        if(m.hp>0 && (this.roleRandom(p,'dw_confuse',()=>this.intervenePositive(p,'恍惚編織・潛意識混淆',rate*100).success?'success':'failure')==='success') && this.monsterAllowsEffect('夢境混亂')) {
          const id=this.roleRandom(p,'dw_type',()=>roll(['mirror','dissociate','nightmare_weak','frenzy_backfire']));
          const names={mirror:'鏡像夢境',dissociate:'解離痛楚',nightmare_weak:'萎靡夢魘',frenzy_backfire:'狂亂夢遊'};
          if(id==='nightmare_weak'&&!this.p8Has(m,id)) {
            const max=m.maxHp;m.maxHp=Math.max(1,Math.round(m.maxHp*.9));m.hp=Math.max(1,Math.round(m.hp*.9));effect(m,id,names[id],turns,{originalMaxHp:max},true);
          } else effect(m,id,names[id],turns,id==='nightmare_weak'?{originalMaxHp:this.p8Has(m,id)?.originalMaxHp}:{},true);
          outcome={type:id,label:names[id]};this.p8Log(`織夢術士撥動夢境纖維，魔物陷入【${names[id]}】狀態！`);
        }
      } else if(p.action==='dw_butterfly') {
        const targetEntity = this.players[p.targetPlayerId] || m;
        let dreamOutcome = this.roleRandom(p,'dw_butterfly',()=>Math.random()<.6 ? 'dream_heal' : 'nightmare');
        if (this.getEffectiveLeaderRole?.() === 'dreamweaver') {
          dreamOutcome = (targetEntity === m) ? 'nightmare' : 'dream_heal';
        }
        const applied=effect(targetEntity,'dream_butterfly','夢蝶迷思',turns,{ownerId:p.id,dreamOutcome});
        outcome=applied?{type:dreamOutcome,label:dreamOutcome==='dream_heal'?'美夢化生':'夢魘成真'}:{type:'immune',label:'效果免疫'};
      }
      else if(p.action==='dw_false_dream' && this.monsterAllowsEffect('虛構歷史')) {
        const id=this.roleRandom(p,'dw_false_dream',()=>roll(['shallow','deep','lone','horde'])),living=alive(this).length;
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
      if(p.action==='basic')damage(Math.floor(value('basic')*bardMultiplier),'mag');
      else if(p.action==='sg_observe') {
        const enhanced=!!countEquip(p,'sg_eye');const r=Math.random();
        const id=this.roleRandom(p,'sg_observe',()=>enhanced?['planet','galaxy','blackhole','boundary'][Math.min(3,Math.floor(r*4))]:r<.6?'star':r<.7?'planet':r<.8?'galaxy':r<.9?'blackhole':'boundary');
        outcome={type:id,label:{star:'發現星座',planet:'發現星球',galaxy:'發現星系',blackhole:'發現黑洞',boundary:'發現宇宙邊界'}[id],enhanced};
        if (id === 'boundary' && this.getEffectiveLeaderRole?.() === 'stargazer') {
          this.stargazerBoundaryScoutedNext = true;
          this.p8Log('🌌 【界外星圖】觀星者隊長勘破宇宙邊界！次回合路線中的三條路事件全數洞悉揭曉！');
        }
        if(id==='star'||id==='planet') {damage(Math.floor((value(id==='star'?'sg_star':enhanced?'sg_eye_planet':'sg_planet'))*bardMultiplier),'mag');if(id==='planet'&&m.hp>0&&this.intervenePositive(p,'天體觀測・星球暈眩',enhanced?30:10).success&&this.monsterAllowsEffect('暈眩')){this.monsterStunnedThisRound=true;outcome.stunned=true;}}
        if(id==='galaxy')for(const ally of alive(this))effect(ally,'galaxy','發現星系',1,{value:this.skillValue(p,enhanced?'sg_eye_galaxy':'sg_bonus'),separate:enhanced,sourceId:p.id});
        if(id==='blackhole') {
          const boss=enhanced?this.getLivingEnemies().find(e=>['ELITE','ABYSS'].includes(e.tier)):m;
          if(boss)damage(enhanced?10:5,'true',{enemy:boss});
          if(!enhanced)for(const ally of alive(this)) {
            const before=this.getHpSnapshot(),res=this.applyDamageToPlayer(ally,5,{kind:'friendly',trueDamage:true});const after=this.getHpSnapshot();
            this.p8Results.push({kind:'damage',targetId:ally.id,finalDamage:res.hpDmg+res.tempAbsorbed,hpDmg:res.hpDmg,absorbed:res.tempAbsorbed,damageType:'true',outcome:{type:'normal'},targetBefore:before.players.find(x=>x.id===ally.id),targetAfter:after.players.find(x=>x.id===ally.id),hpSnapshot:after});
          }
        }
        if(id==='boundary') {
          const targets=alive(this).sort((a,b)=>a.hp-b.hp).slice(0,enhanced?2:1);
          for(const ally of targets)if(!this.p8Has(ally,'boundary'))effect(ally,'boundary','邊界鎖定',Infinity,{permanent:true});
        }
        this.p8Log(`${p.name}完成天體觀測：【${outcome.label}】${enhanced?'・克卜勒的深空天眼':''}${outcome.stunned?'，魔物本輪暈眩':''}。`);
      } else if(p.action==='sg_clock') {
        const r=Math.random(),id=this.roleRandom(p,'sg_clock',()=>countEquip(p,'sg_watch')?(r<.5?'accelerate':r<.75?'reset':'overload'):(r<.7?'accelerate':r<.8?'reset':r<.9?'overload':'nothing'));outcome={type:id,label:{accelerate:'軌道微調',reset:'超新星重啟',overload:'過載躍遷',nothing:'星軌虛耗'}[id]};
        // Deferred until the common cooldown owner has charged this round's casts.
        (this.p8ClockEvents ||= []).push(id);if(id==='overload')for(const ally of alive(this))effect(ally,'overload','過載躍遷',1,{value:this.skillValue(p,'sg_bonus'),sourceId:p.id});
        this.p8Log(`${p.name}重塑時計：【${outcome.label}】。`);
      }
    } else if(p.role==='gladiator') {
      const inArena=this.arena?.playerId===p.id;
      const xiphosBonus=(p.bloodStacks||0)*2;
      if(p.action==='basic')damage(Math.floor((value('basic')+xiphosBonus)*bardMultiplier));
      if(p.action==='g_sacrifice') {
        if(p.hp<=1){this.p8Log(`${p.name}生命不足，無法施放一技能。`);}
        else if(inArena){category='OFFENSIVE';damage(Math.floor((this.applyFateBlessing(p,this.skillValue(p,'g_strike',{players:this.memberIds.length,stacks:p.rage||0}))+xiphosBonus)*bardMultiplier));outcome={type:'arena_assault',label:'血殺重擊'};}
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
          damage(cost+(p.rage||0)*(this.skillValue(p,'g_rage')+(countEquip(p,'g_cingulum')?3:0)));outcome={type:'suicide',label:'同歸於盡'};this.p8Log(`${p.name}以全部 ${cost} 生命發動【同歸於盡】，本層不能甦生。`);
        } else {this.arenaPending={playerId:p.id,round:this.battleRound+1};outcome={type:'challenge',label:'死鬥宣告'};this.p8Log(`${p.name}發出死鬥宣告，下回合進入競技場。`);effect(p,'arena_challenge','死鬥宣告');}
      }
    } else if(p.role==='samurai') {
      const soul=p.soul||0, missing=1-p.hp/p.maxHp, corrosion=this.roundModifiers?.equipmentEffectMultiplier??1;
      const mult=1+.10*countEquip(p,'sa_oboro')*corrosion+(countEquip(p,'sa_murasame')?missing*.25*corrosion:0);
      if(p.action==='sa_tsubame') {
        if(soul<4){this.p8Log(`${p.name}武魂不足，燕返未施放。`);outcome={type:'invalid',label:'武魂不足'};}
        else {p.soul-=4;for(let i=0;i<4&&m.hp>0;i++)damage(Math.floor(value('basic')*bardMultiplier*mult),'phys',{penetration:1});outcome={type:'tsubame',label:'秘劍・燕返'};}
      } else {
        const baseBurstChance = Math.min(.7, .3 + .05 * soul);
        const augurs = Object.values(this.players).filter(pl => pl.hp > 0 && pl.role === 'augur' && pl.observedTargetId === p.id && !pl.augurIntervenedThisRound);
        const burst = p.action==='sa_cut'&&soul>0&&this.roleRandom(p,'sa_cut',()=> (augurs.length ? this.intervenePositive(p, '拔刀斬・一閃', Math.round(baseBurstChance * 100)).success : Math.random()<baseBurstChance)?'success':'failure')==='success';
        if(p.action==='sa_cut'&&soul===0)p.parryChance=.7;
        const baseCutDmg = value(p.action==='sa_cut'?'sa_cut':'basic');
        damage(Math.floor(baseCutDmg*bardMultiplier*mult*(burst?2:1)),'phys',{critical:burst});
        p.soul=Math.min(8,soul+1);outcome={type:burst?'soul_burst':'normal',label:burst?'武魂爆發':undefined};
      }
      this.p8Log(`${p.name}【${outcome.label||'居合攻擊'}】，武魂 ${p.soul||0}/8。`);
    } else if(p.role==='sage') {
      p.sageX ??=30;p.sageOperand ??=Math.floor(Math.random()*30)+1;p.sagePhase ||= 'hypothesis';
      const actual=damage(Math.floor(value('basic')*bardMultiplier),'phys',{penetration:p.action==='sge_deduce'?.5:0});
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
        const raw = value('basic');
        damage(Math.floor(raw*bardMultiplier), 'mag');
        if (this.p8Results.at(-1)?.kind==='damage' && this.p8Results.at(-1).damageType==='magic' && this.p8Results.at(-1).finalDamage>0) m.augurResistanceBreak = 2;
        let clearAmt = 8;
        const amethyst = countEquip(p, 'aug_amethyst');
        if (amethyst > 0) clearAmt += 4 + (amethyst - 1) * 2;
        const repaid = this.repayAugurDebt(p, clearAmt, 'skill');
        outcome = { type: 'prismatic', label: '水晶折光', repaid, damage: raw };
        this.p8Log(`🔮 **${p.name}** 施展【水晶折光】貫穿魔物，削弱其效果抗性 15%（2 回合），並撫平清償自身 **${repaid}** 點【命債】！`, 'combat');
      } else if(p.action==='aug_bind') {
        const others=alive(this).filter(ally=>ally.id!==p.id);
        const target=others.length?others.find(ally=>ally.id===p.targetPlayerId):p;
        // Revalidate at execution: the selected ally may have died after locking.
        if (!target) {
          this.p8Log(`**${p.name}** 的【命運繫結】目標已失效，未切換觀測目標。`,'warning');
          this.p8Visuals=null;
          return {outcome:{type:'invalid',label:'觀測目標已失效'},category:'BUFF',bloodHealApplied};
        }
        p.observedTargetId = target.id;
        p.augurCardState = 'empty';
        p.augurBindingBoostRound = this.battleRound;
        category = 'BUFF';
        outcome = { type: 'bind', label: '命運繫結', targetId: target.id, targetName: target.name };
        this.p8Log(`🤲🔮 **${p.name}** 施展【命運繫結】，將【觀測目標】重設為 **${target.name}**！本回合【命運加護】提升至 25%，正位加成提升至 20%，逆位上限提升至 25%！`, 'buff');
      } else if(p.action==='aug_reckon') {
        const raw = value('aug_reckon');
        damage(Math.floor(raw*bardMultiplier), 'mag');
        if (m.hp > 0) {
          if (this.p8Results.at(-1)?.kind==='damage' && this.p8Results.at(-1).damageType==='magic' && this.p8Results.at(-1).finalDamage>0) m.augurResistanceBreak = 2;
          m.reversedOmenRemaining = 2;
          m.reversedOmenBonus = countEquip(p, 'aug_forbidden_tome') ? 18 : 10;
        }
        category = 'DEBUFF';
        const repaid = this.repayAugurDebt(p, 25, 'skill');
        let bonusHeal = false;
        if (repaid >= 15) {
          bonusHeal = true;
          const heal=(ally)=>{
            const before=this.getHpSnapshot();
            const actualHeal=this.applyHealWithOverheal(ally,value('aug_heal'),{directHp:true});
            const after=this.getHpSnapshot();
            this.p8Results.push({kind:'heal',targetId:ally.id,actualHeal,outcome:{type:'normal'},
              targetBefore:before.players.find(a=>a.id===ally.id),targetAfter:after.players.find(a=>a.id===ally.id),hpSnapshot:after});
          };
          heal(p);
          const target = this.players[p.observedTargetId];
          if (target && target.hp > 0 && target.id !== p.id) {
            heal(target);
          }
        }
        outcome = { type: 'reckon', label: '命運清算・凶兆逆位', repaid, bonusHeal, damage: raw };
        this.p8Log(`🃏⚖️ **${p.name}** 施展【命運清算・凶兆逆位】！為魔物烙印【凶兆逆位】（受傷 +${m.reversedOmenBonus}%，2 回合），並清償自身 **${repaid}** 點【命債】！${bonusHeal ? '清償滿 15 點，額外為自身與觀測目標恢復 10 點生命！' : ''}`, 'combat');
      }
    }
    if(!this.p8Results.length){const snap=this.getHpSnapshot(),target=outcome.type==='immune'?snap.monster:snap.players.find(x=>x.id===p.id);this.p8Results.push({kind:'status',targetId:outcome.type==='immune'?'monster':p.id,outcome,targetBefore:target,targetAfter:target,hpSnapshot:snap});}
    for(const r of this.p8Results){r.monsterName=m.name;r.monsterAvatar=m.avatar;}
    // Resource/debuff changes follow the impact and remain authoritative in the queue.
    if (p.role==='augur') {
      const snapshot=this.getHpSnapshot();
      this.p8Results.push({kind:'status',targetId:p.action==='aug_bind'?p.observedTargetId:'monster',
        targetBefore:p.action==='aug_bind'?augurBefore.players.find(a=>a.id===p.observedTargetId):augurBefore.monster,
        targetAfter:p.action==='aug_bind'?snapshot.players.find(a=>a.id===p.observedTargetId):snapshot.monster,hpSnapshot:snapshot});
    }
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
    const augurReactionIndex=this.augurReactions?.length || 0;
    let equationBefore, fateResults=[];
    const event=(p,name,id,resolve,outcome={type:'normal'})=>{
      const before=equationBefore || this.getHpSnapshot();this.p8Results=[...fateResults];this.p8Visuals=[];resolve();const after=this.getHpSnapshot();
      queue.push({type:'player_action',category:'OFFENSIVE',sourceId:p.id,sourceName:p.name,sourceRole:p.role,actionId:id,skillName:name,monsterName:m?.name,monsterAvatar:m?.avatar,
        augurReactions:(this.augurReactions || []).slice(augurReactionIndex),
        targetId:m?.instanceId,targetEnemyId:m?.instanceId,targetName:m?.name,hpSnapshotBefore:before,hpSnapshot:after,results:this.p8Results,finalDamage:this.p8Results.filter(r=>r.targetEnemyId&&r.kind==='damage').reduce((n,r)=>n+r.finalDamage,0),damageType:'physical',outcome,detail:name});
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
          equationBefore=this.getHpSnapshot(); this.p8Results=[];
          const augurs=Object.values(this.players).filter(pl=>pl.hp>0&&pl.role==='augur'&&pl.observedTargetId===p.id&&!pl.augurIntervenedThisRound);
          let resolution;
          const reservedEquation=this.roleRandom(p,'sage_equation',()=>null);
          if(reservedEquation!==null)resolution=reservedEquation;
          else if(!augurs.length) {
            const r=Math.random();
            resolution=r<confusionChance?'CONFUSION':r<confusionChance+successChance?'SUCCESS':'NOTHING';
          } else {
            const neg=this.interveneNegative(p,'方程推演・思緒紊亂',Math.round(confusionChance*100));
            if(neg.failed) {
              resolution='CONFUSION';
            } else if(neg.intercepted) {
              const r=Math.random();
              resolution=r<successChance?'SUCCESS':'NOTHING';
            } else {
              const pos=this.intervenePositive(p,'方程推演・成功',Math.round(successChance*100));
              resolution=pos.success?'SUCCESS':'NOTHING';
            }
          }
          fateResults=this.p8Results;
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
            const targets=this.getAttackableEnemies(p);
            outcome.distribution=splitEquationDamage(raw,targets);
            let actual=0;
            for(const share of outcome.distribution){
              const enemy=targets.find(e=>e.instanceId===share.enemyId);
              actual+=this.p8DamageMonster(p,share.damage,'phys',resistance,{enemy,penetration:even?0.4:1,equation:true});
              const result=this.p8Results.at(-1);
              if(result?.targetEnemyId===share.enemyId)Object.assign(result,{presentationBeat:'equation_main',equationShare:share.damage});
            }
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
            if(prime){
              const remaining=this.getAttackableEnemies(p);
              outcome.primeDistribution=splitEquationDamage(15,remaining);
              for(const share of outcome.primeDistribution){
                this.p8DamageMonster(p,share.damage,'true',resistance,{enemy:remaining.find(e=>e.instanceId===share.enemyId),equation:true});
                const result=this.p8Results.at(-1);
                if(result?.targetEnemyId===share.enemyId)Object.assign(result,{presentationBeat:'equation_prime',equationShare:share.damage});
              }
              for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=0;p.sagePrimeResetPending=true;
            }
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
              for(const enemy of targets.filter(e=>this.getAttackableEnemies(p).includes(e))){
                const active=this.p8Has(enemy,'sage_exposed');
                this.p8Effect(enemy,'sage_exposed','ODD 承傷 +10%',2,{starts:active?.starts<=this.battleRound?active.starts:this.battleRound+1});
              }
            }
            if(square){
              for(const enemy of targets.filter(e=>this.getAttackableEnemies(p).includes(e))){
                const active=this.p8Has(enemy,'sage_square');
                this.p8Effect(enemy,'sage_square','SQUARE 直接傷害 -25%',2,{starts:active?.starts<=this.battleRound?active.starts:this.battleRound+1});
              }
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
      afterPlayerDamage(this,queue.at(-1));drainEnemyEvents(this,queue);
      this.p8Results=null;this.p8Visuals=null;
    };
    if (m?.hp<=0) this.clearAugurBattleDebts();
    for(const p of Object.values(this.players)) {
      if(m?.hp>0 && p.role==='augur' && p.augurFateDebts && p.augurFateDebts.length > 0) {
        const before=this.getHpSnapshot();
        const expired = p.augurFateDebts.filter(d => d.dueRound <= this.battleRound);
        p.augurFateDebts = p.augurFateDebts.filter(d => d.dueRound > this.battleRound);
        const totalExpired = expired.reduce((sum, d) => sum + d.amount, 0);
        if(p.hp<=0)continue;
        if (totalExpired > 0) {
          const hpBefore = p.hp;
          p.hp = Math.max(0, p.hp - totalExpired);
          this.p8Log(`⚡⚖️ **${p.name}** 的 ${totalExpired} 點【命債】已到期進行因果清算！無視護盾直接扣除 **${totalExpired}** 點生命！${p.hp <= 0 ? '【卜者隕落】！' : ''}`, 'damage');
          queue.push({
            type: 'player_action', category: 'DEBT_EXPIRY', sourceId: p.id, sourceName: p.name, sourceRole: 'augur',actionId:'aug_expiry',
            monsterName:m.name,monsterAvatar:m.avatar,hpSnapshotBefore:before,hpSnapshot:this.getHpSnapshot(),
            skillName: '命債到期清算', targetId: p.id,outcome:{type:'expiry',expired:totalExpired}, results: [{ kind: 'damage', damageType:'true',finalDamage: Math.min(hpBefore,totalExpired), hpDamage: Math.min(hpBefore,totalExpired), targetId: p.id, hpBefore, hpAfter: p.hp,
              targetBefore:before.players.find(a=>a.id===p.id),targetAfter:this.getHpSnapshot().players.find(a=>a.id===p.id),hpSnapshot:this.getHpSnapshot(),isDead:p.hp<=0 }]
          });
        }
      }
    }
    const enemySet = new Set([m, ...(this.enemies || [])].filter(Boolean));
    for (const enemy of enemySet) {
      if (enemy.augurResistanceBreak > 0) enemy.augurResistanceBreak--;
      if (enemy.reversedOmenRemaining > 0) enemy.reversedOmenRemaining--;
    }
    for(const p of alive(this)) {
      if(p.hp<=0 || (this.enemyArena&&this.enemyArena.playerId!==p.id))continue;
      p.sageSamplingEnded=true;
      if(m.hp>0&&p.role==='warrior'&&this.p8Has(p,'warrior_resolve')&&p.warriorRoundDamage>0)event(p,'堅定反擊','w_counter',()=>{this.p8DamageMonster(p,p.warriorRoundDamage,'phys',resistance);this.p8Log(`${p.name}【堅定反擊】返還本輪實受 ${p.warriorRoundDamage} 傷害。`);});
      p.warriorRoundDamage=0;
      if(m.hp>0&&p.role==='samurai'&&p.parriedCount>0) {
        const n=countEquip(p,'sa_murasame')?20+p.parriedCount*2:countEquip(p,'sa_haori')?5:this.skillValue(p,'sa_counter',{blocks:p.parriedCount});
        event(p,'狂刀反擊','sa_counter',()=>this.p8DamageMonster(p,n,'phys',resistance));this.p8Log(`${p.name}統一反擊 ${n}（招架 ${p.parriedCount} 次）。`);
      }
      if(p.role==='sage'&&!p.sageEquationResolved&&(p.sagePhase==='hypothesis'||p.sageSolvedThisRound))this.p8ResolveEquation(p,queue,log,resistance,bardMultiplier);
    }
    // The arena restores its original maximum using the exit ratio, including death.
    if(this.arena)this.p8ExitArena(queue);
    this.arenaRoundLock=null;
    this.p8LogBuffer=null;
  }
};
