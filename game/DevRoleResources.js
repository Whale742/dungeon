// Explicit numeric resource operations only. Composite relationships stay read-only.
const resources = {
  warrior: [{ key: 'warriorStacks', label: '受傷攻擊疊層', min: 0, max: 15, get: p => p.warriorStacks || 0, set: (p, v) => { p.warriorStacks = v; } }],
  gladiator: [{ key: 'rage', label: '怒氣', min: 0, max: 100, get: p => p.rage || 0, set: (p, v) => { p.rage = v; } }],
  sage: [{ key: 'sageX', label: '變量 X', min: 0, max: 10000, get: p => p.sageX ?? 30, set: (p, v) => { p.sageX = v; } }],
  assassin: [{ key: 'stealthStacks', label: '匿蹤疊層', min: 0, max: 100, get: p => p.stealthStacks || 0, set: (p, v) => { p.stealthStacks = v; } }],
  samurai: [{ key: 'soul', label: '武魂', min: 0, max: 8, get: p => p.soul || 0, set: (p, v) => { p.soul = v; } }]
};
export const DEV_ROLE_POLICY = {
  warrior: '可調整受傷疊層；防護效果唯讀',
  gladiator: '可調整怒氣；血祭與競技場唯讀',
  sage: '可調整 X；運算元、演算階段、透支與取樣唯讀',
  assassin: '可調整匿蹤疊層；本回合隱藏與追擊關係唯讀',
  samurai: '可調整武魂；狂刀與招架唯讀',
  augur: '觀測、諭示牌與命債關係唯讀',
  mage: '技能冷卻與效果唯讀', archer: '彈藥、閃避與技能狀態唯讀',
  bard: '曲目加成與技能狀態唯讀', alchemist: '酸蝕、藥劑與技能狀態唯讀',
  druid: '變身、召喚物與技能狀態唯讀', paladin: '代贖、護盾來源與追蹤關係唯讀',
  stargazer: '星象與觀測狀態唯讀', dreamweaver: '夢境與生命連動唯讀', onmyoji: '符咒與式神關係唯讀'
};

export function roleResources(player) {
  return (resources[player.role] || []).map(({ key, label, min, max, get }) => ({ key, label, min, max, value: get(player) }));
}
export function validRoleResource(room, params) {
  const p = room.players[params.playerId];
  const resource = p && Object.hasOwn(resources, p.role) && resources[p.role].find(r => r.key === params.resource);
  return Boolean(resource && room.state === 'IN_BATTLE' && p.hp > 0 && !p.arenaActive &&
    !(p.role === 'sage' && (p.sageDebt > 0 || (p.sageInduction && !p.sageSamplingEnded))) &&
    Number.isSafeInteger(params.value) && params.value >= resource.min && params.value <= resource.max);
}
export function setRoleResource(room, params) {
  const player = room.players[params.playerId];
  resources[player.role].find(r => r.key === params.resource).set(player, params.value);
}
