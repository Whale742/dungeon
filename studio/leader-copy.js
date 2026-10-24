import { LEADER_SKILLS } from '../game/constants.js';

export const LEADER_COPY_PREFIX = '(僅在作為隊長時生效)';
export function leaderDescription(value = '') {
  return LEADER_COPY_PREFIX + String(value).trim().replace(/^(?:\(僅在作為隊長時生效\)\s*)+/, '');
}
export function leaderSkillCopy(role) {
  const skill = LEADER_SKILLS[role];
  return skill && { ...skill, label: skill.name, isLeaderSkill: true,
    shortDesc: leaderDescription(skill.desc), desc: leaderDescription(skill.combatDesc || skill.desc) };
}
