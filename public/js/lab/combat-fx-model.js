// Presentation-data adapter only: reuse recorded outcomes, never run game rules.
export const clone = value => structuredClone(value);
export function actorFor(config) {
  return [...config.party, ...config.enemies].find(p => p.id === config.actorId || p.instanceId === config.actorId);
}
export function sceneSteps(fixture, entry) {
  if(entry.id==='gladiator_full')return Array.from(fixture.steps);
  const belongs=s=>entry.role?s.sourceRole===entry.role&&!['boss_action','enemy_mechanic'].includes(s.type):['boss_action','enemy_mechanic'].includes(s.type);
  return Array.from(fixture.steps).filter((s,i,steps)=>belongs(s)&&(s.actionId===entry.actionId || s.actionId===entry.actionId+'_result' || (entry.role==='sage'&&s.actionId==='sge_equation'&&steps.slice(0,i).some(p=>p.actionId===entry.actionId))));
}
export function preparePlayback(config, fixture, entry) {
  const sourceSteps = sceneSteps(fixture, entry);
  if (!sourceSteps.length) throw new Error('此樣本沒有可獨立播放的行動');
  const actor = actorFor(config);
  if (!actor) throw new Error('請選擇演出者');
  const base = { players: clone(config.party), enemies: clone(config.enemies), arena: null };
  const primary = base.enemies.find(e => e.instanceId === config.primaryId) || base.enemies[0];
  base.monster = primary; base.currentMonster = primary;
  const original = sourceSteps[0].hpSnapshotBefore;
  const originalEnemies = original?.enemies?.length ? original.enemies : original?.monster ? [original.monster] : [];
  const ids = new Map([['monster', primary.instanceId]]);
  const used = new Set();
  for (const p of original?.players || []) {
    const next = p.id === sourceSteps[0].sourceId && entry.role ? actor : base.players.find(x => x.role === p.role && !used.has(x.id) && x.id !== config.actorId);
    if (next) { ids.set(p.id, next.id); used.add(next.id); }
  }
  if (entry.role) ids.set(sourceSteps[0].sourceId, actor.id);
  const enemies = [primary, ...base.enemies.filter(e => e !== primary)];
  originalEnemies.forEach((e,i) => { if(enemies[i]) ids.set(e.instanceId || e.id || 'monster', enemies[i].instanceId); });
  if (!entry.role) ids.set(sourceSteps[0].sourceId, actor.instanceId);
  const target = entry.targetSide === 'party' ? config.partyTargetId : config.primaryId;
  if(entry.role&&entry.targetSide==='party'&&sourceSteps[0].targetId&&sourceSteps[0].targetId!==sourceSteps[0].sourceId&&!['all','all_players','all_allies'].includes(sourceSteps[0].targetId))ids.set(sourceSteps[0].targetId,target);
  // A single-target incoming attack must hit the explicitly selected ally.
  if (!entry.role && sourceSteps[0].results?.length) {
    const first=sourceSteps[0].results.find(r => original?.players?.some(p => p.id === r.targetId));
    if(first) ids.set(first.targetId, target);
  }
  const units = state => [...state.players, ...state.enemies];
  const idOf = p => p.instanceId || p.id;
  const delta = (before, after, current) => {
    const next = clone(current);
    const maxHp=typeof after?.maxHp==='number'&&typeof before?.maxHp==='number'?Math.max(1,current.maxHp+after.maxHp-before.maxHp):current.maxHp;
    for (const [key,value] of Object.entries(after || {})) {
      if (['id','instanceId','name','role','avatar','battleAvatar','tier','equips','customAvatar'].includes(key)) continue;
      if (JSON.stringify(before?.[key]) === JSON.stringify(value)) continue;
      if (key === 'hp' && typeof before?.hp === 'number') next.hp = Math.max(0, Math.min(maxHp, current.hp + value - before.hp));
      else if(key==='maxHp')next.maxHp=maxHp;
      else next[key] = clone(value);
    }
    return next;
  };
  let state = clone(base);
  const steps = sourceSteps.map((raw,index) => {
    const step = clone(raw), before = clone(state);
    const isEnemyResult=r=>r.targetId==='monster'||!!r.targetEnemyId||!!r.targetBefore?.instanceId||originalEnemies.some(e=>[e.id,e.instanceId].includes(r.targetId));
    const selfOnly=entry.targetMode==='self'&&(raw.results||[]).length&&(raw.results||[]).every(r=>r.targetId===raw.sourceId);
    const targetsEnemy=raw.targetId==='monster'||!!raw.targetEnemyId||originalEnemies.some(e=>[e.id,e.instanceId].includes(raw.targetId))||(!selfOnly&&(raw.results||[]).some(isEnemyResult));
    const stepTarget=selfOnly?step.sourceId:targetsEnemy?config.primaryId:target;
    step.sourceId = entry.role ? actor.id : actor.instanceId;
    step.sourceName = actor.name; step.sourceRole = entry.role || raw.sourceRole;
    step.monsterName = entry.role ? primary.name : actor.name;
    step.monsterAvatar = entry.role ? primary.avatar : actor.avatar;
    step.targetId = selfOnly?step.sourceId:stepTarget; step.targetEnemyId = targetsEnemy?config.primaryId:undefined;
    step.hpSnapshotBefore = before;
    const allEnemies = /all|enemies/.test(raw.targetId || '') || (raw.tags || []).some(t => /群體|群攻/.test(t));
    const allParty = (entry.targetSide === 'party' && (raw.tags || []).some(t => /全體/.test(t))) || (!!entry.role && new Set((raw.results||[]).filter(r=>!isEnemyResult(r)).map(r=>r.targetId)).size > 1);
    const selectedSupport=entry.role&&entry.targetMode!=='self'&&entry.targetSide==='party'&&!allParty&&((raw.results||[]).every(r=>['heal','shield'].includes(r.kind))||['dw_butterfly','dw_false_dream'].includes(entry.skillId));
    const results=[];
    const firstEnemyResult=raw.results?.find(isEnemyResult),firstAllyResult=raw.results?.find(r=>!isEnemyResult(r));
    for (const result of raw.results || []) {
      const oldId=result.canonicalTargetId || result.targetEnemyId || result.targetId;
      const enemyResult=oldId==='monster' || originalEnemies.some(e => [e.id,e.instanceId].includes(oldId)) || !!result.targetBefore?.instanceId;
      if(allEnemies&&enemyResult&&oldId!==(firstEnemyResult?.canonicalTargetId||firstEnemyResult?.targetEnemyId||firstEnemyResult?.targetId))continue;
      if(allParty&&!enemyResult&&oldId!==(firstAllyResult?.canonicalTargetId||firstAllyResult?.targetEnemyId||firstAllyResult?.targetId))continue;
      let receivers = allEnemies && enemyResult ? state.enemies.map(idOf) : allParty && !enemyResult ? state.players.map(idOf) : [ids.get(oldId)];
      if (!allEnemies && enemyResult && entry.role) receivers = [config.primaryId];
      if (entry.role && !enemyResult && entry.targetSide==='party' && !allParty && oldId!==raw.sourceId) receivers=[target];
      if(selectedSupport)receivers=[target];
      for (const id of receivers.filter(Boolean)) {
        const current=units(state).find(p=>idOf(p)===id); if(!current)continue;
        const key=[id,result.kind,result.resultId || results.length].join(':');
        const beforeTarget=clone(current);
        const after=delta(result.targetBefore,result.targetAfter,current);
        const actualHpDamage=Math.max(0,(beforeTarget?.hp||0)-(after?.hp||0));
        const actualAbsorbed=Math.max(0,(beforeTarget?.tempHp||0)-(after?.tempHp||0));
        const r={...clone(result),resultId:`lab-${index}-${key}`,targetId:id,canonicalTargetId:id,targetBefore:beforeTarget,targetAfter:after};
        r.actualHpDamage ??= actualHpDamage;
        r.actualAbsorbed ??= actualAbsorbed;
        r.actualDamage ??= ['damage','intercept'].includes(result.kind)?actualHpDamage+actualAbsorbed:0;
        if(state.enemies.some(e=>e.instanceId===id))r.targetEnemyId=id; else delete r.targetEnemyId;
        const collection=r.targetEnemyId?state.enemies:state.players;
        collection[collection.findIndex(p=>idOf(p)===id)]=after;
        state.monster=state.enemies.find(e=>e.instanceId===primary.instanceId);state.currentMonster=state.monster;
        r.hpSnapshot=clone(state);results.push(r);
      }
    }
    // Apply recorded non-target state changes too (observation, soul, form,
    // ammo, summons). Always compute deltas from this step's start, once.
    const oldBefore=raw.hpSnapshotBefore;
    const resolvedOriginalIds=new Set((raw.results||[]).map(r=>r.canonicalTargetId||r.targetEnemyId||r.targetId));
    const resolvedIds=new Set(results.map(r=>r.targetId));
    for(const collection of ['players','enemies']){
      const afterUnits=raw.hpSnapshot?.[collection] || (collection==='enemies'&&raw.hpSnapshot?.monster?[raw.hpSnapshot.monster]:[]);
      const beforeUnits=oldBefore?.[collection] || (collection==='enemies'&&oldBefore?.monster?[oldBefore.monster]:[]);
      for(const old of afterUnits){
        const originalId=collection==='enemies'?(old.instanceId||old.id||'monster'):old.id;
        // Target-after payloads already committed these changes, possibly to a
        // newly selected recipient. Do not also apply them to the fixture actor.
        if(resolvedOriginalIds.has(originalId))continue;
        const id=ids.get(originalId),baseline=units(before).find(p=>idOf(p)===id);
        if(!baseline||resolvedIds.has(id))continue;
        const prior=beforeUnits.find(p=>(collection==='enemies'?(p.instanceId||p.id||'monster'):p.id)===originalId);
        const index=state[collection].findIndex(p=>idOf(p)===id);
        if(index>=0)state[collection][index]=delta(prior,old,baseline);
      }
    }
    state.monster=state.enemies.find(e=>e.instanceId===primary.instanceId);state.currentMonster=state.monster;
    step.results=results;
    step.hpSnapshot=clone(state);
    // References inside per-role payloads (marks, follow-ups, arena ownership).
    const remap = value => {
      if (typeof value==='string') return ids.get(value) || value;
      if (Array.isArray(value)) return value.map(remap);
      if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));
      return value;
    };
    for(const key of Object.keys(step))if(/Presentation$/.test(key))step[key]=remap(step[key]);
    for(const [source,destination]of [[raw.hpSnapshotBefore,step.hpSnapshotBefore],[raw.hpSnapshot,step.hpSnapshot]]){
      if(source&&'arena'in source){const arena=source.arena?remap(source.arena):null;if(arena){arena.enemyId=primary.instanceId;arena.playerId=entry.role?actor.id:target;}destination.arena=arena;}
    }
    return remap(step);
  });
  return { initial:base, steps };
}
