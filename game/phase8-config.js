// Data consumed by the existing constants/config owners.
const skill = (id, label, cd, dmgType, desc, category = 'OFFENSIVE') => ({ id, label, cd, dmgType, desc, category,
  tags: [dmgType === 'mag' ? '魔法' : dmgType === 'phys' ? '物理' : '輔助'] });
export const NEW_CLASSES = {
  dreamweaver: { name: '織夢術士', avatar: '/photo/Dreamweaver.webp', maxHp: 75,
    desc: '夢境纖維扭轉傷害與現實。', passive: '普通攻擊有 50% 機率使魔物混亂 1 回合：鏡像交換物魔抗性；解離承傷 +10%；夢魘虛弱暫降當前與最大生命 10%；狂亂反噬傷害 +10%。四種等機率。',
    skills: [skill('basic', '夢境纖維', 0, 'mag', '10 魔法傷害；50% 使魔物陷入隨機混亂。'),
      skill('dw_butterfly', '夢蝶振翅', 2, null, '指定隊友或魔物，持續 1 回合。每次傷害有 60% 轉為等額治療，40% 化為無視抗性的真實傷害。', 'BUFF'),
      skill('dw_false_dream', '虛構歷史', 3, null, '魔物 1 回合計算覆寫：淺夢為樓層區段起點，深夢為終點，孤影為存活人數 -3（至少 1），群影為存活人數 +3；等機率。', 'DEBUFF')] },
  stargazer: { name: '觀星者', avatar: '/photo/Stargazer.webp', maxHp: 70,
    desc: '探索深空，重塑星軌與時間。', passive: '無隨機普攻被動。三件望遠鏡零件必須同時裝備，才能啟動克卜勒的深空天眼。',
    skills: [skill('basic', '星光引導', 0, 'mag', '10 魔法傷害。'),
      skill('sg_observe', '天體觀測・深空探索', 2, 'mag', '恆星 60%：15 魔法；行星 10%：25 魔法、10% 當輪暈眩；銀河 10%：全隊每次合法命中 +5（1 回合）；黑洞 10%：全場存活者 5 真傷；邊界 10%：最低當前生命隊友鎖血 1（1 回合）。天眼改為四種各 25%：行星 35／30% 暈眩、銀河 +10、黑洞僅魔物 10 真傷、邊界另滿血並抵擋一次致命傷。', 'BUFF'),
      skill('sg_clock', '星軌干涉・時計重塑', 3, null, '70% 存活全隊冷卻 -1；10% 冷卻歸零；10% 超負荷（技能基礎傷害 +5，1 回合，冷卻中的技能 +1）；10% 無效果。', 'BUFF')] },
  gladiator: { name: '角鬥士', avatar: '/photo/Gladiator.webp', maxHp: 85,
    desc: '以鮮血積累怒氣，挑戰死亡競技場。', passive: '實際受傷獲得 1 怒氣，每回合最多一次。鮮血獻祭另獲 1 怒氣。競技場只允許自己與魔物行動，雙方忽略減傷；自己的最大與當前生命按 0.6 ×（隊伍人數 +1）等比例縮放，退出依剩餘生命比例恢復。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理傷害。'),
      skill('g_sacrifice', '鮮血獻祭', 0, null, '支付 20 真實生命（無視護盾、減傷），怒氣 +1。競技場改為造成 15 + 人數 ×10 + 怒氣 ×25 物理傷害。', 'BUFF'),
      skill('g_arena', '死鬥宣告', 3, null, '本回合宣告，下回合進入競技場 1 回合。場內改為同歸於盡：消耗全部生命，造成消耗生命 + 怒氣 ×10 傷害並死亡；同層不能甦生，下層正常復活。', 'BUFF')] },
  samurai: { name: '武士', avatar: '/photo/武士.webp', maxHp: 80,
    desc: '以居合招架積累劍魂，施展秘劍燕返。', passive: '劍魂上限 8。每回合第一個敵方直接攻擊判定 40% 鏡頭：失敗後不再判定；成功則本輪後續直接攻擊全部招架，每輪進入鏡頭劍魂 +1。每次主動攻擊（反擊、燕返除外）劍魂 +1。敵方階段結束統一反擊 10 + 招架次數。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理傷害，劍魂 +1。'),
      skill('sa_cut', '一刀兩斷', 1, 'phys', '15 物理；施放前劍魂為 0 時，本輪招架率 70%；有魂則以 30% + 每魂 5%（最高 70%）機率倍傷。'),
      skill('sa_tsubame', '秘劍・燕返', 0, 'phys', '需要至少 4 劍魂，消耗 4；四次各 10 物理傷害，忽略物理抗性。一次行動，四次命中。')] },
  sage: { name: '智者', avatar: '/photo/智者.webp', maxHp: 70,
    stateHint:'假設建立基數；求解後於回合末解析方程。',
    desc: '兩輪演算，以假設與求解建立方程。', passive: '開戰 X=10，每兩回合一循環，Operand 隨機整數 1–30。A 輪假設、B 輪求解，B 輪末 Equation=round(abs(Operand × (0.25 + 1.75X/(X+80))))，獨立物理事件。偶數：全隊方程傷害 40% 護盾 1 回合，完全未破時餘盾 20% 轉下循環基數；奇數：方程穿透物抗，下輪魔物承傷 +10%；質數：另 15 真傷、智者 CD 歸零；完全平方數：下輪魔物直接傷害 -25%。屬性全部疊加。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理；假設時 Operand=實傷，求解時 +2。方程後：60% 成功 X+=Operand，15% 混亂 X×0.75（至少 10），25% 無效。'),
      skill('sge_deduce', '演繹推理', 1, 'phys', '10 物理，50% 穿透物抗。假設時 Operand+=實傷，求解 +5；方程後 50% 成功 X+=Operand，25% 混亂 -25%，25% 無效。'),
      skill('sge_induce', '歸納證明', 1, 'phys', '10 物理；假設時記錄基數，直到本輪末僅魔物直接傷害累加 Operand；求解時 Operand×2。方程後 40% 成功 X+=Operand/4，35% 混亂 -25%，25% 無效。')] }
};
const item = (id, role, name, desc, stats = {}, unique = false) => ({ id, role, name, desc, ...stats, unique });
export const NEW_LOOT = [
  item('dw_spindle','dreamweaver','命運的紡錘','混亂機率提升至 75%。',{},true),
  item('dw_loom','dreamweaver','莫比烏斯的織機','全隊最大生命 +20；隊友受到惡夢傷害後回復該隊友最大生命 5%。可疊加。'),
  item('dw_history','dreamweaver','偽史古卷','自己施加的夢境狀態持續 +1 回合。',{},true),
  item('sg_eyepiece','stargazer','粗糙研磨的黃銅目鏡','生命 +3、魔法 +1；天眼零件。',{bonusHp:3,bonusAtk:1}),
  item('sg_tube','stargazer','生鏽卡死的伸縮鏡筒','魔法 +1；天眼零件。',{bonusAtk:1}),
  item('sg_mount','stargazer','傾角失準的赤道儀基座','生命 +5；天眼零件。',{bonusHp:5}),
  item('sg_cloak','stargazer','流浪占星師的粗呢斗篷','生命 +10。',{bonusHp:10}),
  item('sg_watch','stargazer','赫密斯的星盤懷錶','魔法 +6。',{bonusAtk:6}),
  item('sg_bracer','stargazer','墜星隕鐵護腕','魔法 +10。',{bonusAtk:10}),
  item('g_xiphos','gladiator','斯巴達短劍','每次鮮血獻祭累積獻血：每層物理 +2，競技場結束清空；完全免疫腐蝕。',{},true),
  item('g_cuirass','gladiator','染血胸甲','生命 +35；生命低於 30 時獻祭後受療 +20% 持續 2 回合。被動不疊加、免疫腐蝕，數值仍受腐蝕。',{bonusHp:35}),
  item('g_cingulum','gladiator','血砂腰帶','物理 +4；同歸於盡怒氣係數改為 15。',{bonusAtk:4}),
  item('sa_oboro','samurai','名刀・朧月','每件主動攻擊傷害 +10%，加算疊加。'),
  item('sa_haori','samurai','殘心羽織','生命 +20；鏡頭額外獲 1 劍魂；反擊固定 5。村雨會停用全部羽織效果。',{bonusHp:20},true),
  item('sa_murasame','samurai','妖刀・村雨','生命 -15；鏡頭減傷 50% 取代完全招架；反擊 20 + 次數×2；主動傷害每缺少 1% 生命增加 0.25%。',{bonusHp:-15}),
  item('sge_lens','sage','演算透鏡','首件成功率 +10 個百分點，每件額外 +5；從無效果機率移轉，超過時移轉混亂。'),
  item('sge_rule','sage','慣性計算尺','首件方程最終傷害 +10%，每件額外 +5%，加算。')
];
export const NEW_ROLE_DETAILS = Object.fromEntries(Object.entries(NEW_CLASSES).map(([id,c]) => [id, {
  roleName:c.name, enName:id[0].toUpperCase()+id.slice(1), avatar:c.avatar, hp:c.maxHp,
  type: ['dreamweaver','stargazer'].includes(id) ? '魔法 / 輔助' : '物理 / 戰術', passive:c.passive,
  skills:c.skills.map((s,i)=>({ type:i ? `${i} 技能`:'普攻', name:s.label, cd:`CD ${s.cd}`, dmgType:s.dmgType==='mag'?'【魔法】':s.dmgType==='phys'?'【物理】':'【輔助】', desc:s.desc })),
  equipment:NEW_LOOT.filter(e=>e.role===id).map(e=>({name:e.name,desc:e.desc}))
}]));
