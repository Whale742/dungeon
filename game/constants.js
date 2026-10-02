// 遊戲常數與數值定義 (100% 完整移植自 index.js)

export const CLASSES = {
  warrior: {
    name: '戰士',
    emoji: '🛡️',
    avatar: '/photo/Warrior.webp',
    maxHp: 120,
    desc: '【生命 120】前排坦鋒。具備強大的守護壁壘，全技能皆為物理傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', desc: '【物理】揮動武器打擊（傷害: 10）' },
      { id: 'w_strike', label: '堅定斬擊', cd: 0, dmgType: 'phys', desc: '【物理】堅定重斬（傷害: 15，無CD）' },
      { id: 'w_shield', label: '壁壘守護', cd: 2, desc: '第1回合阻擋90%傷害，第2回合阻擋40%，第3回合失效（需休息2回合）' }
    ]
  },
  mage: {
    name: '法師',
    emoji: '🧙‍♂️',
    avatar: '/photo/Mage.webp',
    maxHp: 80,
    desc: '【生命 80】遠程法系。站樁高爆發與生命汲取，全技能皆為魔法傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'mag', desc: '【魔法】引導微光魔法打擊（傷害: 10）' },
      { id: 'm_blast', label: '奧術爆破', cd: 1, dmgType: 'mag', desc: '【魔法】引爆奧術轟出巨額傷害（傷害: 40，需休息1回合）' },
      { id: 'm_drain', label: '生命汲取', cd: 1, dmgType: 'mag', desc: '【魔法】造成 15~20 傷害，吸取該傷害 20% 生命（需休息1回合）' }
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
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', desc: '【物理】拉弓射出基礎箭矢（傷害: 10）' },
      { id: 'a_shot', label: '精準狙擊', cd: 1, dmgType: 'phys', desc: '【物理】百步穿楊狙擊（傷害: 30，需休息1回合）' },
      { id: 'a_rain', label: '箭雨壓制', cd: 1, dmgType: 'mag', desc: '【魔法】附魔箭雨壓制（傷害: 20，削弱怪物 10 點攻擊，需休息1回合）' }
    ]
  },
  assassin: {
    name: '刺客',
    emoji: '🗡️',
    avatar: '/photo/Assassin.webp',
    maxHp: 60,
    critRate: 0.5,
    vulnerableMod: 1.25,
    desc: '【生命 60】近戰爆發。自帶 50% 暴擊，全技能皆為物理傷害。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'phys', desc: '【物理】揮動雙匕進行基本切削（傷害: 10）' },
      { id: 's_stab', label: '暗影刺殺', cd: 1, dmgType: 'phys', desc: '【物理】背刺（傷害 30，暴擊造成 60 且暴擊時無CD；未暴擊需休息1回合）' },
      { id: 's_smoke', label: '煙霧匿蹤', cd: 2, desc: '隱入陰影避開本回合攻擊，但下次攻擊無法暴擊（需休息2回合）' }
    ]
  },
  bard: {
    name: '吟遊詩人',
    emoji: '🪕',
    avatar: '/photo/Bard.webp',
    maxHp: 70,
    desc: '【生命 70】團隊核心輔助。普攻為魔法傷害，精通全體群療、增傷減傷與奇蹟甦生。',
    skills: [
      { id: 'basic', label: '普通攻擊', cd: 0, dmgType: 'mag', desc: '【魔法】撥動琴弦引導音波魔法打擊（傷害: 10）' },
      { id: 'b_heal', label: '治癒頌歌', cd: 1, desc: '全體回血，指定一名隊友額外回復生命（需休息1回合）' },
      { id: 'b_buff', label: '狂熱協奏', cd: 1, desc: '激勵全隊：增傷 50%、減傷 25%，且削弱敵方雙抗至 65%（需休息1回合）' }
    ]
  },
  alchemist: {
    name: '鍊金術士',
    emoji: '⚗️',
    avatar: '/photo/Alchemist.webp',
    maxHp: 75,
    desc: '【生命 75】神秘調和者。精通強酸爆破、劇毒煙霧與命運試劑，全技能與普攻皆為魔法傷害。',
    skills: [
      { id: 'basic', label: '基礎打擊', cd: 0, dmgType: 'mag', desc: '【魔法】基礎藥杵打擊（傷害: 10）' },
      { id: 'alc_acid', label: '1技A: 腐蝕強酸瓶', cd: 0, dmgType: 'mag', desc: '【魔法】擲出強酸（傷害: 40，自身受15點自傷，無CD）' },
      { id: 'alc_poison', label: '1技B: 劇毒煙霧瓶', cd: 0, dmgType: 'mag', desc: '【魔法】引爆毒霧（傷害: 20，自身自傷5點，敵我皆陷入劇毒2回合各受3點毒傷，無CD）' },
      { id: 'alc_fate', label: '2技: 命運煉成試劑', cd: 2, desc: '立即驅散我方全體負面效果(流血/中毒)。50%大成功(全員回血40+2回合70%減傷)；50%失敗(全員回血10+下回合全隊受傷+20%)（CD 2）' }
    ]
  },
  druid: {
    name: '德魯伊',
    emoji: '🍃',
    avatar: '/photo/Druid.webp',
    maxHp: 85,
    desc: '【生命 85】自然之子。擅長形態轉變（狼人/樹精）與自然呼喚僕從（小樹精/幼狼）。',
    skills: [
      { id: 'basic', label: '基礎打擊', cd: 0, dmgType: 'phys', desc: '【物理】自然法杖揮擊（傷害: 10）' },
      { id: 'dru_transform', label: '1技: 形態轉變', cd: 0, desc: '持續2回合(結束後才可再次變身)：50%狼人(扣20HP/全傷+20/立即30傷強化普攻；遇暗影魔狼族長臣服)；50%樹精(生命+60/全傷-5/替全隊吸收50%受傷)' },
      { id: 'dru_summon_treant', label: '2技A: 呼喚小樹精', cd: 2, desc: '【自然呼喚】召喚小樹精(HP 15 / 攻擊 1)，每回合自動攻擊並優先替全隊擋下怪物彈射傷害（共用CD 2）' },
      { id: 'dru_summon_wolf', label: '2技B: 呼喚幼狼', cd: 2, desc: '【自然呼喚】召喚幼狼(HP 5 / 攻擊 10)，每回合自動攻擊並優先替全隊擋下怪物彈射傷害（共用CD 2）' }
    ]
  }
};

// 裝備池 (12種)
export const LOOT_TABLE = [
  { role: 'warrior', name: '重鋼巨劍', bonusAtk: 12, desc: '戰士攻擊傷害 +12' },
  { role: 'warrior', name: '荊棘重鎧', bonusHp: 30, desc: '戰士最大生命值 +30' },
  { role: 'mage', name: '虛空魔杖', bonusAtk: 15, desc: '法師攻擊傷害 +15' },
  { role: 'mage', name: '大魔導護符', bonusHp: 20, desc: '法師最大生命值 +20' },
  { role: 'archer', name: '破甲獵弓', bonusAtk: 12, desc: '弓箭手狙擊傷害 +12' },
  { role: 'archer', name: '靈巧披風', bonusHp: 20, desc: '弓箭手最大生命值 +20' },
  { role: 'assassin', name: '染毒刺刃', bonusAtk: 10, desc: '刺客基礎攻擊 +10（暴擊時翻倍）' },
  { role: 'assassin', name: '暗影皮甲', bonusHp: 25, desc: '刺客最大生命值 +25' },
  { role: 'bard', name: '精靈木豎琴', bonusAtk: 10, desc: '詩人音律傷害 +10' },
  { role: 'bard', name: '祝福絲綢袍', bonusHp: 25, desc: '詩人最大生命值 +25' },
  { role: 'alchemist', name: '賢者燒瓶', bonusAtk: 12, desc: '鍊金術士藥劑傷害 +12' },
  { role: 'druid', name: '荒野守護符', bonusHp: 30, desc: '德魯伊最大生命值 +30' }
];

// 怪物庫 (10種)
export const ENCOUNTERS = [
  { 
    name: '地底熔岩巨像', 
    avatar: '/BOSS/Lava Colossus.webp',
    hp: 100, 
    desc: '巨石與高溫熔岩構成的巨像，岩石外殼極為厚重！', 
    attack: 10,
    resistance: 'phys',
    ultName: '崩山滅世重砸'
  },
  { 
    name: '暗影魔狼族長', 
    avatar: '/BOSS/Shadow Wolf Alpha.webp',
    hp: 70, 
    desc: '動作敏捷的狼王，周身幽暗的暗影能量流動！', 
    attack: 5,
    resistance: 'mag',
    ultName: '血影狂暴撕裂'
  },
  { 
    name: '古代守護魔偶', 
    avatar: '/BOSS/Ancient Guardian Golem.webp',
    hp: 120, 
    desc: '鋼鐵機體具備堅固的物理防禦壁壘！', 
    attack: 15,
    resistance: 'phys',
    ultName: '過載超導電弧'
  },
  { 
    name: '赤月嗜血巫師', 
    avatar: '/BOSS/Blood Moon Sorcerer.webp',
    hp: 100, 
    desc: '赤月能量構築出強大的魔法護盾！', 
    attack: 15,
    resistance: 'mag',
    ultName: '赤月血幕絕罰'
  },
  { 
    name: '深淵腐蝕巨蟒', 
    avatar: '/BOSS/Abyssal Corrosive Serpent.webp',
    hp: 110, 
    desc: '毒沼中的巨蟒，體表黏液對元素魔法有極高抗性！', 
    attack: 12,
    resistance: 'mag',
    ultName: '滅絕劇毒狂湧'
  },
  { 
    name: '霜骨亡靈騎士', 
    avatar: '/BOSS/Frostbone Death Knight.webp',
    hp: 120, 
    desc: '身披玄鐵重鎧的古老騎兵，刀槍難入！', 
    attack: 14,
    resistance: 'phys',
    ultName: '寒霜斷頭烈斬'
  },
  { 
    name: '迷宮食腐暴食魔', 
    avatar: '/BOSS/Labyrinth Glutton Demon.webp',
    hp: 160, 
    desc: '體型龐大且長滿利齒的惡臭憎惡，飢渴地撲向生者！', 
    attack: 8,
    resistance: 'none',
    ultName: '吞天噬地暴嚼'
  },
  { 
    name: '幻惑幽魂歌姬', 
    avatar: '/BOSS/Spectral Banshee.webp',
    hp: 80, 
    desc: '純粹的精神虛無體，一般法術難以侵蝕其心智！', 
    attack: 16,
    resistance: 'mag',
    ultName: '亡靈攝魂尖叫'
  },
  { 
    name: '結晶守護巨蠍', 
    avatar: '/BOSS/Crystal Guardian Scorpion.webp',
    hp: 115, 
    desc: '紫晶甲殼堅不可摧，擅長彈開物理兵刃！', 
    attack: 13,
    resistance: 'phys',
    ultName: '晶化貫通連刺'
  },
  { 
    name: '煉獄炎獄行者', 
    avatar: '/BOSS/Infernal Hellstrider Demon.webp',
    hp: 145, 
    desc: '自地心火海中爬出的惡魔，氣息粗暴凶悍！', 
    attack: 13,
    resistance: 'none',
    ultName: '末日天火焚世'
  }
];

export const ROUTES = [
  { id: 'route_trail', name: '羊腸小徑', icon: '🐾', desc: '狹窄蜿蜒的碎石土徑，兩側灌木叢生，隱藏著未知足跡' },
  { id: 'route_stream', name: '沿著溪流', icon: '🌊', desc: '伴隨潺潺水聲前行，清澈溪水下隱約折射出奇異光芒' },
  { id: 'route_stars', name: '跟隨星星', icon: '✨', desc: '微光指引前路，星辰排列出的古老軌跡指引著未知方向' },
  { id: 'route_cave', name: '洞穴深處', icon: '🪨', desc: '深邃陰暗的地下岩洞，冷風夾雜著遠古生物的低鳴' },
  { id: 'route_forest', name: '森林深處', icon: '🌲', desc: '古木參天的幽暗密林，密不透光的樹冠下瀰漫著神秘霧氣' },
  { id: 'route_house', name: '隱約的房屋', icon: '🏚️', desc: '霧氣深處隱約浮現陳舊石屋的輪廓，門窗緊閉卻似有人影' }
];

// 每次從 6 個選項中隨機挑選 4 個
export function getRandomRoutes(count = 4) {
  const shuffled = [...ROUTES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function equipItemToPlayer(player, drop) {
  player.equipCounts[drop.name] = (player.equipCounts[drop.name] || 0) + 1;
  if (drop.bonusAtk) player.bonusAtk += drop.bonusAtk;
  if (drop.bonusHp) {
    player.maxHp += drop.bonusHp;
    player.hp += drop.bonusHp;
  }
}

export function formatPlayerEquips(player) {
  const entries = Object.entries(player.equipCounts || {});
  if (entries.length === 0) return '';
  const list = entries.map(([name, count]) => count > 1 ? `${name} x${count}` : name);
  return ` [裝備: ${list.join(', ')}]`;
}
