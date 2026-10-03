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
      { id: 'w_strike', label: '堅定斬擊', cd: 0, dmgType: 'phys', desc: '【物理】堅定重斬（80%造成18傷害；20%揮砍失衡僅造成5傷害且下回合自身受傷+20%，無CD）' },
      { id: 'w_shield', label: '壁壘守護', cd: 2, desc: '【防護】阻擋90%傷害（25%盾牌龜裂CD額外延長1回合），第2回合阻擋40%（CD 2）' }
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
      { id: 'm_blast', label: '奧術爆破', cd: 1, dmgType: 'mag', desc: '【魔法】奧術轟擊（75%造成45傷害；25%法力走火造成10傷害且自身承受10點反噬傷害，CD 1）' },
      { id: 'm_drain', label: '生命汲取', cd: 1, dmgType: 'mag', desc: '【魔法】極端浮動吸血（造成 1~40 浮動傷害，吸取該傷害 20% 生命，CD 1）' }
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
      { id: 'a_shot', label: '精準狙擊', cd: 1, dmgType: 'phys', desc: '【物理】破甲狙擊（80%造成35傷害；20%箭矢脫靶造成0傷害且自身下回合失去閃避率，CD 1）' },
      { id: 'a_rain', label: '箭雨壓制', cd: 1, dmgType: 'mag', desc: '【魔法】箭雨壓制（造成20傷害並削弱怪物10點攻擊；20%狂風亂流誤傷隨機存活隊友10傷害，CD 1）' }
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
      { id: 'b_heal', label: '治癒頌歌', cd: 1, desc: '【生命頌歌】（80%回復全體22/專注目標額外28；20%刺耳走音全體僅能回復5生命，CD 1）' },
      { id: 'b_buff', label: '狂熱協奏', cd: 1, desc: '【激勵樂章】全隊增傷50%、減傷25%並削弱抗性；25%狂熱透支結算時全體隊友各扣5點生命（CD 1）' }
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
      { id: 'alc_poison', label: '1技B: 劇毒煙霧瓶', cd: 0, dmgType: 'mag', desc: '【魔法】引爆毒霧（傷害: 30，自身自傷5點，敵我皆陷入劇毒2回合各受5點毒傷，無CD）' },
      { id: 'alc_fate', label: '2技: 命運煉成試劑', cd: 2, desc: '立即驅散我方全體負面效果(流血/中毒)。若自身有異常狀態：50%大成功(全員回血40+2回合70%減傷) / 50%失敗(全員回血10+下回合全隊受傷+20%)；若自身無異常狀態：效果轉為全員穩定回復15點生命（無反噬，CD 2）' }
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
      { id: 'dru_transform', label: '1技: 形態轉變', cd: 0, desc: '持續2回合(結束後才可再次變身)：50%狼人(扣20HP/全傷+20/立即30傷強化普攻；遇暗影魔狼族長臣服)；50%樹精(生命+100/減傷20%/每回合初自癒5HP(勝場可加成)/替全隊吸收50%受傷/致命傷免死化為樹木1回合)' },
      { id: 'dru_summon_treant', label: '2技A: 呼喚小樹精', cd: 2, desc: '【自然呼喚】召喚小樹精(HP 15 / 攻擊 1)，每回合自動攻擊並優先替全隊擋下怪物彈射傷害（共用CD 2）' },
      { id: 'dru_summon_wolf', label: '2技B: 呼喚幼狼', cd: 2, desc: '【自然呼喚】召喚幼狼(HP 5 / 攻擊 10)，每回合自動攻擊並優先替全隊擋下怪物彈射傷害（共用CD 2）' }
    ]
  }
};

// 完整重構裝備池 (共 19 種專屬裝備)
export const LOOT_TABLE = [
  // 戰士 (Warrior)
  {
    id: 'w_sword',
    role: 'warrior',
    name: '鋼鐵聖劍',
    bonusAtk: 5,
    desc: '攻擊傷害 +5'
  },
  {
    id: 'w_armor',
    role: 'warrior',
    name: '荊棘重鎧',
    bonusHp: 30,
    bonusAtk: -5,
    desc: '最大生命 +30，但造成的傷害 -5'
  },
  {
    id: 'w_greatsword',
    role: 'warrior',
    name: '雙手劍',
    isSpecial: true,
    desc: '原本2技能護盾失效，替換為攻擊技能【狂怒重劈】；1技能與2技能基礎傷害分別提升為 25 與 40'
  },

  // 法師 (Mage)
  {
    id: 'm_wand',
    role: 'mage',
    name: '虛空魔杖',
    bonusAtk: 15,
    desc: '法師攻擊傷害 +15'
  },
  {
    id: 'm_amulet',
    role: 'mage',
    name: '大魔導護符',
    bonusHp: 20,
    desc: '法師最大生命值 +20'
  },
  {
    id: 'm_robe',
    role: 'mage',
    name: '嗜血法袍',
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
    bonusAtk: 12,
    desc: '弓箭手攻擊傷害 +12'
  },
  {
    id: 'a_cloak',
    role: 'archer',
    name: '靈巧披風',
    bonusHp: 20,
    desc: '弓箭手最大生命值 +20'
  },
  {
    id: 'a_archangel_bow',
    role: 'archer',
    name: '大天使重弓',
    bonusAtk: 20,
    dodgePenalty: 0.20,
    desc: '攻擊傷害 +20，但閃避機率降低 20%'
  },

  // 刺客 (Assassin)
  {
    id: 's_blade',
    role: 'assassin',
    name: '染毒刺刃',
    bonusAtk: -10,
    bonusCrit: 0.30,
    desc: '基礎傷害 -10，但暴擊率提升 30%'
  },
  {
    id: 's_armor',
    role: 'assassin',
    name: '暗影皮甲',
    bonusHp: -10,
    bonusDodge: 0.10,
    desc: '閃避機率 +10%，最大生命 -10'
  },

  // 吟遊詩人 (Bard)
  {
    id: 'b_harp',
    role: 'bard',
    name: '精靈木豎琴',
    isSpecial: true,
    desc: '1技能與2技能的效果數值皆提升 10%'
  },
  {
    id: 'b_robe',
    role: 'bard',
    name: '祝福絲綢袍',
    bonusHp: 15,
    isSpecial: true,
    desc: '最大生命 +15。每回合初自動為全隊當前生命最低的隊友補血，補血量為詩人最大生命值的 5%'
  },
  {
    id: 'b_violin',
    role: 'bard',
    name: '精靈木提琴',
    bonusAtk: 10,
    isSpecial: true,
    desc: '攻擊傷害 +10。原本1、2技能失效，1技能替換為【催眠夜曲】(15傷害+30%機率使敵方本回合無法行動)；2技能替換為【狂亂殺戮曲】(20傷害，我方全體下回合扣20%最大生命，但全隊傷害提升70%)'
  },

  // 鍊金術士 (Alchemist)
  {
    id: 'alc_flask',
    role: 'alchemist',
    name: '賢者燒瓶',
    bonusAtk: 12,
    desc: '藥劑傷害 +12'
  },
  {
    id: 'alc_robe',
    role: 'alchemist',
    name: '防護生化袍',
    bonusHp: 20,
    desc: '最大生命 +20'
  },
  {
    id: 'alc_burette',
    role: 'alchemist',
    name: '精密滴定管',
    isSpecial: true,
    desc: '1技能對自身造成的反噬傷害降低 50%，但2技能失敗機率提高至 75%'
  },

  // 德魯伊 (Druid)
  {
    id: 'dru_amulet',
    role: 'druid',
    name: '荒野守護符',
    bonusHp: 30,
    desc: '德魯伊最大生命值 +30'
  },
  {
    id: 'dru_resonance',
    role: 'druid',
    name: '自然共鳴',
    isSpecial: true,
    desc: '每回合初為所有存活僕從回復 3 點生命；小樹精最大生命 +5；幼狼造成傷害 +2'
  }
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
  { id: 'route_house', name: '破舊古宅', icon: '🏚️', desc: '地底深處廢棄莊園，門窗緊閉，隱約散發著詭異不詳的氣息' }
];

// 專屬開場與選路文本庫
export const STORY_TEXTS = {
  prologue: {
    title: '【深淵啟程・命運之扉開啟】',
    paragraphs: [
      '厚重的黑曜石大門在刺耳的摩擦聲中緩緩敞開，古老腐朽的塵埃隨之撲面而來。',
      '火把微弱的橘光照亮了腳下斑駁的石階，空氣中瀰漫著潮濕的青苔、生鏽鐵器與隱約的血腥氣味。',
      '身後的退路已被封死，冒險小隊握緊了手中的武器與符文，深吸一口氣，正式踏入這座沉睡千年的深淵地城！'
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
        if (role === 'archer') return `🏹 **${name}** 抽箭搭弦如滿月，離弦之箭撕裂空氣，化作一道白芒直刺魔物身軀！`;
        if (role === 'assassin') return `🗡️ **${name}** 身形如鬼魅般晃動，短匕如冷月寒芒，在魔物關節間切劃出凌厲傷痕！`;
        if (role === 'bard') return `🪕 **${name}** 輕巧撥動琴弦，激發出一道淡金色微光音波，穿透空氣打擊魔物！`;
        if (role === 'alchemist') return `⚗️ **${name}** 揮舞青銅研磨杵，帶著滾燙的藥劑殘渣狠狠砸向魔物！`;
        if (role === 'druid') {
          if (player.druidForm === 'werewolf') return `🐺 狼人形態下的 **${name}** 雙眼血紅，鋒利的利爪撕裂空氣狂暴抓向魔物！`;
          if (player.druidForm === 'treant') return `🌳 樹精形態下的 **${name}** 揮動粗壯的古木藤蔓，沉重地甩向魔物！`;
          return `🍃 **${name}** 揮動自然法杖，召喚林地原始的狂風重擊魔物！`;
        }
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
        return `🏹 **${name}** 朝地窟穹頂射出附魔光矢，光矢在空中分裂為漫天箭雨，暴雨般傾瀉而下壓制魔物凶焰！`;
      case 's_stab':
        if (extra.isCrit) {
          return `💥 **${name}** 抓住魔物轉瞬即逝的破綻瞬步突刺，染血利刃精準捅入最脆弱的心臟死穴！暴擊骨肉撕裂！`;
        }
        return `🗡️ **${name}** 踏著無聲步伐瞬移至魔物盲點，短匕如毒蛇出洞，狠狠刺入魔物要害！`;
      case 's_smoke':
        return `💨 **${name}** 擲出特製的暗影煙霧彈，滾滾黑煙瞬間瀰漫，其身形融於黑暗陰影之中避開所有反擊！`;
      case 'b_heal':
        return `🪕 **${name}** 撫琴奏響空靈聖潔的生命頌歌，溫潤如春雨的七彩光環籠罩全場，溫暖的光輝撫平了隊員們的創傷！`;
      case 'b_buff':
        return `🪕 **${name}** 琴音節奏驟然激昂高亢，戰意如烈火般燃燒！刺耳的共振聲波震顫著魔物身軀，撕裂其護甲防線！`;
      case 'b_revive':
        return `🕊️ **${name}** 唱響禁忌的甦生之曲，奇蹟的金光刺破死氣，將瀕死的隊友自深淵邊緣喚回人間！`;
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
  if (item.bonusAtk) player.bonusAtk += item.bonusAtk;
  if (item.bonusHp) {
    player.maxHp += item.bonusHp;
    if (item.bonusHp > 0) {
      player.hp += item.bonusHp;
    } else {
      player.hp = Math.min(player.hp, player.maxHp);
      player.hp = Math.max(1, player.hp);
    }
  }
}

// 卸除裝備數值扣減
export function removeEquipStats(player, item) {
  if (!player || !item) return;
  if (item.bonusAtk) player.bonusAtk -= item.bonusAtk;
  if (item.bonusHp) {
    player.maxHp -= item.bonusHp;
    player.hp = Math.min(player.hp, player.maxHp);
    player.hp = Math.max(1, player.hp);
  }
}

// 穿上裝備（支援上限 3 件與指定位置替換）
export function equipItemToPlayer(player, drop, replaceIndex = -1) {
  if (!player) return null;
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
  const equips = player.equips || [];

  if (player.role === 'warrior') {
    const hasGreatsword = equips.some(e => e.id === 'w_greatsword' || e.name === '雙手劍');
    if (hasGreatsword) {
      const s1 = baseSkills.find(s => s.id === 'w_strike');
      if (s1) {
        s1.desc = '【物理】雙手巨劍堅定重斬（80%造成25重傷害；20%揮砍失衡僅造成5傷害且下回合自身受傷+20%，無CD）';
      }
      const idx2 = baseSkills.findIndex(s => s.id === 'w_shield');
      if (idx2 !== -1) {
        baseSkills[idx2] = {
          id: 'w_cleave',
          label: '狂怒重劈',
          cd: 2,
          dmgType: 'phys',
          desc: '【物理】狂暴揮動雙手巨劍重劈魔物（基礎傷害: 40，CD 2）'
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
          desc: '【魔法】幽邃催眠曲（造成15傷害，30%機率使敵方本回合陷入沉睡無法行動，CD 1）'
        };
      }
      const idx2 = baseSkills.findIndex(s => s.id === 'b_buff');
      if (idx2 !== -1) {
        baseSkills[idx2] = {
          id: 'b_frenzy',
          label: '狂亂殺戮曲',
          cd: 1,
          dmgType: 'mag',
          desc: '【魔法】狂亂殺戮樂章（造成20傷害，全隊傷害暴增70%，但下回合全隊扣除20%最大生命，CD 1）'
        };
      }
    }
  }

  return baseSkills;
}

