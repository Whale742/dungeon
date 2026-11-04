// Keep the public type array compatible with existing HUDs and saved encounters.
// Metadata is positional: every attachment/removal updates both arrays together.
export const TALISMAN_TYPES = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
export function normalizeTalismans(enemy) {
  const permanent = [...(enemy.permanentTalismans || [])];
  const old = enemy.talismanStates || [];
  enemy.talismans = (enemy.talismans || []).slice(0, 10).map(t => typeof t === 'string' ? t : t.type);
  enemy.talismanStates = enemy.talismans.map((type, i) => {
    const p = permanent.indexOf(type), state = old[i];
    if (p >= 0) permanent.splice(p, 1);
    const source = state?.type === type ? state.source : p >= 0 ? 'leader' : 'normal';
    return { type, source: source === 'leader' ? 'leader' : 'normal',
      dropRate: Math.max(0, Math.min(source === 'leader' ? 30 : 70, Number(state?.type === type ? state.dropRate : 0) || 0)) };
  });
  enemy.permanentTalismans = [];
  enemy.talismansLockedTurns = 0;
  return enemy.talismanStates;
}
export function attachTalisman(enemy, type, source = 'normal') {
  normalizeTalismans(enemy);
  if (enemy.hp <= 0 || enemy.talismans.length >= 10 || !TALISMAN_TYPES.includes(type)) return false;
  enemy.talismans.push(type);
  enemy.talismanStates.push({type, source, dropRate: 0});
  if (enemy.activeTalismans) enemy.activeTalismans.push(type);
  return true;
}
export const activeTalismans = enemy => enemy.activeTalismans ?? enemy.talismans ?? [];
export function clearTalismans(enemy) {
  enemy.talismans = []; enemy.talismanStates = []; enemy.permanentTalismans = []; enemy.activeTalismans = [];
  enemy.sealedThisRound = false;
  enemy.talismanPendingRound = null; enemy.talismanResolution = null;
}
export function ageTalismans(enemy, round, increment, rng = Math.random) {
  if (enemy.talismanRound === round) return null;
  const states = normalizeTalismans(enemy), kept = [], dropped = [], rolls = [];
  enemy.talismanRound = round;
  for (const state of states) {
    const roll = rng();
    rolls.push({type: state.type, source: state.source, dropRate: state.dropRate, roll});
    if (roll < state.dropRate / 100) dropped.push(state.type);
    else kept.push({...state, dropRate: Math.min(state.source === 'leader' ? 30 : 70,
      state.dropRate + (state.source === 'leader' ? 5 : increment))});
  }
  enemy.talismanStates = kept;
  enemy.talismans = kept.map(s => s.type);
  // Partial Fisher–Yates samples distinct physical cards; resolve in stored order.
  const indices = kept.map((_, i) => i);
  for (let i = 0; i < Math.min(5, indices.length); i++) {
    const j = i + Math.floor(rng() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const selected = indices.slice(0, 5).sort((a,b) => a-b);
  enemy.activeTalismans = selected.map(i => kept[i].type);
  enemy.talismanResolution = {round, rolls, dropped, selected};
  return {dropped, kept: enemy.talismans, selected: enemy.activeTalismans};
}
export function distributeLeaderTalismans(enemies, rng = Math.random) {
  const additions = new Map();
  for (const enemy of enemies) normalizeTalismans(enemy);
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.talismans.length >= 10) continue;
    const count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count && enemy.talismans.length < 10; i++) {
      const type = TALISMAN_TYPES[Math.floor(rng() * TALISMAN_TYPES.length)];
      if (attachTalisman(enemy, type, 'leader')) additions.set(enemy, [...(additions.get(enemy) || []), type]);
    }
  }
  return additions;
}
