import { mechanicStatuses } from './enemy-mechanics.js';
import { NEW_CLASSES } from './phase8-config.js';
import { p8State } from './phase8.js';
// Wire contract: gameplay decides every outcome and value before presentation.
export const ACTION_CATEGORIES = Object.freeze([
  'OFFENSIVE', 'AOE_OFFENSIVE', 'HEAL', 'DEFENSE', 'SHIELD', 'BUFF', 'DEBUFF',
  'CLEANSE', 'TRANSFORM', 'SUMMON', 'STEALTH', 'REVIVE', 'MINION_ATTACK',
  'MINION_INTERCEPT', 'STATUS_TICK', 'FOLLOW_UP'
]);
export const SKILL_CATEGORIES = Object.freeze({
  ...Object.fromEntries(Object.values(NEW_CLASSES).flatMap(c=>c.skills.filter(s=>s.id!=='basic').map(s=>[s.id,s.category]))),
  basic: 'OFFENSIVE', w_strike: 'OFFENSIVE', w_cleave: 'OFFENSIVE', w_shield: 'DEFENSE',
  m_blast: 'OFFENSIVE', m_drain: 'OFFENSIVE', a_shot: 'OFFENSIVE', a_rain: 'AOE_OFFENSIVE',
  a_reload: 'DEFENSE', a_frenzy_reload: 'DEFENSE',
  s_stab: 'OFFENSIVE', s_smoke: 'OFFENSIVE', b_heal: 'HEAL', b_buff: 'BUFF',
  b_nocturne: 'DEBUFF', b_frenzy: 'BUFF', b_revive: 'REVIVE', alc_acid: 'AOE_OFFENSIVE',
  alc_poison: 'DEBUFF', alc_flask: 'AOE_OFFENSIVE', alc_fate: 'CLEANSE', dru_transform: 'TRANSFORM',
  dru_summon_treant: 'SUMMON', dru_summon_wolf: 'SUMMON', use_item_healing_potion: 'HEAL', use_item_antidote: 'CLEANSE', onm_all_talismans: 'DEBUFF', leader_assassin_execute: 'OFFENSIVE'
});

export function playerStatuses(player, room, balance) {
  const statuses = mechanicStatuses(player, room);
  const add = (id, label, icon, turns = 0, extra = {}) => statuses.push({ id, label, icon, turns, ...extra });
  if (player.hp <= 0) add('downed', '倒下・本層無法行動', 'downed');
  if (player.role==='paladin'&&player.hp>0) add('paladin_target_weight','神聖嘲諷・受擊權重 ↑','guard',0,{category:'BUFF',desc:'提高被選為目標的權重，不保證敵人鎖定。'});
  if (player.poisonTurns) add('poison', 'POISON', 'poison', player.poisonTurns, { stacks: player.poisonDmg, isNegative:true, category:'DEBUFF', isDot:true });
  if (player.burnTurns) add('burn', 'BURN', 'burn', player.burnTurns, { stacks: player.burnDmg, isNegative:true, category:'DEBUFF', isDot:true });
  if (player.fractureTurns) add('fracture', 'FRACTURE', 'fracture', player.fractureTurns, { stacks: player.fractureDmg, isNegative:true, category:'DEBUFF', isDot:true });
  if (player.chillTurns) add('chill', 'CHILL', 'chill', player.chillTurns, { stacks: player.chillDmg, isNegative:true, category:'DEBUFF', isDot:true });
  if (player.corrosionTurns) add('corrosion', 'CORROSION', 'corrosion', player.corrosionTurns, { isNegative:true, category:'DEBUFF' });
  if (player.bleedTurns) add('bleed', 'BLEED', 'bleed', player.bleedTurns, {isNegative:true,category:'DEBUFF',isDot:true});
  if (player.cannotCrit) add('crit_lock', 'CRIT LOCK', 'lock', 1);
  if (player.archerNextDodgeBonus) add('dodge_bonus', 'DODGE ↑', 'dodge', 1, { value: '+' + player.archerNextDodgeBonus * 100 + '%' });
  if (player.stunnedNextTurn || player.nextTurnStunFlag) add('exhausted', 'EXHAUSTED', 'exhausted', 1);
  if (player.druidForm === 'tree') add('sleep', '沉睡古樹', 'sleep', player.druidFormTurns);
  if (player.druidForm === 'treant' || player.druidForm === 'tree') add('treant_guard', 'DR ' + balance.treantDamageReduction * 100 + '%', 'guard', player.druidFormTurns);
  if (player.druidForm === 'bear') add('bear', '巨熊形態', 'transform', player.druidFormTurns);
  if (player.druidForm === 'werewolf') add('wolf', '狼人形態', 'transform', player.druidFormTurns);
  if (player.warriorVulnerableTurns || player.warriorVulnerableNextTurn) add('vulnerable', 'VULNERABLE', 'debuff', 1);
  if (player.stealthStacks) add('stealth_stack', '匿蹤', 'stealth', 0, { stacks: player.stealthStacks });
  if (player.isCrouchedThisRound) add('crouch', '架弩蹲伏 DR 20%', 'guard', 1);
  if (player.ammo && player.ammo.length > 0) {
    const ammoIcons = player.ammo.map(a => a === 'pierce' ? '🔴' : a === 'elemental' ? '🔵' : '💥').join('');
    add('crossbow_ammo', `弩箭 [${ammoIcons}]`, 'buff', 0, { ammo: player.ammo });
  }
  if (player.hp > 0 && player.isHiddenThisRound && !player.stealthBrokenThisRound) {
    add('hidden', '隱身', 'stealth', 1);
    add('follow_up', '追擊 ' + (player.followUpsThisRound || 0) + '/' + (room.getAssassinFollowUpCap(player)), 'stealth');
  }
  if (player.isSurrendered) add('surrender', '血脈臣服', 'lock', 0, { locked: true });
  if (player.hp > 0) {
    if ((room.roundModifiers?.acidFlaskCount||0)>0 || (room.roundModifiers?.equipmentEffectMultiplier??1)<1 || player.alcAcidStack>0) add('alchemy_corrosion','強酸腐蝕・裝備效果降低','debuff',1,{isNegative:true,category:'DEBUFF',stacks:(room.roundModifiers?.acidFlaskCount||0)+(player.alcAcidStack||0)});
    if (room.warriorShieldTurn) add('guard', 'GUARD', 'guard', room.warriorShieldTurn === 1 ? 2 : 1);
    if (room.alcVulnerableTurns || room.alcVulnerableNextTurn) add('alchemy_vulnerable', 'VULNERABLE', 'debuff', 1);
    if (room.frenzyTeamDrainNextTurn) add('frenzy', 'DMG +70% · 次回合代價', 'buff', 1);
    if (room.bardBuffActive) add('frenzy_buff', 'DMG +50%', 'buff', 1);
    if (player.tempHp > 0) add('temp_hp', 'TEMP HP', 'shield', 1, { value: player.tempHp });
    const sageShield=(player.p8Shields||[]).find(s=>s.kind==='sage'&&s.value>0&&s.until>=room.battleRound);
    if(sageShield)add('sage_shield','彈性碰撞護盾','shield',sageShield.until-room.battleRound+1,{value:sageShield.value});
    if (player.corruption) add('corruption', '深淵腐化', 'corruption', 0, { locked: true, stacks: player.corruption });

    // 被動隊長技 buff 顯示（使用職業專屬裝備圖示）
    const leaderRole = room?.getEffectiveLeaderRole?.();
    if (leaderRole) {
      if (leaderRole === 'warrior') {
        const hasWarriorShield = (player.p8Shields || []).some(s => s.kind === 'warrior' && s.value > 0);
        if (hasWarriorShield) {
          add('leader_warrior', '堅盾戰意', 'buff', 1, { isLeaderPassive: true, leaderRole: 'warrior', desc: '持有戰士護盾，攻擊力 +10%' });
        }
      } else if (leaderRole === 'mage') {
        add('leader_mage', '魔力共鳴', 'buff', 0, { isLeaderPassive: true, leaderRole: 'mage', desc: '全隊共享 70% 治療效果' });
      } else if (leaderRole === 'archer') {
        add('leader_archer', '疾風步法', 'buff', 0, { isLeaderPassive: true, leaderRole: 'archer', desc: '隊友閃避機率 +20%' });
      } else if (leaderRole === 'bard' && player.role === 'bard') {
        add('leader_bard', '撫慰樂章', 'buff', 0, { isLeaderPassive: true, leaderRole: 'bard', desc: '1技能補血效果 +10%' });
      } else if (leaderRole === 'dreamweaver' && player.role === 'dreamweaver') {
        add('leader_dreamweaver', '美夢成真', 'buff', 0, { isLeaderPassive: true, leaderRole: 'dreamweaver', desc: '夢蝶必為正面效果' });
      } else if (leaderRole === 'paladin') {
        add('leader_paladin', '聖光庇護', 'buff', 0, { isLeaderPassive: true, leaderRole: 'paladin', desc: '全隊共享普攻護盾' });
      } else if (leaderRole === 'gladiator' && player.role === 'gladiator' && room.arena && room.arena.playerId === player.id) {
        add('leader_gladiator', '鬥技場之王', 'buff', 0, { isLeaderPassive: true, leaderRole: 'gladiator', desc: '角鬥場增傷 +10%' });
      } else if (leaderRole === 'stargazer' && room.stargazerBoundaryScoutedNext) {
        add('leader_stargazer', '界外星圖', 'buff', 0, { isLeaderPassive: true, leaderRole: 'stargazer', desc: '下次選路線全事件洞悉' });
      } else if (leaderRole === 'augur') {
        add('leader_augur', '洞悉虛妄', 'buff', 0, { isLeaderPassive: true, leaderRole: 'augur', desc: '看破寶箱怪與奸商' });
      } else if (leaderRole === 'samurai') {
        add('leader_samurai', '名刀鑑賞', 'buff', 0, { isLeaderPassive: true, leaderRole: 'samurai', desc: '商店武器 1階6折/2階9折' });
      } else if (leaderRole === 'sage' && player.role === 'sage' && player.sagePhase === 'hypothesis') {
        add('leader_sage', '守勢推演', 'buff', 0, { isLeaderPassive: true, leaderRole: 'sage', desc: '假設階段減傷 20%' });
      } else if (leaderRole === 'alchemist' && player.role === 'alchemist') {
        add('leader_alchemist', '高產萃取', 'buff', 0, { isLeaderPassive: true, leaderRole: 'alchemist', desc: '普攻/1技能獲藥率 40%' });
      }
    }
  }
  statuses.push(...p8State(player, room).phase8Statuses);
  return statuses;
}

export function snapshotTarget(snapshot, id) {
  if (!snapshot) return null;
  if (id === 'monster') return snapshot.monster;
  if (snapshot.monster && (snapshot.monster.instanceId === id || snapshot.monster.id === id)) return snapshot.monster;
  return (snapshot.enemies || []).find(e => e.instanceId === id || e.id === id) ||
    (snapshot.players || []).find(p => p.id === id) ||
    (snapshot.players || []).flatMap(p => p.minions || []).find(m => m.id === id);
}

export function buildActionResults(step, before, after, visuals, heals = []) {
  const results = [];
  let display = structuredClone(before);
  const append = (result, targetAfter) => {
    const current = snapshotTarget(display, result.targetId);
    const targetBefore = current ? structuredClone(current) : null;
    if (result.targetId === 'monster') {
      display.monster = structuredClone(targetAfter);
      if (display.enemies && targetAfter?.instanceId) {
        const idx = display.enemies.findIndex(e => e.instanceId === targetAfter.instanceId);
        if (idx >= 0) display.enemies[idx] = structuredClone(targetAfter);
      }
    } else if (current && targetAfter) {
      Object.assign(current, structuredClone(targetAfter));
      const enemy = display.enemies?.find(e => e.instanceId === current.instanceId);
      if (enemy) Object.assign(enemy, structuredClone(targetAfter));
      if (display.monster && current.instanceId && display.monster.instanceId === current.instanceId) {
        display.monster = structuredClone(targetAfter);
      }
    }
    results.push({ ...result, targetBefore, targetAfter: structuredClone(targetAfter), hpSnapshot: structuredClone(display) });
  };
  if (step.cleansedSnapshot) for (const player of step.cleansedSnapshot.players.filter(p => p.hp > 0)) {
    append({ kind: 'cleanse', targetId: player.id, statuses: player.statuses, outcome: { type: 'normal' } }, player);
  }
  for (const event of visuals.filter(e => e.type === 'crouch_reload')) {
    const player = snapshotTarget(after, step.sourceId);
    const old = snapshotTarget(before, step.sourceId);
    append({ kind: 'reload', targetId: step.sourceId, ammoBefore: [...(old.ammo || [])],
      ammoAfter: [...(player.ammo || [])], loaded: (player.ammo || []).slice((old.ammo || []).length),
      statuses: player.statuses, outcome: step.outcome }, player);
  }
  const attacks = visuals.filter(e => e.type === 'player_attack' || e.type === 'augur_tome');
  const orderedSelfEvents=new Set();
  if (step.category === 'TRANSFORM' || step.category === 'SUMMON') {
    const player = after.players.find(p => p.id === step.sourceId);
    const old = snapshotTarget(before, step.sourceId);
    append({ kind: step.category === 'SUMMON' ? 'summon' : 'transform', targetId: player.id,
      statuses: player.statuses, outcome: step.outcome,
      minions: (player.minions || []).filter(m => !(old?.minions || []).some(n => n.id === m.id)) }, player);
  }
  for (const event of attacks) {
    if(event.outcome?.type==='dream_heal'&&event.value===0)continue;
    const id = event.targetEnemyId || (event.target !== 'monster' ? event.target : null) || before.monster?.instanceId || 'monster';
    const current = snapshotTarget(display, id);
    if (!current || current.hp<=0) continue;
    const value = Math.max(0, Number(event.value) || 0);
    const absorbed=Math.min(current.tempHp||0,event.absorbed||0);
    const next = { ...current, hp: Math.max(0, current.hp - value),tempHp:Math.max(0,(current.tempHp||0)-absorbed) };
    append({ kind: 'damage', targetId: id, targetEnemyId: id === 'monster' ? current.instanceId : id,
      finalDamage: value+absorbed, absorbed, tempAbsorbed:absorbed, hpDmg:Math.max(0,current.hp-next.hp), actualDamage: Math.max(0, current.hp - next.hp),
      sourceId: event.sourceId, sourceRole: event.type === 'augur_tome' ? 'augur' : undefined,
      isSecondaryEnemy: !!event.isSecondaryEnemy,
      ammoType: event.ammoType, segmentIndex: event.segmentIndex,
      outcome: event.type === 'augur_tome' ? { type: 'augur_tome' } : event.outcome || step.outcome,
      damageType: event.type === 'augur_tome' || event.outcome?.type === 'nightmare' ? 'true' : event.dmgType === 'mag' ? 'magic' : 'physical' }, next);
    if(event.ammoType==='burst'){
      const start=visuals.indexOf(event),following=visuals.slice(start+1);
      const end=following.findIndex(e=>e.type==='player_attack');
      const recoil=(end<0?following:following.slice(0,end)).find(e=>e.type==='self_damage'&&!orderedSelfEvents.has(e));
      if(recoil){
        const self=snapshotTarget(display,recoil.targetId);
        if(self){orderedSelfEvents.add(recoil);append({kind:'damage',sourceId:recoil.sourceId||step.sourceId,targetId:recoil.targetId,finalDamage:recoil.value,damageType:'true',outcome:recoil.outcome||{type:'normal'}},{...self,hp:Math.max(0,self.hp-recoil.value)});}
      }
    }
  }
  // Certain equipment adds a separate actual boss damage result.
  if (display.monster && after.monster && display.monster.hp > Math.max(0, after.monster.hp)) {
    append({ kind: 'damage', sourceId: step.sourceId, targetId: 'monster', targetEnemyId: display.monster.instanceId, actionId: step.actionId, finalDamage: display.monster.hp - Math.max(0, after.monster.hp),
      outcome: { type: 'normal' }, damageType: 'magic' }, { ...after.monster, hp: Math.max(0, after.monster.hp) });
  }
  for (const heal of heals) append({ kind: 'heal', targetId: heal.targetId, actualHeal: heal.actualHeal,
    absorbedDebt:heal.absorbedDebt || 0,
    outcome: heal.outcome || { type: 'normal' } }, heal.targetAfter);
  if (step.category === 'BUFF') {
    for (const player of after.players.filter(p => p.hp > 0)) {
      const old = snapshotTarget(display, player.id);
      append({ kind: 'status', targetId: player.id, statuses: player.statuses, outcome: step.outcome },
        { ...old, statuses: player.statuses });
    }
  }
  for (const event of visuals.filter(e => e.type === 'self_damage' || e.type === 'revive' || e.type === 'hidden_evade')) {
    if(orderedSelfEvents.has(event))continue;
    const target = event.targetAfter || snapshotTarget(after, event.targetId);
    if (target) append({ kind: event.type === 'revive' ? 'revive' : 'damage', targetId: event.targetId,
      sourceId: event.sourceId || step.sourceId, finalDamage: event.value, actualHeal: event.type === 'revive' ? event.value : undefined,
      outcome: event.outcome || { type: 'normal' }, damageType: 'physical' }, target);
  }
  for (const player of after.players) {
    const old = snapshotTarget(display, player.id);
    const changed = JSON.stringify(old?.statuses || []) !== JSON.stringify(player.statuses || []);
    const formChanged = old?.druidForm !== player.druidForm;
    const spawned = (player.minions || []).filter(m => !(old?.minions || []).some(n => n.id === m.id));
    if (changed || formChanged || spawned.length || old?.hp !== player.hp || old?.maxHp !== player.maxHp || old?.tempHp !== player.tempHp) {
      const finalDamage = Math.max(0, (old?.hp || 0) - player.hp);
      const actualHeal = Math.max(0, player.hp - (old?.hp || 0));
      const actualShield = Math.max(0, (player.tempHp || 0) - (old?.tempHp || 0));
      const kind = spawned.length ? 'summon' : formChanged ? 'transform' : actualShield > 0 ? 'shield' :
        finalDamage > 0 ? 'damage' : actualHeal > 0 ? 'heal' : 'status';
      append({ kind, finalDamage, actualHeal, actualShield, targetId: player.id,
        statuses: player.statuses, minions: spawned, outcome: step.outcome }, player);
    }
  }
  if (after.monster && JSON.stringify(display.monster?.statuses) !== JSON.stringify(after.monster.statuses)) {
    append({ kind: 'status', targetId: 'monster', statuses: after.monster.statuses, outcome: step.outcome },
      { ...after.monster, hp: display.monster.hp });
  }
  for (const enemy of after.enemies || []) {
    const old = snapshotTarget(display, enemy.instanceId);
    if (old && enemy.instanceId !== after.monster?.instanceId && JSON.stringify(old.statuses) !== JSON.stringify(enemy.statuses)) {
      append({ kind: 'status', targetId: enemy.instanceId, targetEnemyId: enemy.instanceId, statuses: enemy.statuses, outcome: step.outcome }, { ...enemy, hp: old.hp });
    }
  }
  return results;
}

// Equipment reactions belong to the triggering action. Present its main hit
// before the separate tome hit, retaining actual amounts and monotonic HP.
export function sequenceAugurDamageResults(step) {
  if (!step.hpSnapshotBefore || !step.results?.some(r=>r.outcome?.type==='augur_tome')) return step;
  const regular=step.results.filter(r=>r.outcome?.type!=='augur_tome');
  const tome=step.results.filter(r=>r.outcome?.type==='augur_tome');
  let monsterHp=step.hpSnapshotBefore.monster?.hp || 0;
  step.results=[...regular,...tome].map(result=>{
    const next={...result};
    if(result.targetId==='monster'||result.targetEnemyId===(step.targetEnemyId||step.hpSnapshotBefore.monster?.instanceId)) {
      next.targetBefore={...(result.targetBefore || step.hpSnapshotBefore.monster),hp:monsterHp};
      if(result.kind==='damage')monsterHp=Math.max(0,monsterHp-(result.finalDamage || 0));
      else if(result.kind==='heal')monsterHp+=result.actualHeal || 0;
      next.targetAfter={...(result.targetAfter || next.targetBefore),hp:monsterHp};
    }
    if(result.hpSnapshot) {
      next.hpSnapshot=structuredClone(result.hpSnapshot);
      if(next.hpSnapshot.monster)next.hpSnapshot.monster.hp=monsterHp;
      const enemy=next.hpSnapshot.enemies?.find(e=>e.instanceId===(step.targetEnemyId||step.hpSnapshotBefore.monster?.instanceId));
      if(enemy)enemy.hp=monsterHp;
    }
    return next;
  });
  return step;
}

// Normalize at the wire boundary, after legacy producers and reaction ordering.
// This never resolves targets against the room's *current* selection.
export function normalizeCombatQueue(queue, presentationId) {
  let sequence = 0;
  for (const [stepIndex, step] of queue.entries()) {
    const primaryId = step.targetEnemyId || step.hpSnapshotBefore?.monster?.instanceId || step.hpSnapshot?.monster?.instanceId;
    const resolve = (id, explicit) => id === 'monster' ? explicit || primaryId : id;
    step.targetId = resolve(step.targetId, step.targetEnemyId);
    if (step.targetId === primaryId) step.targetEnemyId = primaryId;
    step.sourceId = resolve(step.sourceId || (step.type === 'boss_action' ? step.enemyId || primaryId : null));
    const display = structuredClone(step.hpSnapshotBefore || { players: [], enemies: [] });
    step.results = (step.results || []).filter(result=>{
      if(!['damage','intercept'].includes(result.kind))return true;
      const id=resolve(result.targetId,result.targetEnemyId||result.targetBefore?.instanceId);
      const before=result.targetBefore||snapshotTarget(display,id);
      return !before||before.hp>0;
    }).map((result, index) => {
      const targetId = resolve(result.targetId, result.targetEnemyId || result.targetBefore?.instanceId);
      const before = result.targetBefore || structuredClone(snapshotTarget(display, targetId));
      const after = result.targetAfter || snapshotTarget(result.hpSnapshot || step.hpSnapshot, targetId) || before;
      const enemyId = result.targetEnemyId || before?.instanceId || after?.instanceId;
      const sourceId = result.minion && result.kind !== 'intercept' ? result.minion.id : resolve(result.sourceId || step.sourceId || targetId);
      const next = { ...result, sourceId, ownerId: result.ownerId || (result.minion ? step.sourceId : undefined),
        targetId, targetEnemyId: enemyId || null,
        actionId: result.actionId || step.actionId || step.category || step.type,
        skillId: result.skillId || step.actionId || step.category || step.type,
        outcome: result.outcome || step.outcome || { type: 'normal' },
        actualDamage: result.kind === 'damage' || result.kind === 'intercept' ?
          Math.max(0, (before?.hp || 0) - (after?.hp || 0)) + Math.max(0, (before?.tempHp || 0) - (after?.tempHp || 0)) : 0,
        actualHpDamage: Math.max(0, (before?.hp || 0) - (after?.hp || 0)),
        actualAbsorbed: Math.max(0, (before?.tempHp || 0) - (after?.tempHp || 0)),
        actualHeal: result.actualHeal ?? (['heal', 'revive'].includes(result.kind) ? Math.max(0, (after?.hp || 0) - (before?.hp || 0)) : 0),
        actualShield: result.actualShield ?? Math.max(0, (after?.tempHp || 0) - (before?.tempHp || 0)),
        targetBefore: before, targetAfter: after,
        sequence: sequence++, resultId: presentationId + ':' + stepIndex + ':' + index,
        targetRelation: result.sharedFrom ? 'redirected' : result.kind === 'intercept' ? 'intercept' :
          targetId === sourceId ? 'self' : enemyId ? (enemyId === primaryId ? 'primary' : 'secondary') : 'ally' };
      const current = snapshotTarget(display, targetId);
      if (current && after) Object.assign(current, structuredClone(after));
      const enemy = enemyId && display.enemies?.find(e => e.instanceId === enemyId);
      if (enemy && after) Object.assign(enemy, structuredClone(after));
      if (enemyId && display.monster?.instanceId === enemyId && after) display.monster = structuredClone(after);
      next.hpSnapshot = structuredClone(display);
      return next;
    });
    for (const event of step.visualEvents || []) {
      if (event.type === 'player_attack' || event.type === 'augur_tome') {
        event.targetEnemyId ||= event.target !== 'monster' && event.target ? event.target : primaryId;
        event.targetId = event.targetEnemyId;
      } else if (event.targetId === 'monster') event.targetId = event.targetEnemyId || primaryId;
      event.sourceId ||= step.sourceId;
      event.actionId ||= step.actionId || step.category || step.type;
    }
  }
  return queue;
}
