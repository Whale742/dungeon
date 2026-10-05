// Wire contract: gameplay decides every outcome and value before presentation.
export const ACTION_CATEGORIES = Object.freeze([
  'OFFENSIVE', 'AOE_OFFENSIVE', 'HEAL', 'DEFENSE', 'SHIELD', 'BUFF', 'DEBUFF',
  'CLEANSE', 'TRANSFORM', 'SUMMON', 'STEALTH', 'REVIVE', 'MINION_ATTACK',
  'MINION_INTERCEPT', 'STATUS_TICK', 'FOLLOW_UP'
]);
export const SKILL_CATEGORIES = Object.freeze({
  basic: 'OFFENSIVE', w_strike: 'OFFENSIVE', w_cleave: 'OFFENSIVE', w_shield: 'DEFENSE',
  m_blast: 'OFFENSIVE', m_drain: 'OFFENSIVE', a_shot: 'OFFENSIVE', a_rain: 'AOE_OFFENSIVE',
  s_stab: 'OFFENSIVE', s_smoke: 'OFFENSIVE', b_heal: 'HEAL', b_buff: 'BUFF',
  b_nocturne: 'DEBUFF', b_frenzy: 'BUFF', b_revive: 'REVIVE', alc_acid: 'OFFENSIVE',
  alc_poison: 'DEBUFF', alc_flask: 'OFFENSIVE', alc_fate: 'CLEANSE', dru_transform: 'TRANSFORM',
  dru_summon_treant: 'SUMMON', dru_summon_wolf: 'SUMMON'
});

export function playerStatuses(player, room, balance) {
  const statuses = [];
  const add = (id, label, icon, turns = 0, extra = {}) => statuses.push({ id, label, icon, turns, ...extra });
  if (player.hp <= 0) add('downed', '倒下・本層無法行動', 'downed');
  if (player.poisonTurns) add('poison', 'POISON', 'poison', player.poisonTurns, { stacks: player.poisonDmg });
  if (player.bleedTurns) add('bleed', 'BLEED', 'bleed', player.bleedTurns);
  if (player.cannotCrit) add('crit_lock', 'CRIT LOCK', 'lock', 1);
  if (player.archerNextDodgeBonus) add('dodge_bonus', 'DODGE ↑', 'dodge', 1, { value: '+' + player.archerNextDodgeBonus * 100 + '%' });
  if (player.stunnedNextTurn || player.nextTurnStunFlag) add('exhausted', 'EXHAUSTED', 'exhausted', 1);
  if (player.druidForm === 'tree') add('sleep', '沉睡古樹', 'sleep', player.druidFormTurns);
  if (player.druidForm === 'treant' || player.druidForm === 'tree') add('treant_guard', 'DR ' + balance.treantDamageReduction * 100 + '%', 'guard', player.druidFormTurns);
  if (player.druidForm === 'werewolf') add('wolf', '狼人形態', 'transform', player.druidFormTurns);
  if (player.warriorVulnerableTurns || player.warriorVulnerableNextTurn) add('vulnerable', 'VULNERABLE', 'debuff', 1);
  if (player.stealthStacks) add('stealth_stack', '匿蹤', 'stealth', 0, { stacks: player.stealthStacks });
  if (player.hp > 0 && player.isHiddenThisRound && !player.stealthBrokenThisRound) {
    add('hidden', '隱身', 'stealth', 1);
    add('follow_up', '追擊 ' + (player.followUpsThisRound || 0) + '/' + (room.getAssassinFollowUpCap(player)), 'stealth');
  }
  if (player.isSurrendered) add('surrender', '血脈臣服', 'lock', 0, { locked: true });
  if (player.hp > 0) {
    if (room.warriorShieldTurn) add('guard', 'GUARD', 'guard', room.warriorShieldTurn === 1 ? 2 : 1);
    if (room.alcShieldTurns) add('alchemy_guard', 'DR 70%', 'guard', room.alcShieldTurns);
    if (room.alcVulnerableTurns || room.alcVulnerableNextTurn) add('alchemy_vulnerable', 'VULNERABLE', 'debuff', 1);
    if (room.frenzyTeamDrainNextTurn) add('frenzy', 'DMG +70% · 次回合代價', 'buff', 1);
    if (room.bardBuffActive) add('frenzy_buff', 'DMG ↑ / DR ↑', 'buff', 1);
    if (player.tempHp > 0) add('temp_hp', 'TEMP HP', 'shield', 1, { value: player.tempHp });
    if (player.corruption) add('corruption', '深淵腐化', 'corruption', 0, { locked: true, stacks: player.corruption });
  }
  return statuses;
}

export function snapshotTarget(snapshot, id) {
  if (id === 'monster') return snapshot.monster;
  return snapshot.players.find(p => p.id === id) || snapshot.players.flatMap(p => p.minions || []).find(m => m.id === id);
}

export function buildActionResults(step, before, after, visuals, heals = []) {
  const results = [];
  let display = structuredClone(before);
  const append = (result, targetAfter) => {
    const current = snapshotTarget(display, result.targetId);
    const targetBefore = current ? structuredClone(current) : null;
    if (result.targetId === 'monster') display.monster = structuredClone(targetAfter);
    else if (current && targetAfter) Object.assign(current, structuredClone(targetAfter));
    results.push({ ...result, targetBefore, targetAfter: structuredClone(targetAfter), hpSnapshot: structuredClone(display) });
  };
  if (step.cleansedSnapshot) for (const player of step.cleansedSnapshot.players.filter(p => p.hp > 0)) {
    append({ kind: 'cleanse', targetId: player.id, statuses: player.statuses, outcome: { type: 'normal' } }, player);
  }
  const attacks = visuals.filter(e => e.type === 'player_attack');
  if (step.category === 'TRANSFORM' || step.category === 'SUMMON') {
    const player = after.players.find(p => p.id === step.sourceId);
    const old = snapshotTarget(before, step.sourceId);
    append({ kind: step.category === 'SUMMON' ? 'summon' : 'transform', targetId: player.id,
      statuses: player.statuses, outcome: step.outcome,
      minions: (player.minions || []).filter(m => !(old?.minions || []).some(n => n.id === m.id)) }, player);
  }
  for (const event of attacks) {
    const next = { ...display.monster, hp: Math.max(0, display.monster.hp - event.value) };
    append({ kind: 'damage', targetId: 'monster', finalDamage: event.value,
      outcome: step.outcome, damageType: event.dmgType === 'mag' ? 'magic' : 'physical' }, next);
  }
  // Certain equipment adds a separate actual boss damage result.
  if (display.monster && after.monster && display.monster.hp > Math.max(0, after.monster.hp)) {
    append({ kind: 'damage', targetId: 'monster', finalDamage: display.monster.hp - Math.max(0, after.monster.hp),
      outcome: { type: 'normal' }, damageType: 'magic' }, { ...after.monster, hp: Math.max(0, after.monster.hp) });
  }
  for (const heal of heals) append({ kind: 'heal', targetId: heal.targetId, actualHeal: heal.actualHeal,
    outcome: { type: 'normal' } }, heal.targetAfter);
  if (step.category === 'BUFF') {
    for (const player of after.players.filter(p => p.hp > 0)) {
      const old = snapshotTarget(display, player.id);
      append({ kind: 'status', targetId: player.id, statuses: player.statuses, outcome: step.outcome },
        { ...old, statuses: player.statuses });
    }
  }
  for (const event of visuals.filter(e => e.type === 'self_damage' || e.type === 'revive' || e.type === 'hidden_evade')) {
    const target = snapshotTarget(after, event.targetId);
    if (target) append({ kind: event.type === 'revive' ? 'revive' : 'damage', targetId: event.targetId,
      finalDamage: event.value, actualHeal: event.type === 'revive' ? event.value : undefined,
      outcome: event.outcome || { type: 'normal' }, damageType: 'physical' }, target);
  }
  for (const player of after.players) {
    const old = snapshotTarget(display, player.id);
    const changed = JSON.stringify(old?.statuses || []) !== JSON.stringify(player.statuses || []);
    const formChanged = old?.druidForm !== player.druidForm;
    const spawned = (player.minions || []).filter(m => !(old?.minions || []).some(n => n.id === m.id));
    if (changed || formChanged || spawned.length || old?.hp !== player.hp || old?.maxHp !== player.maxHp) {
      append({ kind: spawned.length ? 'summon' : formChanged ? 'transform' : 'status', targetId: player.id,
        statuses: player.statuses, minions: spawned, outcome: step.outcome }, player);
    }
  }
  if (after.monster && JSON.stringify(display.monster?.statuses) !== JSON.stringify(after.monster.statuses)) {
    append({ kind: 'status', targetId: 'monster', statuses: after.monster.statuses, outcome: step.outcome },
      { ...after.monster, hp: Math.max(0, after.monster.hp) });
  }
  return results;
}
