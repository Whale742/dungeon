import {v2Copy, v2SkillCopy, v2SkillKey} from './v2-content.js';
import { INITIAL_STATS, resolveStats } from './stats.js';
import { NEW_CLASSES, NEW_LOOT, NEW_ROLE_DETAILS } from './phase8-config.js';
// 遊戲常數與數值定義 (100% 完整移植自 index.js)

export const CLASSES = {
  warrior: {
    name: '戰士',
    emoji: '🛡️',
    avatar: '/photo/Warrior.webp',
    maxHp: 120,
    desc: '【生命 120】前排坦鋒。具備強大的守護壁壘，全技能皆為物理傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', tags: ['物理', '單體'], desc: '對單一目標造成基礎 5 點物理打擊。' },
      { id: 'w_strike', label: '堅定斬擊', cd: 0, dmgType: 'phys', tags: ['物理', '單體', '高風險'], desc: '揮動巨劍造成物理傷害。有機率因揮砍失衡而造成微量傷害，並使下回合自身承受傷害提高。施放後自身減傷 60% 持續 3 回合，每輪末反擊本輪實受傷害。' },
      { id: 'w_shield', label: '壁壘守護', cd: 2, tags: ['護盾', '全體'], desc: '全隊獲得戰士最大生命 40% 的護盾；有機率盾牌龜裂延長冷卻。' }
    ]
  },
  mage: {
    name: '法師',
    emoji: '🧙‍♂️',
    avatar: '/photo/Mage.webp',
    maxHp: 80,
    desc: '【生命 80】遠程法系。站樁高爆發與生命汲取，全技能皆為魔法傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'mag', tags: ['魔法', '單體'], desc: '引導微光魔力造成基礎魔法打擊。' },
      { id: 'm_blast', label: '奧術爆破', cd: 2, dmgType: 'mag', tags: ['魔法', '單體', '高風險'], desc: '引爆狂暴魔力轟炸敵方；有機率發生法力走火導致威力驟降，並對自身造成魔力反噬。' },
      { id: 'm_drain', label: '生命汲取', cd: 2, dmgType: 'mag', tags: ['魔法', '單體', '治療'], desc: '對敵方造成劇烈浮動的魔法傷害，並依據最終造成的傷害量吸取生命回復自身。' }
    ]
  },
  archer: {
    name: '弓箭手',
    emoji: '🏹',
    avatar: '/photo/Archer.webp',
    maxHp: 80,
    dodgeRate: 0.4,
    desc: '【生命 80】遠程敏捷。常駐 40% 閃避，普攻與1技能為物理，2技能為魔法。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', tags: ['物理', '單體'], desc: '拉弓射出基礎箭矢造成物理打擊。' },
      { id: 'a_shot', label: '精準狙擊', cd: 1, dmgType: 'phys', tags: ['物理', '單體', '高風險'], desc: '百步穿楊狙擊目標；有機率發生脫靶導致無法造成傷害，並使下一次閃避檢定成功率提高 20 個百分點（檢定後消耗）。' },
      { id: 'a_rain', label: '箭雨壓制', cd: 1, dmgType: 'mag', tags: ['魔法', '全體', '減益', '高風險'], desc: '召喚範圍附魔箭雨造成魔法傷害並削弱敵方攻擊；有機率受地底氣流干擾誤傷隨機一名隊友。' }
    ]
  },
  assassin: {
    name: '刺客',
    emoji: '🗡️',
    avatar: '/photo/Assassin.webp',
    maxHp: 50,
    critRate: 0.5,
    vulnerableMod: 1.25,
    desc: '【生命 50】60% 暴擊；每次暴擊獲得1層匿蹤，隱身可追擊；100% 避開陷阱，輕甲承傷 +25%。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', tags: ['物理', '單體'], desc: '揮動雙匕進行基礎物理切削。' },
      { id: 's_stab', label: '暗影刺殺', cd: 1, dmgType: 'phys', tags: ['物理', '單體'], desc: '基礎 35 點物理傷害，暴擊 70 點。若觸發暴擊則傷害倍增且立即重置冷卻，未暴擊則需正常進入冷卻。' },
      { id: 's_smoke', label: '暗影爆襲', cd: 2, dmgType: 'phys', tags: ['物理', '單體'], desc: '消耗所有匿蹤，造成基礎 30 點傷害；每層增加基礎傷害的 50%（3 層為 75）。暴擊資格待定。' }
    ]
  },
  bard: {
    name: '吟遊詩人',
    emoji: '🪕',
    avatar: '/photo/Bard.webp',
    maxHp: 70,
    desc: '【生命 70】團隊核心輔助。普攻為魔法傷害，精通全體群療與增傷減傷。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'mag', tags: ['魔法', '單體'], desc: '撥動琴弦引導音波造成基礎魔法傷害。' },
      { id: 'b_heal', label: '治癒頌歌', cd: 1, tags: ['治療', '全體', '高風險'], desc: '唱響聖詠為全體隊友回復生命，並專注為指定目標額外回復；有機率因走音導致全隊回復量大幅縮減。' },
      { id: 'b_buff', label: '狂熱協奏', cd: 1, tags: ['增益', '全體', '高風險'], desc: '使全隊提升傷害、減傷並削弱敵方抗性；有機率因節奏過激導致全隊力竭扣除當前生命。' }
    ]
  },
  alchemist: {
    name: '鍊金術士',
    emoji: '🧪',
    avatar: '/photo/Alchemist.webp',
    maxHp: 70,
    desc: '【生命 70】神秘調和者。\n被動【異常調和】：\n・腐蝕：Boss 的血量上限與傷害減少 5%，玩家觸發時裝備效果減半（持續 1 回合）。\n・中毒：每回合開始時造成 8 點傷害，持續 2 回合（重複釋放可疊加）。\n・燃燒：每回合開始時造成 10 點傷害，持續 1 回合（重複釋放可疊加）。\n・骨折：每回合開始時造成 5 點傷害，持續 3 回合（重複釋放可疊加）。\n・寒冷：每回合開始時造成 6 點傷害，持續 2 回合（重複釋放可疊加）。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'mag', tags: ['魔法', '單體', '腐蝕'], desc: '造成 10 點傷害，有 70% 機率造成腐蝕效果持續一回合，當觸發腐蝕效果時，有 35% 機率使我方全體也觸發腐蝕效果。' },
      { id: 'alc_flask', label: '1 技能: 不穩定試劑瓶', cd: 0, dmgType: 'mag', tags: ['魔法', '群體', '持續傷害', '隨機'], desc: '造成 15 點傷害並波及其他敵方（非主目標承受 50% 傷害），並對主目標造成 4 種持續傷害其中一種：中毒、燃燒、骨折、寒冷（重複釋放可疊加）。有 40% 機率對我方全體同步造成此次效果。' },
      { id: 'alc_fate', label: '2 技能: 命運煉成試劑', cd: 2, tags: ['淨化', '治療', '全體', '高風險'], desc: '立即驅散全隊所有負面狀態。可能煉金大成功或煉金失敗。' }
    ]
  },
  druid: {
    name: '德魯伊',
    emoji: '🌿',
    avatar: '/photo/Druid.webp',
    maxHp: 85,
    desc: '【生命 85】自然之子。擅長形態轉變（狼人/樹精）與自然呼喚夥伴（小樹精/幼狼）。',
    forms: {
      werewolf: { name: '狼人', avatar: '/photo/狼人.webp' },
      treant: { name: '遠古樹精', avatar: '/photo/遠古樹精.webp' },
      tree: { name: '沉睡古樹', avatar: '/photo/遠古樹精.webp' }
    },
    summons: {
      treant: [
        { name: '小樹精1', avatar: '/photo/小樹精1.webp' },
        { name: '小樹精2', avatar: '/photo/小樹精2.webp' },
        { name: '小樹精3', avatar: '/photo/小樹精3.webp' }
      ],
      wolf: [
        { name: '幼狼1', avatar: '/photo/幼狼1.webp' },
        { name: '幼狼2', avatar: '/photo/幼狼2.webp' },
        { name: '幼狼3', avatar: '/photo/幼狼3.webp' }
      ]
    },
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', tags: ['物理', '單體'], desc: '引導自然力量造成基礎自然打擊。' },
      { id: 'dru_transform', label: '1 技能: 形態轉變', cd: 0, tags: ['變身', '高風險'], desc: '有一半機率化身狼人/化身樹精' },
      { id: 'dru_summon_treant', label: '2 技能 A: 召喚小樹精', cd: 0, tags: ['召喚', '護盾'], desc: '召喚肉盾型樹精夥伴，每回合自動攻擊並優先替隊伍承受分散傷害。' },
      { id: 'dru_summon_wolf', label: '2 技能 B: 召喚幼狼', cd: 0, tags: ['召喚', '物理'], desc: '召喚敏捷型幼狼夥伴，每回合自動攻擊並優先替隊伍承受分散傷害。' }
    ]
  },
  ...NEW_CLASSES
};

export const EQUIP_SLOTS = Object.freeze({
  WEAPON: 'WEAPON',
  ARMOR: 'ARMOR',
  ACCESSORY: 'ACCESSORY',
  CLASS_EXCLUSIVE: 'CLASS_EXCLUSIVE'
});

// 完整重構裝備池 (15 職業專屬裝備池)
export const LOOT_TABLE = [
  ...NEW_LOOT,
  // 戰士 (Warrior)
  {
    id: 'w_sword',
    role: 'warrior',
    name: '鋼鐵聖劍',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 10,
    desc: '被動：當全體玩家未持有護盾時，自身攻擊力＋10點，直到獲得護盾時解除此效果。'
  },
  {
    id: 'w_thorn_shield',
    role: 'warrior',
    name: '荊棘重盾',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    desc: '被動：當自身護盾被擊破時，會獲得一次反傷，反傷倍率等同於受到傷害的100%，冷卻三回合。'
  },
  {
    id: 'w_armor',
    role: 'warrior',
    name: '荊棘重鎧',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 30,
    bonusAtk: -5,
    desc: '最大生命 +30，但造成的傷害 -5。'
  },
  {
    id: 'w_greatsword',
    role: 'warrior',
    name: '雙手劍',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    isSpecial: true,
    unique: true,
    desc: '原本2技能護盾失效，替換為攻擊技能【狂怒重劈】；1技能與2技能基礎傷害分別提升為 25 與 40。不受效果減半影響，不可重複穿戴'
  },

  // 法師 (Mage)
  {
    id: 'm_wand',
    role: 'mage',
    name: '虛空魔杖',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 15,
    desc: '被動：每回合攻擊敵方時，都會降低受到傷害的敵方2%魔法抗性（最低降至0%）。法師攻擊傷害 +15。'
  },
  {
    id: 'm_amulet',
    role: 'mage',
    name: '大魔導護符',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 20,
    desc: '被動：每回合隨機 +1~10 魔法攻擊力，僅當回合生效。法師最大生命值 +20。'
  },
  {
    id: 'm_robe',
    role: 'mage',
    name: '嗜血法袍',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: -20,
    bonusAtk: 20,
    isSpecial: true,
    desc: '最大生命 -20，攻擊傷害 +20。1、2技能額外造成目標最大生命 10% 傷害並為全體隊友吸血（上限不超過該次實際加成傷害）'
  },

  // 弓箭手 (Archer)
  {
    id: 'a_bow',
    role: 'archer',
    name: '破甲獵弓',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 12,
    desc: '被動：每命中一次敵方時，都會降低受到傷害的敵方1%物理抗性（最低降至0%）。弓箭手攻擊傷害 +12。'
  },
  {
    id: 'a_cloak',
    role: 'archer',
    name: '靈巧披風',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 20,
    desc: '被動：使閃避率提高10%，每次攻擊多增加一段傷害。弓箭手最大生命值 +20。'
  },
  {
    id: 'a_archangel_bow',
    role: 'archer',
    name: '大天使重弓',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 20,
    dodgePenalty: 0.20,
    desc: '攻擊傷害 +20，但閃避機率降低 20%'
  },
  {
    id: 'a_crossbow',
    role: 'archer',
    name: '改良型重弩',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    isSpecial: true,
    unique: true,
    desc: '裝備後原有技能失效，替換為【戰術上膛】與【極速狂熱裝填】。裝填時獲得【架弩蹲伏】（減傷 20% 但無法閃避）；普通攻擊消耗彈匣弩箭齊射（穿甲物理／元素魔法／爆裂等量自傷）。不可重複穿戴'
  },

  // 刺客 (Assassin)
  {
    id: 's_blade',
    role: 'assassin',
    name: '染毒刺刃',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: -10,
    bonusCrit: 0.30,
    desc: '被動：暴擊率 +30%（不可疊加）；第 2／3 把分別將追擊上限提高至 3／4 次。基礎傷害 -10。'
  },
  {
    id: 's_armor',
    role: 'assassin',
    name: '暗影皮甲',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: -10,
    bonusAtk: 10,
    desc: '被動：有50%機率不會失去匿蹤，傷害 +10，最大生命 -10。'
  },
  {
    id: 's_boots',
    role: 'assassin',
    name: '赫米斯之靴',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    desc: '被動：當刺客施放1技能時，有30%機率多造成一次傷害。（第二次傷害暴擊可獲得匿蹤，但是造成傷害為原傷害50%）。'
  },

  // 吟遊詩人 (Bard)
  {
    id: 'b_harp',
    role: 'bard',
    name: '精靈木豎琴',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    isSpecial: true,
    desc: '被動：施放2技能時，全隊獲得20%減傷，持續兩回合。1技能與2技能的效果數值皆提升 10%。'
  },
  {
    id: 'b_robe',
    role: 'bard',
    name: '祝福絲綢袍',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 10,
    isSpecial: true,
    desc: '被動：HP +10。每回合初自動為全隊當前生命最低的隊友補血，補血量為詩人HP的 5%。'
  },
  {
    id: 'b_violin',
    role: 'bard',
    name: '妖精木提琴',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 10,
    isSpecial: true,
    unique: true,
    desc: '攻擊傷害 +10。原本1、2技能失效，1技能替換為【催眠夜曲】(15傷害+30%機率使敵方本回合無法行動)；2技能替換為【狂亂殺戮曲】(20傷害，我方全體下回合扣20%最大生命，但全隊傷害提升70%)。不受效果減半影響，不可重複穿戴'
  },

  // 鍊金術士 (Alchemist)
  {
    id: 'alc_flask',
    role: 'alchemist',
    name: '賢者燒瓶',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusAtk: 15,
    desc: '被動：攻擊力 +15，造成的DoT傷害降低25%，但持續回合延長一回合。'
  },
  {
    id: 'alc_robe',
    role: 'alchemist',
    name: '防護生化袍',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 20,
    desc: '被動：使因為普攻和1技能造成我方全體的 DoT 傷害降低 50%。最大生命 +20。'
  },
  {
    id: 'alc_burette',
    role: 'alchemist',
    name: '精密滴管',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    isSpecial: true,
    desc: '被動：2技能的失敗機率降低15%，大成功補血倍率變成15+300% A。'
  },

  // 德魯伊 (Druid)
  {
    id: 'dru_amulet',
    role: 'druid',
    name: '荒野守護符',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    bonusHp: 30,
    desc: '被動：有10%機率再多召喚一隻夥伴。德魯伊最大生命值 +30。'
  },
  {
    id: 'dru_resonance',
    role: 'druid',
    name: '自然共鳴',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    isSpecial: true,
    desc: '被動：小樹精最大生命 +15；幼狼造成傷害 +7。'
  },
  {
    id: 'dru_beast',
    role: 'druid',
    name: '野獸招喚',
    slot: EQUIP_SLOTS.CLASS_EXCLUSIVE,
    tier: 'CLASS_EXCLUSIVE',
    desc: '被動：1技能變身多增加“巨熊”，機率為各1/3。巨熊血量與攻擊力為：10+100%A 攻擊力，增加200%D的血量，退出狀態後恢復。'
  }
];

// 怪物庫 (10種)
export const ENCOUNTERS = [
  { 
    name: '地底熔岩巨像', 
    avatar: '/BOSS/Lava Colossus_fullbody.webp',
    hp: 100, 
    desc: '巨石與高溫熔岩構成的巨像，岩石外殼極為厚重！', 
    attack: 10,
    baseResistances: { physical: 20, magic: 20, effect: 0 },
    ultName: '崩山滅世重砸'
  },
  { 
    name: '暗影魔狼族長', 
    avatar: '/BOSS/Shadow Wolf Alpha_fullbody.webp',
    hp: 70, 
    desc: '動作敏捷的狼王，周身幽暗的暗影能量流動！', 
    attack: 5,
    baseResistances: { physical: 15, magic: 15, effect: 10 },
    ultName: '血影狂暴撕裂'
  },
  { 
    name: '古代守護魔偶', 
    avatar: '/BOSS/Ancient Guardian Golem_fullbody.webp',
    hp: 120, 
    desc: '古代鋼鐵魔偶的意志堅不可摧，擅長抵禦負面狀態！',
    attack: 15,
    baseResistances: { physical: 0, magic: 0, effect: 20 },
    ultName: '過載超導電弧'
  },
  { 
    name: '赤月嗜血巫師', 
    avatar: '/BOSS/Blood Moon Sorcerer_fullbody.webp',
    hp: 100, 
    desc: '赤月能量構築出強大的魔法護盾！', 
    attack: 15,
    baseResistances: { physical: 0, magic: 20, effect: 15 },
    ultName: '赤月血幕絕罰'
  },
  { 
    name: '深淵腐蝕巨蟒', 
    avatar: '/BOSS/Abyssal Corrosive Serpent_fullbody.webp',
    hp: 110, 
    desc: '毒沼中的巨蟒，體表黏液對元素魔法有極高抗性！', 
    attack: 12,
    baseResistances: { physical: 10, magic: 10, effect: 20 },
    ultName: '滅絕劇毒狂湧'
  },
  { 
    name: '霜骨亡靈騎士', 
    avatar: '/BOSS/Frostbone Death Knight_fullbody.webp',
    hp: 120, 
    desc: '古老亡靈騎兵的寒霜魔力能抵禦法術與負面狀態！',
    attack: 14,
    baseResistances: { physical: 0, magic: 20, effect: 20 },
    ultName: '寒霜斷頭烈斬'
  },
  { 
    name: '迷宮食腐暴食魔', 
    avatar: '/BOSS/Labyrinth Glutton Demon_fullbody.webp',
    hp: 160, 
    desc: '體型龐大且長滿利齒的惡臭憎惡，飢渴地撲向生者！', 
    attack: 8,
    baseResistances: { physical: 5, magic: 5, effect: 20 },
    ultName: '吞天噬地暴嚼'
  },
  { 
    name: '幻惑幽魂歌姬', 
    avatar: '/BOSS/Spectral Banshee_fullbody.webp',
    hp: 80, 
    desc: '純粹的精神虛無體，尋常物理攻擊難以觸及！',
    attack: 16,
    baseResistances: { physical: 20, magic: 0, effect: 0 },
    ultName: '亡靈攝魂尖叫'
  },
  { 
    name: '結晶守護巨蠍', 
    avatar: '/BOSS/Crystal Guardian Scorpion_fullbody.webp',
    hp: 115, 
    desc: '紫晶甲殼堅不可摧，擅長彈開物理兵刃！', 
    attack: 13,
    baseResistances: { physical: 20, magic: 5, effect: 0 },
    ultName: '晶化貫通連刺'
  },
  { 
    name: '煉獄炎獄行者', 
    avatar: '/BOSS/Infernal Hellstrider Demon_fullbody.webp',
    hp: 145, 
    desc: '自地心火海中爬出的惡魔，氣息粗暴凶悍！', 
    attack: 13,
    baseResistances: { physical: 10, magic: 10, effect: 10 },
    ultName: '末日天火焚世'
  }
];

export const ROUTES = [
  { id: 'route_trail', name: '羊腸小徑', icon: '🐾', desc: '狹窄蜿蜒的碎石土徑，兩側灌木叢生，隱藏著未知足跡' },
  { id: 'route_stream', name: '沿著溪流', icon: '🌊', desc: '伴隨潺潺水聲前行，清澈溪水下隱約折射出奇異光芒' },
  { id: 'route_stars', name: '跟隨星星', icon: '✨', desc: '微光指引前路，星辰排列出的古老軌跡指引著未知方向' },
  { id: 'route_cave', name: '洞穴深處', icon: '🪨', desc: '深邃陰暗的地下岩洞，冷風夾雜著遠古生物的低鳴' },
  { id: 'route_forest', name: '森林深處', icon: '🌲', desc: '古木參天的幽暗密林，密不透光的樹冠下瀰漫著神秘霧氣' },
  { id: 'route_house', name: '破舊古宅', icon: '🏚️', desc: '地底深處廢棄莊園，門窗緊閉，隱約散發著詭異不詳的氣息' }
];

// 專屬開場與選路文本庫
export const STORY_TEXTS = {
  prologue: {
    title: '【深淵啟程・命運之扉開啟】',
    paragraphs: [
      '厚重的黑曜石大門在刺耳的摩擦聲中緩緩敞開，古老腐朽的塵埃隨之撲面而來。',
      '火把微弱的橘光照亮了腳下斑駁的石階，空氣中瀰漫著潮濕的青苔、生鏽鐵器與隱約的血腥氣味。',
      '身後的退路已被封死，冒險小隊握緊了手中的武器與符文，深吸一口氣，正式踏入這座沉睡千年的深淵地城……'
    ]
  },
  routeChoice: {
    title: (floor) => `【第 ${floor} 層・迷霧分歧點】`,
    paragraphs: [
      '腳下的石磚路在此處斷裂，前方地勢錯綜複雜，瀰漫著不詳的陰暗薄霧。',
      '隱約間能聽見遠處傳來的低沉嘶吼、風穿過石隙的尖銳呼嘯，甚至還有金屬反光的微弱閃爍……',
      '機遇與毀滅僅有一線之隔，請隊長為小隊指引前進的方向！'
    ]
  }
};

// 6 條路線 × 3 種結果專屬文本庫
export const ROUTE_STORIES = {
  route_trail: {
    name: '羊腸小徑',
    treasure: {
      title: '🎁【羊腸小徑・奇遇秘銀】',
      story: '小隊沿著佈滿碎石與雜草的小徑摸索前進，撥開厚重荊棘後，赫然發現一具靠在岩壁上的古老斥候遺骨。他的懷中緊緊抱著一個尚未被撬開的秘銀寶箱，裡面裝有完好的療癒聖藥與強大裝備！'
    },
    battle: {
      title: '⚔️【羊腸小徑・魔物伏擊】',
      story: '羊腸小徑兩側突然傳來急促的碎石滾落聲！石壁上方猛然躍下一道凶煞黑影，截斷了狹窄的小路，腥臭的吐息撲面而來，戰鬥一觸即發！'
    },
    trap: {
      title: '⚠️【羊腸小徑・淬毒吹箭】',
      story: '小路表面鋪滿了偽裝用的枯枝敗葉，帶頭者一腳踩中鬆動的石板，兩側石縫中瞬間激射出密集的淬毒吹箭！隊員們猝不及防，被亂箭擦傷！'
    }
  },
  route_stream: {
    name: '沿著溪流',
    treasure: {
      title: '🎁【沿著溪流・河床秘寶】',
      story: '走在濕滑的溪邊時，隊員一個踉蹌不慎跌入冰涼的水潭中！正當大家伸手拉人時，意外在清澈的鵝卵石河床底下，摸出了一個被水草與青苔包裹的沉重防水寶箱！'
    },
    battle: {
      title: '⚔️【沿著溪流・暗河巨獸】',
      story: '水流突然變得湍急，原本平靜的水面開始翻湧冒泡，伴隨著巨大的水花炸裂，一隻蟄伏在暗河深處的凶猛巨獸破水而出，發出震耳欲聾的咆哮！'
    },
    trap: {
      title: '⚠️【沿著溪流・酸蝕流沙】',
      story: '溪畔看似平坦的沙洲其實是吃人的暗流流沙與酸性腐蝕水窪！大家失足陷落，皮膚被帶有劇烈腐蝕性的地底酸水灼傷，費了好大一番功夫才掙脫上岸！'
    }
  },
  route_stars: {
    name: '跟隨星星',
    treasure: {
      title: '🎁【跟隨星星・星光聖祭壇】',
      story: '隊伍抬頭仰望，岩頂自然散發著如同夜空繁星般的螢光菌菇。循著星光的指引來到一處神聖祭壇前，柔和的光芒沐浴著眾人的傷口，祭壇中央正靜靜擺放著被星光祝福的寶箱！'
    },
    battle: {
      title: '⚔️【跟隨星星・魔眼群襲】',
      story: '頭頂閃爍的「星星」忽然整齊地眨動了一下——那根本不是礦石或星光，而是棲息在地穴頂部的嗜血魔獸那密密麻麻的凶殘眼眸！怪物群俯衝落地包圍了小隊！'
    },
    trap: {
      title: '⚠️【跟隨星星・重力法陣】',
      story: '星光在眾人眼前產生了奇異的折射幻覺，隊員被美麗的光點吸引，不慎踏入了古代遺留的星辰重力法陣，無形的重壓瞬間將眾人狠狠壓趴在石板上，骨骼隱隱作痛！'
    }
  },
  route_cave: {
    name: '洞穴深處',
    treasure: {
      title: '🎁【洞穴深處・古代藏寶庫】',
      story: '深入漆黑無光的鐘乳石洞窟，敲碎一堵脆弱的岩壁後，赫然發現了一座早已被世人遺忘的古代藏寶庫！角落裡的黃金寶箱在火把照耀下閃爍著令人心醉的寶光！'
    },
    battle: {
      title: '⚔️【洞穴深處・巢穴霸主】',
      story: '洞窟深處傳來低沉沉重的呼吸聲，地面隨之微微震動。一雙泛著紅光的巨大暴戾雙眼從黑暗中緩緩逼近，盤踞在此處的巢穴霸主被小隊的腳步聲徹底激怒！'
    },
    trap: {
      title: '⚠️【洞穴深處・鐘乳落石】',
      story: '洞內氣流驟變引發了連鎖震動，洞頂尖銳的鐘乳石如雨點般崩落砸下！雖然大家奮力躲閃，但依舊被落石重重擊中，狼狽不堪！'
    }
  },
  route_forest: {
    name: '森林深處',
    treasure: {
      title: '🎁【森林深處・長老生機盒】',
      story: '穿過地底異常生長的發光真菌巨木林，林間迴盪著輕柔的自然呢喃。在一棵巨大的古樹樹洞中，樹精長老留下的生機寶盒正靜靜等待著有緣的勇者開啟！'
    },
    battle: {
      title: '⚔️【森林深處・蔓藤獵殺】',
      story: '四周茂密的枝葉突然劇烈抖動，粗壯的蔓藤彷彿有了生命般狂亂扭動！盤踞在林間陰影中的飢餓捕食者自樹冠俯衝撲落，封鎖了所有退路！'
    },
    trap: {
      title: '⚠️【森林深處・毒菇孢子】',
      story: '不小心踢到了林間的巨大毒菇菌包，濃烈的劇毒神經孢子瞬間如同爆炸般擴散開來！全隊吸入大量嗆鼻的毒霧，劇烈咳嗽並感到頭暈目眩！'
    }
  },
  route_house: {
    name: '破舊古宅',
    treasure: {
      title: '🎁【破舊古宅・壁爐秘寶】',
      story: '推開地底深處廢棄莊園那搖搖欲墜的橡木大門，在堆滿古籍與蜘蛛網的壁爐暗格裡，意外找到了一個帶有封印火漆的古老秘寶箱，裡面的藥劑依然純淨如新！'
    },
    battle: {
      title: '⚔️【破舊古宅・怨念魔物】',
      story: '剛踏進老宅玄關，身後的大門「匡噹」一聲重重反鎖！大廳中央的陰影驟然凝聚，原本死寂的宅邸中響起了憤怒的怨念嚎叫，守衛宅邸的恐怖魔物自黑暗中現身！'
    },
    trap: {
      title: '⚠️【破舊古宅・吊燈機關】',
      story: '腐朽不堪的二樓木質地板突然崩塌！伴隨著天花板吊燈的墜落，整座宅邸的防盜機關被觸發，密密麻麻的鐵滾輪與墜石將小隊砸得滿身是傷！'
    }
  }
};

// 6 條路線 × 10 種 BOSS 專屬文案故事庫
export const ROUTE_BOSS_STORIES = {
  route_trail: {
    '地底熔岩巨像': '小隊沿著狹窄的碎石小徑攀爬，岩壁縫隙突然透出滾燙赤芒，整段山道化為滾滾熔岩，黑曜石巨拳破壁而出！',
    '暗影魔狼族長': '蜿蜒的小徑兩側荊棘劇烈晃動，急促的爪音在石壁間迴盪，一道迅捷如電的黑影截斷前路，狼王露出了嗜血獠牙！',
    '古代守護魔偶': '碎石路上半掩的古代齒輪突然瘋狂運轉，伴隨著沉悶的蒸汽轟鳴，一尊被藤蔓纏繞的精鋼魔偶轟然站起！',
    '赤月嗜血巫師': '小徑兩側的石碑滲出鮮血，原本昏暗的死路泛起不詳的紅光，一名手持顱骨法杖的血袍巫師在前方擋住了去路！',
    '深淵腐蝕巨蟒': '狹窄的小徑兩側傳來粗重的蛇鱗摩擦聲，地面被酸液腐蝕得滋滋作響，龐大的毒蟒自石壁裂隙中探出猙獰蛇首！',
    '霜骨亡靈騎士': '小徑上的空氣驟然降至冰點，碎石覆上一層慘白寒霜，伴隨著幽冥馬蹄聲，披掛霜甲的亡靈騎士手執巨刃現身！',
    '迷宮食腐暴食魔': '拐過狹窄的岩角，一股令人作嘔的腐臭撲面而來，堆積如山的骸骨之中，長滿巨口的肉瘤巨魔發出飢餓的咆哮！',
    '幻惑幽魂歌姬': '小徑的盡頭飄蕩著淒美婉轉的歌聲，令人神智恍惚，當隊伍撥開迷霧，一尊懸浮於半空的幽白魅影正冷冷凝視著眾人！',
    '結晶守護巨蠍': '兩側石壁閃爍著尖銳的紫晶光芒，地面突然崩裂，一隻被晶體重甲覆蓋的巨蠍揮舞著毒針衝出岩層！',
    '煉獄炎獄行者': '小徑岩石被高溫燒得通紅龜裂，空氣扭曲灼熱，一尊踏著地獄烈焰的惡魔自火光中走出，地面寸寸焦黑！'
  },
  route_stream: {
    '地底熔岩巨像': '原本清澈的暗河水流劇烈沸騰蒸發，白濛濛的水汽中，一尊燃燒著地心烈焰的熔岩巨像踏碎河床破水而出！',
    '暗影魔狼族長': '沿著溪流前行時，水面上倒映出的不是倒影，而是一群疾馳的狼影，狼王踏水無痕，自水霧中露出森冷白牙！',
    '古代守護魔偶': '溪流的水車機關被重重啟動，沉入水底多年的古代機械重新點亮紅光，鏽蝕但堅硬的鋼鐵魔偶破開水浪升起！',
    '赤月嗜血巫師': '潺潺溪水在眨眼間化為濃稠的血河，血浪翻騰間，赤月巫師踏著漂浮的白骨自水面上緩緩降臨！',
    '深淵腐蝕巨蟒': '原本平靜的水面泛起劇烈的毒泡，整條溪流被染成幽綠色，深淵巨蟒掀起滔天酸蝕水浪，張開了血盆大口！',
    '霜骨亡靈騎士': '湍急的溪流瞬間凝結成厚重寒冰，刺骨的凍氣沿著冰面蔓延，霜骨騎士手持長槍，踏著冰封河道步步逼近！',
    '迷宮食腐暴食魔': '溪水下游漂來大量殘破的甲胄與碎骨，岸邊的爛泥中猛然隆起一座肉山，暴食惡魔滿嘴流涎，狂暴地拍打著水面！',
    '幻惑幽魂歌姬': '清脆的水流聲中夾雜著詭異的水中呢喃，一名面容蒼白的幽魂女妖自清潭中央浮現，歌聲讓水波為之震顫！',
    '結晶守護巨蠍': '鵝卵石河床下泛起耀眼的晶體折射，無數紫晶刺穿透水面爆發而出，守護巨蠍自水底鑽出，螯肢泛著寒光！',
    '煉獄炎獄行者': '溪流的水量以驚人速度乾涸殆盡，河床化為焦炭，炎獄行者伴隨著滾滾烈火自蒸乾的河道中踏出！'
  },
  route_stars: {
    '地底熔岩巨像': '岩頂星光指引的祭壇突然劇烈震盪，地底火脈噴湧而出，熔岩巨像帶著翻滾烈焰撞碎了星光石壁！',
    '暗影魔狼族長': '天頂的微光突然被無盡夜幕吞噬，狼王的長嘯撕裂了星空般的寧靜，群狼在星光陰影的夾縫中顯露真身！',
    '古代守護魔偶': '星光匯聚在古老祭壇中央的星盤上，機關重合聲響起，沉睡千年的古代守護魔偶吸收星芒，眼部紅光大盛！',
    '赤月嗜血巫師': '頭頂美麗的微光星辰突然化為一顆顆流血的眼眸，血色月幕籠罩天際，赤月巫師高舉法杖吟唱死靈咒文！',
    '深淵腐蝕巨蟒': '星芒微光照射在濕滑的岩層上，投射出一條龐大無比的蜿蜒陰影，腐蝕巨蟒從星盤背後的裂谷中昂首現身！',
    '霜骨亡靈騎士': '星光化作幽藍冰晶灑落，整片星宿穹頂凝結霜花，霜骨騎士自冥界裂縫中踏星而來，戰刃散發幽冷死氣！',
    '迷宮食腐暴食魔': '星光所指的神聖殿堂早已淪為屠宰場，惡臭撲鼻的暴食魔撕扯著祭品，泛著綠光的凶眼鎖定了冒險小隊！',
    '幻惑幽魂歌姬': '柔和的星光在半空中幻化為迷人的幻象，緊接著淒厲的悲鳴劃破天際，幽魂歌姬撕開星光偽裝現出猙獰面目！',
    '結晶守護巨蠍': '穹頂星芒與地面的天然水晶產生共鳴，整座大廳光芒刺目，由星輝結晶孕育的守護巨蠍自晶簇中猛然甦醒！',
    '煉獄炎獄行者': '星光被漫天火雨無情撕裂，整座大廳的重力彷彿崩塌，炎獄行者撕開空間裂隙，踏著滅世流火狂笑降臨！'
  },
  route_cave: {
    '地底熔岩巨像': '洞穴深處的溫度驟然上升，鐘乳石被烤得通紅滴落，伴隨著震耳欲聾的轟鳴，熔岩巨像踏碎地脈巍峨聳立！',
    '暗影魔狼族長': '漆黑無光的洞窟深處亮起一雙雙冰冷的幽瞳，石筍陰影間殺機四伏，狼王自最深邃的暗處悄然邁出！',
    '古代守護魔偶': '洞穴深處赫然是一座古代兵工廠遺跡，紅色的警戒指示燈逐一亮起，重型鋼鐵魔偶踏著沉重步伐迎面而來！',
    '赤月嗜血巫師': '洞壁上的遠古壁畫被鮮血浸透，洞窟盡頭的石棺轟然炸裂，赤月巫師周身環繞著猩紅血球自祭台上飄起！',
    '深淵腐蝕巨蟒': '洞窟地面覆蓋著厚厚的酸性黏液，濃烈的刺鼻氣味令人窒息，深淵巨蟒龐大的身軀盤踞在鐘乳石柱上俯瞰獵物！',
    '霜骨亡靈騎士': '洞穴兩側的岩壁被萬年玄冰封凍，陰風呼嘯間，霜骨騎士騎乘幽冥戰馬，自冰封墓穴中拔劍而出！',
    '迷宮食腐暴食魔': '狹窄的洞窟深處傳來骨骼被嚼碎的令人毛骨悚然的聲響，巨型暴食魔龐大的身軀幾乎塞滿了整條坑道！',
    '幻惑幽魂歌姬': '洞窟天然的岩壁迴音將詭異的歌聲放大了數倍，直刺靈魂，幽魂歌姬的身影在黑暗中若隱若現，飄忽不定！',
    '結晶守護巨蠍': '洞穴深處長滿了巨大的紫水晶簇，伴隨著岩石碎裂聲，守護巨蠍甩動著巨大的晶化尾刺自洞頂倒吊爬下！',
    '煉獄炎獄行者': '地底裂谷深處噴湧出刺目的硫磺地火，灼熱狂風席捲洞窟，炎獄行者自熔岩深淵中踏火而上，魔威滔天！'
  },
  route_forest: {
    '地底熔岩巨像': '發光的地下巨木被高溫點燃成火海，烈焰灰燼漫天飛舞，熔岩巨像撞碎參天巨樹，攜帶著滾滾火舌狂暴登場！',
    '暗影魔狼族長': '幽暗的樹冠層中沙沙作響，林間霧氣驟然變濃，伴隨著威嚴的狼嚎，身披暗影的魔狼族長自古樹陰影中一躍而下！',
    '古代守護魔偶': '巨木根系纏繞的一尊古代石偶突然劇烈顫動，扯斷粗壯的樹根與蔓藤，眼部亮起警示光芒，守護魔偶大步踏出！',
    '赤月嗜血巫師': '密林中的所有花草在眨眼間枯萎凋零，化為灰燼，赤月巫師在被鮮血染紅的樹冠頂端現身，死靈法杖閃爍血光！',
    '深淵腐蝕巨蟒': '林間潮濕的沼澤突然劇烈翻滾，劇毒霧氣瞬間腐蝕了周遭的巨木，深淵巨蟒巨大的身軀碾碎樹幹從毒沼中竄出！',
    '霜骨亡靈騎士': '茂密的綠葉在數秒內掛滿白霜，整座林海化為冰封枯木，霜骨騎士穿過死寂森林，長劍拖在雪地上劃出冰痕！',
    '迷宮食腐暴食魔': '林間空地上堆滿了腐爛的野獸殘骸，飢餓難耐的暴食魔正瘋狂啃食樹木，察覺到生者氣息後猛然轉過滿嘴利齒！',
    '幻惑幽魂歌姬': '森林深處飄蕩著如夢似幻的林間旋律，誘人深入，當隊伍看清時，歌姬透明的死者面孔已在樹梢露出詭異微笑！',
    '結晶守護巨蠍': '樹根底下覆蓋著奇異的晶化真菌，地面突然塌陷，一隻身披堅硬晶殼的龐大巨蠍揮舞雙螯，自林地破土而出！',
    '煉獄炎獄行者': '整片發光森林在熾熱火浪中化為灰燼，焦土之上，炎獄行者踏著翻滾的惡魔烈焰現身，將退路化為火海！'
  },
  route_house: {
    '地底熔岩巨像': '廢棄古宅的石質地基在劇烈震動中崩塌，滾燙的岩漿沖破大廳木地板，熔岩巨像以摧枯拉朽之勢砸碎了莊園屋頂！',
    '暗影魔狼族長': '老宅二樓的走廊傳來急促而沉重的腳步聲，宅邸吊燈轟然墜落，魔狼族長自破碎的旋轉樓梯上狂奔而下！',
    '古代守護魔偶': '古宅地下室的厚重鐵門被巨力轟開，莊園歷代守護魔偶被警報喚醒，滿是鐵鏽的重拳直接砸碎了客廳玄關！',
    '赤月嗜血巫師': '古宅的所有窗戶被猩紅血光染透，壁爐中燃起幽暗的綠火，赤月巫師在莊園主位的大椅上幽幽站起，冷笑連連！',
    '深淵腐蝕巨蟒': '宅邸的天花板與木牆被濃酸腐蝕穿孔，發出刺鼻白煙，深淵巨蟒盤踞在莊園大梁之上，自高處俯衝撲下！',
    '霜骨亡靈騎士': '古宅大廳內的空氣瞬間凝結成霜，牆上古老的肖像畫覆上冰花，霜骨騎士手按佩劍，自幽暗的長廊中大步走出！',
    '迷宮食腐暴食魔': '古宅宴會廳的長桌上堆滿了腐敗的食物，體型肥碩臃腫的暴食魔正貪婪吞食，轉身時將實木餐桌撞得粉碎！',
    '幻惑幽魂歌姬': '破舊古宅的三角鋼琴竟無人自彈，悽慘哀怨的歌聲迴盪在整棟宅邸，歌姬的幽白怨靈自天花板水晶燈中飄然而降！',
    '結晶守護巨蠍': '古宅陳列室裡的各色水晶標本同時震顫共鳴，地板崩裂，守護巨蠍撕裂整面石壁，紫晶尾刺閃爍著致命寒光！',
    '煉獄炎獄行者': '整棟古宅在頃刻間被地獄烈火包圍點燃，樑柱燃燒坍塌，炎獄行者踏著沖天火光破門而入，氣焰囂張狂暴！'
  }
};

export function getRouteBossStory(routeId, bossName) {
  const cleanName = (bossName || '').replace(/^【削弱】/, '');
  const storiesForRoute = ROUTE_BOSS_STORIES[routeId] || ROUTE_BOSS_STORIES['route_trail'];
  if (storiesForRoute && storiesForRoute[cleanName]) {
    return storiesForRoute[cleanName];
  }
  for (const r of Object.values(ROUTE_BOSS_STORIES)) {
    if (r[cleanName]) return r[cleanName];
  }
  const routeStory = ROUTE_STORIES[routeId]?.battle?.story || ROUTE_STORIES['route_trail']?.battle?.story;
  return routeStory || `前方的迷霧驟然撕裂，強大的魔物【${cleanName || '首領'}】帶著無盡殺意現身！`;
}

// 戰鬥生動攻擊文字敘述庫
export const BATTLE_NARRATIVES = {
  // 魔物專屬攻擊動作 (普通反擊 & 必殺技)
  monsters: {
    '地底熔岩巨像': {
      normal: '🌋 【地底熔岩巨像】體內的赤紅熔岩劇烈翻滾，高舉由千度黑曜石構成的灼熱重拳，帶著滾滾濃煙泰山壓頂般轟擊而下！',
      ult: '🔥 【地底熔岩巨像】胸口的地心火核狂暴過載，烈焰如火龍沖天而起！巨像轟然躍入高空，夾帶滅世威壓發動【崩山滅世重砸】！地面瞬間化為崩碎的熔岩火海！'
    },
    '暗影魔狼族長': {
      normal: '🐺 【暗影魔狼族長】喉間發出嗜血低吼，周身暗影如黑霧翻騰，化作一道肉眼難辨的幽暗殘影，尖牙利爪撲面撕咬！',
      ult: '🩸 【暗影魔狼族長】雙眸化為猩紅血月，仰天長嘯震顫洞窟！周身分裂出數道幻影，掀起漫天血光發動【血影狂暴撕裂】！'
    },
    '古代守護魔偶': {
      normal: '🤖 【古代守護魔偶】胸口發條急速轉動，眼部瞄準鏡紅光大盛，沉重的精鋼巨臂如攻城錘般帶著刺耳金屬摩擦聲橫掃全場！',
      ult: '⚡ 【古代守護魔偶】體內的遠古能源核心劇烈超載，全身導管噴射出高溫蒸汽，刺目耀眼的萬伏雷暴化作【過載超導電弧】瘋狂彈射肆虐！'
    },
    '赤月嗜血巫師': {
      normal: '🩸 【赤月嗜血巫師】揮舞鑲嵌著惡魔顱骨的枯木法杖，陰冷晦澀的詛咒化作一道漆黑的死靈箭矢，尖嘯著刺向冒險小隊！',
      ult: '🌙 【赤月嗜血巫師】雙手高舉喚來虛空中的猩紅殘月，整座戰場被冰冷的血色天幕籠罩，無數血刺如暴雨般降下施展【赤月血幕絕罰】！'
    },
    '深淵腐蝕巨蟒': {
      normal: '🐍 【深淵腐蝕巨蟒】猩紅蛇信嘶嘶吞吐，巨大的蛇軀在地面摩擦出滾燙毒霧，張開血盆大口噴出一道高腐蝕性的毒液射流！',
      ult: '🧪 【深淵腐蝕巨蟒】全身幽綠毒囊劇烈收縮膨脹，發出一聲刺痛耳膜的尖嘯，漫天排山倒海的酸蝕毒浪發動【滅絕劇毒狂湧】席捲而來！'
    },
    '霜骨亡靈騎士': {
      normal: '❄️ 【霜骨亡靈騎士】骷髏眼眶中跳動著幽藍的冰霜魂火，胯下骸骨戰馬長嘶踏雪，手中的霜華重劍橫掃出一道凍結骨髓的寒芒！',
      ult: '🗡️ 【霜骨亡靈騎士】勒緊幽靈韁繩戰馬人立而起，雙手高舉凝結著千丈寒冰的處決巨刃，帶著絕對零度的死亡氣息劈下【寒霜斷頭烈斬】！'
    },
    '迷宮食腐暴食魔': {
      normal: '🍖 【迷宮食腐暴食魔】臃腫的肉軀不斷淌下惡臭黏液，滿是倒刺的肥厚巨爪帶著腐臭腥風，凶殘暴躁地向前狂拍亂打！',
      ult: '🦷 【迷宮食腐暴食魔】腹部巨大的獠牙巨口驟然裂開直達胸膛，強烈的腐蝕狂風將四周吸入腹腔，發動【吞天噬地暴嚼】瘋狂撕咬咀嚼！'
    },
    '幻惑幽魂歌姬': {
      normal: '👻 【幻惑幽魂歌姬】虛無縹緲的白裙隨陰風狂舞，冰冷枯槁的鬼爪穿透空間，直抓生者溫熱的心臟！',
      ult: '📢 【幻惑幽魂歌姬】面部五官驟然撕裂扭曲，發出足以震碎靈魂與神智的【亡靈攝魂尖叫】，無形的心靈音暴在眾人腦海中瘋狂炸裂！'
    },
    '結晶守護巨蠍': {
      normal: '🦂 【結晶守護巨蠍】厚重堅固的紫晶甲殼折射出冷光，兩對鋒利如鍘刀的晶體巨螯相互撞擊，高高揚起的毒刺如閃電般刺下！',
      ult: '💎 【結晶守護巨蠍】背部水晶叢集光芒大盛，尾部的劇毒晶針高速振動幻化成漫天殘影，發動勢如破竹的【晶化貫通連刺】！'
    },
    '煉獄炎獄行者': {
      normal: '🔥 【煉獄炎獄行者】踩著流淌硫磺烈焰的沉重步伐逼近，燃燒著深淵業火的魔爪猛烈揮舞，空氣被高溫灼燒至扭曲變形！',
      ult: '☄️ 【煉獄炎獄行者】發出震動地脈的咆哮，雙手撕裂地底岩頂，召引天外燃燒的硫磺巨石與流星雨，降下毀滅一切的【末日天火焚世】！'
    }
  },

  // 玩家職業技能描述動態生成
  getPlayerSkillNarrative(player, actionId, extra = {}) {
    const name = player.name;
    const role = player.role;
    switch (actionId) {
      case 'basic': {
        if (role === 'warrior') return `🛡️ **${name}** 雙手緊握沉重長劍踏步前壓，劍風呼嘯著在魔物身軀上狠狠劈出一道深痕！`;
        if (role === 'mage') return `🧙‍♂️ **${name}** 輕揮法杖引導元素微粒，指尖凝聚出一團藍白色的奧術魔彈轟向魔物！`;
        if (role === 'archer') {
          if (extra?.hasAmmo || (player.ammo && player.ammo.length > 0)) {
            return `🏹💥 **${name}** 穩固重弩底座，扣動擊發扳機發動毀滅性的【重弩齊射】！`;
          }
          return `🏹 **${name}** 抽箭搭弦如滿月，離弦之箭撕裂空氣，化作一道白芒直刺魔物身軀！`;
        }
        if (role === 'assassin') return `🗡️ **${name}** 身形如鬼魅般晃動，短匕如冷月寒芒，在魔物關節間切劃出凌厲傷痕！`;
        if (role === 'bard') return `🪕 **${name}** 輕巧撥動琴弦，激發出一道淡金色微光音波，穿透空氣打擊魔物！`;
        if (role === 'alchemist') return `⚗️ **${name}** 揮舞青銅研磨杵，帶著滾燙的藥劑殘渣狠狠砸向魔物！`;
        if (role === 'druid') {
          if (player.druidForm === 'werewolf') return `🐺 狼人形態下的 **${name}** 雙眼血紅，鋒利的利爪撕裂空氣狂暴抓向魔物！`;
          if (player.druidForm === 'treant') return `🌳 樹精形態下的 **${name}** 揮動粗壯的古木藤蔓，沉重地甩向魔物！`;
          return `🍃 **${name}** 揮動自然法杖，召喚林地原始的狂風重擊魔物！`;
        }
        if (role === 'paladin') return `🛡️✨ **${name}** 揮動聖光重錘砸向魔物，並引導神聖護盾庇護自身！`;
        if (role === 'augur') return `🔮 **${name}** 纖指輕撫水晶球，球心星芒凝聚成一道璀璨的虹彩折光貫穿魔物，削弱其抗性並撫平自身命債！`;
        if (role === 'onmyoji') return `📜 **${name}** 念動真言施展【引符術】，靈符如電飛射，對魔物造成魔法打擊！`;
        return `🗡️ **${name}** 施展【普通攻擊】打擊魔物！`;
      }
      case 'w_strike':
        return `🛡️ **${name}** 戰意沸騰，怒吼著將全身力道灌注於劍刃，巨劍泛起冷冽寒光，力劈華山般斬下【堅定斬擊】！`;
      case 'w_shield':
        return `🛡️ **${name}** 將精鋼巨盾重重頓入石板，耀眼的金黃壁壘光幕驟然升起，誓死庇護全體隊友！`;
      case 'm_blast':
        return `🧙‍♂️ **${name}** 口中低吟遠古秘術咒文，一顆狂暴旋轉的奧術星體自虛空降臨，在魔物眼前劇烈引爆！`;
      case 'm_drain':
        return `🩸 **${name}** 眼中泛起猩紅幽光，虛空中伸出數道暗黑能量觸鬚刺入魔物心核，強行抽離生機反哺自身！`;
      case 'a_shot':
        return `🏹 **${name}** 屏息凝神鎖定致命死角，疾風獵弓劇烈震顫，破甲重箭帶著呼嘯尖嘯貫穿而過！`;
      case 'a_rain':
        return `🏹 **${name}** 朝地穹頂射出附魔光矢，光矢在空中分裂為漫天箭雨，暴雨般傾瀉而下壓制魔物凶焰！`;
      case 'a_reload':
        return `🏹🔧 **${name}** 迅速蹲伏架穩重弩，冷靜拉動絞盤裝填弩箭！`;
      case 'a_frenzy_reload':
        return `🏹⚡ **${name}** 壓低身形全力蹲伏，雙手化作殘影極速拉弦，瞬間填滿重弩彈匣！`;
      case 's_stab':
        if (extra.isCrit) {
          return `💥 **${name}** 抓住魔物轉瞬即逝的破綻瞬步突刺，染血利刃精準捅入最脆弱的心臟死穴！暴擊骨肉撕裂！`;
        }
        return `🗡️ **${name}** 踏著無聲步伐瞬移至魔物盲點，短匕如毒蛇出洞，狠狠刺入魔物要害！`;
      case 's_smoke':
        return `💨 **${name}** 將所有匿蹤化為刃上暗影，瞬步爆襲魔物！`;
      case 'b_heal':
        return `🪕 **${name}** 撫琴奏響空靈聖潔的生命頌歌，溫潤如春雨的七彩光環籠罩全場，溫暖的光輝撫平了隊員們的創傷！`;
      case 'b_buff':
        return `🪕 **${name}** 琴音節奏驟然激昂高亢，戰意如烈火般燃燒！刺耳的共振聲波震顫著魔物身軀，撕裂其護甲防線！`;
      case 'b_revive':
        return `🕊️ **${name}** 唱響禁忌的甦生之曲，奇蹟的金光刺破死氣，將瀕死的隊友自深淵邊緣喚回人間！`;
      case 'alc_flask':
        if (extra?.flaskType === 'poison' || extra?.outcome === 'alchemy_poison') {
          return `🧪 **${name}** 投擲【不穩定試劑瓶】引爆劇毒煙霧，致命的深紫色神經毒霧如浪潮般湧開，窒息般的劇毒迅速侵入體內！`;
        }
        if (extra?.flaskType === 'burn' || extra?.outcome === 'alchemy_burn') {
          return `🔥 **${name}** 投擲【不穩定試劑瓶】引燃烈焰試劑，熾熱的火浪轟然炸裂，高溫烈焰瘋狂焚燒！`;
        }
        if (extra?.flaskType === 'fracture' || extra?.outcome === 'alchemy_fracture') {
          return `🦴 **${name}** 投擲【不穩定試劑瓶】引發骨折衝擊波，強烈的碎骨震盪直擊骨髓！`;
        }
        if (extra?.flaskType === 'chill' || extra?.outcome === 'alchemy_chill') {
          return `❄️ **${name}** 投擲【不穩定試劑瓶】爆發極寒凍氣，冰藍色寒霜蔓延全場，刺骨極寒滲透臟腑！`;
        }
        return `⚗️ **${name}** 投擲【不穩定試劑瓶】，試劑劇烈反應炸開！`;
      case 'alc_acid':
        return `🧪 **${name}** 擲出冒著劇烈氣泡的高壓強酸燒瓶，在魔物軀體上轟然炸裂，腐蝕性酸液瘋狂灼燒！`;
      case 'alc_poison':
        return `🧪 **${name}** 砸碎毒素瓦斯罐，致命的深紫色神經毒霧如浪潮般湧開，窒息般的劇毒迅速侵入敵我體內！`;
      case 'alc_fate':
        return `🌿 **${name}** 搖勻試管中變幻莫測的神秘藥劑一飲而盡，狂暴的命運藥力在血管中奔流引動奇蹟！`;
      case 'dru_transform':
        return `🍃 **${name}** 引動體內的自然精魄血脈，骨骼咯咯作響咆哮變身！`;
      case 'dru_summon_treant':
        return `🐾 **${name}** 灑下自然種子引導生機，一隻活潑歡快的小樹精破土而出，揮舞木棒誓死護衛隊伍！`;
      case 'dru_summon_wolf':
        return `🐺 **${name}** 吹響獸骨狼哨，一隻雙眼幽綠、矯健靈活的自然幼狼自虛空中竄出撲向戰場！`;
      case 'w_cleave':
        return `⚔️ **${name}** 狂怒爆發，雙手緊握巨劍掀起狂烈風暴，帶著千鈞之勢轟出【狂怒重劈】！`;
      case 'b_nocturne':
        return `🪕 **${name}** 撫弄琴弦奏響空靈幽邃的【催眠夜曲】，魔性催眠音律宛如夢魘低語，直穿靈魂深處！`;
      case 'b_frenzy':
        return `🪕 **${name}** 琴弦狂亂震顫，奏響浴血的【狂亂殺戮曲】！刺骨殺意激發了全員潛能，戰意癲狂飆升！`;
      case 'pal_glory':
        return `🛡️🎺 **${name}** 高唱【榮耀讚歌】，神聖光輝籠罩全身，並凝聚小隊鬥志轉化為庇護！`;
      case 'pal_grace':
        return `🛡️🕊️ **${name}** 詠唱【代受恩典】，以誓約承擔隊友的一切苦痛與負面厄運！`;
      case 'aug_bind':
        return `🤲🔮 **${name}** 單手在水晶球上方緩緩揮動，球內迷霧散去並浮現戰友的身影，星軌金環隨之共鳴，賜予深邃的命運加護！`;
      case 'aug_reckon':
        return `🃏⚖️ **${name}** 雙手托起緩緩上浮的水晶球，耀眼白光透出五彩光芒，隨後將【凶兆逆位】牌烙印於魔物，清償自身命債！`;
      case 'onm_talisman':
        return `📜 **${name}** 手捏靈訣擲出【五鬼攝魂符】，陰陽符咒化作幽光直貼魔物命門！`;
      case 'onm_detonate':
        return `📜💥 **${name}** 踏罡步斗高喝【急急如律令・百符引爆】，引爆魔物身上的所有符咒！`;
      default:
        return `⚔️ **${name}** 發動了行動！`;
    }
  }
};

// 每次從 6 個選項中隨機挑選 4 個
export function getRandomRoutes(count = 4) {
  const shuffled = [...ROUTES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// 裝備數值套用
export function applyEquipStats(player, item) {
  if (!player || !item) return;
  player.statsVersion = 2;
  if (item.bonusAtk) player.bonusAtk = (player.bonusAtk || 0) + item.bonusAtk;
  if (item.bonusPhysAtk) player.bonusPhysAtk = (player.bonusPhysAtk || 0) + item.bonusPhysAtk;
  if (item.bonusMagAtk) player.bonusMagAtk = (player.bonusMagAtk || 0) + item.bonusMagAtk;
  if (item.bonusHp) {
    player.maxHp += item.bonusHp;
    if (item.bonusHp > 0) {
      player.hp += item.bonusHp;
    } else {
      player.hp = Math.min(player.hp, player.maxHp);
      player.hp = Math.max(1, player.hp);
    }
  }
  if (item.bonusDef) player.bonusDef = (player.bonusDef || 0) + item.bonusDef;
  if (item.regenPerRound) player.regenPerRound = (player.regenPerRound || 0) + item.regenPerRound;
  if (item.battleStartShield) player.battleStartShield = (player.battleStartShield || 0) + item.battleStartShield;
  if (item.bonusCrit) player.bonusCrit = (player.bonusCrit || 0) + item.bonusCrit;
}

// 卸除裝備數值扣減
export function removeEquipStats(player, item) {
  if (!player || !item) return;
  if (item.bonusAtk) player.bonusAtk = (player.bonusAtk || 0) - item.bonusAtk;
  if (item.bonusPhysAtk) player.bonusPhysAtk = (player.bonusPhysAtk || 0) - item.bonusPhysAtk;
  if (item.bonusMagAtk) player.bonusMagAtk = (player.bonusMagAtk || 0) - item.bonusMagAtk;
  if (item.bonusHp) {
    player.maxHp -= item.bonusHp;
    player.hp = Math.min(player.hp, player.maxHp);
    player.hp = Math.max(1, player.hp);
  }
  if (item.bonusDef) player.bonusDef = Math.max(0, (player.bonusDef || 0) - item.bonusDef);
  if (item.regenPerRound) player.regenPerRound = Math.max(0, (player.regenPerRound || 0) - item.regenPerRound);
  if (item.battleStartShield) player.battleStartShield = Math.max(0, (player.battleStartShield || 0) - item.battleStartShield);
  if (item.bonusCrit) player.bonusCrit = Math.max(0, (player.bonusCrit || 0) - item.bonusCrit);
}

// 檢查玩家是否可以裝備該物品（雙手劍、精靈木提琴及改良型重弩不能重複穿戴）
export function canPlayerEquipItem(player, drop, replaceIndex = -1) {
  if (!player || !drop) return false;
  const uniqueEquipIds = ['w_greatsword', 'b_violin', 'a_crossbow'];
  const uniqueEquipNames = ['雙手劍', '精靈木提琴', '妖精木提琴', '改良型重弩'];
  const isUnique = drop.unique || uniqueEquipIds.includes(drop.id) || uniqueEquipNames.includes(drop.name);
  if (isUnique) {
    const equips = player.equips || [];
    const existingIndex = equips.findIndex(e => e.id === drop.id || e.name === drop.name);
    if (existingIndex !== -1 && existingIndex !== replaceIndex) {
      return false; // 已穿戴且不是替換同一格，禁止重複穿戴
    }
  }
  return true;
}

// 穿上裝備（支援上限 3 件與指定位置替換）
export function equipItemToPlayer(player, drop, replaceIndex = -1) {
  if (!player || !drop) return null;
  if (!canPlayerEquipItem(player, drop, replaceIndex)) return null;
  if (!player.equips) player.equips = [];
  if (!player.equipCounts) player.equipCounts = {};

  let replacedItem = null;
  if (player.equips.length >= 3 && replaceIndex >= 0 && replaceIndex < player.equips.length) {
    replacedItem = player.equips[replaceIndex];
    removeEquipStats(player, replacedItem);
    player.equips[replaceIndex] = drop;
    applyEquipStats(player, drop);
  } else if (player.equips.length < 3) {
    player.equips.push(drop);
    applyEquipStats(player, drop);
  }

  // 刷新計數字典以相容舊代碼
  player.equipCounts = {};
  for (const eq of player.equips) {
    player.equipCounts[eq.name] = (player.equipCounts[eq.name] || 0) + 1;
  }
  if (!player.equips.some(e=>e.id==='a_crossbow')) { player.ammo=[]; player.isCrouchedThisRound=false; }
  return replacedItem;
}

// 手動卸下裝備
export function unequipItemFromPlayer(player, index) {
  if (!player || !player.equips || index < 0 || index >= player.equips.length) return null;
  const removed = player.equips.splice(index, 1)[0];
  if (removed) {
    removeEquipStats(player, removed);
    player.equipCounts = {};
    for (const eq of player.equips) {
      player.equipCounts[eq.name] = (player.equipCounts[eq.name] || 0) + 1;
    }
  }
  if (!player.equips.some(e=>e.id==='a_crossbow')) { player.ammo=[]; player.isCrouchedThisRound=false; }
  return removed;
}

// 格式化玩家裝備顯示：[裝備 2/3]: 鋼鐵聖劍, 荊棘重鎧
export function formatPlayerEquips(player) {
  const equips = player.equips || [];
  const count = equips.length;
  if (count === 0) return '[裝備 0/3]';
  const list = equips.map(e => e.name).join(', ');
  return `[裝備 ${count}/3]: ${list}`;
}

// 依據玩家職業與裝備動態取得可用技能庫（支援特殊裝備技能替換）
export function getPlayerSkills(player) {
  if (!player || !player.role || !CLASSES[player.role]) return [];
  const baseSkills = CLASSES[player.role].skills.map(s => ({ ...s }));
  if(player.role==='sage')for(const skill of baseSkills) {
    skill.phaseBlocked=player.sagePhase==='solve'&&skill.id===player.sagePreviousAction;
    skill.contextualCopy=true;
  }
  if (player.role === 'gladiator') {
    const sacrifice = baseSkills[1], arena = baseSkills[2];
    if (player.arenaActive) {
      Object.assign(sacrifice, { label:'血殺重擊', dmgType:'phys', category:'OFFENSIVE', tags:['物理'],
        desc:'造成（15+玩家人數×10）+怒氣層數×25的物理傷害。生命小於等於1時不可施放。', cooldownKey:'arena_g_sacrifice' });
      Object.assign(arena, { label:'同歸於盡', cd:0, dmgType:'phys', category:'OFFENSIVE', tags:['物理'],
        desc:`消耗剩餘所有生命，造成等同於消耗生命+怒氣層數×${(player.equips||[]).some(e=>e.id==='g_cingulum')?15:10}的物理傷害；以此方式死亡，本層不可被吟遊詩人復活。`, cooldownKey:'arena_g_arena' });
    } else {
      sacrifice.desc = sacrifice.desc.split('\n【死亡角鬥場】中')[0];
      arena.desc = arena.desc.split('\n場內技能')[0];
    }
    sacrifice.hpBlocked = player.hp <= 1;
    for (const skill of [sacrifice, arena]) { skill.shortDesc = skill.desc; skill.contextualCopy = true; }
  }
  const equips = player.equips || [];

  if (player.role === 'warrior') {
    const hasGreatsword = equips.some(e => e.id === 'w_greatsword' || e.name === '雙手劍');
    if (hasGreatsword) {
      const s1 = baseSkills.find(s => s.id === 'w_strike');
      if (s1) {
        s1.desc = '揮動巨劍造成物理傷害。有機率因揮砍失衡而造成微量傷害，並使下回合自身承受傷害提高。';
      }
      const idx2 = baseSkills.findIndex(s => s.id === 'w_shield');
      if (idx2 !== -1) {
        baseSkills[idx2] = {
          id: 'w_cleave',
          label: '狂怒重劈',
          cd: 2,
          dmgType: 'phys',
          tags: ['物理', '單體'],
          desc: '狂暴揮動雙手巨劍重劈魔物，造成物理傷害。'
        };
      }
    }
  } else if (player.role === 'bard') {
    const hasViolin = equips.some(e => e.id === 'b_violin' || e.name === '精靈木提琴');
    if (hasViolin) {
      const idx1 = baseSkills.findIndex(s => s.id === 'b_heal');
      if (idx1 !== -1) {
        baseSkills[idx1] = {
          id: 'b_nocturne',
          label: '催眠夜曲',
          cd: 1,
          dmgType: 'mag',
          tags: ['魔法', '單體'],
          desc: '幽邃催眠曲造成魔法傷害，有機率使敵方本回合陷入沉睡無法行動。'
        };
      }
      const idx2 = baseSkills.findIndex(s => s.id === 'b_buff');
      if (idx2 !== -1) {
        baseSkills[idx2] = {
          id: 'b_frenzy',
          label: '狂亂殺戮曲',
          cd: 1,
          dmgType: 'mag',
          tags: ['魔法', '全體', '增益', '高風險'],
          desc: '狂亂殺戮樂章造成魔法傷害，全隊傷害暴增，但次回合全隊承受生命代價。'
        };
      }
    }
  } else if (player.role === 'archer') {
    const hasCrossbow = equips.some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
    if (hasCrossbow) {
      // 普攻描述更新
      const basicSkill = baseSkills.find(s => s.id === 'basic');
      if (basicSkill) {
        basicSkill.desc = '消耗彈匣所有弩箭齊射。未裝填時造成基礎 10 點物理傷害；裝填時傷害大幅提升（1發45/2發63/3發89），依箭矢類型（穿甲物理／元素魔法／爆裂等量自傷）均分結算。';
      }
      // 1 技能替換為 戰術上膛
      const idx1 = baseSkills.findIndex(s => s.id === 'a_shot');
      if (idx1 !== -1) {
        baseSkills[idx1] = {
          id: 'a_reload',
          label: '1 技能: 戰術上膛',
          cd: 0,
          dmgType: '【輔助】',
          tags: ['裝填', '減傷', '無閃避'],
          desc: '裝填 1 枚隨機弩箭（40%穿甲/40%元素/20%爆裂，彈匣上限 3 枚）。本回合觸發【架弩蹲伏】：受到的所有傷害降低 20%，但閃避率強制歸零無法閃避。'
        };
      }
      // 2 技能替換為 極速狂熱裝填
      const idx2 = baseSkills.findIndex(s => s.id === 'a_rain');
      if (idx2 !== -1) {
        baseSkills[idx2] = {
          id: 'a_frenzy_reload',
          label: '2 技能: 極速狂熱裝填',
          cd: 3,
          dmgType: '【輔助】',
          tags: ['裝填', '減傷', '無閃避', '爆發'],
          desc: '瞬間將彈匣補滿至 3 枚（缺幾發補幾發，每枚獨立判定）。本回合觸發【架弩蹲伏】：受到的所有傷害降低 20%，但閃避率強制歸零無法閃避。'
        };
      }
    }
  }

  for(const skill of baseSkills) {
    const key=v2SkillKey(player,skill),copy=v2SkillCopy(player.role,key);
    if(copy) {
      const keepLabel = skill.id === 'a_reload' || skill.id === 'a_frenzy_reload';
      Object.assign(skill,{desc:copy.full_copy,shortDesc:copy.short_copy,copyKey:key,label:keepLabel ? skill.label : copy.display_name});
    }
  }
  return baseSkills;
}

// 玩家行動優先權判定 (1: 淨化, 2: 復活, 3: 防禦/護盾/裝填蹲伏, 4: 增益, 5: 治療, 6: 變身/召喚, 7: 敵方減益, 8: 攻擊技能)
export function getActionPriority(actionId) {
  if (['dw_butterfly','sg_clock','g_sacrifice','g_arena'].includes(actionId)) return 4;
  if (['dw_false_dream','sg_observe'].includes(actionId)) return 7;
  if (actionId === 'alc_fate' || actionId === 'aug_bind') return 1; // 1. 淨化 / 命運繫結 (Cleanse / Fate Binding)
  if (actionId === 'b_revive') return 2; // 2. 復活 (Revive)
  if (actionId === 'w_shield' || actionId === 'a_reload' || actionId === 'a_frenzy_reload' || actionId === 'pal_glory' || actionId === 'pal_grace') return 3; // 3. 防禦/護盾/免傷/架弩蹲伏 (Defense / Mitigation)
  if (actionId === 'b_buff' || actionId === 'b_frenzy') return 4; // 4. 增益 (Buff)
  if (actionId === 'b_heal') return 5; // 5. 治療 (Heal)
  if (actionId === 'dru_transform' || actionId === 'dru_summon_treant' || actionId === 'dru_summon_wolf') return 6; // 6. 變身/召喚 (Transform / Summon)
  if (actionId === 'a_rain' || actionId === 'aug_reckon' || actionId === 'onm_talisman') return 7; // 7. 敵方減益 (Enemy Debuff - 削弱敵方攻擊力 / 命運清算・凶兆逆位 / 施加符咒)
  // 8. 攻擊技能 (Offensive Skills)
  // 【重要規範】:
  // - 法師【生命汲取】(m_drain): 依實際造成的魔法傷害計算回血，本質為攻擊技能，歸於 Priority 8。
  // - 鍊金【腐蝕強酸瓶】(alc_acid): 攻擊技能，歸於 Priority 8（其全隊裝備減半為 Pre-Resolution 靜默效果）。
  // - 其餘攻擊: basic, w_strike, w_cleave, m_blast, a_shot, s_stab, alc_poison, b_nocturne 等。
  return 8;
}

// 敵方難度加成計算：1~5層每層+10%，6~10層每層+15%，以此類推
export function getFloorDifficultyBonusPercent(floor) {
  let bonus = 0;
  for (let f = 2; f <= floor; f++) {
    const bracket = Math.floor((f - 1) / 5);
    const rate = 10 + bracket * 5;
    bonus += rate;
  }
  return bonus;
}

export function getFloorDifficultyMultiplier(floor) {
  return 1 + (getFloorDifficultyBonusPercent(floor) / 100);
}

// 7 大職業完整詳細技能介紹與數值機制（供選職業介面查看）
export const ROLE_DETAILS = {
  ...NEW_ROLE_DETAILS,
  warrior: {
    roleName: '戰士',
    enName: 'Warrior',
    emoji: '🛡️',
    avatar: '/photo/Warrior.webp',
    hp: 120,
    type: '物理 / 前排坦鋒',
    passive: '每次實際扣除生命的受傷事件，攻擊 +1，最多 15，戰鬥結束清空。全盾吸收、閃避與零傷不增加。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '揮動武器進行基本物理打擊，對單一目標造成基礎 5 點傷害。'
      },
      {
        type: '1 技能',
        name: '堅定斬擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '自身減傷 60% 持續 3 回合；每輪末反擊本輪實際受到的生命與護盾傷害。揮動巨劍造成物理傷害。80% 機率造成 18 點傷害；20% 機率因揮砍失衡僅造成 5 點傷害，並使下回合自身承受傷害提高 20%。'
      },
      {
        type: '2 技能',
        name: '壁壘守護',
        dmgType: '【防護】',
        cd: '2 回合',
        desc: '全隊獲得戰士最大生命 40% 護盾，持續本回合；有 25% 機率盾牌龜裂，使冷卻額外 +1。'
      }
    ]
  },
  mage: {
    roleName: '法師',
    enName: 'Mage',
    emoji: '🧙‍♂️',
    avatar: '/photo/Mage.webp',
    hp: 80,
    type: '魔法 / 遠程爆發',
    passive: '站樁高爆發與生命汲取，全技能與普攻皆為魔法傷害。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【魔法】',
        cd: '無 CD',
        desc: '引導微光魔力造成基礎 10 點魔法傷害。'
      },
      {
        type: '1 技能',
        name: '奧術爆破',
        dmgType: '【魔法】',
        cd: '2 回合',
        desc: '引爆狂暴魔力轟炸敵方造成 45 點魔法傷害。有 25% 機率發生法力走火導致威力驟降為 10 點傷害，並對自身造成 10 點魔力反噬。'
      },
      {
        type: '2 技能',
        name: '生命汲取',
        dmgType: '【魔法】',
        cd: '2 回合',
        desc: '對敵方造成 1~50 點劇烈浮動的魔法傷害，並依據最終造成的傷害量吸取 20% 生命回復自身。'
      }
    ]
  },
  archer: {
    roleName: '弓箭手',
    enName: 'Archer',
    emoji: '🏹',
    avatar: '/photo/Archer.webp',
    hp: 80,
    type: '物理 / 遠程敏捷',
    passive: '常駐 40% 閃避率（可完全閃避單體物理打擊與怪物反擊）。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '拉弓射出基礎箭矢造成基礎 10 點物理傷害。'
      },
      {
        type: '1 技能',
        name: '精準狙擊',
        dmgType: '【物理】',
        cd: '1 回合',
        desc: '百步穿楊狙擊目標造成 35 點傷害。有 20% 機率發生脫靶導致無法造成傷害（0 傷害），並使下一次閃避檢定成功率提高 20 個百分點（檢定後消耗）。'
      },
      {
        type: '2 技能',
        name: '箭雨壓制',
        dmgType: '【魔法】',
        cd: '1 回合',
        desc: '召喚範圍附魔箭雨造成 20 點魔法傷害並削弱敵方 10 點攻擊力。有 20% 機率受地底氣流干擾誤傷隨機一名隊友 10 點傷害。'
      }
    ]
  },
  assassin: {
    roleName: '刺客',
    enName: 'Assassin',
    emoji: '🗡️',
    avatar: '/photo/Assassin.webp',
    hp: 50,
    type: '物理 / 近戰刺殺',
    passive: '常駐 60% 暴擊，輕甲承傷 +25%。每次有效暴擊獲得 1 層匿蹤（跨戰鬥保留）。初始獲得 1 層匿蹤；每 3 回合開始減 1 層（第 3 回合起），再判定隱身；隱身免傷，主動攻擊解除當回合隱身。隱身時其他玩家每次正式行動有 50% 機率追擊，基礎上限 2 次、追擊暴擊率 50%。100% 避開陷阱。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '揮動雙匕進行基礎物理切削造成 10 點傷害。'
      },
      {
        type: '1 技能',
        name: '暗影刺殺',
        dmgType: '【物理】',
        cd: '1 回合 (暴擊無CD)',
        desc: '背刺敵方造成 35 點物理傷害。若觸發暴擊則傷害倍增為 70 且立即重置冷卻；未暴擊則需正常進入冷卻 1 回合。'
      },
      {
        type: '2 技能',
        name: '暗影爆襲',
        dmgType: '【物理】',
        cd: '2 回合',
        desc: '消耗所有匿蹤，基礎傷害 30；每層增加 15 點，0／1／2／3／4 層為 30／45／60／75／90。暴擊資格待定。'
      }
    ]
  },
  bard: {
    roleName: '吟遊詩人',
    enName: 'Bard',
    emoji: '🪕',
    avatar: '/photo/Bard.webp',
    hp: 70,
    type: '魔法 / 團隊核心輔助',
    passive: '團隊核心輔助，精通全體群療與增傷減傷，全技能皆為魔法傷害。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【魔法】',
        cd: '無 CD',
        desc: '撥動琴弦引導音波造成基礎 10 點魔法傷害。'
      },
      {
        type: '1 技能',
        name: '治癒頌歌',
        dmgType: '【治療】',
        cd: '1 回合',
        desc: '唱響聖詠為全體隊友回復生命。80% 機率為全體回復 22 點生命，並專注為指定目標額外回復 28 點；20% 機率因走音導致全隊回復量大幅縮減為僅回復 5 點生命。'
      },
      {
        type: '2 技能',
        name: '狂熱協奏',
        dmgType: '【增益】',
        cd: '1 回合',
        desc: '使全隊提升 50% 傷害、25% 減傷並削弱敵方抗性。有 25% 機率因節奏過激導致全隊力竭扣除當前 5 點生命。'
      }
    ]
  },
  alchemist: {
    roleName: '鍊金術士',
    enName: 'Alchemist',
    emoji: '🧪',
    avatar: '/photo/Alchemist.webp',
    hp: 70,
    type: '魔法 / 調和煉成',
    passive: '【異常調和】\n・腐蝕：Boss 的血量上限與傷害減少 5%，玩家觸發時裝備效果減半（持續 1 回合）。\n・中毒：每回合開始時造成 8 點傷害，持續 2 回合（重複釋放可疊加）。\n・燃燒：每回合開始時造成 10 點傷害，持續 1 回合（重複釋放可疊加）。\n・骨折：每回合開始時造成 5 點傷害，持續 3 回合（重複釋放可疊加）。\n・寒冷：每回合開始時造成 6 點傷害，持續 2 回合（重複釋放可疊加）。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【魔法】',
        cd: '無 CD',
        desc: '造成 10 點傷害，有 70% 機率造成腐蝕效果持續一回合，當觸發腐蝕效果時，有 35% 機率使我方全體也觸發腐蝕效果。'
      },
      {
        type: '1 技能',
        name: '不穩定試劑瓶',
        dmgType: '【魔法/持續傷害】',
        cd: '無 CD',
        desc: '造成 15 點傷害，並對敵方造成 4 種持續傷害其中一種：中毒、燃燒、骨折、寒冷（重複釋放可疊加）。有 40% 機率對我方全體同步造成此次效果。'
      },
      {
        type: '2 技能',
        name: '命運煉成試劑',
        dmgType: '【驅散/調和】',
        cd: '2 回合',
        desc: '立即驅散全隊所有負面狀態（中毒/燃燒/骨折/寒冷/腐蝕/撕裂）。若自身有異常狀態：50% 機率煉金大成功（全員回復 40 點生命 + 2 回合 70% 減傷護盾）/ 50% 機率煉金失敗（全員回復 10 點生命 + 下回合全隊受傷 +20%）；若自身無異常狀態：全員穩定回復 15 點生命。'
      }
    ]
  },
  druid: {
    roleName: '德魯伊',
    enName: 'Druid',
    emoji: '🌿',
    avatar: '/photo/Druid.webp',
    hp: 85,
    type: '物理 / 自然變形',
    passive: '自然之子，擅長形態轉變（狼人/遠古樹精）與自然夥伴召喚（小樹精/幼狼）。',
    forms: {
      werewolf: { name: '狼人', avatar: '/photo/狼人.webp' },
      treant: { name: '遠古樹精', avatar: '/photo/遠古樹精.webp' },
      tree: { name: '沉睡古樹', avatar: '/photo/遠古樹精.webp' }
    },
    summons: {
      treant: [
        { name: '小樹精1', avatar: '/photo/小樹精1.webp' },
        { name: '小樹精2', avatar: '/photo/小樹精2.webp' },
        { name: '小樹精3', avatar: '/photo/小樹精3.webp' }
      ],
      wolf: [
        { name: '幼狼1', avatar: '/photo/幼狼1.webp' },
        { name: '幼狼2', avatar: '/photo/幼狼2.webp' },
        { name: '幼狼3', avatar: '/photo/幼狼3.webp' }
      ]
    },
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '引導自然力量造成基礎 10 點物理傷害。'
      },
      {
        type: '1 技能',
        name: '形態轉變',
        dmgType: '【變身】',
        cd: '無 CD (持續2回合)',
        desc: '持續 2 回合（結束後才可再次變身）：有一半機率化身狼人（降低 20% 最大生命、造成傷害提升至 35 點、立即造成 35 傷害強化普攻，變身結束恢復最大生命）；有一半機率化身遠古樹精（獲得自身最大生命 85% 護盾、常駐減傷 30%、替全隊吸收 50% 受傷、致命傷免死化為樹木休眠 1 回合）。'
      },
      {
        type: '2 技能 A',
        name: '召喚小樹精',
        dmgType: '【召喚】',
        cd: '無 CD (每位德魯伊上限3隻)',
        desc: '召喚肉盾型樹精夥伴（HP = floor(10 + Max HP × 25%)，ATK = floor(有效攻擊 × 10%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。'
      },
      {
        type: '2 技能 B',
        name: '召喚幼狼',
        dmgType: '【召喚】',
        cd: '無 CD (每位德魯伊上限3隻)',
        desc: '召喚敏捷型幼狼夥伴（HP = floor(5 + Max HP × 10%)，ATK = floor(有效攻擊 × 80%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。'
      }
    ]
  }
};

// Phase 6 balance decisions confirmed by the user. Rates are fractions.
export const GAME_BALANCE = Object.freeze({
  archerMissNextDodgeBonus: 0.20,
  floorReviveHpRatio: 0.20,
  werewolfMaxHpReduction: 0.20,
  treantDamageReduction: 0.30
});

// 改良型重弩彈藥隨機抽取與標籤輔助函式
export function rollCrossbowAmmo() {
  const r = Math.random();
  if (r < 0.40) return 'pierce';
  if (r < 0.80) return 'elemental';
  return 'burst';
}

export function getCrossbowAmmoLabel(ammo) {
  if (ammo === 'pierce') return '🔴 穿甲箭';
  if (ammo === 'elemental') return '🔵 元素箭';
  if (ammo === 'burst') return '💥 爆裂箭';
  return ammo;
}

export function getCrossbowAmmoIcon(ammo) {
  if (ammo === 'pierce') return '🔴';
  if (ammo === 'elemental') return '🔵';
  if (ammo === 'burst') return '💥';
  return '▫️';
}

// Canonical v2 defaults consumed by the lobby, skill buttons and Studio catalog.
for(const [role,stats] of Object.entries(INITIAL_STATS)) {
  Object.assign(CLASSES[role],stats,{ATK_base:stats.attack,DEF:stats.defense});
  const text=v2Copy[role];
  CLASSES[role].desc=text.intro; CLASSES[role].passive=text.skills.passive.full_copy;
  for(const skill of CLASSES[role].skills) {
    const copy=v2SkillCopy(role,skill.id);
    if(copy)Object.assign(skill,{desc:copy.full_copy,shortDesc:copy.short_copy,label:copy.display_name});
  }
  if(ROLE_DETAILS[role]) {
    ROLE_DETAILS[role].passive=text.skills.passive.full_copy;
    ROLE_DETAILS[role].skills?.forEach((skill,i)=>{const copy=v2SkillCopy(role,CLASSES[role].skills[i]?.id);if(copy)skill.desc=copy.full_copy;});
  }
}

// ==========================================
// Module 2：10 大精英怪專屬伴生小怪與 3 種泛用雜兵
// ==========================================

export const EXCLUSIVE_MINIONS = [
  // 1. 地底熔岩巨像 專屬
  {
    id: 'lava_larva',
    bossName: '地底熔岩巨像',
    name: '爆裂熔岩幼體',
    avatar: '/BOSS/爆裂熔岩幼體.webp',
    hp: 30,
    desc: '熔岩巨像崩落碎片孕育出的火元素生物，死亡時會引發自爆。',
    attack: 4,
    baseResistances: { physical: 15, magic: 15, effect: 0 },
    ultName: '焦油自爆烈焰'
  },
  // 2. 暗影魔狼族長 專屬
  {
    id: 'shadow_wolf_pup',
    bossName: '暗影魔狼族長',
    name: '暗影疾行幼狼',
    avatar: '/BOSS/暗影疾行幼狼.webp',
    hp: 24,
    desc: '穿梭於陰影中的敏捷狼崽，擅長群體包抄擾亂目標。',
    attack: 5,
    baseResistances: { physical: 5, magic: 10, effect: 5 },
    ultName: '暗影連環撕咬'
  },
  // 3. 古代守護魔偶 專屬
  {
    id: 'ancient_repair_drone',
    bossName: '古代守護魔偶',
    name: '古代維修浮游機',
    avatar: '/BOSS/古代維修浮游機.webp',
    hp: 35,
    desc: '古代遺跡的自主修復裝置，會持續為主要魔偶輸送護盾與能量。',
    attack: 3,
    baseResistances: { physical: 0, magic: 0, effect: 15 },
    ultName: '奈米過載充能'
  },
  // 4. 赤月嗜血巫師 專屬
  {
    id: 'blood_moon_acolyte',
    bossName: '赤月嗜血巫師',
    name: '赤月狂熱侍僧',
    avatar: '/BOSS/赤月狂熱侍僧.webp',
    hp: 28,
    desc: '沉溺於赤月詛咒的教徒，願意獻祭自身的生命強化主祭的咒語。',
    attack: 6,
    baseResistances: { physical: 0, magic: 15, effect: 10 },
    ultName: '血咒獻祭爆裂'
  },
  // 5. 深淵腐蝕巨蟒 專屬
  {
    id: 'corrosive_slime',
    bossName: '深淵腐蝕巨蟒',
    name: '酸蝕劇毒泥怪',
    avatar: '/BOSS/酸蝕劇毒泥怪.webp',
    hp: 38,
    desc: '巨蟒腹部蛻下的腐蝕黏液化成的軟泥怪，能溶解玩家的防禦護甲。',
    attack: 3,
    baseResistances: { physical: 5, magic: 15, effect: 15 },
    ultName: '強酸腐蝕噴吐'
  },
  // 6. 霜骨亡靈騎士 專屬
  {
    id: 'frostbone_skeleton',
    bossName: '霜骨亡靈騎士',
    name: '霜髓殘破骷髏兵',
    avatar: '/BOSS/霜髓殘破骷髏兵.webp',
    hp: 32,
    desc: '伴隨騎士一同長眠的步兵枯骨，手中的鏽蝕長矛附帶刺骨嚴寒。',
    attack: 4,
    baseResistances: { physical: 0, magic: 10, effect: 15 },
    ultName: '寒冰刺骨戳擊'
  },
  // 7. 迷宮食腐暴食魔 專屬
  {
    id: 'carrion_crawler',
    bossName: '迷宮食腐暴食魔',
    name: '寄生腐肉爬行者',
    avatar: '/BOSS/寄生腐肉爬行者.webp',
    hp: 42,
    desc: '寄生於暴食魔爛肉皺褶中的多足蟲，以腐爛血肉為食，生命力頑強。',
    attack: 3,
    baseResistances: { physical: 5, magic: 0, effect: 10 },
    ultName: '腐臭毒液寄生'
  },
  // 8. 幻惑幽魂歌姬 專屬
  {
    id: 'whispering_apparition',
    bossName: '幻惑幽魂歌姬',
    name: '低語迷失怨魂',
    avatar: '/BOSS/迷失怨魂.webp',
    hp: 22,
    desc: '無實體的游離幽魂，透過哀怨的尖叫削弱敵人的精神抗性。',
    attack: 7,
    baseResistances: { physical: 20, magic: 0, effect: 0 },
    ultName: '迷亂惑心低語'
  },
  // 9. 結晶守護巨蠍 專屬
  {
    id: 'crystal_beetle',
    bossName: '結晶守護巨蠍',
    name: '共鳴紫晶甲蟲',
    avatar: '/BOSS/紫晶甲蟲.webp',
    hp: 36,
    desc: '甲殼覆蓋結晶碎屑的小型甲蟲，能與巨蠍的晶甲產生共鳴屏障。',
    attack: 4,
    baseResistances: { physical: 15, magic: 0, effect: 0 },
    ultName: '晶屑折射反彈'
  },
  // 10. 煉獄炎獄行者 專屬
  {
    id: 'hellfire_imp',
    bossName: '煉獄炎獄行者',
    name: '焦灼地獄小鬼',
    avatar: '/BOSS/地獄小鬼.webp',
    hp: 26,
    desc: '狡黠的地獄下級僕從，喜歡在戰場邊緣投擲火球製造混亂。',
    attack: 6,
    baseResistances: { physical: 5, magic: 8, effect: 5 },
    ultName: '煉獄火球連擲'
  }
];

// 3 種泛用雜兵
export const GENERAL_MINIONS = [
  {
    id: 'gel_slime',
    name: '迷途凝膠史萊姆',
    avatar: '/BOSS/史萊姆.webp',
    hp: 35,
    desc: '地下城最常見的膠狀生物，體質具彈性，能吸收各類衝擊。',
    attack: 3,
    baseResistances: { physical: 10, magic: 5, effect: 5 },
    ultName: '黏液纏繞重壓'
  },
  {
    id: 'cave_goblin_rogue',
    name: '洞窟暗刃哥布林',
    avatar: '/BOSS/哥布林.webp',
    hp: 25,
    desc: '手持粗糙匕首的哥布林斥候，偏好偷襲落單冒險者的弱點。',
    attack: 6,
    baseResistances: { physical: 5, magic: 0, effect: 0 },
    ultName: '背刺偷襲突刺'
  },
  {
    id: 'labyrinth_crossbowman',
    name: '流浪迷宮弩手',
    avatar: '/BOSS/流浪迷宮弩手.webp',
    hp: 28,
    desc: '在迷宮中迷失理智的冒險者亡骸，盲目地向視野內一切生靈射擊。',
    attack: 5,
    baseResistances: { physical: 0, magic: 5, effect: 5 },
    ultName: '穿甲散射重弩'
  }
];

// 深淵隨從小怪（供 col 9 深淵精英戰固定搭配 2 隻隨從小怪）
export const ABYSS_MINIONS = [
  {
    id: 'abyss_remnant',
    name: '深淵執念殘響',
    avatar: '/BOSS/迷失怨魂.webp',
    hp: 34,
    desc: '由未被選擇者的遺恨凝聚而成的深淵隨從，撕扯生者的靈魂。',
    attack: 5,
    baseResistances: { physical: 10, magic: 15, effect: 10 },
    ultName: '深淵哀鳴衝擊',
    isAbyssMinion: true
  },
  {
    id: 'abyss_watcher',
    name: '深淵侵蝕凝視者',
    avatar: '/BOSS/酸蝕劇毒泥怪.webp',
    hp: 36,
    desc: '寄生於深淵裂隙的暗影眷屬，為深淵化的宿主提供掩護。',
    attack: 4,
    baseResistances: { physical: 15, magic: 10, effect: 10 },
    ultName: '虛空侵蝕射線',
    isAbyssMinion: true
  }
];

// 特殊事件觸發的精英怪（奸商、寶箱怪）
export const SPECIAL_ELITES = {
  shady_merchant: {
    id: 'shady_merchant',
    name: '深淵黑市奸商・格里德',
    avatar: '/BOSS/Blood Moon Sorcerer_fullbody.webp',
    hp: 110,
    desc: '撕下偽善面具的黑市商人，揮舞著鑲滿假寶石的沉重金庫法杖！',
    attack: 14,
    baseResistances: { physical: 15, magic: 15, effect: 15 },
    ultName: '黑金暴利轟炸',
    tier: 'ELITE',
    isShadyMerchant: true
  },
  treasure_mimic: {
    id: 'treasure_mimic',
    name: '貪婪噬魂寶箱怪',
    avatar: '/BOSS/Labyrinth Glutton Demon_fullbody.webp',
    hp: 125,
    desc: '偽裝成華麗秘銀寶箱的擬態魔物，箱蓋張開時露出密密麻麻的利齒與血紅長舌！',
    attack: 15,
    baseResistances: { physical: 20, magic: 10, effect: 10 },
    ultName: '貪婪吞噬猛咬',
    tier: 'ELITE',
    isMimic: true
  }
};

// ==========================================
// Module 5：深淵化職業設定 (整合自 public/assets/深淵.md)
// ==========================================

export const ABYSS_BOSSES = {
  warrior: {
    id: 'abyss_warrior',
    role: 'warrior',
    name: '深淵戰士',
    avatar: '/photo/Warrior.webp',
    hp: 180,
    attack: 7,
    baseResistances: { physical: 30, magic: 5, effect: 5 },
    noBonusResistance: false,
    desc: '墮入深淵的前排坦鋒，揮舞被深淵黑血浸染的巨劍。',
    basicName: '巨劍揮砍',
    basicDesc: '揮動巨劍造成 7 點傷害',
    ultName: '深淵壁壘重斬',
    ultDesc: '開啟基於當下生命值30%的護盾，並造成18點傷害',
    script: {
      basicDamage: 7,
      specialDamage: 18,
      specialShieldCurrentHpRatio: 0.30
    }
  },
  mage: {
    id: 'abyss_mage',
    role: 'mage',
    name: '深淵法師',
    avatar: '/photo/Mage.webp',
    hp: 90,
    attack: 18,
    baseResistances: { physical: 0, magic: 30, effect: 10 },
    noBonusResistance: false,
    desc: '被狂暴奧術吞噬心智的法師，肆意傾瀉毀滅性的深淵魔力。',
    basicName: '狂暴魔力轟炸',
    basicDesc: '引爆狂暴魔力轟炸敵方造成 18 點傷害',
    ultName: '深淵亂流汲取',
    ultDesc: '造成 1~27 點劇烈浮動的傷害，恢復造成傷害5%的血量',
    script: {
      basicDamage: 18,
      specialMinDamage: 1,
      specialMaxDamage: 27,
      specialLifestealRatio: 0.05
    }
  },
  archer: {
    id: 'abyss_archer',
    role: 'archer',
    name: '深淵弓箭手',
    avatar: '/photo/Archer.webp',
    hp: 85,
    attack: 12,
    baseResistances: { physical: 10, magic: 10, effect: 0 },
    noBonusResistance: false,
    desc: '隱沒於深淵迷霧中的冷血射手，箭矢專挑昔日同伴的命門。',
    basicName: '百步穿楊',
    basicDesc: '百步穿楊狙擊目標造成 12 點傷害',
    ultName: '深淵貫穿壓制',
    ultDesc: '20 點傷害並削弱敵方 10 點攻擊力',
    script: {
      basicDamage: 12,
      specialDamage: 20,
      specialWeakenAtk: 10
    }
  },
  assassin: {
    id: 'abyss_assassin',
    role: 'assassin',
    name: '深淵刺客',
    avatar: '/photo/Assassin.webp',
    hp: 50,
    attack: 20,
    baseResistances: { physical: 0, magic: 0, effect: 0 },
    noBonusResistance: true, // (不會獲得抗性)
    desc: '徹底融入深淵暗影的刺客，捨棄了一切防禦換取極致的致命殺機。',
    basicName: '深淵背刺',
    basicDesc: '背刺敵方造成 20 點傷害',
    ultName: '虛無暗影步',
    ultDesc: '此回合玩家不可對他造成傷害。造成10點傷害。',
    script: {
      basicDamage: 20,
      specialDamage: 10,
      specialUntargetableRound: true
    }
  },
  bard: {
    id: 'abyss_bard',
    role: 'bard',
    name: '深淵吟遊詩人',
    avatar: '/photo/Bard.webp',
    hp: 90,
    attack: 8,
    baseResistances: { physical: 5, magic: 20, effect: 0 },
    noBonusResistance: false,
    desc: '撥動斷裂琴弦的絕望樂手，奏響令人理智崩潰的深淵輓歌。',
    basicName: '悲鳴音波',
    basicDesc: '撥動琴弦引導音波造成 8 點傷害',
    ultName: '深淵安魂頌',
    ultDesc: '恢復自身10%血量，不造成傷害。',
    script: {
      basicDamage: 8,
      specialDamage: 0,
      specialSelfHealMaxHpRatio: 0.10
    }
  },
  alchemist: {
    id: 'abyss_alchemist',
    role: 'alchemist',
    name: '深淵煉金術士',
    avatar: '/photo/Alchemist.webp',
    hp: 80,
    attack: 15,
    baseResistances: { physical: 0, magic: 5, effect: 35 },
    noBonusResistance: false,
    desc: '將深淵瘴氣注入試劑瓶的瘋狂學者，以劇毒與烈火灼燒萬物。',
    basicName: '深淵禁忌投擲',
    basicDesc: '施放【劇毒煙霧瓶】、【焦油燃燒瓶】、【重鉛裂骨瓶】、【霜蝕吸熱瓶】造成15傷害',
    ultName: '禁忌再生提純',
    ultDesc: '清除自身所有負面狀態，恢復5%生命。',
    script: {
      basicDamage: 15,
      basicRandomFlaskDot: ['poison', 'burn', 'fracture', 'chill'],
      specialDamage: 0,
      specialCleanseSelf: true,
      specialSelfHealMaxHpRatio: 0.05
    }
  },
  druid: {
    id: 'abyss_druid',
    role: 'druid',
    name: '深淵德魯伊',
    avatar: '/photo/Druid.webp',
    hp: 90,
    attack: 10,
    baseResistances: { physical: 30, magic: 5, effect: 5 },
    noBonusResistance: false,
    desc: '遭深淵腐化扭曲的自然化身，在嗜血狂狼與腐朽古樹間狂亂切換。',
    basicName: '腐化自然之力',
    basicDesc: '引導自然力量造成 10 點傷害',
    ultName: '深淵狂暴變形',
    ultDesc: '下回合有一半機率化身狼人（減少5%生命，立即造成 20 傷害）；有一半機率化身遠古樹精（恢復20%生命，立即造成3點傷害）',
    script: {
      basicDamage: 10,
      specialWolfHpCostRatio: 0.05,
      specialWolfDamage: 20,
      specialTreantHealRatio: 0.20,
      specialTreantDamage: 3
    }
  },
  paladin: {
    id: 'abyss_paladin',
    role: 'paladin',
    name: '深淵聖騎士',
    avatar: '/photo/Paladin.webp',
    hp: 80,
    attack: 2,
    baseResistances: { physical: 30, magic: 0, effect: 10 },
    noBonusResistance: false,
    desc: '背棄聖光誓言的墮落騎士，將信仰化為不可侵犯的荊棘反傷壁壘。',
    basicName: '墮落懲戒',
    basicDesc: '造成2點傷害，並且獲得基於造成傷害2倍的護盾',
    ultName: '黑蝕荊棘聖盾',
    ultDesc: '獲得當下生命30%的護盾，將此回合受到傷害50%反擊回去',
    script: {
      basicDamage: 2,
      basicShieldMultiplier: 2,
      specialDamage: 0,
      specialShieldCurrentHpRatio: 0.30,
      specialReflectDamageRatio: 0.50
    }
  },
  gladiator: {
    id: 'abyss_gladiator',
    role: 'gladiator',
    name: '深淵角鬥士',
    avatar: '/photo/Gladiator.webp',
    hp: 150,
    attack: 12,
    baseResistances: { physical: 30, magic: 0, effect: 0 },
    noBonusResistance: false,
    desc: '沉淪於無盡殺戮的深淵鬥士，燃燒自身鮮血強行將獵物拖入死鬥。',
    basicName: '狂血猛擊',
    basicDesc: '減少20%生命，並造成12點傷害',
    ultName: '深淵死鬥角鬥場',
    ultDesc: '出現額外回合，隨機選一名玩家進入角鬥場，雙方受到傷害不受減免，並造成18點傷害。',
    script: {
      basicDamage: 12,
      basicSelfHpCostRatio: 0.20,
      specialDamage: 18,
      specialForceArena: true
    }
  },
  stargazer: {
    id: 'abyss_stargazer',
    role: 'stargazer',
    name: '深淵觀星者',
    avatar: '/photo/Stargazer.webp',
    hp: 80,
    attack: 9,
    baseResistances: { physical: 0, magic: 25, effect: 5 },
    noBonusResistance: false,
    desc: '直視深淵黑洞而陷入瘋狂的觀星者，以扭曲引力撕裂空間與時間。',
    basicName: '引力坍縮',
    basicDesc: '引力坍縮撕裂空間，造成9點真實撕裂傷害。',
    ultName: '星軌停滯崩落',
    ultDesc: '全部玩家CD增加一回合，並造成15點傷害。',
    script: {
      basicDamage: 9,
      basicTrueDamage: true,
      specialDamage: 15,
      specialAllPlayersCooldownPlus: 1
    }
  },
  dreamweaver: {
    id: 'abyss_dreamweaver',
    role: 'dreamweaver',
    name: '深淵織夢術士',
    avatar: '/photo/Dreamweaver.webp',
    hp: 80,
    attack: 10,
    baseResistances: { physical: 0, magic: 15, effect: 25 },
    noBonusResistance: false,
    desc: '編織無盡惡夢的深淵術士，篡改隊員的感官使其自相殘殺。',
    basicName: '惡夢穿刺',
    basicDesc: '造成10點傷害',
    ultName: '深淵群體惑亂',
    ultDesc: '迷惑全體玩家，使玩家造成傷害打在隊友身上。',
    script: {
      basicDamage: 10,
      specialDamage: 0,
      specialConfuseAllPlayers: true
    }
  },
  samurai: {
    id: 'abyss_samurai',
    role: 'samurai',
    name: '深淵武士',
    avatar: '/photo/武士.webp',
    hp: 80,
    attack: 12,
    baseResistances: { physical: 25, magic: 10, effect: 0 },
    noBonusResistance: false,
    desc: '被妖刀徹底支配的劍鬼，刀鋒所向無人能全身而退。',
    basicName: '魔刃斬擊',
    basicDesc: '造成12點傷害，40%觸發反擊，每次反擊傷害為3點',
    ultName: '深淵秘劍・燕返',
    ultDesc: '快速砍出連續4刀【燕返】，每刀造成3點物理傷害',
    script: {
      basicDamage: 12,
      basicCounterChance: 0.40,
      basicCounterDamage: 3,
      specialMultiHits: 4,
      specialHitDamage: 3
    }
  },
  onmyoji: {
    id: 'abyss_onmyoji',
    role: 'onmyoji',
    name: '深淵陰陽師',
    avatar: '/photo/陰陽師.webp',
    hp: 65,
    attack: 12,
    baseResistances: { physical: 0, magic: 15, effect: 15 },
    noBonusResistance: false,
    desc: '役使百鬼怨靈的墮落陰陽師，將惡毒咒印烙印在生者魂魄之上。',
    basicName: '怨靈符擊',
    basicDesc: '擲出一道符咒，造成12點傷害',
    ultName: '百鬼血咒印',
    ultDesc: '擲出一道符咒，對隨機一名玩家施加以下3種負面效果之一：將造成的傷害10%~30%作用在自身、有100%機率在當前回合完全不造成任何傷害、受到的所有攻擊傷害提升10%',
    script: {
      basicDamage: 12,
      specialDamage: 0,
      specialApplyPlayerCurse: ['backlash', 'seal_zero', 'vulnerable']
    }
  },
  sage: {
    id: 'abyss_sage',
    role: 'sage',
    name: '深淵智者 - 無解的方程',
    avatar: '/photo/智者.webp',
    hp: 85,
    attack: 11,
    baseResistances: { physical: 5, magic: 25, effect: 20 },
    noBonusResistance: false,
    desc: '無法接受演算結果不選自己、認定整個世界皆為錯誤的深淵演算者。',
    passiveName: '錯誤演算',
    passiveDesc: '每回合累積誤差並干擾玩家行動結果',
    basicName: '向量崩解',
    basicDesc: '造成物理傷害並使目標下次受傷增加',
    ultName: '無解證明',
    ultDesc: '每兩回合依累積誤差對全隊造成傷害並重置誤差',
    script: {
      passiveErrorPerRound: 6,
      basicDamage: 11,
      basicApplyNextHitVulnerable: 0.20,
      specialEveryNRounds: 2,
      specialBaseDamage: 10,
      specialResetError: true
    }
  }
};

// 卜者特殊彩蛋設定（排除出一般深淵候選池）
export const ABYSS_AUGUR_EASTER_EGG = Object.freeze({
  role: 'augur',
  name: '卜者・命運預見者',
  avatar: '/photo/卜者.webp',
  excludedFromAbyssPool: true,
  triggerChance: 0.08,
  dialogue: '「在你們踏入大廳之前，水晶球就已經映出了我不會被選上的結局。深淵的誘惑對早已看透因果的人毫無意義……小心吧，真正被怨恨吞噬的人，就在我身後。」'
});

export function getExclusiveMinionForBoss(bossName) {
  if (!bossName) return EXCLUSIVE_MINIONS[0];
  const cleanName = String(bossName).replace(/^【削弱】/, '').trim();
  return EXCLUSIVE_MINIONS.find(m => m.bossName === cleanName || cleanName.includes(m.bossName)) || EXCLUSIVE_MINIONS[0];
}

// ==========================================
// Module 3：雙層背包、裝備欄位與合成系統
// ==========================================

export function determineEquipSlot(item) {
  if (!item) return EQUIP_SLOTS.ACCESSORY;
  if (item.slot && EQUIP_SLOTS[item.slot]) return item.slot;
  if (item.tier === 'CLASS_EXCLUSIVE' || (item.role && !item.slot)) {
    return EQUIP_SLOTS.CLASS_EXCLUSIVE;
  }
  if (item.bonusDef || (item.name && (item.name.includes('甲') || item.name.includes('盾') || item.name.includes('鎧')))) {
    return EQUIP_SLOTS.ARMOR;
  }
  if (item.bonusAtk && !item.bonusDef && !item.regenPerRound && !item.battleStartShield) {
    return EQUIP_SLOTS.WEAPON;
  }
  return EQUIP_SLOTS.ACCESSORY;
}

export const TIER1_EQUIPMENTS = [
  // 武器（7 件）
  { id: 'short_sword', name: '精煉短劍', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusAtk: 4, cost: 50, icon: '/assets/Equipments/精煉短劍.webp', desc: '精煉短劍，物理攻擊 +4。' },
  { id: 'hunter_bow', name: '獵人長弓', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusAtk: 5, cost: 60, icon: '/assets/Equipments/獵人長弓.webp', desc: '獵人長弓，物理攻擊 +5。' },
  { id: 'armor_cleaver', name: '裂甲戰斧', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusAtk: 7, bonusHp: -10, cost: 70, icon: '/assets/Equipments/裂甲戰斧.webp', desc: '裂甲戰斧，物理攻擊 +7，最大 HP -10。' },
  { id: 'magic_crystal', name: '魔力水晶', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusMagAtk: 4, isMagic: true, cost: 50, icon: '/assets/Equipments/魔力水晶.webp', desc: '蘊含純淨以太能量的水晶，魔法攻擊 +4。' },
  { id: 'star_staff', name: '星紋法杖', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusMagAtk: 5, isMagic: true, cost: 60, icon: '/assets/Equipments/星紋法杖.webp', desc: '刻有繁星符文的法杖，魔法攻擊 +5。' },
  { id: 'forbidden_tome', name: '禁忌魔典', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusMagAtk: 7, bonusHp: -10, isMagic: true, cost: 70, icon: '/assets/Equipments/禁忌魔典.webp', desc: '封印深淵知識的魔典，魔法攻擊 +7，最大 HP -10。' },
  { id: 'arcane_dagger', name: '奧術短刃', slot: EQUIP_SLOTS.WEAPON, tier: 1, bonusAtk: 4, bonusMagAtk: 4, cost: 75, icon: '/assets/Equipments/奧術短刃.webp', desc: '同時蘊含鋒芒與奧術的短刃，物攻 +4、魔攻 +4。' },

  // 衣服（6 件）
  { id: 'ragged_robe', name: '破舊麻衣', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 10, cost: 40, icon: '/assets/Equipments/破舊麻衣.webp', desc: '粗糙透氣的麻布衣，最大 HP +10。' },
  { id: 'leather_armor', name: '探險者皮甲', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 15, cost: 50, icon: '/assets/Equipments/探險者皮甲.webp', desc: '野獸厚皮縫製的防具，最大生命 +15。' },
  { id: 'traveler_robe', name: '旅人長袍', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 20, cost: 65, icon: '/assets/Equipments/旅人長袍.webp', desc: '耐磨舒適的長袍，最大 HP +20。' },
  { id: 'buckler', name: '輕型護胸', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 10, bonusDef: 2, cost: 60, icon: '/assets/Equipments/輕型護胸.webp', desc: '保護要害的輕巧護胸，最大 HP +10、防禦力 +2。' },
  { id: 'copper_armor', name: '精銅護甲', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 14, bonusDef: 1, cost: 60, icon: '/assets/Equipments/精銅護甲.webp', desc: '精銅鍛造的堅實護甲，最大 HP +14、防禦力 +1。' },
  { id: 'steel_armor', name: '鋼鐵護甲', slot: EQUIP_SLOTS.ARMOR, tier: 1, bonusHp: 6, bonusDef: 3, cost: 70, icon: '/assets/Equipments/鋼鐵護甲.webp', desc: '厚重牢固的鋼鐵重甲，最大 HP +6、防禦力 +3。' },

  // 飾品（8 件）
  { id: 'ruby', name: '熾熱紅寶石', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusHp: 10, cost: 45, icon: '/assets/Equipments/熾熱紅寶石.webp', desc: '溫暖脈動的赤紅晶石，最大生命 +10。' },
  { id: 'bronze_ring', name: '青銅指環', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusAtk: 1, bonusMagAtk: 1, bonusHp: 5, cost: 50, icon: '/assets/Equipments/青銅指環.webp', desc: '古代青銅指環，物攻 +1、魔攻 +1、最大 HP +5。' },
  { id: 'regen_herb_ring', name: '再生草環', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusHp: 5, regenPerRound: 3, cost: 65, icon: '/assets/Equipments/再生草環.webp', desc: '以生命草根莖編織的指環，最大 HP +5，每回合開始恢復 3 HP。' },
  { id: 'guardian_amulet', name: '守衛吊墜', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusHp: 6, bonusDef: 1, battleStartShield: 6, cost: 70, icon: '/assets/Equipments/守衛吊墜.webp', desc: '刻劃防護符文的吊墜，最大 HP +6、防禦 +1，每場戰鬥開始獲得 6 點護盾。' },
  { id: 'hawkeye_feather', name: '鷹眼羽飾', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusAtk: 3, bonusHp: 5, cost: 70, icon: '/assets/Equipments/鷹眼羽飾.webp', desc: '靈敏銳利的獵鷹羽飾，物攻 +3、最大 HP +5。' },
  { id: 'starlight_earring', name: '星輝耳墜', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusMagAtk: 2, bonusHp: 3, healBonus: 0.05, cost: 70, icon: '/assets/Equipments/星輝耳墜.webp', desc: '閃耀微光的耳墜，魔攻 +2、最大 HP +3，自身施放的直接治療量 +5%。' },
  { id: 'balance_talisman', name: '均衡護符', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusAtk: 1, bonusMagAtk: 1, bonusHp: 5, bonusDef: 1, cost: 75, icon: '/assets/Equipments/均衡護符.webp', desc: '均衡協調的守護護符，物攻 +1、魔攻 +1、最大 HP +5、防禦 +1。' },
  { id: 'frost_ring', name: '霜紋戒指', slot: EQUIP_SLOTS.ACCESSORY, tier: 1, bonusMagAtk: 2, bonusDef: 1, magicShieldOnce: 5, cost: 70, icon: '/assets/Equipments/霜紋戒指.webp', desc: '散發淡淡寒霜的戒指，魔攻 +2、防禦 +1，每場戰鬥首次受到魔法直接傷害時，該次傷害減少 5 點。' }
];

export const TIER2_EQUIPMENTS = [
  // 核心合成裝備（6 件）
  { id: 'rune_greatsword', name: '符文長劍', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusAtk: 8, bonusMagAtk: 8, cost: 120, icon: '/assets/Equipments/符文長劍.webp', desc: '融合鋒刃與奧術的附魔長劍，物攻 +8、魔攻 +8。' },
  { id: 'assault_blade', name: '破陣鋒刃', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusAtk: 11, bonusHp: 5, cost: 120, icon: '/assets/Equipments/破陣鋒刃.webp', desc: '破甲攻堅的重斬之刃，物攻 +11、最大 HP +5。' },
  { id: 'steel_plate_armor', name: '精鋼鎧', slot: EQUIP_SLOTS.ARMOR, tier: 2, bonusHp: 30, bonusDef: 5, cost: 120, icon: '/assets/Equipments/精鋼鎧.webp', desc: '重型精鋼板甲，最大 HP +30、防禦 +5。' },
  { id: 'ring_of_life', name: '生命指環', slot: EQUIP_SLOTS.ACCESSORY, tier: 2, bonusHp: 18, regenPerRound: 5, cost: 120, icon: '/assets/Equipments/生命指環.webp', desc: '蘊藏生命律動的翡翠指環，最大 HP +18，每回合開始恢復 5 HP。' },
  { id: 'guardian_pendant', name: '守護者吊墜', slot: EQUIP_SLOTS.ACCESSORY, tier: 2, bonusHp: 20, bonusDef: 1, battleStartShield: 12, cost: 120, icon: '/assets/Equipments/守護者吊墜.webp', desc: '神聖守護墜飾，最大 HP +20、防禦 +1，每場戰鬥開始獲得 12 點護盾。' },
  { id: 'hymn_scepter', name: '聖歌權杖', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusMagAtk: 9, healReceivedBonus: 0.08, cost: 120, icon: '/assets/Equipments/聖歌權杖.webp', desc: '傳頌聖詠的神聖權杖，魔攻 +9，自身受到的直接治療量 +8%。' },

  // 擴充合成裝備（6 件）
  { id: 'hunting_bow', name: '追獵長弓', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusAtk: 12, cost: 120, icon: '/assets/Equipments/追獵長弓.webp', desc: '百步穿楊的追獵神弓，物攻 +12。' },
  { id: 'siege_axe', name: '破城巨斧', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusAtk: 13, bonusDef: 2, bonusHp: -10, cost: 120, icon: '/assets/Equipments/破城巨斧.webp', desc: '勢大力沉的重斧，物攻 +13、防禦 +2、最大 HP -10。' },
  { id: 'frost_tome', name: '霜蝕秘典', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusMagAtk: 12, bonusDef: 2, bonusHp: -8, cost: 120, icon: '/assets/Equipments/霜蝕秘典.webp', desc: '極寒冰霜典籍，魔攻 +12、防禦 +2、最大 HP -8。' },
  { id: 'dual_phase_dagger', name: '雙相短刃', slot: EQUIP_SLOTS.WEAPON, tier: 2, bonusAtk: 7, bonusMagAtk: 7, bonusHp: 8, cost: 120, icon: '/assets/Equipments/雙相短刃.webp', desc: '魔武雙修的雙相短刃，物攻 +7、魔攻 +7、最大 HP +8。' },
  { id: 'ancient_robe', name: '古紋長袍', slot: EQUIP_SLOTS.ARMOR, tier: 2, bonusHp: 40, cost: 120, icon: '/assets/Equipments/古紋長袍.webp', desc: '古老咒文編織的長袍，最大 HP +40。' },
  { id: 'city_guard_armor', name: '守城戰衣', slot: EQUIP_SLOTS.ARMOR, tier: 2, bonusHp: 22, bonusDef: 3, battleStartShield: 12, cost: 120, icon: '/assets/Equipments/守城戰衣.webp', desc: '堅毅的守衛防禦戰衣，最大 HP +22、防禦 +3，每場戰鬥開始獲得 12 點護盾。' }
];

export const CRAFTING_RECIPES = [
  { id: 'craft_rune_greatsword', ingredients: ['short_sword', 'magic_crystal'], resultId: 'rune_greatsword', name: '符文長劍', desc: '精煉短劍 ＋ 魔力水晶' },
  { id: 'craft_assault_blade', ingredients: ['short_sword', 'bronze_ring'], resultId: 'assault_blade', name: '破陣鋒刃', desc: '精煉短劍 ＋ 青銅指環' },
  { id: 'craft_steel_plate_armor', ingredients: ['leather_armor', 'buckler'], resultId: 'steel_plate_armor', name: '精鋼鎧', desc: '探險者皮甲 ＋ 輕型護胸' },
  { id: 'craft_ring_of_life', ingredients: ['ruby', 'regen_herb_ring'], resultId: 'ring_of_life', name: '生命指環', desc: '熾熱紅寶石 ＋ 再生草環' },
  { id: 'craft_guardian_pendant', ingredients: ['buckler', 'ruby'], resultId: 'guardian_pendant', name: '守護者吊墜', desc: '輕型護胸 ＋ 熾熱紅寶石' },
  { id: 'craft_hymn_scepter', ingredients: ['star_staff', 'starlight_earring'], resultId: 'hymn_scepter', name: '聖歌權杖', desc: '星紋法杖 ＋ 星輝耳墜' },
  { id: 'craft_hunting_bow', ingredients: ['hunter_bow', 'hawkeye_feather'], resultId: 'hunting_bow', name: '追獵長弓', desc: '獵人長弓 ＋ 鷹眼羽飾' },
  { id: 'craft_siege_axe', ingredients: ['armor_cleaver', 'steel_armor'], resultId: 'siege_axe', name: '破城巨斧', desc: '裂甲戰斧 ＋ 鋼鐵護甲' },
  { id: 'craft_frost_tome', ingredients: ['forbidden_tome', 'frost_ring'], resultId: 'frost_tome', name: '霜蝕秘典', desc: '禁忌魔典 ＋ 霜紋戒指' },
  { id: 'craft_dual_phase_dagger', ingredients: ['arcane_dagger', 'balance_talisman'], resultId: 'dual_phase_dagger', name: '雙相短刃', desc: '奧術短刃 ＋ 均衡護符' },
  { id: 'craft_ancient_robe', ingredients: ['ragged_robe', 'traveler_robe'], resultId: 'ancient_robe', name: '古紋長袍', desc: '破舊麻衣 ＋ 旅人長袍' },
  { id: 'craft_city_guard_armor', ingredients: ['copper_armor', 'guardian_amulet'], resultId: 'city_guard_armor', name: '守城戰衣', desc: '精銅護甲 ＋ 守衛吊墜' }
];

export function getCraftingRecipe(item1Id, item2Id) {
  if (!item1Id || !item2Id) return null;
  const sorted = [item1Id, item2Id].sort();
  return CRAFTING_RECIPES.find(r => {
    const rSorted = r.ingredients.slice().sort();
    return rSorted[0] === sorted[0] && rSorted[1] === sorted[1];
  }) || null;
}

export function findItemTemplate(itemId) {
  if (!itemId) return null;
  return TIER1_EQUIPMENTS.find(e => e.id === itemId) ||
    TIER2_EQUIPMENTS.find(e => e.id === itemId) ||
    LOOT_TABLE.find(e => e.id === itemId) ||
    NEW_LOOT.find(e => e.id === itemId) ||
    null;
}

// ==========================================
// Module 6：15 職業隊長技系統
// ==========================================

export const LEADER_SKILLS = Object.freeze({
  warrior: {
    id: 'leader_warrior',
    role: 'warrior',
    name: '堅守陣線',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；每場戰鬥首次有隊友生命降至 30% 以下時，該次所受傷害降低 50%。',
    eventDesc: '【事件】翻臉搶劫奸商時使奸商首回合暈眩；祭壇鮮血獻祭扣血減半。'
  },
  mage: {
    id: 'leader_mage',
    role: 'mage',
    name: '奧術共鳴',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；指定隊友，下一次魔法攻擊無視敵方 50% 魔法抗性。',
    eventDesc: '【事件】「重鑄」事件費用減半，且必定可將物理武器轉為魔法武器。'
  },
  archer: {
    id: 'leader_archer',
    role: 'archer',
    name: '獵殺標記',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；標記敵方目標，讓隊伍下一輪的首次攻擊更容易命中（無視閃避）。',
    eventDesc: '【事件】六角地圖提前偵測「寶箱/商店」格機率提高 35%，並直接看穿寶箱怪偽裝。'
  },
  assassin: {
    id: 'leader_assassin',
    role: 'assassin',
    name: '無聲行軍',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；全隊本場首次攻擊獲得額外破綻效果（目標次回合承傷 +20%）。',
    eventDesc: '【事件】一般商店 8 折；遇到奸商時解鎖專屬選項「暗中行竊」（50% 機率免戰偷走一件商品）。'
  },
  bard: {
    id: 'leader_bard',
    role: 'bard',
    name: '變奏指揮',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；調整本回合隊伍技能優先級，全隊攻擊於敵方行動前優先結算。',
    eventDesc: '【事件】「流浪商人」免費提供路況情報，且以物易物必換出高一階裝備。'
  },
  alchemist: {
    id: 'leader_alchemist',
    role: 'alchemist',
    name: '戰地調配',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；每場戰鬥選擇一次偏防禦（全隊獲得 20 護盾與 15% 減傷）或偏進攻（全隊攻擊 +8 且攻擊附加 DoT）藥劑。',
    eventDesc: '【事件】背包「合成裝備」時，30% 機率保留其中一件小件材料或額外產出 20 金幣。'
  },
  druid: {
    id: 'leader_druid',
    role: 'druid',
    name: '群生號令',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；召喚物首次替隊友承受傷害時，為該隊友提供 10 點額外臨時護盾保護。',
    eventDesc: '【事件】遇到「寶箱怪」時解鎖「餵食安撫」選項，可免戰直接領取寶箱獎勵。'
  },
  paladin: {
    id: 'leader_paladin',
    role: 'paladin',
    name: '不屈誓約',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；指定隊友，抵擋一次致命傷害（受到致死打擊時生命保留 1 點）。',
    eventDesc: '【事件】「祭壇」解鎖專屬選項「聖光淨化」，免代價為全隊回復 30% 生命並附加 15 護盾。'
  },
  gladiator: {
    id: 'leader_gladiator',
    role: 'gladiator',
    name: '榮耀號角',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；成功存活離開角鬥場後，全隊獲得防守優勢（全隊防禦 +20%，持續 2 回合）。',
    eventDesc: '【事件】「賭博」解鎖押注生命值換雙倍獎勵；擊敗精英怪金幣掉落 +30%。'
  },
  stargazer: {
    id: 'leader_stargazer',
    role: 'stargazer',
    name: '星軌先見',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；預知下一次敵方特殊攻擊時機，並協助全體隊友技能冷卻減少 1 回合。',
    eventDesc: '【事件】每通過 3 層六角格，自動揭露前方一整列（所有格點）的所有真實事件。'
  },
  dreamweaver: {
    id: 'leader_dreamweaver',
    role: 'dreamweaver',
    name: '共夢契約',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；將一次指定隊友本回合受到的 50% 傷害延後至下一回合結算。',
    eventDesc: '【事件】在「流浪商人」或「賭博盲盒」中，可將裝備重塑為隨機同階配飾（含被動）。'
  },
  samurai: {
    id: 'leader_samurai',
    role: 'samurai',
    name: '拔刀號令',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；隊伍本場首次成功反擊後，讓一名隊友獲得一次額外普攻追擊機會。',
    eventDesc: '【事件】「重鑄」強化武器部位時，數值增幅從 +25% 提升至 +40%。'
  },
  sage: {
    id: 'leader_sage',
    role: 'sage',
    name: '預設解',
    type: 'PASSIVE',
    combatDesc: '【戰鬥】被動；每場戰鬥首次求解失利（未命中或思緒紊亂）時，自動重試一次演算判定。',
    eventDesc: '【事件】「賭博」金幣勝率從 50% 提升至 70%，且裝備盲盒碎裂機率降為 0%。'
  },
  augur: {
    id: 'leader_augur',
    role: 'augur',
    name: '命運宣告',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；一次性讓指定隊友的機率判定獲得絕對正面干涉（本回合免除命債代價）。',
    eventDesc: '【事件】踏入「奸商、寶箱怪、深淵」格前觸發預警，允許隊長重選同層其他相鄰格。'
  },
  onmyoji: {
    id: 'leader_onmyoji',
    role: 'onmyoji',
    name: '百鬼敕令',
    type: 'ACTIVE',
    combatDesc: '【戰鬥】主動；指定目標身上現存符咒，在下次自然脫落判定時全數保留。',
    eventDesc: '【事件】「祭壇」選擇褻瀆祭壇時完全免疫減防詛咒；深淵戰中封印隨從小怪首回合行動。'
  }
});

// ==========================================
// Module 5：深淵遭遇四階段對話庫
// ==========================================

export const ABYSS_DIALOGUES = {
  // 通用回答選項與戰鬥條件修正
  choices: [
    {
      id: 'apology',
      label: '誠摯道歉',
      text: '「我們當時別無選擇……對不起，請原諒我們。」',
      desc: '深淵魔化首領受到觸動，首回合攻擊力降低 30%。',
      atkMod: -0.30,
      defMod: 0
    },
    {
      id: 'rational',
      label: '冷靜理性',
      text: '「深淵已經侵蝕了你的心智，多說無益，請安息吧。」',
      desc: '維持正常戰鬥條件。',
      atkMod: 0,
      defMod: 0
    },
    {
      id: 'provoke',
      label: '拔刃挑釁',
      text: '「弱者才會把落選怪罪給世界，要戰便戰！」',
      desc: '激怒深淵首領，其首回合攻擊力提升 30%，但防禦與抗性降低 30%。',
      atkMod: 0.30,
      defMod: -0.30
    }
  ],
  // 各深淵職業階段台詞庫
  bossDialogues: {
    warrior: {
      stage1: '「……是你？隊長，好久不見了。自從那次在大廳分道揚鑣後，我就一直在這底層探索……」',
      stage2: '「為什麼……為什麼當初握劍守在門口的……不是我？為什麼被拋下的是我——！？」',
      stage3: '「這把染滿深淵黑血的巨劍，現在要將你們所有人……徹底碾碎！」',
      leaderDiff: {
        warrior: '「同為持盾揮劍之人，你憑什麼站在他們面前，而我卻只能在地底腐爛？！」',
        mage: '「你那孱弱的魔法能庇護誰？！站在前面流血的本該是我！」',
        paladin: '「偽善的聖光……我的鋼鐵壁壘才是一切！」'
      }
    },
    mage: {
      stage1: '「呵呵……你們終於來了。看啊，這座深淵裡流淌的奧術能量，比高塔上的更加純粹……」',
      stage2: '「你們嫌棄我不可控？嫌棄我的魔力太過危險？！現在……看看到底是誰不可控！！」',
      stage3: '「深淵的虛空裂隙已經向我敞開……你們一個也逃不掉！」',
      leaderDiff: {
        mage: '「你以為你的奧術算得上純粹？在深淵狂潮面前，你的法杖就像枯枝！」',
        warrior: '「無知的莽夫，你當初憑什麼決定誰能出發？！」'
      }
    },
    archer: {
      stage1: '「腳步聲太重了，隊長。我的箭尖……早就已經對準了你的喉嚨。」',
      stage2: '「選職那天，你們甚至沒有回頭看我一眼……我的箭矢在你們眼裡就這麼不值一提？！」',
      stage3: '「我的箭不會再射偏了……這一次，全部貫穿你們的心臟！」',
      leaderDiff: {
        archer: '「同行之間的較量……今天就讓你看清楚，誰才是百步穿楊的死神！」',
        assassin: '「藏在陰影裡的老鼠，別以為能逃過我的鷹眼！」'
      }
    },
    assassin: {
      stage1: '「別拔刀，隊長。在黑暗裡，我比你們更早熟悉這座迷宮的每一個死角。」',
      stage2: '「落單的滋味……你們體會過嗎？每一次呼吸都像利刃在肺裡攪動……」',
      stage3: '「既然不選我，那就成為我淬毒刀刃下的祭品吧！」',
      leaderDiff: {
        warrior: '「笨重的盔甲，救不了你這顆該死的心臟！」',
        assassin: '「暗影只認可最強的獵手……你根本不配匿蹤！」'
      }
    },
    bard: {
      stage1: '「啦啦啦……聽啊，隊長，這首深淵輓歌，是專門為你們譜寫的……」',
      stage2: '「琴弦斷了……被你們硬生生扯斷了！為什麼連一個位置都不肯分給我？！」',
      stage3: '「讓我們在瘋狂的旋律裡一同墜落吧……哈哈哈哈！！」',
      leaderDiff: {
        bard: '「聽聽看什麼才是真正的狂亂之曲！你的讚歌只配給死人陪葬！」',
        paladin: '「你那神聖的禱告，根本比不上深淵的哀號！」'
      }
    },
    alchemist: {
      stage1: '「看啊隊長，深淵的瘴氣與強酸……真是世間最完美的試劑原料……」',
      stage2: '「說我不穩定？！說我的藥劑會害死隊友？！現在我就讓你們嚐嚐什麼叫完美反應！」',
      stage3: '「所有試管都已經填滿……連同你們的骨血一起蒸餾吧！」',
      leaderDiff: {
        alchemist: '「你的調配比例簡直是兒戲！深淵的禁忌才是真正的真理！」'
      }
    },
    druid: {
      stage1: '「樹木在哭泣……隊長，自然早已經拋棄了這座地下城，連同我一起。」',
      stage2: '「古樹腐朽，群狼飢餓……你們離開時，可曾聽見我的咆哮？！」',
      stage3: '「狂暴的深淵之靈……撕碎這些背信棄義的人！」',
      leaderDiff: {
        druid: '「偽善的自然守護者！腐化的狂獸才是進化的終點！」'
      }
    },
    paladin: {
      stage1: '「聖光在這裡早已熄滅……隊長，不要再用那種眼神看著我。」',
      stage2: '「我曾發誓守護隊伍……但隊伍在哪裡？！你們拋棄誓約時，聖光就在嘲笑我！」',
      stage3: '「現在……以深淵的黑蝕聖盾，制裁你們的罪孽！」',
      leaderDiff: {
        paladin: '「榮耀？正義？你握緊聖徽的手……不覺得虛偽嗎？！」'
      }
    },
    gladiator: {
      stage1: '「熱血在沸騰啊隊長！在深淵的鬥技場裡，我每一天都在等待這場決鬥！」',
      stage2: '「不選我上場？！把最強的戰士留在冷板凳上腐爛？！不可原諒！！」',
      stage3: '「踏入我的深淵角鬥場……今天只有一個人能站著走出去！」',
      leaderDiff: {
        warrior: '「把你的重盾扔掉！像個真正的角鬥士一樣跟我用血肉互毆！」',
        gladiator: '「王座只有一個，唯有更嗜血的野獸才能活著加冕！」'
      }
    },
    stargazer: {
      stage1: '「星辰早已熄滅，隊長……深淵黑洞的視界邊緣，才是宇宙唯一的真相。」',
      stage2: '「你們以為天眼看見的是希望？我看見的……只有你們離去的冷漠背影！」',
      stage3: '「引力坍縮……讓時間與你們的生命一同停止！」',
      leaderDiff: {
        stargazer: '「你的星軌算錯了……黑洞才是萬物的歸宿！」'
      }
    },
    dreamweaver: {
      stage1: '「這是一個夢，隊長……一個你們永遠無法醒來的深淵噩夢。」',
      stage2: '「美夢留給了你們……惡夢全部留給了我！這公平嗎？！回答我！！」',
      stage3: '「在虛構的現實裡自相殘殺吧……這是你們應得的下場！」',
      leaderDiff: {
        dreamweaver: '「看清楚了，誰的織機能編出更殘忍的幻象！」'
      }
    },
    samurai: {
      stage1: '「……刀已出鞘。隊長，在迷宮的黑暗中，村雨的渴望從未停歇。」',
      stage2: '「武士的榮耀被你們踐踏在腳下……沒有出發的拔刀，比死更加屈辱！」',
      stage3: '「秘劍・燕返……這一次，斬斷的是我們昔日的羈絆！」',
      leaderDiff: {
        samurai: '「居合對決！今天用你的刀，來洗刷當日落選之恥！」'
      }
    },
    onmyoji: {
      stage1: '「符咒在黑夜中飄落，隊長……你們身上的生氣，真是讓人垂涎啊。」',
      stage2: '「陰陽失衡，百鬼夜行……把我留在陽世之外，你們就該料到這一天！」',
      stage3: '「急急如律令！百鬼血咒，將你們的魂魄全數拘入深淵！」',
      leaderDiff: {
        onmyoji: '「你的道術太過稚嫩！真正的咒印，是用怨恨血肉刻下的！」'
      }
    },
    sage: {
      stage1: '「演算的終點是發散的……隊長，你們的世界模型從一開始就是錯的。」',
      stage2: '「邏輯不會說謊！數學不會出錯！唯一錯誤的……就是你們不選擇我的決定！！」',
      stage3: '「錯誤演算無可逆轉……現在，讓我為你們的世界寫下【無解證明】！」',
      leaderDiff: {
        sage: '「你算出的解全都是謬誤！在絕對誤差面前，你的公理不堪一擊！」'
      }
    }
  }
};
