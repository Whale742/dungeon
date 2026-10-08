import {PHASE81_COPY} from './phase81-copy.js';
// Data consumed by the existing constants/config owners.
const skill = (id, label, cd, dmgType, desc, category = 'OFFENSIVE') => ({ id, label, cd, dmgType, desc, category,
  tags: [dmgType === 'mag' ? '魔法' : dmgType === 'phys' ? '物理' : '輔助'] });
export const NEW_CLASSES = {
  dreamweaver: { name: '織夢術士', avatar: '/photo/Dreamweaver.webp', maxHp: 75,
    desc: '夢境纖維扭轉傷害與現實。', passive: '普通攻擊有 50% 機率使魔物混亂 1 回合：鏡像交換物魔抗性；解離承傷 +10%；夢魘虛弱暫降當前與最大生命 10%；狂亂反噬傷害 +10%。四種等機率。',
    skills: [skill('basic', '夢境纖維', 0, 'mag', '10 魔法傷害；50% 使魔物陷入隨機混亂。'),
      skill('dw_butterfly', '清醒夢・薛丁格之蝶', 2, null, '指定隊友或魔物，持續 1 回合。施放時抽定夢境：60%【美夢化生】將傷害轉為等額治療，40%【夢魘成真】將傷害轉為無視抗性的真實傷害；狀態期間受擊沿用所選夢境。', 'BUFF'),
      skill('dw_false_dream', '虛構歷史', 3, null, '魔物 1 回合計算覆寫：淺夢為樓層區段起點，深夢為終點，孤影為存活人數 -3（至少 1），群影為存活人數 +3；等機率。', 'DEBUFF')] },
  stargazer: { name: '觀星者', avatar: '/photo/Stargazer.webp', maxHp: 70,
    desc: '探索深空，重塑星軌與時間。', passive: '無隨機普攻被動。三件望遠鏡零件必須同時裝備，才能啟動克卜勒的深空天眼。',
    skills: [skill('basic', '星光引導', 0, 'mag', '10 魔法傷害。'),
      skill('sg_observe', '天體觀測・深空探索', 2, 'mag', '恆星 60%：15 魔法；行星 10%：25 魔法、10% 當輪暈眩；銀河 10%：全隊每次合法命中 +5（1 回合）；黑洞 10%：全場存活者 5 真傷；邊界 10%：最低當前生命隊友鎖血 1（1 回合）。天眼改為四種各 25%：行星 35／30% 暈眩、銀河 +10、黑洞僅魔物 10 真傷、邊界另滿血並抵擋一次致命傷。', 'BUFF'),
      skill('sg_clock', '星軌干涉・時計重塑', 3, null, '70% 存活全隊冷卻 -1；10% 冷卻歸零；10% 超負荷（技能基礎傷害 +5，1 回合，冷卻中的技能 +1）；10% 無效果。', 'BUFF')] },
  gladiator: { name: '角鬥士', avatar: '/photo/Gladiator.webp', maxHp: 85,
    desc: '以鮮血積累怒氣，挑戰死亡角鬥場。', passive: '實際受傷獲得 1 怒氣，每回合最多一次。鮮血獻祭另獲 1 怒氣。競技場只允許自己與魔物行動，雙方忽略減傷；自己的最大與當前生命按 0.6 ×（隊伍人數 +1）等比例縮放，退出依剩餘生命比例恢復。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理傷害。'),
      skill('g_sacrifice', '鮮血獻祭', 0, null, '支付 20 真實生命（無視護盾、減傷），怒氣 +1。競技場改為造成 15 + 人數 ×10 + 怒氣 ×25 物理傷害。', 'BUFF'),
      skill('g_arena', '死鬥宣告', 3, null, '本回合宣告，下回合進入競技場 1 回合。場內改為同歸於盡：消耗全部生命，造成消耗生命 + 怒氣 ×10 傷害並死亡；同層不能甦生，下層正常復活。', 'BUFF')] },
  samurai: { name: '武士', avatar: '/photo/武士.webp', maxHp: 80,
    desc: '以居合招架積累武魂，施展秘劍燕返。', passive: '武魂上限 8。每回合第一個敵方直接攻擊判定 40% 狂刀：失敗後不再判定；成功則本輪後續直接攻擊全部招架，每輪進入狂刀武魂 +1。每次主動攻擊（反擊、燕返除外）武魂 +1。敵方階段結束統一反擊 10 + 招架次數。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理傷害，武魂 +1。'),
      skill('sa_cut', '一刀兩斷', 1, 'phys', '15 物理；施放前武魂為 0 時，本輪招架率 70%；有魂則以 30% + 每魂 5%（最高 70%）機率倍傷。'),
      skill('sa_tsubame', '秘劍・燕返', 0, 'phys', '需要至少 4 武魂，消耗 4；四次各 10 物理傷害，忽略物理抗性。一次行動，四次命中。')] },
  sage: { name: '智者', avatar: '/photo/智者.webp', maxHp: 80,
    stateHint:'假設建立運算元；求解攻擊後觸發方程結算。',
    desc: '將未知化作變量，將戰鬥化作方程。透過假設、求解與演算累積知識，逐步建立足以改寫戰局的最終解。', passive: '開戰 X=30 跨戰鬥保留，每兩回合一循環，開戰獲【先驗防壁】。A 輪假設、B 輪求解，B 輪末方程結算造成獨立物理傷害並享受全隊增傷與通關攻擊補正，固定獲保底變量 X。X 達 100/200/300 享演算精通 +10%/20%/30%。偶數 40% 穿透與 40% 護盾；奇數 100% 穿透與承傷 +10%；質數 15 真傷與 CD 歸零；平方數 Boss 傷害 -25%。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '10 物理；假設時 Operand=實傷，求解時 +2。每輪固定保底獲得基本變量 X。方程後：60% 成功 X+=Operand，15% 思緒紊亂下一輪擾動降低 25%，25% 無事發生。'),
      skill('sge_deduce', '向量定軌・貫穿演算', 1, 'phys', '10 物理，50% 穿透物抗。假設時 Operand+=實傷，求解 +5；每輪固定保底獲得基本變量 X。方程後：50% 成功 X+=Operand，25% 思緒紊亂下一輪擾動降低 25%，25% 無事發生。'),
      skill('sge_induce', '動量回授・慣性取樣', 1, 'phys', '10 物理；假設時獲至少 15（10%最大生命）護盾並取樣魔物直接傷害；求解時 Operand×2；每輪固定保底獲得基本變量 X。方程後：40% 成功 X+=Operand/4，35% 思緒紊亂下一輪擾動降低 25%，25% 無事發生。')] }
};
const item = (id, role, name, desc, stats = {}, unique = false) => ({ id, role, name, desc, ...stats, unique });
export const NEW_LOOT = [
  item('dw_spindle','dreamweaver','命運的紡錘','使【潛意識混淆】觸發機率提高25%（至75%），裝備不可疊加。',{},true),
  item('dw_loom','dreamweaver','莫比烏斯的織機','提高我方全體20生命上限。當我方角色觸發【夢魘成真】效果受到傷害後，恢復生命上限5%生命。可疊加。'),
  item('dw_history','dreamweaver','偽史古卷','自己施加的夢境狀態持續 +1 回合。',{},true),
  item('sg_eyepiece','stargazer','粗糙研磨的黃銅目鏡','生命 +3、魔法 +1；天眼零件。',{bonusHp:3,bonusAtk:1}),
  item('sg_tube','stargazer','生鏽卡死的伸縮鏡筒','魔法 +1；天眼零件。',{bonusAtk:1}),
  item('sg_mount','stargazer','傾角失準的赤道儀基座','生命 +5；天眼零件。',{bonusHp:5}),
  item('sg_cloak','stargazer','流浪占星師的粗呢斗篷','生命 +10。',{bonusHp:10}),
  item('sg_watch','stargazer','赫密斯的星盤懷錶','魔法 +6。',{bonusAtk:6}),
  item('sg_bracer','stargazer','墜星隕鐵護腕','魔法 +10。',{bonusAtk:10}),
  item('g_xiphos','gladiator','斯巴達破陣短劍','【血債血償】：每次【鮮血獻祭】扣除生命時獲得【血祭】，每層物理傷害 +2；【死亡角鬥場】結束清空；效果不可疊加，完全免疫腐蝕。',{},true),
  item('g_cuirass','gladiator','染血的赤銅戰鎧','生命 +35。【死線喘息】：生命低於30時，使用【鮮血獻祭】後獲得治療量 +20%，持續2回合。被動不可疊加，只有生命值受腐蝕瓶影響。',{bonusHp:35}),
  item('g_cingulum','gladiator','血砂角鬥士束帶','物理伤害 +4。【末路狂瀾】：1v1死鬥領域使用【同歸於盡】時，怒氣額外伤害從每層10提升至每層15。',{bonusAtk:4}),
  item('sa_oboro','samurai','名刀・朧月','每件主動攻擊傷害 +10%，加算疊加。'),
  item('sa_haori','samurai','殘心羽織','生命 +20；狂刀額外獲 1 武魂；反擊固定 5。村雨會停用全部羽織效果。',{bonusHp:20},true),
  item('sa_murasame','samurai','妖刀・村雨','生命 -15；狂刀減傷 50% 取代完全招架；反擊 20 + 次數×2；主動傷害每缺少 1% 生命增加 0.25%。',{bonusHp:-15}),
  item('sge_lens','sage','演算透鏡','提高智者【方程結算】後觸發【推演成功】的機率。第一件提高 10 個百分點，每件額外裝備再提高 5 個百分點。提升的成功率優先取代【無事發生】，若不足則取代【思緒紊亂】。不影響每輪固定獲得的基本變量 X。'),
  item('sge_rule','sage','慣性計算尺','提高智者【方程結算】造成的最終傷害。第一件提高 10%，每件額外裝備再提高 5%。此效果與演算精通及全隊傷害增益共同作用。裝備效果受到腐蝕時，依照既有腐蝕規則降低。')
];
for(const [id,copy] of Object.entries(PHASE81_COPY)) {
 const c=NEW_CLASSES[id];c.passive=copy.passive;
 c.skills.forEach((skill,i)=>{skill.shortDesc=copy.skills[i][1].split('\n')[0];skill.label=copy.skills[i][0];skill.desc=copy.skills[i][1];});
}
export const NEW_ROLE_DETAILS = Object.fromEntries(Object.entries(NEW_CLASSES).map(([id,c]) => [id, {
  roleName:c.name, enName:id[0].toUpperCase()+id.slice(1), avatar:c.avatar, hp:c.maxHp,
  type: ['dreamweaver','stargazer'].includes(id) ? '魔法 / 輔助' : id === 'sage' ? '長軸輸出 / 演算成長 / 戰術輔助' : '物理 / 戰術', passive:c.passive,
  skills:c.skills.map((s,i)=>({ type:i ? `${i} 技能`:'普攻', name:s.label, cd:`CD ${s.cd}`, dmgType:s.dmgType==='mag'?'【魔法】':s.dmgType==='phys'?'【物理】':'【輔助】', desc:s.desc })),
  equipment:NEW_LOOT.filter(e=>e.role===id).map(e=>({name:e.name,desc:e.desc})).concat(id==='stargazer'?[{name:'克卜勒的深空天眼',desc:'同時裝備望遠鏡三件零件時啟動，徹底重構【天體觀測・深空探索】：完全移除60%的【發現星座】，其餘各25%。【發現星球】：35點魔法傷害、30%機率當輪暈眩；【發現星系】：全隊每次合法命中追擊10點；【發現黑洞】：對Boss造成10點真實傷害；【發現宇宙邊界】：若鎖血目標當前已為滿血，額外賦予抵擋一次致死打擊的【星光壁壘】。'}]:[])
}]));
