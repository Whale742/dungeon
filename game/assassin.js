// Authoritative Assassin rules. Presentation consumes snapshots, never rolls.
export const ASSASSIN_BALANCE = Object.freeze({
  followUpChance: .5, followUpCritChance: .5, followUpBaseDamage: 10,
  criticalMultiplier: 2, skill1BaseDamage: 35, skill2BaseDamage: 30,
  skill2StackMultiplier: .5,
  skill2CanCrit: null // TODO: user has not specified critical eligibility.
});
export function assassinState(p) {
  return { stealthStacks: p.stealthStacks || 0, critTowardStealth: p.critTowardStealth || 0,
    isHiddenThisRound: !!p.isHiddenThisRound, stealthBrokenThisRound: !!p.stealthBrokenThisRound,
    followUpsThisRound: p.followUpsThisRound || 0, followUpCap: getAssassinFollowUpCap(p) };
}
export function getAssassinFollowUpCap(p) {
  const count = (p.equips || []).filter(e => e.id === 's_blade' || e.name === '染毒刺刃').length;
  return 2 + Math.min(2, Math.max(0, count - 1));
}
export function assassinCritRate(p, equipmentMultiplier = 1) {
  return Math.min(1, .5 + ((p.equips || []).some(e => e.id === 's_blade') ? .3 * equipmentMultiplier : 0));
}
export function isAssassinHidden(p) {
  return p.role === 'assassin' && p.hp > 0 && !p.downedForFloor && p.isHiddenThisRound && !p.stealthBrokenThisRound;
}
export function addAssassinCritical(p, count = 1) {
  p.critTowardStealth = (p.critTowardStealth || 0) + count;
  const gain = Math.floor(p.critTowardStealth / 2);
  p.critTowardStealth %= 2;
  p.stealthStacks = (p.stealthStacks || 0) + gain;
  return gain;
}
