import {PHASE81_COPY} from './role-copy.js';
// Data consumed by the existing constants/config owners.
const skill = (id, label, cd, dmgType, desc, category = 'OFFENSIVE') => ({ id, label, cd, dmgType, desc, category,
  tags: [dmgType === 'mag' ? '魔法' : dmgType === 'phys' ? '物理' : '輔助'] });
export const NEW_CLASSES = {
  dreamweaver: { name: '織夢術士', avatar: '/assets/characters/portraits/Dreamweaver.webp', maxHp: 75,
    desc: '夢境纖維扭轉傷害與現實。', passive: '普通攻擊有 50% 機率使魔物混亂 1 回合：鏡像交換物魔抗性；解離承傷 +10%；夢魘虛弱暫降當前與最大生命 10%；狂亂反噬傷害 +10%。四種等機率。',
    skills: [skill('basic', '夢境纖維', 0, 'mag', '10 魔法傷害；50% 使魔物陷入隨機混亂。'),
      skill('dw_butterfly', '清醒夢・薛丁格之蝶', 2, null, '指定隊友或魔物，持續 1 回合。施放時抽定夢境：60%【美夢化生】將傷害轉為等額治療，40%【夢魘成真】將傷害轉為無視抗性的真實傷害；狀態期間受擊沿用所選夢境。', 'BUFF'),
      skill('dw_false_dream', '虛構歷史', 3, null, '魔物 1 回合計算覆寫：淺夢為樓層區段起點，深夢為終點，孤影為存活人數 -3（至少 1），群影為存活人數 +3；等機率。', 'DEBUFF')] },
  stargazer: { name: '觀星者', avatar: '/assets/characters/portraits/Stargazer.webp', maxHp: 70,
    desc: '探索深空，重塑星軌與時間。', passive: '無隨機普攻被動。裝備克卜勒的深空天眼可重塑天體觀測；星盤懷錶重塑時計機率，斗篷在首領攻擊後追加魔法傷害。',
    skills: [skill('basic', '星光引導', 0, 'mag', '10 魔法傷害。'),
      skill('sg_observe', '天體觀測・深空探索', 1, 'mag', '發現星座 60%：round(5 + 150% × A魔) 魔法（四捨五入，初始 22 點）；行星 10%：25 魔法、10% 當輪暈眩；銀河 10%：全隊每次合法命中 +5（1 回合）；黑洞 10%：指定敵人 round(1.0 × A魔) 真傷、存活隊友 5 真傷；邊界 10%：最低當前生命隊友鎖血 1，不限制回合且不可疊加。天眼改為四種各 25%：行星 round(2 + 300% × A魔)／30% 暈眩、銀河每次合法命中追加 round(1 + 75% × A魔) 魔法傷害、黑洞指定敵人 round(2.5 × A魔) 真傷（不傷隊友）、邊界保護兩名最低生命存活隊友。', 'BUFF'),
      skill('sg_clock', '星軌干涉・時計重塑', 2, null, '70% 存活全隊冷卻 -1；10% 冷卻歸零；10% 超負荷（技能基礎傷害 +5，1 回合，冷卻中的技能 +1）；10% 無效果。', 'BUFF')] },
  gladiator: { name: '角鬥士', avatar: '/assets/characters/portraits/Gladiator.webp', maxHp: 85,
    desc: '拒絕庇護，以交鋒累積鬥志，在死亡角鬥場賭命決勝。', passive: PHASE81_COPY.gladiator.passive,
    skills: [skill('basic', '鬥士斬擊', 0, 'phys', '10 物理傷害。'),
      skill('g_sacrifice', '血戰邀約', 0, 'phys', PHASE81_COPY.gladiator.skills[1][1]),
      skill('g_arena', '死鬥宣告', 2, null, PHASE81_COPY.gladiator.skills[2][1], 'BUFF')] },
  samurai: { name: '武士', avatar: '/assets/characters/portraits/武士.webp', maxHp: 80,
    desc: '以殘心標記敵人，將全場武魂化為連續全體斬擊。', passive: PHASE81_COPY.samurai.passive,
    skills: [skill('basic', '普通攻擊', 0, 'phys', PHASE81_COPY.samurai.skills[0][1]),
      skill('sa_cut', '一刀兩斷', 1, 'phys', PHASE81_COPY.samurai.skills[1][1]),
      skill('sa_tsubame', '秘劍・燕返', 0, 'phys', PHASE81_COPY.samurai.skills[2][1])] },
  sage: { name: '智者', avatar: '/assets/characters/portraits/智者.webp', maxHp: 70,
    stateHint:'假設建立運算元；求解攻擊後立即觸發方程結算。',
    desc:'演算型主 C／長期資源成長／戰術型方程爆發／低生存能力。',passive:PHASE81_COPY.sage.passive,
    skills:[skill('basic','普通攻擊',0,'phys',PHASE81_COPY.sage.skills[0][1]),
      skill('sge_deduce','向量定軌・貫穿演算',1,'phys',PHASE81_COPY.sage.skills[1][1]),
      skill('sge_induce','動量回授・慣性取樣',1,'phys',PHASE81_COPY.sage.skills[2][1])] },
  paladin: { name: '聖騎士', avatar: '/assets/characters/portraits/Paladin.webp', maxHp: 90,
    desc: '【生命 90】神聖壁壘。受到傷害機率提高 30%，以護盾化攻為守，代受隊友苦痛。', passive: '嘲諷：受到傷害機率提高 30%。',
    skills: [skill('basic', '普通攻擊', 0, 'phys', '5 點物理傷害，並且獲得基於普攻造成傷害 2 倍的護盾（無回合限制）。'),
      skill('pal_glory', '榮耀讚歌', 2, 'phys', '自身獲得基於生命上限 50% 的護盾（持續 2 回合），並造成一次 15 點物理傷害。下回合全隊獲得本次所有隊友造成的 70% 傷害轉化而成的護盾，最高獲得護盾不超過聖騎士自身血量上限。持有此方式獲得的護盾時，全體造成的傷害提高 20%。有 40% 的機率，獲得的護盾減少 50%。', 'BUFF'),
      skill('pal_grace', '代受恩典', 2, null, '指定一名我方，在接下來的 2 回合自身獲得 15% 減傷，該隊友受到的傷害及負面狀態將由聖騎士承受。由此技能受到的傷害，將在技能持續時間結束後，聖騎士獲得傷害一半的護盾。有 50% 的機率聖騎士不獲得護盾。', 'BUFF')] },
  augur: { name: '卜者', avatar: '/assets/characters/portraits/Augur.webp', maxHp: 70,
    desc: '優雅的命運觀測者。透過水晶球與諭示牌強化隊友數值並干涉技能吉凶。',
    passive: '戰鬥開始時，卜者透過水晶球隨機選擇一名自身以外的存活隊友作為【觀測目標】（優先選擇具有負面機率風險或主要輸出之職業；若場上無其他存活隊友，則改為觀測自身）。\n\n【命運加護】：\n只要處於【觀測目標】狀態，該角色施放技能的基礎數字數值常駐提高 20%（僅加成直接攻擊傷害、直接治療量、技能基礎護盾量；吟遊詩人的百分比增減傷、所有持續傷害 DoT 與智者的獨立方程結算等不受加成）。\n\n【感應式諭示牌】：\n每回合開始時，卜者的諭示牌恢復為【空象】。當【觀測目標】施放可干涉的技能時，水晶球會自動感應並干涉命運（每回合最多觸發一次命運干涉，負面效果判定優先於正面效果）：\n• 【逆位・違逆命運】：當【觀測目標】施放具有負面失誤或反噬機率的技能時，最多降低該次負面結果 20 個百分點的觸發機率（最低降至 0%）。只有當亂數結果確實落在被抵銷的 20 個百分點區間內時，諭示牌才會轉為【逆位】，將抵銷的厄運封存於水晶球，並使卜者獲得等同於本次實際降低機率百分點數值的【命債】（單次最多 20 點）。\n• 【正位・順應命運】：當【觀測目標】施放具有正面效果觸發機率的技能，且本次行動未觸發【逆位】封存厄運時，使本次正面效果觸發機率提高 15 個百分點（最高不超過 100%），諭示牌轉為【正位】。\n\n【星芒破障】：\n每當卜者透過普攻或技能對敵方 Boss 造成直接魔法傷害時，使 Boss 的【效果抗性】降低 15 個百分點，持續 2 回合（重複觸發時刷新持續時間，不疊加）。\n\n【命債】：\n卜者成功封存厄運時，會將抵銷的負面機率轉換為等量【命債】（上限 60 點，戰鬥結束後清空）。每筆【命債】於產生後的第 3 回合結束時進行清算。卜者受到治療時，治療量優先 1:1 抵銷尚未清算的命債；命債清償完畢後的剩餘治療量才能恢復本體生命。到期時，剩餘命債直接扣除等量生命，無視護盾與減傷，可使卜者死亡。',
    skills: [
      skill('basic', '水晶折光', 0, 'mag', '對敵方造成 10 點基礎魔法傷害（觸發被動【星芒破障】使敵方效果抗性降低 15 個百分點，持續 2 回合），並立即清償自身最早到期的 8 點【命債】。'),
      skill('aug_bind', '命運繫結', 1, null, '指定一名自身以外的我方存活隊友施放（不可指定敵方；若場上無其他存活隊友則指定自身）。\n將【觀測目標】重新指定為該名隊友，並將諭示牌恢復為【空象】。\n施放本回合內，該目標享有的【命運加護】基礎數值加成由 20% 提升至 25%；且本回合對其進行命運干涉時，【正位】正面機率加成提升至 20 個百分點，【逆位】負面機率降低上限提升至 25 個百分點（成功攔截時，單次最多仍只產生 20 點【命債】）。', 'BUFF'),
      skill('aug_reckon', '命運清算・凶兆逆位', 2, 'mag', '將累積於水晶球內的命運之力調配釋放，對敵方造成 15 點魔法傷害（觸發被動使敵方效果抗性降低 15 個百分點）。\n\n【凶兆逆位】\n為敵方 Boss 卜算並烙印一張敵人專用的逆位牌【凶兆逆位】，持續 2 回合，使 Boss 受到我方全體造成的傷害提高 10%（此效果不受敵方效果抗性影響）。\n\n【命債清償】\n立即清償卜者自身最多 25 點【命債】（優先從最早到期的部分開始清償）。若本次實際清償了至少 15 點【命債】，額外為卜者自身與【觀測目標】各回復 10 點生命。', 'DEBUFF')
    ]
  },
  onmyoji: { name: '陰陽師', avatar: '/assets/characters/portraits/Onmyōji.webp', maxHp: 70,
    desc: '【生命 70】符咒咒術師。精通五鬼攝魂咒術，施加多種無回合限制的負面符咒，每回合開始時有35%機率掉落，未掉落則再次觸發效果（上限10張），並能以百符引爆造成連鎖巨量傷害。',
    passive: '【符道真解】：擲出的符咒依附於目標身上無回合限制（最多存在 10 張），每回合開始時有 35% 機率符咒掉落（每張獨立計算），沒掉落就再次觸發每一個效果；可藉由【急急如律令・百符引爆】一次性引爆所有符咒造成連鎖巨量傷害並清除符咒。',
    skills: [skill('basic', '引符術', 0, 'mag', '對目標造成 10 點魔法傷害。'),
      skill('onm_talisman', '五鬼攝魂符', 0, 'mag', '先對指定敵人造成 round(2 + 150% × A魔) 點直接魔法傷害（初始 20 點；A魔＝基礎 ATK＋裝備魔攻，不含物攻加成，受既有抗性與增傷影響）。目標仍存活且未達 10 張符咒時，向敵方擲出一道符咒，隨機施加以下 5 種負面效果之一（受核心被動機制影響，每回合開始時有 35% 機率符咒掉落，每張獨立計算，沒掉落就再次觸發每一個效果；敵方身上最多存在 10 張符咒）：\n【障目符】: 目標攻擊命中率大幅下降，此次攻擊有60%~100%的不對我方傷害。\n【封勁符】: 目標有100%機率在當前回合完全不造成任何傷害。\n【蝕體符】: 目標進入易傷狀態，受到的所有攻擊傷害提升10%。\n【惑心符】: 目標陷入心智混亂，出手時將造成的傷害50%~100%作用在自身。\n【抽髓符】: 扣除目標最大生命值 5% 的血量（百分比削血）。', 'DEBUFF'),
      skill('onm_detonate', '急急如律令・百符引爆', 2, 'mag', '引爆目標身上所有未掉落的符咒。令 N 為符咒數量（最多計算 10 張）；N＝0 時不造成傷害，否則造成 round(4 + 25% × A魔 + N × 100% × A魔) 點魔法傷害（初始 ATK 12 時為 7 + 12N）。技能結算後清除目標所有符咒。', 'OFFENSIVE')] }

};
const item = (id, role, name, desc, stats = {}, unique = false) => ({ id, role, name, desc, slot: 'CLASS_EXCLUSIVE', tier: 'CLASS_EXCLUSIVE', icon: `/assets/equipment/exclusive/${name}.webp`, ...stats, unique });
export const NEW_LOOT = [
  item('dw_spindle','dreamweaver','命運的紡錘','使【潛意識混淆】觸發機率提高25%（至75%），裝備不可疊加。',{},true),
  item('dw_loom','dreamweaver','莫比烏斯的織機','提高我方全體20生命上限。當我方角色觸發【夢魘成真】效果受到傷害後，恢復生命上限5%生命。可疊加。'),
  item('dw_history','dreamweaver','偽史古卷','自己施加的夢境狀態持續 +1 回合。',{},true),
  item('sg_cloak','stargazer','流浪占星師的斗篷','【星塵回響】：本輪我方對首領的獨立傷害段數，在首領攻擊完成後追加 10 + 段數 點魔法傷害；每輪一次，斗篷自身傷害不計入。'),
  item('sg_watch','stargazer','赫密斯的星盤懷錶','【星軌干涉・時計重塑】：軌道微調 50%、超新星重啟 25%、過載躍遷 25%，不再出現星軌虛耗；保留各結果原有功能及代價。'),
  item('sg_eye','stargazer','克卜勒的深空天眼','【天體觀測・深空探索】：移除【發現星座】，其餘各25%。【發現星球】：數值更改2 + 300% × A魔的魔法傷害、30%機率當輪暈眩；【發現星系】：數值更改為1 + 75% × A魔；【發現黑洞】：對指定敵人造成 round(2.5 × A魔) 點真實傷害（初始 28 點），不傷害隊友；【發現宇宙邊界】：目標更變成兩位隊友。',{},true),
  item('g_xiphos','gladiator','斯巴達破陣短劍',"【血債血償】：血戰邀約命中時額外獲得 1 層鬥志；被邀戰目標當回合直接攻擊自身，再額外獲得 1 層（每回合一次，多段不重複）。普通攻擊不享命中獎勵。被動不可疊加，完全免疫腐蝕。",{},true),
  item('g_cuirass','gladiator','染血的赤銅戰鎧',"生命 +35。【拒絕庇護】：單筆護盾或治療轉換鼓舞時，先計算基礎鼓舞，再乘以 1.5 並無條件捨去；持續時間不變，總物攻上限仍為 +40。轉換效率不可疊加，已產生鼓舞保留快照。",{bonusHp:35}),
  item('g_cingulum','gladiator','血砂角鬥士束帶',"物理攻擊 +4。【末路狂瀾】：死亡角鬥場內的浴血裁決改為 round(15 + A物 + 2 × 實際消耗生命) 點物理傷害；不增加生命消耗，最低保留 1 HP。被動不可疊加，不影響血殺重擊倍率或凱旋。",{bonusAtk:4}),
  item('sa_oboro','samurai','名刀・朧月','每件主動攻擊傷害 +10%，加算疊加。'),
  item('sa_haori','samurai','殘心羽織','生命 +20；【餘韻不絕】狂刀觸發時，依增加前的狀態對最低殘心敵人額外附加 1 層（並列隨機、單體上限 8）；反擊固定 5。村雨會停用全部羽織效果。',{bonusHp:20},true),
  item('sa_murasame','samurai','妖刀・村雨','生命 -15；狂刀減傷 50% 取代完全招架；反擊 20 + 次數×2；主動傷害每缺少 1% 生命增加 0.25%。',{bonusHp:-15}),
  item('sge_lens','sage','演算透鏡','使智者【推演成功】機率提高 10 個百分點；重複獲得的每件額外提高 5 個百分點。增加的成功率只減少【無事發生】，不佔用【思緒紊亂】機率；超出可用機率的部分忽略。裝備腐蝕依既有規則降低效果。'),
  item('sge_rule','sage','慣性計算尺','使【方程結算】最終傷害提高 10%；重複獲得的每件額外提高 5%。方程專屬加成，不視為一般全隊傷害增益；腐蝕依既有規則降低效果。'),
  item('sge_template','sage','解題範本','被動運算元更改為20~45。',{},true),
  item('pal_hammer','paladin','晨曦誓約重錘','物理傷害 +5，生命值 +10。',{bonusAtk:5,bonusHp:10}),
  item('pal_cuirass','paladin','受難代贖者聖鎧','1 技能【榮耀讚歌】觸發「護盾減少 50%」的負面機率由 40% 降低至 15%。',{},true),
  item('pal_banner','paladin','庇護之光軍旗','生命值 +20。被動：當聖騎士自身持有任何盾牌時，受到的傷害額外降低 15%。',{bonusHp:20},true),
  item('aug_amethyst','augur','無瑕紫晶球','使【命運加護】提供的技能基礎數值加成 +5%，且普通攻擊【水晶折光】額外清償 4 點【命債】。若重複獲得，則新增的每件使數值加成 +5%、普攻清償量 +2 點。'),
  item('aug_gilded_box','augur','鎏金諭示牌盒','最大生命 +15。觸發【逆位】成功封存厄運時，產生的【命債】減少 5 點（最低為 5 點）；觸發【正位】時，正面效果機率額外 +5%。',{bonusHp:15},true),
  item('aug_forbidden_tome','augur','禁忌厄運聖契','最大生命 -10。【命債】到期清算時間由第 3 回合縮短為第 2 回合；但每當卜者獲得或透過技能清償【命債】時，會將該次變動命債量的 50%（四捨五入）轉化為無視抗性的真實傷害轟擊 Boss，且二技能【凶兆逆位】使敵方受到的傷害加成由 10% 提升至 18%。',{bonusHp:-10},true),
  item('onm_brush','onmyoji','硃砂引靈筆','傷害 +5。普通攻擊有 25% 機率依附一道符咒（符咒類型與 1 技能相同）。',{bonusAtk:5},true),
  item('onm_kariginu','onmyoji','退魔水引狩衣','生命值 +20。符咒掉落機率由 35% 降低至 20%。',{bonusHp:20},true),
  item('onm_mirror','onmyoji','八咫靈犀鏡','2 技能【急急如律令・百符引爆】每張符咒額外增加 2 點基礎傷害（初始每張由 12 點提升至 14 點）。',{},true)
];
for(const [id,copy] of Object.entries(PHASE81_COPY)) {
 const c=NEW_CLASSES[id];c.passive=copy.passive;
 c.skills.forEach((skill,i)=>{skill.shortDesc=copy.skills[i][1].split('\n')[0];skill.label=copy.skills[i][0];skill.desc=copy.skills[i][1];});
}
NEW_CLASSES.paladin.skills.forEach(s => { s.shortDesc = s.desc; });
NEW_CLASSES.augur.skills.forEach(s => { s.shortDesc = s.desc.split('\n')[0]; });
NEW_CLASSES.onmyoji.skills.forEach(s => { s.shortDesc = s.desc.split('\n')[0]; });
export const NEW_ROLE_DETAILS = Object.fromEntries(Object.entries(NEW_CLASSES).map(([id,c]) => [id, {
  roleName:c.name, enName:id==='onmyoji'?'Onmyōji':id[0].toUpperCase()+id.slice(1), avatar:c.avatar, hp:c.maxHp,
  type: ['dreamweaver','stargazer'].includes(id) ? '魔法 / 輔助' : id === 'augur' ? '魔法 / 功能型輔助 / 機率干涉 / 命運觀測' : id === 'onmyoji' ? '魔法 / 咒術 / 削弱' : id === 'sage' ? '演算主 C / 長期成長 / 戰術爆發 / 低生存' : id === 'paladin' ? '物理 / 坦鋒 / 守護' : '物理 / 戰術', passive:c.passive,
  skills:c.skills.map((s,i)=>({ type:i ? `${i} 技能`:'普攻', name:s.label, cd:`CD ${s.cd}`, dmgType:s.dmgType==='mag'?'【魔法】':s.dmgType==='phys'?'【物理】':'【輔助】', desc:s.desc })),
  equipment:NEW_LOOT.filter(e=>e.role===id).map(e=>({name:e.name,desc:e.desc,icon:e.icon}))
}]));
