// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - 前端核心客戶端 (app.js)
// ==========================================================================

const socket = io({ auth: { devMode: location.pathname === '/dev' } });
if (location.pathname === '/dev') import('/js/dev/dev-tools.js').then(({ mountDevTools }) => mountDevTools(socket));

// ============================================================================
// 全站輕量 Toast 提示系統 (Dark Pixel Fantasy)
// ============================================================================
function showToast(message, type = 'info', duration = 2500) {
  let container = document.getElementById('uiToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'uiToastContainer';
    container.className = 'ui-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'ui-toast ui-toast--' + type;
  
  const iconMap = {
    info: '<svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-log"></use></svg>',
    success: '<svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-sparkle"></use></svg>',
    warning: '<svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-shield"></use></svg>',
    danger: '<svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-close"></use></svg>'
  };

  toast.innerHTML = '<span class="ui-toast-icon">' + (iconMap[type] || '') + '</span>' +
    '<span class="ui-toast-message">' + escapeHtml(message) + '</span>';

  container.appendChild(toast);

  if (type === 'success' || message.includes('金幣') || message.includes('購入') || message.includes('售出')) {
    playSound('gold');
  }

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.classList.add('is-hiding');
    setTimeout(() => {
      toast.remove();
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 200);
  }, duration);
}
window.showToast = showToast;

function showShopReadyNotice(message) {
  let container = document.getElementById('shopReadyNoticeContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'shopReadyNoticeContainer';
    container.className = 'shop-ready-notice-container';
    document.body.appendChild(container);
  }

  const notice = document.createElement('div');
  notice.className = 'shop-ready-notice';
  notice.innerHTML = `
    <span class="shop-ready-icon">${getIconSvg('camp', 'ui-icon--sm')}</span>
    <span class="shop-ready-text">${escapeHtml(message)}</span>
  `;
  container.appendChild(notice);
  playSound('gold');

  requestAnimationFrame(() => {
    notice.classList.add('is-visible');
  });

  setTimeout(() => {
    notice.classList.remove('is-visible');
    notice.classList.add('is-leaving');
    setTimeout(() => {
      notice.remove();
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 300);
  }, 4500);
}
window.showShopReadyNotice = showShopReadyNotice;


// 核心狀態
let myId = null;
let myName = localStorage.getItem('dungeon_player_name') || '';
let currentRoomCode = null;
let roomState = null;
let classesData = {};
let routesData = [];
let soundEnabled = true;
let roleDetailsData = null;

const DEFAULT_ROLE_DETAILS = {
  warrior: {
    roleName: '戰士',
    enName: 'Warrior',
    emoji: '🛡️',
    avatar: '/assets/characters/portraits/Warrior.webp',
    hp: 120,
    type: '物理 / 前排坦鋒',
    passive: '前排坦鋒，擁有全職業最高的基礎生命值（120 HP）與強大減傷防護。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '揮動武器進行基本物理打擊，對單一目標造成基礎 5 點傷害。' },
      { type: '1 技能', name: '堅定斬擊', dmgType: '【物理】', cd: '無 CD', desc: '揮動巨劍造成物理傷害。80% 機率造成 18 點傷害；20% 機率因揮砍失衡僅造成 5 點傷害，並使下回合自身承受傷害提高 20%。' },
      { type: '2 技能', name: '壁壘守護', dmgType: '【防護】', cd: '2 回合', desc: '展開厚重盾勢，大幅降低全隊本回合受到的傷害（阻擋 90% 傷害，有 25% 機率盾牌龜裂使冷卻延長 1 回合）；次回合仍提供殘餘 40% 減傷。' }
    ]
  },
  mage: {
    roleName: '法師',
    enName: 'Mage',
    emoji: '🧙‍♂️',
    avatar: '/assets/characters/portraits/Mage.webp',
    hp: 80,
    type: '魔法 / 遠程爆發',
    passive: '站樁高爆發與生命汲取，全技能與普攻皆為魔法傷害。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '引導微光魔力造成基礎 10 點魔法傷害。' },
      { type: '1 技能', name: '奧術爆破', dmgType: '【魔法】', cd: '1 回合', desc: '引爆狂暴魔力轟炸敵方造成 45 點魔法傷害。有 25% 機率發生法力走火導致威力驟降為 10 點傷害，並對自身造成 10 點魔力反噬。' },
      { type: '2 技能', name: '生命汲取', dmgType: '【魔法】', cd: '1 回合', desc: '對敵方造成 1~40 點劇烈浮動的魔法傷害，並依據最終造成的傷害量吸取 20% 生命回復自身。' }
    ]
  },
  archer: {
    roleName: '弓箭手',
    enName: 'Archer',
    emoji: '🏹',
    avatar: '/assets/characters/portraits/Archer.webp',
    hp: 80,
    type: '物理 / 遠程敏捷',
    passive: '常駐 40% 閃避率（可完全閃避單體物理打擊與怪物反擊）。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '拉弓射出基礎箭矢造成基礎物理傷害。' },
      { type: '1 技能', name: '封鎖箭雨', dmgType: '【物理】', cd: '1 回合', desc: '射出 10 枝箭矢的箭雨，每支造成 50%×A 物理傷害且有 50% 機率命中。未命中箭矢殘留在地表形成持續 2 回合的「箭刺陷阱區域」，敵方每次行動受到 25%×A 物理傷害。' },
      { type: '2 技能', name: '標記射擊', dmgType: '【魔法】', cd: '2 回合', desc: '拉滿弓弦狙擊單一目標，正常命中造成 6 + 100%×A 點魔法傷害，並在目標身上附加 1 層「破綻印記」（每層使目標受傷增加 10%、受到攻擊命中率提升 10%、效果命中降低 10%，最多 5 層，無回合限制）。' }
    ]
  },
  assassin: {
    roleName: '刺客',
    enName: 'Assassin',
    emoji: '🗡️',
    avatar: '/assets/characters/portraits/Assassin.webp',
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
    avatar: '/assets/characters/portraits/Bard.webp',
    hp: 70,
    type: '魔法 / 團隊核心輔助',
    passive: '團隊核心輔助，精通全體群療與增傷減傷，全技能皆為魔法傷害。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '撥動琴弦引導音波造成基礎 10 點魔法傷害。' },
      { type: '1 技能', name: '治癒頌歌', dmgType: '【治療】', cd: '1 回合', desc: '唱響聖詠為全體隊友回復生命。80% 機率為全體回復 22 點生命，並專注為指定目標額外回復 28 點；20% 機率因走音導致全隊回復量大幅縮減為僅回復 5 點生命。' },
      { type: '2 技能', name: '狂熱協奏', dmgType: '【增益】', cd: '1 回合', desc: '使全隊提升 50% 傷害、25% 減傷並削弱敵方抗性。有 25% 機率因節奏過激導致全隊力竭扣除當前 5 點生命。' }
    ]
  },
  alchemist: {
    roleName: '鍊金術士',
    enName: 'Alchemist',
    emoji: '🧪',
    avatar: '/assets/characters/portraits/Alchemist.webp',
    hp: 70,
    type: '魔法 / 調和煉成',
    passive: '【異常調和】\n・腐蝕：Boss 的血量上限與傷害減少 5%，玩家觸發時裝備效果減半（持續 1 回合）。\n・中毒：每回合開始時造成 8 點傷害，持續 2 回合（重複釋放可疊加）。\n・燃燒：每回合開始時造成 10 點傷害，持續 1 回合（重複釋放可疊加）。\n・骨折：每回合開始時造成 5 點傷害，持續 3 回合（重複釋放可疊加）。\n・寒冷：每回合開始時造成 6 點傷害，持續 2 回合（重複釋放可疊加）。',
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【魔法】', cd: '無 CD', desc: '造成 10 點傷害，有 70% 機率造成腐蝕效果持續一回合，當觸發腐蝕效果時，有 35% 機率使我方全體也觸發腐蝕效果。' },
      { type: '1 技能', name: '不穩定試劑瓶', dmgType: '【魔法/群體/持續傷害】', cd: '無 CD', desc: '群體攻擊：對主目標造成 15 點傷害，對其餘敵方造成 50% 濺射傷害。並對主目標造成 4 種持續傷害其中一種：中毒、燃燒、骨折、寒冷（重複釋放可疊加）。有 40% 機率對我方全體同步造成此次效果。' },
      { type: '2 技能', name: '命運煉成試劑', dmgType: '【驅散/調和】', cd: '2 回合', desc: '立即驅散全隊所有負面狀態（中毒/燃燒/骨折/寒冷/腐蝕/撕裂）。若自身有異常狀態：50% 機率煉金大成功（全員回復 40 點生命 + 2 回合 70% 減傷護盾）/ 50% 機率煉金失敗（全員回復 10 點生命 + 下回合全隊受傷 +20%）；若自身無異常狀態：全員穩定回復 15 點生命。' }
    ]
  },
  druid: {
    roleName: '德魯伊',
    enName: 'Druid',
    emoji: '🌿',
    avatar: '/assets/characters/portraits/Druid.webp',
    hp: 85,
    type: '物理 / 自然變形',
    passive: '自然之子，擅長形態轉變（狼人/遠古樹精）與自然夥伴召喚（小樹精/幼狼）。',
    forms: {
      werewolf: { name: '狼人', avatar: '/assets/characters/forms/druid/狼人.webp' },
      treant: { name: '遠古樹精', avatar: '/assets/characters/forms/druid/遠古樹精.webp' },
      tree: { name: '沉睡古樹', avatar: '/assets/characters/forms/druid/遠古樹精.webp' },
      bear: { name: '巨熊', avatar: '/assets/characters/forms/druid/巨熊.webp' }
    },
    summons: {
      treant: [
        { name: '小樹精1', avatar: '/assets/characters/summons/druid/小樹精1.webp' },
        { name: '小樹精2', avatar: '/assets/characters/summons/druid/小樹精2.webp' },
        { name: '小樹精3', avatar: '/assets/characters/summons/druid/小樹精3.webp' }
      ],
      wolf: [
        { name: '幼狼1', avatar: '/assets/characters/summons/druid/幼狼1.webp' },
        { name: '幼狼2', avatar: '/assets/characters/summons/druid/幼狼2.webp' },
        { name: '幼狼3', avatar: '/assets/characters/summons/druid/幼狼3.webp' }
      ]
    },
    skills: [
      { type: '普攻', name: '普通攻擊', dmgType: '【物理】', cd: '無 CD', desc: '引導自然力量造成基礎 10 點物理傷害。' },
      { type: '1 技能', name: '形態轉變', dmgType: '【變身】', cd: '無 CD (持續2回合)', desc: '持續 2 回合（結束後才可再次變身）：有一半機率化身狼人（降低 20% 最大生命、造成傷害提升至 35 點、立即造成 35 傷害強化普攻，變身結束恢復最大生命）；有一半機率化身遠古樹精（生命上限 +100、常駐減傷 30%、替全隊吸收 50% 受傷、致命傷免死化為樹木休眠 1 回合）。' },
      { type: '2 技能 A', name: '召喚小樹精', dmgType: '【召喚】', cd: '無 CD (每位德魯伊上限3隻)', desc: '召喚肉盾型樹精夥伴（HP = floor(10 + Max HP × 25%)，ATK = floor(有效攻擊 × 10%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。' },
      { type: '2 技能 B', name: '召喚幼狼', dmgType: '【召喚】', cd: '無 CD (每位德魯伊上限3隻)', desc: '召喚敏捷型幼狼夥伴（HP = floor(5 + Max HP × 10%)，ATK = floor(有效攻擊 × 80%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。' }
    ]

  },
  sage: {
  "roleName": "智者",
  "enName": "Sage",
  "avatar": "/assets/characters/portraits/智者.webp",
  "hp": 70,
  "type": "演算主 C / 長期成長 / 戰術爆發 / 低生存",
  "passive": "智者於冒險開始時擁有 30 點「變量 X」。\n變量 X 無硬上限，在整趟冒險中持續累積，跨戰鬥、樓層、休息站、冷卻刷新及死亡復活保留。\n戰鬥中，以兩回合為一個【演算週期】，依序進行「假設」與「求解」。\n每輪開始時，隨機獲得 1～30 的基礎擾動常數，作為初始「運算元」。\n\n【假設】階段\n透過技能建立與改變本輪運算元。\n\n【求解】階段\n上一回合使用的技能暫時無法再次使用，其他技能會依照各自的演算方式改變運算元。\n求解攻擊結束後，立即觸發獨立的【方程結算】，依據運算元與變量 X 造成物理傷害。\n方程不享受全隊傷害增益、通關永久攻擊成長或通用易傷。\n每次完成方程結算，使用衰減前 X 計算傷害；再將超過 X60 的部分衰減 20%，無條件進位，最後獲得固定與成功額外 X 成長。\n\n【方程結算公式】\n解 = round(| 運算元 × η(變量) |)\nη(變量) = 0.4 + (1.75 × 變量) / (變量 + 80)\n慣性計算尺與思緒紊亂倍率合併後四捨五入，再依物理穿透與 Boss 抗性結算。\n\n依照求解技能，以一次亂數觸發以下三種互斥結果之一：\n【推演成功】依技能效果額外增加變量 X（額外獎勵四捨五入）。\n【思緒紊亂】本次方程主傷害降低 20%，隨機誤傷一名其他存活隊友，造成 10 點真實傷害；無其他存活隊友時改為自傷，可致死。\n誤傷不受增傷、護甲、抗性影響，可被原有護盾吸收，不觸發「受到攻擊時」類被動，也不計入慣性取樣。\n紊亂基礎機率 5%；X 超過 60 後，每超過完整 10 點額外增加 1%，最高 25%。紊亂優先判定，透鏡只將無事發生機率轉為成功。\n【無事發生】沒有額外效果，仍保留本輪基本變量成長。\n紊亂亦保留固定 X 成長，不會同時獲得成功額外 X。\n\n【偶數・彈性碰撞】\n方程獲得 40% 物理穿透；將 Boss 因本次方程主傷害實際失去生命的 40%（無條件捨去）轉為全隊護盾總量，平均分攤給所有存活成員，包含智者，持續 2 回合。\n餘數依固定伺服器玩家順序分配；每人新護盾上限為智者最大生命的 20%（無條件捨去）。不含質數真傷、溢出傷害與技能本體傷害。\n方程護盾不疊加，保留原有剩餘與新護盾中較高者並刷新至 2 回合；多位智者共用此規則，其他來源護盾不受影響。\n\n【奇數・非彈性形變】\n方程傷害無視 100% 物理抗性，使 Boss 下一回合受到的全體傷害提高 10%；智者獨立方程不受此通用易傷增傷。\n\n【質數・固有頻率共振】\n額外造成獨立的 15 點真實傷害，立即刷新智者全部技能冷卻。\n\n【完全平方數・穩定駐波】\n使 Boss 下一回合造成的直接傷害降低 25%。\n運算元可以同時符合多種數學性質，所有符合條件的效果同時觸發。",
  "skills": [
    {
      "type": "普攻",
      "name": "普通攻擊",
      "cd": "CD 0",
      "dmgType": "【物理】",
      "desc": "對敵方造成 10 點基礎物理傷害。\n\n【假設階段】\n將本次攻擊實際造成的傷害作為新的運算元，取代原本數值。\n\n【求解階段】\n使運算元 +2。\n求解結束後固定獲得 10 點變量，並有 60% 機率【推演成功】，額外獲得 round(5 + 運算元 × 30%) 點變量。\n無事發生或思緒紊亂時，僅獲得固定 10 X。"
    },
    {
      "type": "1 技能",
      "name": "向量定軌・貫穿演算",
      "cd": "CD 1",
      "dmgType": "【物理】",
      "desc": "對敵方造成 10 點物理傷害，附帶 50% 物理穿透。（CD1）\n\n【假設階段】\n將本次攻擊實際造成的傷害加入當前運算元。\n\n【求解階段】\n使運算元 +5。\n求解結束後固定獲得 14 點變量，並有 50% 機率【推演成功】，額外獲得 round(7 + 運算元 × 30%) 點變量。\n無事發生或思緒紊亂時，僅獲得固定 14 X。"
    },
    {
      "type": "2 技能",
      "name": "動量回授・慣性取樣",
      "cd": "CD 1",
      "dmgType": "【物理】",
      "desc": "對敵方造成 10 點物理傷害。（CD1）\n\n【假設階段】\n施放時記錄當前運算元；直到本回合結束前，將 Boss 對智者主動造成的直接傷害加入運算元，包括生命損失與既有護盾實際吸收的部分。\n不記錄 DoT、流血、毒傷、友軍誤傷、自傷或完全免疫／閃避而未承受的傷害；不額外提供護盾。\n\n【求解階段】\n提前透支變量：下一次可行動的戰鬥回合開始時消耗 20 X，不影響本次方程倍率；透支跨戰鬥、樓層與休息站保留，死亡復活也不清除，X 不足時扣至 0，支付後不重複扣除。\n先判斷目前運算元奇偶：奇數 +20，偶數 +21，最終必為奇數。\n求解結束後固定獲得 4 點變量，並有 40% 機率【推演成功】，額外獲得 round(2 + 運算元 × 15%) 點變量。\n無事發生或思緒紊亂時，僅獲得固定 4 X。"
    }
  ],
  "equipment": [
    {
      "name": "演算透鏡",
      "desc": "使智者【推演成功】機率提高 10 個百分點；重複獲得的每件額外提高 5 個百分點。增加的成功率只減少【無事發生】，不佔用【思緒紊亂】機率；超出可用機率的部分忽略。裝備腐蝕依既有規則降低效果。"
    },
    {
      "name": "慣性計算尺",
      "desc": "使【方程結算】最終傷害提高 10%；重複獲得的每件額外提高 5%。方程專屬加成，不視為一般全隊傷害增益；腐蝕依既有規則降低效果。"
    }
  ],
  "emoji": "📜"
},
  paladin: {
    roleName: '聖騎士',
    enName: 'Paladin',
    emoji: '🛡️',
    avatar: '/assets/characters/portraits/Paladin.webp',
    hp: 90,
    type: '物理 / 坦鋒 / 守護',
    passive: '嘲諷：受到傷害機率提高 30%。',
    skills: [
      {
        type: '普攻',
        name: '普通攻擊',
        dmgType: '【物理】',
        cd: '無 CD',
        desc: '造成 5 點物理傷害，並且獲得基於普攻造成傷害 2 倍的護盾（無回合限制）。'
      },
      {
        type: '1 技能',
        name: '榮耀讚歌',
        dmgType: '【物理】',
        cd: '2 回合',
        desc: '自身獲得基於生命上限 50% 的護盾（持續 2 回合），並造成一次 15 點物理傷害。下回合全隊獲得本次所有隊友造成的 70% 傷害轉化而成的護盾，最高獲得護盾不超過聖騎士自身血量上限。持有此方式獲得的護盾時，全體造成的傷害提高 20%。有 40% 的機率，獲得的護盾減少 50%。'
      },
      {
        type: '2 技能',
        name: '代受恩典',
        dmgType: '【守護】',
        cd: '2 回合',
        desc: '指定一名我方，在接下來的 2 回合自身獲得 15% 減傷，該隊友受到的傷害及負面狀態將由聖騎士承受。由此技能受到的傷害，將在技能持續時間結束後，聖騎士獲得傷害一半的護盾。有 50% 的機率聖騎士不獲得護盾。'
      }
    ],
    equipment: [
      { name: '晨曦誓約重錘', desc: '物理傷害 +5，生命值 +10。' },
      { name: '受難代贖者聖鎧', desc: '1 技能【榮耀讚歌】觸發「護盾減少 50%」的負面機率由 40% 降低至 15%。' },
      { name: '庇護之光軍旗', desc: '生命值 +20。被動：當聖騎士自身持有任何護盾時，受到的傷害額外降低 15%。' }
    ]
  },
  onmyoji: {
    roleName: '陰陽師',
    enName: 'Onmyōji',
    emoji: '📜',
    avatar: '/assets/characters/portraits/Onmyōji.webp',
    hp: 70,
    type: '魔法 / 咒術 / 削弱',
    passive: '【符道真解】：擲出的符咒依附於目標身上無回合限制（最多存在 10 張），每回合開始時有 70% 機率符咒掉落（每張獨立計算），沒掉落就再次觸發每一個效果；可藉由【急急如律令・百符引爆】一次性引爆所有符咒造成連鎖巨量傷害並清除符咒。',
    skills: [
      {
        type: '普攻',
        name: '引符術',
        dmgType: '【魔法】',
        cd: '無 CD',
        desc: '對目標造成 10 點魔法傷害。'
      },
      {
        type: '1 技能',
        name: '五鬼攝魂符',
        dmgType: '【魔法】',
        cd: '無 CD',
        desc: '向敵方擲出一道符咒，隨機施加以下 5 種負面效果之一（受核心被動機制影響，每回合開始時有 70% 機率符咒掉落，每張獨立計算，沒掉落就再次觸發每一個效果；敵方身上最多存在 10 張符咒）：\n【障目符】: 目標攻擊命中率大幅下降，此次攻擊有60%~100%的不對我方傷害。\n【封勁符】: 目標有100%機率在當前回合完全不造成任何傷害。\n【蝕體符】: 目標進入易傷狀態，受到的所有攻擊傷害提升10%。\n【惑心符】: 目標陷入心智混亂，出手時將造成的傷害50%~100%作用在自身。\n【抽髓符】: 扣除目標最大生命值 2% 的血量（百分比削血）。'
      },
      {
        type: '2 技能',
        name: '急急如律令・百符引爆',
        dmgType: '【魔法】',
        cd: '2 回合',
        desc: '引爆目標身上所有未掉落的符咒。若目標身上沒有符咒（0 張），不造成任何傷害。若目標身上有符咒，啟動基礎傷害 10 點，每張符咒額外增加 3 點傷害。單次引爆上限為 10 張符咒（滿 10 張時造成 40 點傷害）。引爆結算：技能結算後，目標身上所有符咒全數脫落並銷毀。'
      }
    ],
    equipment: [
      { name: '硃砂引靈筆', desc: '傷害 +5。普通攻擊有 25% 機率依附一道符咒。' },
      { name: '退魔水引狩衣', desc: '生命值 +20。符咒掉落機率由 60% 降低至 40%。' },
      { name: '八咫靈犀鏡', desc: '2 技能【急急如律令・百符引爆】每增加一張符咒額外增加的傷害由 3 點提升至 5 點。' }
    ]
  }
};

// 大廳成員卡片行內修改暱稱狀態
let isEditingMyName = false;
let editingNameValue = '';

// 本回合暫存選擇
let currentPendingAction = null;
let pendingActionRoundKey = null;
let currentPendingTarget = null;

// 打字機與戰鬥敘述鎖定狀態
let currentTypewriterTimer = null;
let currentTypewriterContext = null;
let activeNarrativeResolvers = new Set();
let lastTypedTransitionKey = null;
let isPlayingBattleNarrative = false;

// 全域轉場、大字幕與各階段打字機狀態
let currentActiveStage = null;
let lastAnnouncedBattleRound = 0;
let isPrologueTyping = false;
let prologueCompleted = false;
let prologueController = null;
let routeNarrativeDoneKey = null;
let routePresentationController = null;
let trapPresentationController = null;
let trapDisplay = null;
let trapStartedId = null;
let chestPresentationController = null;
let chestDisplay = null;
let chestStartedId = null;
let chestRewardCompletedId = null;
let routeInteractionReadyKey = null;
let eventDoneKey = null;

// 強制關閉全部彈窗（演出階段嚴格防阻擋）
function forceCloseAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => ModalMotion.hide(el));
  document.querySelectorAll('.chat-popup-card').forEach(el => el.classList.add('hidden'));
  const avatarModal = document.getElementById('avatarCustomModal');
  if (avatarModal) ModalMotion.hide(avatarModal);
  const chatPopup = document.getElementById('chatPopupCard');
  if (chatPopup) chatPopup.classList.add('hidden');
  if (typeof updateHudInventoryButtonState === 'function') updateHudInventoryButtonState();
}
if (typeof window !== 'undefined') window.forceCloseAllModals = forceCloseAllModals;

// ==========================================================================
// Presentation Orchestrator & Duplicate Prevention (P2-R1 Section 0, 1, 2)
// ==========================================================================
const presentationManager = {
  playedKeys: new Set(),
  isBlocking: false,
  timerState: 'STOPPED', // 'STOPPED' | 'WAITING_FOR_PRESENTATION' | 'RUNNING' | 'EXPIRED'

  hasPlayed(key) {
    return this.playedKeys.has(key);
  },

  markPlayed(key) {
    this.playedKeys.add(key);
  },

  clear() {
    this.playedKeys.clear();
    this.setBlocking(false);
    this.timerState = 'STOPPED';
  },

  setBlocking(blocking) {
    this.isBlocking = Boolean(blocking);
    if (this.isBlocking) {
      forceCloseAllModals();
    }
    const root = document.getElementById('presentationRoot');
    if (root) {
      if (this.isBlocking) {
        root.classList.add('interactive');
        document.body.classList.add('presentation-blocking');
      } else {
        root.classList.remove('interactive');
        document.body.classList.remove('presentation-blocking');
      }
    }
  }
};

// ==========================================================================
// 沉浸式音效系統 (SFXManager - Web Audio API Procedural Synthesizer)
// 沿用 presentation-core.js 的單一真實來源 SFXManager
// ==========================================================================
const sfx = (typeof sfxManager !== 'undefined' ? sfxManager : (typeof window !== 'undefined' && window.sfxManager ? window.sfxManager : null));

function initAudio() {
  if (sfx && typeof sfx.init === 'function') sfx.init();
}

function playSound(type, options) {
  if (sfx && typeof sfx.play === 'function') {
    return sfx.play(type, options);
  } else if (typeof window !== 'undefined' && window.playSound) {
    return window.playSound(type, options);
  }
}

// 正式 UI SVG 圖示產生器 (避免使用 Emoji)
function getIconSvg(name, extraClass = '') {
  return `<svg class="ui-icon svg-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

// 職業簡短定位標籤 (P2 規範：以簡短 Tag 呈現定位)
const ROLE_BADGES = {
  warrior: [
    { text: 'TANK', type: 'tank' },
    { text: '物理', type: '' },
    { text: '防護', type: '' }
  ],
  mage: [
    { text: 'DPS', type: 'dps' },
    { text: '魔法', type: '' },
    { text: '爆發', type: '' }
  ],
  archer: [
    { text: 'DPS', type: 'dps' },
    { text: '物理', type: '' },
    { text: '閃避', type: '' }
  ],
  assassin: [
    { text: 'DPS', type: 'dps' },
    { text: '物理', type: '' },
    { text: '暴擊', type: '' }
  ],
  bard: [
    { text: 'SUPPORT', type: 'support' },
    { text: '魔法', type: '' },
    { text: '群療', type: '' }
  ],
  alchemist: [
    { text: 'SUPPORT', type: 'support' },
    { text: '魔法', type: '' },
    { text: '調和', type: '' }
  ],
  druid: [
    { text: 'TANK', type: 'tank' },
    { text: '自然', type: '' },
    { text: '召喚', type: '' }
  ]
};

function getRoleIconName(roleKey) {
  const map = {
    warrior: 'shield',
    mage: 'magic',
    archer: 'arrow',
    assassin: 'sword',
    bard: 'sparkle',
    alchemist: 'poison',
    druid: 'summon', dreamweaver:'magic', stargazer:'sparkle', gladiator:'shield', samurai:'sword', sage:'info', paladin:'shield', onmyoji:'sparkle'
  };
  return map[roleKey] || 'user';
}

// 樓層開場大字幕播放紀錄（避免同一層切換重覆播放）

// DOM 元素引用
const elements = {
  // Badges & Header
  roomBadge: document.getElementById('roomBadge'),
  roomCodeText: document.getElementById('roomCodeText'),
  roomCopyToast: document.getElementById('roomCopyToast'),
  btnLeaveParty: document.getElementById('btnLeaveParty'),
  soundToggleBtn: document.getElementById('soundToggleBtn'),
  soundToggleIcon: document.getElementById('soundToggleIcon'),
  btnHeaderBurger: document.getElementById('btnHeaderBurger'),
  headerBurgerMenu: document.getElementById('headerBurgerMenu'),

  // Cinematic Banner & Transition Curtain
  screenTransitionCurtain: document.getElementById('screenTransitionCurtain'),
  stageCinematicBanner: document.getElementById('stageCinematicBanner'),
  cinematicBannerTitle: document.getElementById('cinematicBannerTitle'),
  cinematicBannerSub: document.getElementById('cinematicBannerSub'),

  // Views
  views: {
    entry: document.getElementById('viewEntry'),
    lobby: document.getElementById('viewLobby'),
    prologue: document.getElementById('viewPrologue'),
    route: document.getElementById('viewRoute'),
    transition: document.getElementById('viewTransition'),
    event: document.getElementById('viewEvent'),
    abyss: document.getElementById('viewAbyssDialogue'),
    battle: document.getElementById('viewBattle'),
    checkpoint: document.getElementById('viewCheckpoint'),
    end: document.getElementById('viewEnd')
  },

  // Modules 3-6: Inventory, Leader Skills, Abyss
  btnOpenInventory: document.getElementById('btnOpenInventory'),
  headerGoldDisplay: document.getElementById('headerGoldDisplay'),
  inventoryModal: document.getElementById('inventoryModal'),
  btnCloseInventoryModal: document.getElementById('btnCloseInventoryModal'),
  squadGrid: document.getElementById('squadGrid'),
  personalBagGrid: document.getElementById('personalBagGrid'),
  equippedSlotsGrid: document.getElementById('equippedSlotsGrid'),
  craftingRecipesList: document.getElementById('craftingRecipesList'),
  inventoryGoldCount: document.getElementById('inventoryGoldCount'),
  squadCapacityText: document.getElementById('squadCapacityText'),
  personalBagCapacityText: document.getElementById('personalBagCapacityText'),
  invStatHp: document.getElementById('invStatHp'),
  invStatPhys: document.getElementById('invStatPhys'),
  invStatMag: document.getElementById('invStatMag'),
  invStatDef: document.getElementById('invStatDef'),
  invInspectorPanel: document.getElementById('invInspectorPanel'),
  invInspectorContent: document.getElementById('invInspectorContent'),
  btnToggleCraftingPanel: document.getElementById('btnToggleCraftingPanel'),
  craftingPanelBody: document.getElementById('craftingPanelBody'),
  craftingToggleArrow: document.getElementById('craftingToggleArrow'),
  viewAbyssDialogue: document.getElementById('viewAbyssDialogue'),
  abyssBossAvatar: document.getElementById('abyssBossAvatar'),
  abyssBossName: document.getElementById('abyssBossName'),
  abyssStageTag: document.getElementById('abyssStageTag'),
  abyssDialogueTextBox: document.getElementById('abyssDialogueTextBox'),
  abyssChoicesContainer: document.getElementById('abyssChoicesContainer'),
  btnAdvanceAbyss: document.getElementById('btnAdvanceAbyss'),
  abyssRedEyeOverlay: document.getElementById('abyssRedEyeOverlay'),
  btnUseLeaderSkill: document.getElementById('btnUseLeaderSkill'),

  // Entry & Modals
  inputPlayerName: document.getElementById('inputPlayerName'),
  btnCreateRoom: document.getElementById('btnCreateRoom'),
  inputRoomCode: document.getElementById('inputRoomCode'),
  btnJoinRoom: document.getElementById('btnJoinRoom'),
  btnEntryAvatar: document.getElementById('btnEntryAvatar'),
  entryAvatarPreview: document.getElementById('entryAvatarPreview'),
  screenRecruit: document.getElementById('screenRecruit'),
  screenLobbyMenu: document.getElementById('screenLobbyMenu'),
  screenServerList: document.getElementById('screenServerList'),
  btnRandomName: document.getElementById('btnRandomName'),
  btnSubmitRecruit: document.getElementById('btnSubmitRecruit'),
  menuPlayerName: document.getElementById('menuPlayerName'),
  btnOpenServerList: document.getElementById('btnOpenServerList'),
  btnOpenClassArchive: document.getElementById('btnOpenClassArchive'),
  btnOpenProfileModal: document.getElementById('btnOpenProfileModal'),
  btnExitToRecruit: document.getElementById('btnExitToRecruit'),
  serverSlotsContainer: document.getElementById('serverSlotsContainer'),
  btnJoinServer: document.getElementById('btnJoinServer'),
  btnDirectConnectModalOpen: document.getElementById('btnDirectConnectModalOpen'),
  btnRefreshServerList: document.getElementById('btnRefreshServerList'),
  btnBackToLobbyMenu: document.getElementById('btnBackToLobbyMenu'),
  btnArchiveBackToMenu: document.getElementById('btnArchiveBackToMenu'),
  directConnectModal: document.getElementById('directConnectModal'),
  btnCloseDirectConnectModal: document.getElementById('btnCloseDirectConnectModal'),
  profileModal: document.getElementById('profileModal'),
  btnProfileAvatar: document.getElementById('btnProfileAvatar'),
  profileAvatarPreview: document.getElementById('profileAvatarPreview'),
  profileNewNameInput: document.getElementById('profileNewNameInput'),
  profileCurrentClassText: document.getElementById('profileCurrentClassText'),
  btnCloseProfileModal: document.getElementById('btnCloseProfileModal'),
  btnCancelProfileModal: document.getElementById('btnCancelProfileModal'),
  btnSaveProfileModal: document.getElementById('btnSaveProfileModal'),

  // Lobby
  lobbyMemberCount: document.getElementById('lobbyMemberCount'),
  lobbyMemberList: document.getElementById('lobbyMemberList'),
  roleSelectionGrid: document.getElementById('roleSelectionGrid'),
  btnStartGame: document.getElementById('btnStartGame'),
  leaderStartArea: document.getElementById('leaderStartArea'),
  memberWaitArea: document.getElementById('memberWaitArea'),
  btnToggleReady: document.getElementById('btnToggleReady'),
  readyBtnText: document.getElementById('readyBtnText'),
  startRequirementText: document.getElementById('startRequirementText'),
  transferLeaderModal: document.getElementById('transferLeaderModal'),
  transferLeaderModalDesc: document.getElementById('transferLeaderModalDesc'),
  btnCancelTransferLeader: document.getElementById('btnCancelTransferLeader'),
  btnConfirmTransferLeader: document.getElementById('btnConfirmTransferLeader'),

  // Game Start Overlay (P2-R1.1 Section 3)
  gameStartOverlay: document.getElementById('gameStartOverlay'),
  gameTitleContainer: document.getElementById('gameTitleContainer'),
  prologuePresentationContainer: document.getElementById('prologuePresentationContainer'),
  prologuePresBody: document.getElementById('prologuePresBody'),

  // Transition
  transitionTypewriterTitle: document.getElementById('transitionTypewriterTitle'),
  transitionRouteTag: document.getElementById('transitionRouteTag'),
  transitionStoryTitle: document.getElementById('transitionStoryTitle'),
  transitionStoryText: document.getElementById('transitionStoryText'),

  // Avatar Modal
  avatarModalOverlay: document.getElementById('avatarModalOverlay'),
  btnCloseAvatarModal: document.getElementById('btnCloseAvatarModal'),
  modalAvatarPreview: document.getElementById('modalAvatarPreview'),
  modalAvatarTypeLabel: document.getElementById('modalAvatarTypeLabel'),
  tabHeroBtn: document.getElementById('tabHeroBtn'),
  tabEmojiBtn: document.getElementById('tabEmojiBtn'),
  tabUploadBtn: document.getElementById('tabUploadBtn'),
  tabHeroContent: document.getElementById('tabHeroContent'),
  tabEmojiContent: document.getElementById('tabEmojiContent'),
  tabUploadContent: document.getElementById('tabUploadContent'),
  heroRoleOptionCard: document.getElementById('heroRoleOptionCard'),
  heroRoleOptionPreview: document.getElementById('heroRoleOptionPreview'),
  heroRoleOptionTitle: document.getElementById('heroRoleOptionTitle'),
  heroRoleOptionDesc: document.getElementById('heroRoleOptionDesc'),
  heroRoleOptionBadge: document.getElementById('heroRoleOptionBadge'),
  emojiGridAdventure: document.getElementById('emojiGridAdventure'),
  emojiGridCreatures: document.getElementById('emojiGridCreatures'),
  emojiGridWeapons: document.getElementById('emojiGridWeapons'),
  customEmojiInput: document.getElementById('customEmojiInput'),
  btnApplyCustomEmoji: document.getElementById('btnApplyCustomEmoji'),
  avatarDropzone: document.getElementById('avatarDropzone'),
  avatarFileInput: document.getElementById('avatarFileInput'),
  btnBrowseFile: document.getElementById('btnBrowseFile'),
  btnResetAvatarDefault: document.getElementById('btnResetAvatarDefault'),
  btnCancelAvatar: document.getElementById('btnCancelAvatar'),
  btnSaveAvatar: document.getElementById('btnSaveAvatar'),

  // Route
  routeFloorNum: document.getElementById('routeFloorNum'),
  routeFloorHeaderNum: document.getElementById('routeFloorHeaderNum'),
  routeMainTitle: document.getElementById('routeMainTitle'),
  routeDiffPercent: document.getElementById('routeDiffPercent'),
  routeTimerProgress: document.getElementById('routeTimerProgress'),
  routeTimerText: document.getElementById('routeTimerText'),
  routeStatusText: document.getElementById('routeStatusText'),
  routeOptionsGrid: document.getElementById('routeOptionsGrid'),
  routeVotersStatusList: document.getElementById('routeVotersStatusList'),
  routeAtmosphereText: document.getElementById('routeAtmosphereText'),
  floorIntroOverlay: document.getElementById('floorIntroOverlay'),
  floorIntroNumber: document.getElementById('floorIntroNumber'),
  floorIntroTitle: document.getElementById('floorIntroTitle'),
  routeTimerBar: document.getElementById('routeTimerBar'),
  hexMapContainer: document.getElementById('hexMapContainer'),

  // Event
  eventIcon: document.getElementById('eventIcon'),
  eventTitle: document.getElementById('eventTitle'),
  eventStoryText: document.getElementById('eventStoryText'),
  eventCardBox: document.getElementById('eventCardBox'),
  trapDiscoverySection: document.getElementById('trapDiscoverySection'),
  trapDiscoveryStory: document.getElementById('trapDiscoveryStory'),
  chestDiscoverySection: document.getElementById('chestDiscoverySection'),
  chestDiscoveryStory: document.getElementById('chestDiscoveryStory'),
  chestInteractionArea: document.getElementById('chestInteractionArea'),
  btnOpenChest: document.getElementById('btnOpenChest'),
  chestPresentationOverlay: document.getElementById('chestPresentationOverlay'),
  presentationChestVisual: document.getElementById('presentationChestVisual'),
  presentationRewardContent: document.getElementById('presentationRewardContent'),
  presentationRewardRarity: document.getElementById('presentationRewardRarity'),
  presentationRewardTitle: document.getElementById('presentationRewardTitle'),
  presentationRewardDesc: document.getElementById('presentationRewardDesc'),
  presentationRewardMeta: document.getElementById('presentationRewardMeta'),
  eventDetails: document.getElementById('eventDetails'),

  // Battle
  battleFloorNum: document.getElementById('battleFloorNum'),
  battleRoundNum: document.getElementById('battleRoundNum'),
  battleTimerCount: document.getElementById('battleTimerCount'),
  battleNarrativeBox: document.getElementById('battleNarrativeBox'),
  battleNarrativeText: document.getElementById('battleNarrativeText'),
  monsterCard: document.getElementById('monsterCard'),
  battleEnemiesStage: document.getElementById('battleEnemiesStage'),
  floatingEnemyTooltip: document.getElementById('floatingEnemyTooltip'),
  floatingItemTooltip: document.getElementById('floatingItemTooltip'),
  monsterAvatarWrap: document.getElementById('monsterAvatarWrap'),
  monsterAvatar: document.getElementById('monsterAvatar'),
  monsterSlashOverlay: document.getElementById('monsterSlashOverlay'),
  monsterMagicOverlay: document.getElementById('monsterMagicOverlay'),
  monsterPixelFx: document.getElementById('monsterPixelFx'),
  monsterFloatingContainer: document.getElementById('monsterFloatingContainer'),
  monsterName: document.getElementById('monsterName'),
  monsterResTag: document.getElementById('monsterResTag'),
  monsterDesc: document.getElementById('monsterDesc'),
  monsterHpText: document.getElementById('monsterHpText'),
  monsterHpFill: document.getElementById('monsterHpFill'),
  monsterAtkText: document.getElementById('monsterAtkText'),
  monsterUltName: document.getElementById('monsterUltName'),
  monsterBuffsRow: document.getElementById('monsterBuffsRow'),
  shieldNoticeBadge: document.getElementById('shieldNoticeBadge'),
  battleTeammatesGrid: document.getElementById('battleTeammatesGrid'),

  // Player action
  myRoleEmoji: document.getElementById('myRoleEmoji'),
  myRoleName: document.getElementById('myRoleName'),
  myHpSummary: document.getElementById('myHpSummary'),
  myAtkSummary: document.getElementById('myAtkSummary'),
  myEquipsSummary: document.getElementById('myEquipsSummary'),
  myActionStatus: document.getElementById('myActionStatus'),
  mySkillsRow: document.getElementById('mySkillsRow'),

  // Presentation Root & Overlays (P2-R1 Section 3, 20, 23, 24)
  presentationRoot: document.getElementById('presentationRoot'),
  trapPresentationOverlay: document.getElementById('trapPresentationOverlay'),
  trapVictimsContainer: document.getElementById('trapVictimsContainer'),
  presentationFxContainer: document.getElementById('presentationFxContainer'),

  // Combat Action Banner (3-column CSS Grid)
  combatActionBanner: document.getElementById('combatActionBanner'),
  combatBannerActor: document.getElementById('combatBannerActor'),
  combatBannerActorAvatar: document.getElementById('combatBannerActorAvatar'),
  combatBannerActorName: document.getElementById('combatBannerActorName'),
  combatBannerCenter: document.getElementById('combatBannerCenter'),
  combatBannerBadge: document.getElementById('combatBannerBadge'),
  combatBannerTitle: document.getElementById('combatBannerTitle'),
  combatBannerTags: document.getElementById('combatBannerTags'),
  combatBannerHiddenNote: document.getElementById('combatBannerHiddenNote'),
  combatBannerTarget: document.getElementById('combatBannerTarget'),
  combatBannerTargetAvatar: document.getElementById('combatBannerTargetAvatar'),
  combatBannerTargetName: document.getElementById('combatBannerTargetName'),

  // Skill Selection & Lock Bar
  skillSelectionBar: document.getElementById('skillSelectionBar'),
  selectionPromptText: document.getElementById('selectionPromptText'),
  selectionTargetText: document.getElementById('selectionTargetText'),
  btnConfirmLock: document.getElementById('btnConfirmLock'),
  btnUnlockAction: document.getElementById('btnUnlockAction'),

  // Equipment Drop Modal
  equipDropModal: document.getElementById('equipDropModal'),
  equipModalTitle: document.getElementById('equipModalTitle'),
  equipModalSubtitle: document.getElementById('equipModalSubtitle'),
  dropItemName: document.getElementById('dropItemName'),
  dropItemType: document.getElementById('dropItemType'),
  dropItemDesc: document.getElementById('dropItemDesc'),
  currentEquipCount: document.getElementById('currentEquipCount'),
  currentEquipsList: document.getElementById('currentEquipsList'),
  equipReplaceNotice: document.getElementById('equipReplaceNotice'),
  btnEquipItem: document.getElementById('btnEquipItem'),
  btnDiscardItem: document.getElementById('btnDiscardItem'),

  // Checkpoint
  cpFloorNum: document.getElementById('cpFloorNum'),
  btnCpContinue: document.getElementById('btnCpContinue'),
  btnCpEnd: document.getElementById('btnCpEnd'),
  cpLeaderControls: document.getElementById('cpLeaderControls'),
  cpMemberNotice: document.getElementById('cpMemberNotice'),

  // End
  endIcon: document.getElementById('endIcon'),
  endTitle: document.getElementById('endTitle'),
  endSubtitle: document.getElementById('endSubtitle'),
  endStatsBox: document.getElementById('endStatsBox'),
  btnRestartLobby: document.getElementById('btnRestartLobby'),

  // Logs & Floating Chat
  combatLogWindow: document.getElementById('combatLogWindow'),
  battleLogCard: document.getElementById('battleLogCard'),
  floatingChatContainer: document.getElementById('floatingChatContainer'),
  floatingChatBtn: document.getElementById('floatingChatBtn'),
  chatUnreadBadge: document.getElementById('chatUnreadBadge'),
  chatToastBubble: document.getElementById('chatToastBubble'),
  chatBubbleSender: document.getElementById('chatBubbleSender'),
  chatBubbleText: document.getElementById('chatBubbleText'),
  btnCloseChatBubble: document.getElementById('btnCloseChatBubble'),
  chatPopupCard: document.getElementById('chatPopupCard'),
  btnCloseChatPopup: document.getElementById('btnCloseChatPopup'),
  chatMessageList: document.getElementById('chatMessageList'),
  chatInput: document.getElementById('chatInput'),
  btnSendChat: document.getElementById('btnSendChat'),

  // Modal
  targetModal: document.getElementById('targetModal'),
  targetModalTitle: document.getElementById('targetModalTitle'),
  targetModalDesc: document.getElementById('targetModalDesc'),
  targetModalList: document.getElementById('targetModalList'),
  btnCancelTarget: document.getElementById('btnCancelTarget'),
  discardConfirmModal: document.getElementById('discardConfirmModal'),
  discardModalTitle: document.getElementById('discardModalTitle'),
  discardModalDesc: document.getElementById('discardModalDesc'),
  btnCancelDiscard: document.getElementById('btnCancelDiscard'),
  btnConfirmDiscard: document.getElementById('btnConfirmDiscard'),
  minionDetailModal: document.getElementById('minionDetailModal'),
  minionDetailTitle: document.getElementById('minionDetailTitle'),
  minionDetailSubtitle: document.getElementById('minionDetailSubtitle'),
  minionDetailList: document.getElementById('minionDetailList'),
  btnCloseMinionModal: document.getElementById('btnCloseMinionModal'),
  btnConfirmMinionModal: document.getElementById('btnConfirmMinionModal'),
  roleDetailModal: document.getElementById('roleDetailModal'),
  roleDetailTitle: document.getElementById('roleDetailTitle'),
  roleDetailSubtitle: document.getElementById('roleDetailSubtitle'),
  roleDetailAvatarWrap: document.getElementById('roleDetailAvatarWrap'),
  roleDetailBody: document.getElementById('roleDetailBody'),
  btnCloseRoleDetailModal: document.getElementById('btnCloseRoleDetailModal'),
  btnConfirmRoleDetailModal: document.getElementById('btnConfirmRoleDetailModal'),

  // Pause & End Battle Controls
  btnPauseGame: document.getElementById('btnPauseGame'),
  btnEndBattle: document.getElementById('btnEndBattle'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  btnResumeGameBanner: document.getElementById('btnResumeGameBanner'),
  endBattleModal: document.getElementById('endBattleModal'),
  btnConfirmRetreat: document.getElementById('btnConfirmRetreat'),
  btnCancelEndBattle: document.getElementById('btnCancelEndBattle')
};

// 初始化姓名輸入框
if (myName) {
  elements.inputPlayerName.value = myName;
}

// 監聽 Socket 連線
socket.on('connect', () => {
  myId = socket.id;
  window.RecruitCopy?.setPlayerId(myId);
  console.log('連線至伺服器，ID:', myId);
});
socket.on('disconnect', () => {
  battlePhaseController?.abort();
  combatQueueController?.abort();
  BattleHud.reset('ROUND_TICK');
  releaseBattleEncounterScene();
  document.body.classList.remove('battle-intro-active');
  window.RecruitCopy?.setPlayerId(null);
  if (window.RewardPresentation?.isPlaying) window.RewardPresentation.cancel();
});

socket.on('init:constants', (data) => {
  classesData = data.classes || {};
  routesData = data.routes || [];
  if (data.roleDetails) {
    roleDetailsData = data.roleDetails;
  }
  if(typeof registerSkillCopies==='function')registerSkillCopies(classesData,roleDetailsData);
  renderRoleSelectionGrid();
  updateHeroRoleOptionUI();
});
socket.on('studio:content', data => { if(window.StudioContent)StudioContent.install(data,{pin:true}); });
window.addEventListener('studio:content-ready',()=>{
  if(Object.keys(classesData).length){
    const me=roomState?.state==='LOBBY'&&!isClassArchiveMode?getMyPlayer():null;
    if(me)renderLobby(me,roomState.leaderId===myId);
    else renderRoleSelectionGrid();
    updateHeroRoleOptionUI();
  }
  initHeroAvatarGrid();
  updateEntryAvatarPreview();
});

let pendingAuthoritativeState = null;

socket.on('room:update', (state) => {
  const amIInRoom = Boolean(myId && state.players && state.players.some(p => p.id === myId));
  if (!amIInRoom) {
    combatQueueController?.abort();
    BattleHud.reset();
    battlePhaseController?.abort();
    releaseBattleEncounterScene();
    document.body.classList.remove('battle-intro-active');
    roomState = null;
    currentRoomCode = null;
    switchView('entry');
    goToEntryScreen('screenLobbyMenu');
    return;
  }
  if(state.state!=='IN_BATTLE'&&typeof clearGladiatorPresentationState==='function')clearGladiatorPresentationState();
  if (battlePhaseController && (state.state !== 'IN_BATTLE' || battlePhaseController.battleKey !== battleSceneKey(state))) {
    battlePhaseController.abort();
    releaseBattleEncounterScene();
    document.body.classList.remove('battle-intro-active');
    battleControlsReadyKey = null;
  }
  if (combatQueueController && (state.state !== 'IN_BATTLE' || combatQueueController.battleKey !== battleSceneKey(state))) { combatQueueController.abort(); pendingAuthoritativeState = null; }
  // 若目前正透過 Presentation Queue 逐步演出戰鬥交鋒（A5 規範）
  // 嚴禁以權威狀態直接提前覆蓋演出中的 HP / tempHp / bossHp / death state！
  if (isProcessingPresentationQueue) {
    pendingAuthoritativeState = state;
    syncChatMessages(state.chatMessages);
    return;
  }
  roomState = typeof projectChestDisplayState === 'function' ? projectChestDisplayState(projectTrapDisplayState(state)) : projectTrapDisplayState(state);
  roomState = projectExpandedDisplayState(roomState);
  currentRoomCode = state.code;
  renderApp();
  updateHeroRoleOptionUI();
  syncChatMessages(state.chatMessages);
});

function showPrologueSkipNotice(message = '隊長已跳過開頭序章') {
  let notice = document.getElementById('prologueSkipNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'prologueSkipNotice';
    notice.className = 'prologue-skip-notice';
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.remove('hidden');
  notice.classList.remove('is-floating');
  void notice.offsetWidth;
  notice.classList.add('is-floating');
  clearTimeout(notice._timer);
  notice._timer = setTimeout(() => {
    notice.classList.add('hidden');
    notice.classList.remove('is-floating');
  }, 3200);
}
if (typeof window !== 'undefined') window.showPrologueSkipNotice = showPrologueSkipNotice;

socket.on('event:shop_player_ready', (data) => {
  if (data?.message) {
    showShopReadyNotice(data.message);
  }
});

socket.on('event:shop_closed', () => {
  closeInventoryModal();
  forceCloseAllModals();
  hideItemTooltip(true);
});

socket.on('prologue:skipped', (data) => {
  if (data?.leaderId && data.leaderId === myId) return;
  showPrologueSkipNotice('隊長已跳過開頭序章');
});

// 取得職業標準圖像 HTML (Combat Resolution 規範：嚴禁使用自訂/Discord頭像，必須使用職業原畫或變身原畫)
function getClassPortraitHtml(roleOrPlayer, className = 'combat-banner-portrait') {
  let roleKey = '';
  let druidForm = null;
  if (typeof roleOrPlayer === 'string') {
    roleKey = roleOrPlayer;
  } else if (roleOrPlayer && typeof roleOrPlayer === 'object') {
    roleKey = roleOrPlayer.role || roleOrPlayer.sourceRole || '';
    druidForm = roleOrPlayer.druidForm || null;
  }
  if (roleKey === 'druid' && druidForm) {
    if (druidForm === 'werewolf') {
      return `<img src="/assets/characters/forms/druid/狼人.webp" class="${className}" alt="狼人">`;
    } else if (druidForm === 'treant' || druidForm === 'tree') {
      return `<img src="/assets/characters/forms/druid/遠古樹精.webp" class="${className}" alt="遠古樹精">`;
    } else if (druidForm === 'bear') {
      return `<img src="/assets/characters/forms/druid/巨熊.webp" class="${className}" alt="巨熊">`;
    }
  }
  const roleInfo = roleKey ? classesData[roleKey] : null;
  if (roleInfo && roleInfo.avatar) {
    return `<img src="${roleInfo.avatar}" class="${className}" alt="${escapeHtml(roleInfo.name || roleKey)}">`;
  }
  const icon = getRoleIconName(roleKey || 'warrior');
  return `<div class="${className} avatar-icon-badge">${getIconSvg(icon)}</div>`;
}

// 取得職業標準中文名稱
function getClassDisplayName(roleOrPlayer) {
  let roleKey = '';
  if (typeof roleOrPlayer === 'string') {
    roleKey = roleOrPlayer;
  } else if (roleOrPlayer && typeof roleOrPlayer === 'object') {
    roleKey = roleOrPlayer.role || roleOrPlayer.sourceRole || '';
  }
  const roleInfo = roleKey ? classesData[roleKey] : null;
  return roleInfo ? roleInfo.name : '冒險者';
}

// Keep the actual preceding scene inert during the encounter story and warning.
// No cloned battlefield, duplicate IDs or parallel combat state is created.
let battleEncounterScene=null;
function holdBattleEncounterScene(state){
  if(state?.state!=='IN_BATTLE'||state.battleRound!==1||presentationManager.hasPlayed(`BOSS_INTRO_${battleSceneKey(state)}`))return;
  if(battleEncounterScene)return;
  const entry=Object.entries(elements.views).find(([key,node])=>key!=='battle'&&node.classList.contains('active'));
  if(entry){const [view,node]=entry;battleEncounterScene={view,node,inert:node.inert,ariaHidden:node.getAttribute('aria-hidden')};node.inert=true;node.setAttribute('aria-hidden','true');node.classList.add('encounter-scene-held');}
  gateDestinationView('battle');document.body.classList.add('battle-intro-active');
}
function releaseBattleEncounterScene(){
  const held=battleEncounterScene;if(!held)return;
  battleEncounterScene=null;held.node.inert=held.inert;held.node.classList.remove('encounter-scene-held');
  if(held.ariaHidden===null)held.node.removeAttribute('aria-hidden');else held.node.setAttribute('aria-hidden',held.ariaHidden);
}
// 切換視圖
let audioView = null;

function switchView(viewName) {
  if(viewName!=='battle')releaseBattleEncounterScene();
  if(viewName==='battle'&&battleEncounterScene){gateDestinationView('battle');return;}
  document.body.classList.toggle("is-exploring", ["route", "transition", "event", "battle"].includes(viewName));
  if (audioView !== viewName) {
    if (audioView !== null&&!(viewName==='battle'&&roomState?.state==='IN_BATTLE')) sfx?.stopAll({preserveTails:true});
    const preserveDefeatMusic=viewName==='end'&&roomState?.state==='GAME_OVER'&&
      typeof bgmManager!=='undefined'&&['normal','boss','encounter','dying'].includes(bgmManager.mode);
    if (['entry','lobby','prologue','end'].includes(viewName)&&typeof bgmManager!=='undefined'&&!preserveDefeatMusic)bgmManager.reset();
    audioView = viewName;
    if(['route','transition','event'].includes(viewName)&&typeof bgmManager!=='undefined'&&bgmManager.mode==='idle')void bgmManager.resumeNormal();
  }
  Object.keys(elements.views).forEach(key => {
    if (key === viewName) {
      elements.views[key].classList.add('active');
    } else {
      elements.views[key].classList.remove('active');
    }
  });

  if (viewName === 'battle' && !document.body.classList.contains('battle-intro-active')) {
    revealDestinationView('battle');
  }

  // 發起組隊登入頁面 (entry) 隱藏懸浮聊天按鈕與頂部房號/離開小隊，進入選角色 (lobby) 及後續頁面時顯示
  if (viewName === 'entry') {
    if (elements.roomBadge) elements.roomBadge.classList.add('hidden');
    if (elements.btnLeaveParty) elements.btnLeaveParty.classList.add('hidden');
    if (elements.floatingChatContainer) {
      elements.floatingChatContainer.classList.add('hidden');
      dismissChatBubble();
      toggleChat(false);
    }
  } else {
    if (elements.floatingChatContainer) {
      elements.floatingChatContainer.classList.remove('hidden');
    }
  }
}

// Presentation-Gated View Reveal (P2-R1.1 Section 4)
function gateDestinationView(viewName) {
  const v = elements.views ? elements.views[viewName] : null;
  if (v) v.classList.add('view-gated-hidden');
}

function revealDestinationView(viewName) {
  const v = elements.views ? elements.views[viewName] : null;
  if (v) v.classList.remove('view-gated-hidden');
}

// 渲染整體畫面
function renderApp() {
  if (!roomState) return;
  holdBattleEncounterScene(roomState);
  syncNarrativeControls(roomState);

  if (victoryPresentationController && (roomState.state !== 'BATTLE_VICTORY' ||
      roomState.currentVictory?.presentationId !== victoryPresentationController.presentationId)) {
    victoryPresentationController.abort();
    victoryPresentationController = null;
    victoryStartedId = null;
  }
  if (prologueController && roomState.state !== 'PROLOGUE') {
    prologueController.abort();
  }
  if (routePresentationController && (roomState.state !== 'CHOOSING_ROUTE' ||
      routePresentationController.presentationId !== roomState.routePresentationId)) {
    routePresentationController.abort();
  }

  if (trapPresentationController && (roomState.state !== 'EVENT' ||
      roomState.currentEvent?.type !== 'trap' ||
      roomState.currentEvent.presentationId !== trapPresentationController.presentationId)) {
    trapPresentationController.abort();
  }
  if (roomState.state !== 'EVENT' || roomState.currentEvent?.type !== 'trap') {
    trapDisplay = null;
    trapStartedId = null;
  }

  if (chestPresentationController && (roomState.state !== 'EVENT' ||
      !['treasure', 'chest'].includes(roomState.currentEvent?.type) ||
      roomState.currentEvent.presentationId !== chestPresentationController.presentationId)) {
    chestPresentationController.abort();
  }
  if (roomState.state !== 'EVENT' || !['treasure', 'chest'].includes(roomState.currentEvent?.type)) {
    chestDisplay = null;
    chestStartedId = null;
    chestRewardCompletedId = null;
  }


  const me = roomState.players.find(p => p.id === myId);
  const isLeader = roomState.leaderId === myId;

  // 更新頂部資訊條 (僅保留點擊可複製的房號)
  if (elements.roomBadge) elements.roomBadge.classList.remove('hidden');
  if (elements.roomCodeText) elements.roomCodeText.textContent = roomState.code;

  if (me) {
    const savedAvatar = localStorage.getItem('dungeon_custom_avatar');

    // 自動同步本機儲存之自訂頭貼 (若非職業預設)
    if (savedAvatar && !me.customAvatar) {
      socket.emit('player:update_avatar', { avatar: savedAvatar });
    }
  }

  // 放棄挑戰按鈕控制（暫停按鈕已移除）
  if (elements.btnPauseGame) elements.btnPauseGame.classList.add('hidden');
  if (elements.pauseOverlay) elements.pauseOverlay.classList.add('hidden');
  if (roomState.state === 'LOBBY' || roomState.state === 'GAME_OVER' || roomState.state === 'VICTORY') {
    elements.btnEndBattle.classList.add('hidden');
  } else {
    if (isLeader) {
      elements.btnEndBattle.classList.remove('hidden');
    } else {
      elements.btnEndBattle.classList.add('hidden');
    }
  }

  // 更新行囊按鈕與金幣 (Module 3)
  if (elements.btnOpenInventory) {
    if (!roomState || roomState.state === 'ENTRY' || roomState.state === 'LOBBY' || roomState.state === 'GAME_OVER' || roomState.state === 'VICTORY') {
      elements.btnOpenInventory.classList.add('hidden');
    } else {
      elements.btnOpenInventory.classList.remove('hidden');
    }
  }
  if (elements.headerGoldDisplay) {
    elements.headerGoldDisplay.textContent = `${roomState.gold ?? 0} G`;
  }
  const goldPill = document.getElementById('headerGoldPill');
  if (goldPill) {
    if (!roomState || roomState.state === 'ENTRY' || roomState.state === 'GAME_OVER') {
      goldPill.classList.add('hidden');
    } else {
      goldPill.classList.remove('hidden');
    }
  }
  const centerInfo = document.getElementById('headerCenterInfo');
  if (centerInfo) {
    if (!roomState || roomState.state === 'ENTRY') {
      centerInfo.style.opacity = '0';
      centerInfo.style.pointerEvents = 'none';
    } else {
      centerInfo.style.opacity = '1';
      centerInfo.style.pointerEvents = 'auto';
      const floorDisp = document.getElementById('hudFloorDisplay');
      const turnDisp = document.getElementById('hudTurnDisplay');
      const phaseDisp = document.getElementById('hudPhaseDisplay');
      if (floorDisp) floorDisp.textContent = `FLOOR ${String(roomState.floor || 1).padStart(2, '0')}`;
      if (turnDisp) turnDisp.textContent = `TURN ${String(roomState.battleRound || roomState.turn || 1).padStart(2, '0')}`;
      if (phaseDisp) {
        const pMap = {
          'LOBBY': 'LOBBY',
          'PROLOGUE': 'PROLOGUE',
          'ROUTE': 'EXPLORATION',
          'TRANSITION': 'EXPLORATION',
          'IN_BATTLE': 'BATTLE',
          'BATTLE_VICTORY': 'REWARD',
          'CHECKPOINT': 'REST',
          'EVENT': 'EVENT',
          'GAME_OVER': 'DEFEAT',
          'VICTORY': 'VICTORY'
        };
        phaseDisp.textContent = pMap[roomState.state] || roomState.state;
      }
    }
  }
  if (elements.inventoryModal && !elements.inventoryModal.classList.contains('hidden')) {
    renderInventoryModal();
  }

  // 檢查階段變更並觸發 1 秒轉場與專屬像素大字幕
  checkStageTransition(roomState);

  // 根據房間階段切換視圖
  switch (roomState.state) {
    case 'LOBBY':
      if (isClassArchiveMode) {
        isClassArchiveMode = false;
        window.isClassArchiveMode = false;
        const teamCard = document.querySelector('.team-card');
        if (teamCard) teamCard.classList.remove('hidden');
        const viewLobby = document.getElementById('viewLobby');
        if (viewLobby) viewLobby.classList.remove('archive-mode');
        const btnArchiveBack = document.getElementById('btnArchiveBackToMenu');
        if (btnArchiveBack) btnArchiveBack.classList.add('hidden');
        const exitBtn = document.getElementById('btnLobbyExitRoom');
        if (exitBtn) exitBtn.classList.remove('hidden');
        const titleEl = document.getElementById('rolePanelTitle');
        if (titleEl) titleEl.innerHTML = '選擇職業 <small>SELECT CHARACTER</small>';
      }
      switchView('lobby');
      presentationManager.clear();
      prologueCompleted = false;
      isPrologueTyping = false;
      routeNarrativeDoneKey = null;
      routeInteractionReadyKey = null;
      eventDoneKey = null;
      lastAnnouncedBattleRound = 0;
      renderLobby(me, isLeader);
      break;

    case 'PROLOGUE':
      switchView('prologue');
      renderPrologue();
      break;

    case 'CHOOSING_ROUTE':
      switchView('route');
      renderRouteChoice(me, isLeader);
      break;

    case 'TRANSITION':
      switchView('transition');
      renderTransition();
      break;

    case 'EVENT':
      switchView('event');
      renderEvent();
      break;

    case 'ABYSS_DIALOGUE':
      switchView('abyss');
      renderAbyssDialogue(me, isLeader);
      break;

    case 'IN_BATTLE':
      switchView('battle');
      renderBattle(me, isLeader);
      break;

    case 'BATTLE_VICTORY':
      if (roomState.victoryInteractionReady) renderBattle(me, isLeader);
      switchView('battle');
      renderBattleVictory();
      break;

    case 'CHECKPOINT':
      switchView('checkpoint');
      renderCheckpoint(me, isLeader);
      break;

    case 'GAME_OVER':
      switchView('end');
      renderGameOver(isLeader);
      break;

    case 'VICTORY':
      switchView('end');
      renderVictory(isLeader);
      break;
  }

  // 更新日誌
  renderLogs();

  // 檢查並渲染戰利品裝備抉擇彈窗 (上限 4 件與手動替換)
  renderPendingDropModal(me);
}

let selectedReplaceIndex = -1;

// 渲染戰利品裝備抉擇 / 替換 Modal (上限 4 件)
function renderPendingDropModal(me) {
  if (!elements.equipDropModal) return;

  const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState) || {};
  const dropInfo = state.pendingDrop;
  if (state.state === 'BATTLE_VICTORY' && !state.victoryInteractionReady) {
    ModalMotion.hide(elements.equipDropModal); return;
  }
    // Phase 4: Gate equip modal until chest presentation and reward reveal have settled
  if (state.state === 'EVENT' && state.currentEvent?.type === 'treasure') {
    if (chestRewardCompletedId !== state.currentEvent.presentationId) {
      ModalMotion.hide(elements.equipDropModal);
      return;
    }
  }

  const effectiveMyId = myId || me?.id || (state.players && state.players[0]?.id);
  if (!dropInfo || !me || (dropInfo.ownerId && dropInfo.ownerId !== effectiveMyId)) {
    ModalMotion.hide(elements.equipDropModal);
    selectedReplaceIndex = -1;
    return;
  }

  // A pending choice can arrive before its item payload on older servers.
  // Keep the discard/recovery action available instead of throwing or trapping the owner.
  const drop = dropInfo.drop || {};
  const equipOverride = window.StudioContent?.rows('story_copies')?.find(s=>s.category==='equipment'&&s.story_key===('equip.'+drop.role+'.'+drop.id));
  const dropName = equipOverride?.title || drop.name || '未命名裝備';
  const dropDesc = equipOverride?.body || drop.desc || drop.statDesc || '';
  elements.equipModalTitle.innerHTML = `${getIconSvg('chest')} <span>獲得戰利品裝備：【${escapeHtml(dropName)}】！</span>`;
  elements.equipModalSubtitle.textContent = `你在${dropInfo.source === 'battle' ? '擊敗怪物' : '探索寶箱'}後獲得了這件裝備！請抉擇是否穿戴（每位角色上限 4 件）：`;
  elements.dropItemName.textContent = dropName;
  elements.dropItemType.innerHTML = drop.type === 'weapon' ? `${getIconSvg('sword')} 武器` : (drop.type === 'armor' ? `${getIconSvg('shield')} 防具` : `${getIconSvg('sparkle')} 飾品`);
  elements.dropItemDesc.textContent = dropDesc;
  const dropItemIcon = elements?.dropItemIcon || (typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('dropItemIcon') : null);
  if (dropItemIcon && typeof renderItemIconHtml === 'function') {
    dropItemIcon.innerHTML = renderItemIconHtml(drop, 'drop-modal-icon-img');
  }

  const myEquips = me.equips || [];
  elements.currentEquipCount.textContent = myEquips.length;
  const isFull = myEquips.length >= 3;

  const isUniqueRestricted = (drop.id === 'w_greatsword' || drop.id === 'b_violin');
  const alreadyOwnsUnique = isUniqueRestricted && myEquips.some((eq, idx) => eq.id === drop.id && idx !== selectedReplaceIndex);

  if (alreadyOwnsUnique) {
    elements.equipReplaceNotice.textContent = `【${drop.name}】為神兵唯一裝備，不可重複穿戴！`;
    elements.equipReplaceNotice.classList.remove('hidden');
    elements.btnEquipItem.disabled = true;
    elements.btnEquipItem.style.opacity = '0.5';
    elements.btnEquipItem.style.cursor = 'not-allowed';
  } else {
    elements.btnEquipItem.disabled = false;
    elements.btnEquipItem.style.opacity = '';
    elements.btnEquipItem.style.cursor = '';
    if (isFull) {
      elements.equipReplaceNotice.textContent = '裝備已滿 4 件，請從下方點選一件舊裝備進行替換：';
      elements.equipReplaceNotice.classList.remove('hidden');
    } else {
      elements.equipReplaceNotice.classList.add('hidden');
    }
  }

  elements.currentEquipsList.innerHTML = '';
  if (myEquips.length === 0) {
    elements.currentEquipsList.innerHTML = '<div style="color: var(--color-text-secondary); font-size: 13.5px; padding: 6px 0;">目前尚未穿戴任何裝備（空間 0/4）。可以直接穿上！</div>';
  } else {
    myEquips.forEach((eq, idx) => {
      const itemEl = document.createElement(isFull ? 'button' : 'div');
      if (isFull) itemEl.type = 'button';
      itemEl.className = `current-equip-item ${selectedReplaceIndex === idx ? 'selected-to-replace' : ''}`;
      itemEl.innerHTML = `
        <div class="current-equip-info">
          <span class="current-equip-name">${escapeHtml(eq.name)}</span>
          <span class="current-equip-desc">${escapeHtml(eq.desc || eq.statDesc || '')}</span>
        </div>
        ${isFull ? `<span class="replace-radio-badge">${selectedReplaceIndex === idx ? '已選替換此件' : '點選以替換'}</span>` : ''}
      `;

      if (isFull) {
        itemEl.addEventListener('click', () => {
          selectedReplaceIndex = idx;
          playSound('click');
          renderPendingDropModal(me);
        });
      }
      elements.currentEquipsList.appendChild(itemEl);
    });
  }

  elements.btnEquipItem.onclick = () => {
    if (alreadyOwnsUnique) {
      alert('此裝備為神兵唯一裝備，不可重複穿戴！');
      return;
    }
    if (isFull && (selectedReplaceIndex < 0 || selectedReplaceIndex >= myEquips.length)) {
      alert('裝備欄已滿 4 件！請先點選上方欲替換卸下的既有裝備。');
      return;
    }
    playSound('heal');
    submitEquipmentChoice({action:'equip',replaceIndex:selectedReplaceIndex});
  };

  elements.btnDiscardItem.onclick = () => {
    playSound('click');
    submitEquipmentChoice({action:'discard'});
  };

  elements.btnEquipItem.disabled = alreadyOwnsUnique || !drop.id;
  ModalMotion.show(elements.equipDropModal);
}
window.renderPendingDropModal = renderPendingDropModal;

function submitEquipmentChoice(choice){
 elements.btnEquipItem.disabled=true;elements.btnDiscardItem.disabled=true;
 socket.emit('equip:choice',choice,result=>{
  elements.btnEquipItem.disabled=false;elements.btnDiscardItem.disabled=false;
  if(!result?.success){alert(result?.message||'裝備選擇失敗，請重新選擇');renderPendingDropModal(getMyPlayer());return;}
  selectedReplaceIndex=-1;
  // The authoritative room update clears pendingDrop and unlocks victory.
  if(!roomState?.pendingDrop)ModalMotion.hide(elements.equipDropModal);
  refreshVictoryControls();
 });
}

// Lobby readiness uses the existing leader/member rules, with a visible label.
function renderMemberStatusBadge(p, isThisLeader) {
  const isReady = isThisLeader ? Boolean(p.role) : (Boolean(p.role) && Boolean(p.isReady));
  if (isReady) {
    return `
      <span class="member-status-icon ready" title="已就緒" aria-label="已就緒">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    `;
  }
  return `
    <span class="member-status-icon waiting" title="尚未就緒" aria-label="尚未就緒">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="13"></line>
        <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"></circle>
      </svg>
    </span>
  `;
}

// 1. 渲染大廳
function renderLobby(me, isLeader) {
  isClassArchiveMode = false;
  window.isClassArchiveMode = false;
  const teamCard = document.querySelector('.team-card');
  if (teamCard) teamCard.classList.remove('hidden');
  const viewLobby = document.getElementById('viewLobby');
  if (viewLobby) viewLobby.classList.remove('archive-mode');
  const btnArchiveBack = document.getElementById('btnArchiveBackToMenu');
  if (btnArchiveBack) btnArchiveBack.classList.add('hidden');
  const exitBtn = document.getElementById('btnLobbyExitRoom');
  if (exitBtn) exitBtn.classList.remove('hidden');
  const titleEl = document.getElementById('rolePanelTitle');
  if (titleEl) titleEl.innerHTML = '選擇職業 <small>SELECT CHARACTER</small>';

  elements.lobbyMemberCount.textContent = roomState.players.length;

  // 渲染小隊成員
  elements.lobbyMemberList.innerHTML = '';
  roomState.players.forEach(p => {
    const isThisMe = p.id === myId;
    const isThisLeader = p.id === roomState.leaderId;
    const roleInfo = p.role ? classesData[p.role] : null;
    const canTransferToThis = isLeader && !isThisMe;

    const div = document.createElement('div');
    div.className = `member-item ${isThisMe ? 'is-me' : ''} ${canTransferToThis ? 'can-transfer-leader' : ''}`;

    if (isThisMe) {
      div.innerHTML = `
        <div class="member-info-col">
          <div class="member-avatar-wrapper">
            ${getPlayerAvatarHtml(p, 'member-role-avatar')}
          </div>
          <div class="member-name-group">
            <div class="member-name-row">
              <span class="member-name">
                ${isThisLeader ? `<span class="crown-tag" title="房主">${getIconSvg('flag')}<small>房主</small></span>` : ''}
                <span class="member-name-text" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                <span class="me-tag">(你)</span>
              </span>
            </div>
            <div class="member-sub-actions">
              ${roleInfo ? `
                ${renderLobbyRoleTags(p.role,'member-tag-badge')}
              ` : ''}
            </div>
          </div>
        </div>
        <div class="member-status-col">
          ${renderMemberStatusBadge(p, isThisLeader)}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="member-info-col">
          <div class="member-avatar-wrapper">
            ${getPlayerAvatarHtml(p, 'member-role-avatar')}
          </div>
          <div class="member-name-group">
            <span class="member-name">
              ${isThisLeader ? `<span class="crown-tag" title="房主">${getIconSvg('flag')}<small>房主</small></span>` : ''}
              <span class="member-name-text" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
            </span>
            <div class="member-sub-actions">
              ${roleInfo ? `
                ${renderLobbyRoleTags(p.role,'member-tag-badge')}
              ` : ''}
            </div>
          </div>
        </div>
        <div class="member-status-col">
          ${renderMemberStatusBadge(p, isThisLeader)}
        </div>
      `;

      if (canTransferToThis) {
        div.title = '點擊轉移位子';
        div.addEventListener('click', (e) => {
          if (e.target.closest('button, input')) return;
          playSound('click');
          openTransferLeaderModal(p);
        });
      }
    }

    elements.lobbyMemberList.appendChild(div);
  });

  // 更新角色選擇卡
  renderRoleSelectionGrid();

  // 隊員準備按鈕狀態
  if (elements.btnToggleReady) {
    if (me?.isReady) {
      if (elements.readyBtnText) elements.readyBtnText.textContent = '取消準備';
      elements.btnToggleReady.className = 'btn btn-success btn-large full-width';
    } else {
      if (elements.readyBtnText) elements.readyBtnText.textContent = '準備就緒';
      elements.btnToggleReady.className = 'btn btn-primary btn-large full-width';
    }
    elements.btnToggleReady.disabled = !me?.role;
  }

  // 隊長出發按鈕判定（需所有隊友已選職且非隊長成員皆已準備）
  const otherMembers = roomState.players.filter(p => p.id !== roomState.leaderId);
  const allReady = otherMembers.length === 0 || otherMembers.every(p => p.isReady);
  const allPicked = roomState.players.length > 0 && roomState.players.every(p => p.role);
  if (isLeader) {
    elements.leaderStartArea.classList.remove('hidden');
    elements.memberWaitArea.classList.add('hidden');
    elements.btnStartGame.disabled = !(allPicked && allReady);
    if (!allPicked) {
      elements.startRequirementText.textContent = '尚有成員未完成選職';
      elements.startRequirementText.style.color = '#dc2626';
    } else if (!allReady) {
      elements.startRequirementText.textContent = '尚有成員未準備就緒';
      elements.startRequirementText.style.color = '#dc2626';
    } else {
      elements.startRequirementText.textContent = '全體就緒！點擊開始冒險！';
      elements.startRequirementText.style.color = '#16a34a';
    }
  } else {
    elements.leaderStartArea.classList.add('hidden');
    elements.memberWaitArea.classList.remove('hidden');
  }
}

// 渲染選職卡片
function renderRoleSelectionGrid() {
  if (!classesData || Object.keys(classesData).length === 0) return;
  renderRoleLobby({classes:classesData,details:roleDetailsData||DEFAULT_ROLE_DETAILS,players:isClassArchiveMode?[]:roomState?.players||[],myId,onSelect:roleKey=>{
    playSound('click');
    if(isClassArchiveMode||!roomState)return;
    socket.emit('player:select_role',{roleKey},res=>{
      if(!res.success){alert(res.message);lobbyRoleUi.role=roomState?.players?.find(p=>p.id===myId)?.role||'warrior';renderRoleSelectionGrid();}
    });
  }});
}
// --------------------------------------------------------------------------
// 全域轉場、大字幕與打字機函式
// --------------------------------------------------------------------------

// 播放打字機音效 (細緻高頻敲擊)
function playTypewriterClick() {
  if (soundEnabled) {
    playSound('type');
  }
}

// 支援單一元素字串打字
function typeWriterEffect(element, text, speed = 45, onComplete = null) {
  currentTypewriterContext?.cancel?.();
  if (currentTypewriterTimer) clearInterval(currentTypewriterTimer);
  currentTypewriterTimer = null;
  currentTypewriterContext = null;
  if (!element) {
    if (onComplete) onComplete();
    return;
  }
  element.textContent = '';
  element.classList.add('typewriter-cursor');
  let i = 0;
  const finishTyping = beginNarrativeTyping();
  const context = {
    setSpeed: () => {
      if (currentTypewriterTimer) clearInterval(currentTypewriterTimer);
      currentTypewriterTimer = setInterval(step, Math.max(1, speed / narrativeTextSpeed()));
    },
    cancel: () => {
      if (currentTypewriterContext === context) {
        if (currentTypewriterTimer) clearInterval(currentTypewriterTimer);
        currentTypewriterTimer = null;
        currentTypewriterContext = null;
      }
      finishTyping();
      element.classList.remove('typewriter-cursor');
    }
  };

  const step = () => {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      if (i % 2 === 0) playTypewriterClick();
    } else {
      if (currentTypewriterTimer) {
        clearInterval(currentTypewriterTimer);
        currentTypewriterTimer = null;
      }
      finishTyping();
      setTimeout(() => {
        if (currentTypewriterContext !== context) return;
        currentTypewriterContext = null;
        element.classList.remove('typewriter-cursor');
        if (onComplete) onComplete();
      }, 150);
    }
  };

  currentTypewriterContext = context;
  context.setSpeed();
}

// 支援多段落連續打字機效果
function typeWriterParagraphs(container, paragraphs, speed = 20, onComplete = null) {
  currentTypewriterContext?.cancel?.();
  if (!container || !paragraphs || paragraphs.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  container.innerHTML = '';
  let pIdx = 0;

  function typeNext() {
    if (pIdx >= paragraphs.length) {
      currentTypewriterContext = null;
      if (onComplete) onComplete();
      return;
    }
    const pEl = document.createElement('p');
    container.appendChild(pEl);
    typeWriterEffect(pEl, paragraphs[pIdx], speed, () => { pIdx++; typeNext(); });
  }

  typeNext();
}

function accelerateNarrative(value = true) { setNarrativeAcceleration(value); }

let cinematicBannerTimeout = null;

// 播放全域像素大字幕橫幅 (左側滑入 -> 中間停留1秒 -> 右側滑出)
function showCinematicBanner({ title, subtitle, theme = 'gold', onFinish = null }) {
  const banner = elements.stageCinematicBanner;
  if (!banner) {
    if (onFinish) onFinish();
    return;
  }

  if (cinematicBannerTimeout) {
    clearTimeout(cinematicBannerTimeout);
    cinematicBannerTimeout = null;
  }

  if (elements.cinematicBannerTitle) elements.cinematicBannerTitle.textContent = /^【第 \d+ 層・深淵探索】$/.test(title)&&window.StudioContent?StudioContent.template(StudioContent.find('story_copies','event.floor')?.body||title,{floor:roomState?.floor||1}):title;
  if (elements.cinematicBannerSub) elements.cinematicBannerSub.textContent = subtitle || '';

  // 設置主題樣式 (冒險金、玩家藍、首領紅、營地綠、事件金)
  banner.className = 'stage-cinematic-banner';
  if (theme === 'player') banner.classList.add('theme-player');
  else if (theme === 'boss') banner.classList.add('theme-boss');
  else if (theme === 'event') banner.classList.add('theme-event');
  else if (theme === 'camp') banner.classList.add('theme-camp');

  banner.classList.remove('hidden');
  banner.classList.remove('animating');
  void banner.offsetWidth; // 強制重繪觸發動畫
  banner.classList.add('animating');

  playSound('banner');

  // 動畫結束時隱藏並觸發回調 (2.2 秒)
  cinematicBannerTimeout = setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('animating');
    cinematicBannerTimeout = null;
    if (onFinish) onFinish();
  }, 2200);
}

let screenTransitionTimeout = null;

// 執行約 1 秒的淡出淡入轉場 (Fade-out -> 切換 -> Fade-in)
function triggerScreenTransition(duringFadeOut = null, afterFadeIn = null) {
  const curtain = elements.screenTransitionCurtain;
  if (!curtain) {
    if (duringFadeOut) duringFadeOut();
    if (afterFadeIn) afterFadeIn();
    return;
  }

  if (screenTransitionTimeout) {
    clearTimeout(screenTransitionTimeout);
    screenTransitionTimeout = null;
  }

  curtain.classList.remove('hidden');
  curtain.classList.add('fade-active');

  screenTransitionTimeout = setTimeout(() => {
    if (duringFadeOut) duringFadeOut();
    setTimeout(() => {
      curtain.classList.remove('fade-active');
      setTimeout(() => {
        curtain.classList.add('hidden');
        screenTransitionTimeout = null;
        if (afterFadeIn) afterFadeIn();
      }, 450);
    }, 100);
  }, 450);
}

// 計算階段識別唯一鍵值
function getStageKey(state) {
  if (!state) return 'NONE';
  switch (state.state) {
    case 'LOBBY': return 'LOBBY';
    case 'PROLOGUE': return 'PROLOGUE';
    case 'CHOOSING_ROUTE': return `ROUTE_${state.floor}`;
    case 'TRANSITION': return `TRANSITION_${state.floor}_${state.currentTransition?.routeId || ''}`;
    case 'EVENT': return `EVENT_${state.floor}_${state.currentEvent?.title || state.currentEvent?.type || ''}`;
    case 'IN_BATTLE': return `BATTLE_${state.floor}_${state.currentMonster?.name || ''}`;
    case 'CHECKPOINT': return `CHECKPOINT_${state.floor}`;
    case 'GAME_OVER': return `GAME_OVER_${state.floor}`;
    case 'VICTORY': return `VICTORY_${state.floor}`;
    default: return state.state;
  }
}

// 協調階段過場與大字幕
function checkStageTransition(state) {
  if (!state) return;
  const newStage = getStageKey(state);
  if (newStage === currentActiveStage) return;

  const prevStage = currentActiveStage;
  currentActiveStage = newStage;

  // 第一次進入大廳或初始無狀態，不觸發全螢幕過場
  if (prevStage === null || (prevStage === 'NONE' && newStage === 'LOBBY')) {
    return;
  }

  // Game start owns its black curtain; do not run a competing screen transition.
  if (state.state === 'PROLOGUE') {
    prologueCompleted = false;
    return;
  }
  // Exploration owns its full-screen floor intro and section reveal.
  if (state.state === 'BATTLE_VICTORY') return;
  if (state.state === 'IN_BATTLE' || state.state === 'CHOOSING_ROUTE' ||
      state.state === 'EVENT') return;

  // 1 秒淡出淡入轉場
  triggerScreenTransition();

  // 根據不同階段觸發對應的像素大字幕 (左滑入 -> 中間大幅減速停留1秒 -> 右滑出)
  switch (state.state) {
    case 'EVENT':
      // P2-R1 Section 1 & 20: Event presentation is owned solely by renderEvent (playTrapPresentation / playChestPresentation).
      // No duplicate cinematic banner here.
      break;

    case 'IN_BATTLE':
      // P2-R1 Section 23 & 24: Boss Intro and Round Start are owned solely by renderBattle on #presentationRoot.
      // No duplicate cinematic banner here.
      break;

    case 'CHECKPOINT': {
      const cpKey = `CHECKPOINT_BANNER_${state.floor}`;
      if (!presentationManager.hasPlayed(cpKey)) {
        presentationManager.markPlayed(cpKey);
        playSound('heal_chime');
        showCinematicBanner({
          title: '【庇護營地・短暫休整】',
          subtitle: `FLOOR ${state.floor} · SANCTUARY REST`,
          theme: 'camp'
        });
      }
      break;
    }
  }
}

// Phase 1: one owner, one curtain; only the explicit prologue button skips.
const PROLOGUE_TIMING = Object.freeze({
  titleEnter: 850,
  titleHold: 1400,
  titleExit: 600,
  blackHold: 200,
  storyEnter: 600,
  character: 40,
  comma: 140,
  sentence: 280,
  newline: 380,
  paragraph: 600,
  storyHold: 1800,
  storyExit: 800,
  dungeonReveal: 600
});

function waitForPrologue(ms, signal) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let finishHandler = null;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      if (finishHandler && typeof activeNarrativeResolvers !== 'undefined') {
        activeNarrativeResolvers.delete(finishHandler);
      }
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const finish = () => {
      if (timer) clearTimeout(timer);
      if (finishHandler && typeof activeNarrativeResolvers !== 'undefined') {
        activeNarrativeResolvers.delete(finishHandler);
      }
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    finishHandler = finish;
    if (typeof activeNarrativeResolvers !== 'undefined') {
      activeNarrativeResolvers.add(finishHandler);
    }
    timer = setTimeout(finish, ms);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

function prologueFrame(signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

async function typePrologueParagraphs(container, paragraphs, signal, timing = PROLOGUE_TIMING) {
  const finishTyping = beginNarrativeTyping(signal);
  const textWait = ms => waitForPrologue(ms / narrativeTextSpeed(), signal);
  try {
  // Never insert complete text, even in a hidden pre-render. Paint empty first.
  container.replaceChildren();
  await prologueFrame(signal);
  await prologueFrame(signal);
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = document.createElement('p');
    container.appendChild(paragraph);
    const characters = Array.from(paragraphs[index]);
    for (let charIndex = 0; charIndex < characters.length; charIndex++) {
      await textWait(timing.character);
      const character = characters[charIndex];
      paragraph.appendChild(document.createTextNode(character));
      if (charIndex % 2 === 1 && !/\s/.test(character)) playTypewriterClick();
      const pause = /[，、,；;：:]/.test(character) ? timing.comma
        : /[。！？!?…]/.test(character) ? timing.sentence
        : character === '\n' ? timing.newline : 0;
      if (pause) await textWait(pause);
    }
    if (index < paragraphs.length - 1) {
      await textWait(timing.paragraph);
    }
  }
  } finally { finishTyping(); }
}

const preloadedPartyAssetUrls = new Set();
async function preloadPartyClassAssets(state) {
  try {
    const players = Array.isArray(state?.players)
      ? state.players
      : (state?.players ? Object.values(state.players) : []);
    const roles = [...new Set(players.map(p => p.role).filter(Boolean))];
    if (roles.length === 0) return;

    // 1. Audio Preload
    if (typeof sfxManager !== 'undefined' && sfxManager) {
      void sfxManager.preload();
      for (const role of roles) {
        void sfxManager.preloadRole(role);
      }
    }
    if (typeof bgmManager !== 'undefined' && bgmManager) {
      void bgmManager.preload();
    }

    // 2. Class Presentation Animations & FX Preloaders
    if (typeof preloadCombatFxAssets === 'function') void preloadCombatFxAssets();
    if (roles.includes('samurai') && typeof preloadSamuraiFxAssets === 'function') void preloadSamuraiFxAssets();
    if (roles.includes('augur') && typeof preloadAugurAssets === 'function') void preloadAugurAssets();
    if (roles.includes('onmyoji') && typeof preloadOnmyojiAssets === 'function') void preloadOnmyojiAssets();
    if (roles.includes('sage') && typeof preloadSageHands === 'function') void preloadSageHands();

    // 3. Image URLs per class
    const urlsToPreload = new Set([
      '/assets/ui/inventory/slots/armor.png',
      '/assets/ui/inventory/slots/book.png',
      '/assets/ui/inventory/slots/ring.png',
      '/assets/ui/inventory/slots/sword.png',
      '/assets/ui/exploration/hex-arrow-curved.png'
    ]);

    const ROLE_ASSET_MAP = {
      warrior: ['/assets/characters/portraits/Warrior.webp'],
      mage: ['/assets/characters/portraits/Mage.webp'],
      archer: ['/assets/characters/portraits/Archer.webp', '/assets/combat-fx/archer/archer-special-1.webp', '/assets/combat-fx/archer/archer-special-2.webp', '/assets/combat-fx/archer/archer-special-3.webp'],
      assassin: ['/assets/characters/portraits/Assassin.webp'],
      bard: ['/assets/characters/portraits/Bard.webp'],
      alchemist: ['/assets/characters/portraits/Alchemist.webp'],
      druid: [
        '/assets/characters/portraits/Druid.webp',
        '/assets/characters/forms/druid/狼人.webp',
        '/assets/characters/forms/druid/遠古樹精.webp',
        '/assets/characters/forms/druid/巨熊.webp',
        '/assets/characters/summons/druid/小樹精1.webp',
        '/assets/characters/summons/druid/小樹精2.webp',
        '/assets/characters/summons/druid/小樹精3.webp',
        '/assets/characters/summons/druid/幼狼1.webp',
        '/assets/characters/summons/druid/幼狼2.webp',
        '/assets/characters/summons/druid/幼狼3.webp'
      ],
      paladin: ['/assets/characters/portraits/Paladin.webp'],
      onmyoji: ['/assets/characters/portraits/Onmyōji.webp', '/assets/characters/portraits/Onmyoji.webp', '/assets/combat-fx/onmyoji/Onmyoji-1.png', '/assets/combat-fx/onmyoji/Onmyoji-2.png'],
      samurai: ['/assets/characters/portraits/武士.webp', '/assets/combat-fx/samurai/samurai-eye.png', '/assets/combat-fx/samurai/samurai-skill1.png', '/assets/combat-fx/samurai/samurai-skill2.png'],
      sage: ['/assets/characters/portraits/智者.webp', '/assets/combat-fx/sage/sage-error.png', '/assets/combat-fx/sage/sage-snap-1.png', '/assets/combat-fx/sage/sage-snap-2.png'],
      augur: ['/assets/characters/portraits/Augur.webp', '/assets/combat-fx/augur/augur1.png', '/assets/combat-fx/augur/augur2.png'],
      dreamweaver: ['/assets/characters/portraits/Dreamweaver.webp'],
      gladiator: ['/assets/characters/portraits/Gladiator.webp'],
      stargazer: ['/assets/characters/portraits/Stargazer.webp']
    };

    for (const p of players) {
      if (p.customAvatar) urlsToPreload.add(p.customAvatar);
      if (p.avatar) urlsToPreload.add(p.avatar);
    }

    for (const role of roles) {
      const classAvatar = (typeof classesData !== 'undefined' && classesData[role]?.avatar)
        || (typeof DEFAULT_ROLE_AVATARS !== 'undefined' && DEFAULT_ROLE_AVATARS[role]?.avatar);
      if (classAvatar) urlsToPreload.add(classAvatar);
      const specificAssets = ROLE_ASSET_MAP[role];
      if (specificAssets) {
        for (const assetUrl of specificAssets) urlsToPreload.add(assetUrl);
      }
    }

    // 4. Batch decode/preload images
    const pendingPromises = [];
    for (const url of urlsToPreload) {
      if (!url || preloadedPartyAssetUrls.has(url)) continue;
      preloadedPartyAssetUrls.add(url);
      pendingPromises.push(new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.assetRegistry && typeof window.assetRegistry.preloadImage === 'function') {
          window.assetRegistry.preloadImage(url).then(resolve).catch(resolve);
          return;
        }
        const img = new Image();
        img.src = url;
        if (img.decode) {
          img.decode().then(resolve).catch(resolve);
        } else {
          img.onload = img.onerror = resolve;
        }
      }));
    }
    await Promise.allSettled(pendingPromises);
  } catch (err) {
    console.warn('[Prologue:PreloadPartyAssets]', err);
  }
}

async function renderProloguePresentation() {
  if (prologueCompleted || isPrologueTyping) return;
  isPrologueTyping = true;
  void preloadPartyClassAssets(roomState);
  if(typeof bgmManager!=='undefined')void bgmManager.preload();
  const controller = new AbortController();
  prologueController = controller;
  const { signal } = controller;
  const overlay = elements.gameStartOverlay;
  const title = elements.gameTitleContainer;
  const story = elements.prologuePresentationContainer;
  const body = elements.prologuePresBody;
  // Use the authoritative story already supplied by Room, without new narrative.
  const paragraphs = roomState?.currentPrologue?.paragraphs;
  let completed = false;

  const skipButton = document.getElementById('btnSkipPrologue');
  const handlePrologueClick = (e) => {
    const currentIsLeader = roomState?.leaderId ? roomState.leaderId === myId : true;
    if (!currentIsLeader) return;
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
      if (skipButton) skipButton.disabled = true;
      socket.emit('prologue:skip', res => {
        if (skipButton) skipButton.disabled = false;
        if (res?.success) {
          prologueCompleted = true;
          controller.abort();
        }
      });
    }
  };
  if (skipButton) skipButton.addEventListener('click', handlePrologueClick);

  presentationManager.setBlocking(true);
  gateDestinationView('prologue');
  gateDestinationView('route');
  // Prevent keyboard focus from reaching HUD controls through the curtain.
  const app = document.getElementById('app');
  const previousInert = app?.inert || false;
  const chat = elements.floatingChatContainer;
  const previousChatInert = chat?.inert || false;
  if (app) app.inert = true;
  if (chat) chat.inert = true;
  document.body.classList.add('presentation-opening');

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (overlay) {
      overlay.classList.add('hidden');
    }
    if (skipButton) skipButton.removeEventListener('click', handlePrologueClick);
    if (title) { title.classList.add('hidden'); title.classList.remove('exit'); }
    if (story) { story.classList.add('hidden'); story.classList.remove('exit'); }
    if (body) body.replaceChildren();
    if (app) app.inert = previousInert;
    if (chat) chat.inert = previousChatInert;
    document.body.classList.remove('presentation-opening');
    if (prologueController === controller) {
      prologueController = null;
      isPrologueTyping = false;
      presentationManager.setBlocking(false);
      revealDestinationView('route');
    }
  };
  // Abort cleans synchronously, before renderApp starts the next owner.
  signal.addEventListener('abort', cleanup, { once: true });

  try {
    if (!overlay || !title || !story || !body || !paragraphs?.length) {
      throw new Error('Missing game-start presentation elements or story');
    }
    body.replaceChildren();
    story.classList.add('hidden');
    story.classList.remove('exit');
    title.classList.remove('exit');
    overlay.style.opacity = '1';
    overlay.classList.remove('hidden');
    title.classList.remove('hidden');
    playSound('logo_intro', { preserveAcrossViews:true });
    await waitForPrologue(Math.max(PROLOGUE_TIMING.titleEnter + PROLOGUE_TIMING.titleHold, SFX_ASSETS.logo_intro.identityBeatMs), signal);
    title.classList.add('exit');
    await waitForPrologue(PROLOGUE_TIMING.titleExit, signal);
    title.classList.add('hidden');
    await waitForPrologue(PROLOGUE_TIMING.blackHold, signal);

    // Empty story is visible during entry; text begins after entry and two RAFs.
    story.classList.remove('hidden');
    await waitForPrologue(PROLOGUE_TIMING.storyEnter, signal);
    await typePrologueParagraphs(body, paragraphs, signal);
    await waitForPrologue(PROLOGUE_TIMING.storyHold, signal);
    story.classList.add('exit');
    await waitForPrologue(PROLOGUE_TIMING.storyExit, signal);
    story.classList.add('hidden');
    overlay.style.opacity = '0';
    await waitForPrologue(PROLOGUE_TIMING.dungeonReveal, signal);
    overlay.classList.add('hidden');

    // Phase 2 gives every floor (including Floor 1) to the route owner.
    completed = true;
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('[Presentation:prologue]', error);
    }
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }

  if (completed && !signal.aborted && roomState?.state === 'PROLOGUE') {
    prologueCompleted = true;
    if(typeof bgmManager!=='undefined')void bgmManager.resumeNormal();
    socket.emit('prologue:next');
  }
}

function renderPrologue() {
  void preloadPartyClassAssets(roomState);
  // All failures are handled inside the async owner; no unhandled promise.
  void renderProloguePresentation();
}

// 1.8 渲染進入層數打字機轉場
function renderTransition() {
  const trans = roomState.currentTransition;
  if (!trans) return;

  const key = `${trans.floor}_${trans.routeId}_${trans.outcomeType}`;
  if (lastTypedTransitionKey !== key) {
    lastTypedTransitionKey = key;
    playSound('walk',{instance:'route-walk-'+key,preserveAcrossViews:true});
    if (elements.transitionRouteTag) {
      elements.transitionRouteTag.innerHTML = `${getIconSvg('flag')} <span>前往路線：${escapeHtml(trans.routeName)}</span>`;
    }
    if (elements.transitionStoryTitle) {
      elements.transitionStoryTitle.textContent = trans.storyTitle || `【${trans.routeName}】`;
    }

    if (elements.transitionStoryText) elements.transitionStoryText.textContent = '';
    const titleSpeed = 60;
    const storySpeed = 20;

    // 先以打字機風格呈現標題 (一個字一個字慢慢出現)
    if (elements.transitionTypewriterTitle) {
      typeWriterEffect(elements.transitionTypewriterTitle, trans.title || `將進入第 ${trans.floor} 層`, titleSpeed, () => {
        // 接著以更快的打字機呈現故事
        if (elements.transitionStoryText) {
          typeWriterEffect(elements.transitionStoryText, trans.storyText || '正在深入未知迷霧中...', storySpeed);
        }
      });
    }
  }
}

// --------------------------------------------------------------------------
// Trap Event Presentation (P2-R1 Section 20 & 77)
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Chest Event Presentation (P2-R1 Section 21)
// --------------------------------------------------------------------------
// Phase 4 chest presentation is now owned solely by chest.js

// 3. 渲染事件 (P2-R1 Section 1, 20, 21: 單一 Presentation Owner，Trap 演出走 Presentation Root)
function renderEvent() {
  const ev = roomState.currentEvent;
  if (!ev) return;

  const isTrap = ev.type === 'trap';
  const isTreasure = ['treasure', 'chest'].includes(ev.type);

  elements.eventCardBox.classList.toggle('hidden', isTrap || isTreasure);
  elements.trapDiscoverySection.classList.toggle('hidden', !isTrap);
  if (elements.chestDiscoverySection) {
    elements.chestDiscoverySection.classList.toggle('hidden', !isTreasure);
  }

  if (isTrap) {
    if (trapStartedId !== ev.presentationId) {
      trapStartedId = ev.presentationId;
      void playTrapPresentation(ev);
    }
    return;
  }

  if (isTreasure) {
    document.dispatchEvent(new CustomEvent('chest-state', {detail:ev}));
    if (chestStartedId !== ev.presentationId) {
      chestStartedId = ev.presentationId;
      void playChestPresentation(ev);
    }
    return;
  }

  if (ev.type !== 'random_event') {
    elements.eventCardBox?.querySelector('.event-bg-illustration')?.remove();
  }
  if (ev.type === 'shop' || ev.type === 'chest' || ev.type === 'random_event') {
    renderInteractiveEvent(ev);
    return;
  }

  const evKey = `EV_${roomState.floor}_${ev.type}_${ev.title}`;
  if (!presentationManager.hasPlayed(evKey)) {
    presentationManager.markPlayed(evKey);

    if (elements.eventDetails) elements.eventDetails.style.display = 'none';
    const evFooter = document.querySelector('.event-footer');
    if (evFooter) evFooter.style.display = 'none';

    if (ev.type === 'treasure') {
      elements.eventIcon.innerHTML = getIconSvg('chest', 'svg-hero-icon');
      elements.eventTitle.textContent = ev.title || `【第 ${roomState.floor} 層】遠古寶箱！`;
      playChestPresentation(ev);
    }
  }
}

// --------------------------------------------------------------------------
// Boss Intro Presentation (P2-R1 Section 23)
// --------------------------------------------------------------------------
let battlePhaseController = null;
let battlePhasePromise = Promise.resolve();
let battleControlsReadyKey = null;
let battleControlsEntryPromise = null;
function battleSceneKey(state = roomState) {
  return `${state?.code}:${state?.floor}:${state?.battleCount || state?.currentHex?.id || 1}`;
}
function battleRoundKey(state = roomState) { return `${battleSceneKey(state)}:${state?.battleRound}`; }
function ensureBattlePhase(round, state = roomState) {
  const monster = state?.currentMonster;
  if (!monster||state?.state!=='IN_BATTLE') {
    revealDestinationView('battle');
    return battlePhasePromise;
  }
  const bossIntroKey = `BOSS_INTRO_${battleSceneKey(state)}`;
  // Boss Intro 僅限第 1 回合且未播放過時執行；戰鬥中途 (round > 1) 嚴禁再次觸發進場黑幕遮蔽！
  const encounter = !presentationManager.hasPlayed(bossIntroKey) && round === 1;
  if (!encounter && lastAnnouncedBattleRound === round) {
    if(!battlePhaseController)revealDestinationView('battle');
    return battlePhasePromise;
  }
  battlePhaseController?.abort();
  const controller = new AbortController();
  controller.battleKey = battleSceneKey(state);
  battlePhaseController = controller;
  if (encounter) presentationManager.markPlayed(bossIntroKey);
  lastAnnouncedBattleRound = round;
  battleControlsReadyKey = null;
  elements.views.battle.classList.add('battle-phase-pending');
  if(!encounter&&typeof BattleHud!=='undefined')BattleHud.setPhase('ROUND_TICK');
  document.getElementById('playerActionCard').inert = true;
  if (encounter) {gateDestinationView('battle');document.body.classList.add('battle-intro-active');}
  presentationManager.setBlocking(true);
  battlePhasePromise = (async () => {
    try {
      await playBattlePhaseOpening(monster, round, {
        encounter, controller, signal: controller.signal,
        enemies: state.enemies || [monster], arena: state.enemyArena || state.arena,
        routeId: state?.currentMonster?.routeId || state?.currentTransition?.routeId,
        revealEncounterScene(){releaseBattleEncounterScene();switchView('battle');},
        revealHud() {
          releaseBattleEncounterScene();switchView('battle');
          revealDestinationView('battle');
          elements.views.battle.classList.remove('is-battle-hud-revealing');
        }
      });
    } catch (error) {
      if (error.name !== 'AbortError') console.error('[BattlePhase]', error);
    } finally {
      if (battlePhaseController === controller) {
        battlePhaseController = null;
        releaseBattleEncounterScene();
        document.body.classList.remove('battle-intro-active');renderLogs();
        elements.views.battle.classList.remove('is-battle-hud-revealing');
        if(roomState?.state==='IN_BATTLE'&&battleSceneKey(roomState)===controller.battleKey){switchView('battle');revealDestinationView('battle');}
        if (!isProcessingPresentationQueue) presentationManager.setBlocking(false);
        if (!controller.signal.aborted) void revealBattleControls();
      }
    }
  })();
  return battlePhasePromise;
}
async function revealBattleControls() {
  const key = battleRoundKey();
  if (roomState?.state !== 'IN_BATTLE' || roomState.selectionState !== 'SELECTING' ||
      battlePhaseController || isProcessingPresentationQueue || battleControlsReadyKey === key || battleControlsEntryPromise) return;
  const card = document.getElementById('playerActionCard');
  elements.views.battle.classList.remove('battle-phase-pending');
  BattleHud.setPhase('SELECTING');
  card.inert = true;
  card.classList.add('is-phase-entering');
  battleControlsEntryPromise = (async () => {
    await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches?1:420);
    card.classList.remove('is-phase-entering');
    if (battleRoundKey() !== key || roomState.state !== 'IN_BATTLE' || roomState.selectionState !== 'SELECTING' || battlePhaseController || isProcessingPresentationQueue) return;
    battleControlsReadyKey = key;
    card.inert = false;
    renderMyActionBar(getMyPlayer());
    socket.emit('battle:selection_ready', { round: roomState.battleRound });
  })();
  try { await battleControlsEntryPromise; } finally { battleControlsEntryPromise = null; }
}

// ============================================================================
// 戰鬥多目標敵方舞台排佈 (神魔之塔風格) 與邊界限制懸浮面板
// ============================================================================

// 4. 渲染戰鬥畫面
let currentSelectedEnemyId = null;
let lastBattleEncounterKey = null;
function renderBattle(me, isLeader) {
  // 檢測是否切換不同敵方編隊／層數，若切換則重置舞台避免殘留舊敵人圖示
  const currentEncounterKey = `${roomState.floor}_${(roomState.enemies || [roomState.currentMonster]).filter(Boolean).map(e => e.instanceId || e.id).sort().join(',')}`;
  if (lastBattleEncounterKey !== currentEncounterKey) {
    lastBattleEncounterKey = currentEncounterKey;
    if (elements.battleEnemiesStage) {
      elements.battleEnemiesStage.innerHTML = '';
    }
  }
  const enemies = Array.isArray(roomState.enemies) && roomState.enemies.length > 0 ? roomState.enemies : (roomState.currentMonster ? [roomState.currentMonster] : []);
  const arena=roomState.enemyArena||roomState.arena;
  if(arena?.enemyId)currentSelectedEnemyId=arena.enemyId;
  else if (me?.targetEnemyId && enemies.some(e => (e.instanceId || e.id) === me.targetEnemyId && e.hp > 0)) {
    currentSelectedEnemyId = me.targetEnemyId;
  } else if (!currentSelectedEnemyId || !enemies.some(e => (e.instanceId || e.id) === currentSelectedEnemyId && e.hp > 0)) {
    const firstLiving = enemies.find(e => e.hp > 0) || enemies[0];
    currentSelectedEnemyId = firstLiving ? (firstLiving.instanceId || firstLiving.id || null) : null;
  }
  const monster = enemies.find(e => (e.instanceId || e.id) === currentSelectedEnemyId) || roomState.currentMonster;
  if (!monster) return;

  // 神魔之塔風格敵方戰場編隊排佈舞台與血條渲染（唯一舞台）
  renderBattleEnemiesStage(enemies, monster, me);

  elements.battleFloorNum.textContent = roomState.floor;
  elements.battleRoundNum.textContent = roomState.battleRound;
  const targetTextEl = document.getElementById('selectedTargetText');
  if (targetTextEl && monster) {
    targetTextEl.textContent = monster.name;
  }
  const encounterTitleEl = document.getElementById('battleEncounterTitle');
  if (encounterTitleEl && monster) {
    encounterTitleEl.textContent = `ENCOUNTER / ${monster.name.toUpperCase()}`;
  }

  if (!document.body.classList.contains('battle-intro-active')) {
    revealDestinationView('battle');
  }

  // Boss Intro & Round 1 presentation (P2-R1 Section 23 & 24, P2-R1.1 Section 4 & 6)
  void ensureBattlePhase(roomState.battleRound);
  void revealBattleControls();

  // 倒數計時：若無時間限制 (timerRemaining == null) 則隱藏倒數區塊
  const isResolving = (roomState.selectionState === 'RESOLVING' || isProcessingPresentationQueue || battlePhaseController || battleControlsReadyKey !== battleRoundKey() || roomState.selectionState === 'ROUND_START');
  const battleTimerWrap = document.getElementById('battleTimerWrap');
  if (battleTimerWrap) {
    battleTimerWrap.classList.toggle('hidden', roomState.timerRemaining == null);
  }
  if (isResolving || roomState.timerRemaining === null) {
    elements.battleTimerCount.textContent = '--';
  } else {
    elements.battleTimerCount.textContent = roomState.timerRemaining;
  }

  // 舊版怪物卡元件安全回退（若存在於測試環境）
  if (elements.monsterName) elements.monsterName.textContent = monster.name;
  if (elements.monsterDesc) elements.monsterDesc.textContent = monster.desc;
  if (elements.monsterHpText) elements.monsterHpText.textContent = `${monster.hp} / ${monster.maxHp}${monster.tempHp > 0 ? ` (+${monster.tempHp})` : ''}`;
  const monsterHpPercent = Math.max(0, Math.min(100, (monster.hp / monster.maxHp) * 100));
  if (elements.monsterHpFill) elements.monsterHpFill.style.width = `${monsterHpPercent}%`;

  if (elements.monsterAvatar) {
    if (monster.avatar) {
      elements.monsterAvatar.innerHTML = `<img class="monster-avatar-img portrait-image" alt="${escapeHtml(monster.name)}">`;
      syncBattlePortrait(elements.monsterAvatar.querySelector('img'),{...monster,entityType:'monster'});
      if (typeof syncPortraitStatusFx === 'function') {
        syncPortraitStatusFx(monster, elements.monsterAvatarWrap || elements.monsterAvatar, { scale: 1.1 });
      }
    } else {
      elements.monsterAvatar.innerHTML = getIconSvg('sword', 'svg-hero-icon');
    }
  }

  const resistances = monster.resistances || { physical: monster.resistance === 'phys' ? 70 : 0, magic: monster.resistance === 'mag' ? 70 : 0, effect: 0 };
  const mirrored = monster.p8Effects?.mirror?.until >= roomState.battleRound;
  const physical = mirrored ? resistances.magic : resistances.physical;
  const magic = mirrored ? resistances.physical : resistances.magic;
  if (elements.monsterResTag) {
    elements.monsterResTag.className = 'res-tag res-none';
    elements.monsterResTag.textContent = `物抗 ${physical}% · 魔抗 ${magic}% · 效果抗性 ${resistances.effect}%`;
    elements.monsterResTag.title = '效果抗性：免疫負面狀態的機率。';
  }

  const isUltRoundMonster = (roomState.battleRound % 3 === 0);
  const ultAtk = Math.floor(monster.attack * 1.35);
  if (elements.monsterAtkText) elements.monsterAtkText.textContent = `${isUltRoundMonster ? ultAtk : monster.attack} 點`;
  if (elements.monsterUltName) {
    if (isUltRoundMonster) {
      elements.monsterUltName.textContent = `${monster.ultName} (1.35x 必殺爆發！)`;
      elements.monsterUltName.classList.add('ult-alert');
    } else {
      elements.monsterUltName.textContent = `${monster.ultName} (每3回合發動)`;
      elements.monsterUltName.classList.remove('ult-alert');
    }
  }

  if (elements.monsterBuffsRow) {
    let buffHtml = '';
    if (enemies.length > 1) {
      buffHtml += `<div class="enemy-formation-bar" style="display:flex;gap:8px;flex-wrap:wrap;width:100%;margin-bottom:6px;">`;
      enemies.forEach((en, idx) => {
        if(arena?.enemyId&&en.instanceId!==arena.enemyId)return;
        const eid = en.instanceId || en.id || `enemy_${idx}`;
        const isTarget = eid === ( monster.instanceId || monster.id );
        const isDead = en.hp <= 0;
        const hpPct = Math.max(0, Math.min(100, Math.round((en.hp / Math.max(1, en.maxHp)) * 100)));
        const tierLabel = en.tier === 'ABYSS' ? '深淵' : en.tier === 'ELITE' ? '精英' : '小怪';
        buffHtml += `<button type="button" class="enemy-target-chip${isTarget ? ' active' : ''}${isDead ? ' dead' : ''}" data-enemy-id="${escapeHtml(eid)}" ${isDead ? 'disabled' : ''} style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:8px;border:1px solid ${isTarget ? '#f59e0b' : 'rgba(255,255,255,0.2)'};background:${isTarget ? 'rgba(245,158,11,0.22)' : 'rgba(15,23,42,0.75)'};color:#f8fafc;cursor:${isDead ? 'not-allowed' : 'pointer'};opacity:${isDead ? '0.45' : '1'};font-size:12px;">
          <span style="font-weight:700;color:${en.tier === 'ABYSS' ? '#c084fc' : en.tier === 'ELITE' ? '#fbbf24' : '#94a3b8'};">[${tierLabel}]</span>
          <span>${escapeHtml(en.name)}</span>
          ${en.flawMarks > 0 ? `<span style="color:#f87171;font-weight:700;">[破綻×${en.flawMarks}]</span>` : ''}
          <span style="font-family:monospace;color:${isDead ? '#ef4444' : '#cbd5e1'};">${en.hp}/${en.maxHp} (${hpPct}%)</span>
          ${isTarget && !isDead ? getIconSvg('target', 'ui-icon--sm') : ''}
        </button>`;
      });
      buffHtml += `</div>`;
    }
    if (monster.isWeakened) {
      buffHtml += `<span class="buff-badge" style="background: rgba(230, 126, 34, 0.25); border: 1px solid #e67e22; color: #f39c12;">${getIconSvg('status')} 負傷狀態</span>`;
    }
    if (monster.poisonTurns > 0) {
      buffHtml += `<span class="buff-badge tag-poison">${getIconSvg('poison')} 中毒 (${monster.poisonTurns} 回合 / 每回合-${monster.poisonDmg || 5})</span>`;
    }
    if (monster.burnTurns > 0) {
      buffHtml += `<span class="buff-badge tag-burn" style="background: rgba(231, 76, 60, 0.25); border: 1px solid #e74c3c; color: #e74c3c;">${getIconSvg('fire')} 燃燒 (${monster.burnTurns} 回合 / 每回合-${monster.burnDmg || 7})</span>`;
    }
    if (monster.fractureTurns > 0) {
      buffHtml += `<span class="buff-badge tag-fracture" style="background: rgba(149, 165, 166, 0.25); border: 1px solid #bdc3c7; color: #ecf0f1;">${getIconSvg('bone')} 骨折 (${monster.fractureTurns} 回合 / 每回合-${monster.fractureDmg || 2})</span>`;
    }
    if (monster.chillTurns > 0) {
      buffHtml += `<span class="buff-badge tag-chill" style="background: rgba(52, 152, 219, 0.25); border: 1px solid #3498db; color: #3498db;">${getIconSvg('snowflake')} 寒冷 (${monster.chillTurns} 回合 / 每回合-${monster.chillDmg || 3})</span>`;
    }
    if (monster.corrosionTurns > 0) {
      buffHtml += `<span class="buff-badge tag-corrosion" style="background: rgba(155, 89, 182, 0.25); border: 1px solid #9b59b6; color: #9b59b6;">${getIconSvg('flask')} 腐蝕 (血量/傷害 -5% · ${monster.corrosionTurns} 回合)</span>`;
    }
    if (monster.talismans && monster.talismans.length > 0) {
      const TALISMAN_NAMES = { blind: '障目', seal: '封勁', corrode: '蝕體', confuse: '惑心', drain: '抽髓' };
      const details = monster.talismans.map(t => TALISMAN_NAMES[t] || t).join('、');
      buffHtml += `<span class="buff-badge tag-talismans" style="background: rgba(245, 158, 11, 0.25); border: 1px solid #f59e0b; color: #fbbf24;"><img src="/assets/icons/status/符咒.webp" class="buff-icon" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> 符咒 (${monster.talismans.length} 張: ${details})</span>`;
    }
    if (monster.flawMarks > 0) {
      buffHtml += `<span class="buff-badge tag-flaw" style="background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5;"><img src="/assets/icons/status/破綻印記.webp" class="buff-icon" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> 破綻印記 (${monster.flawMarks}/5 層 · 受傷+${monster.flawMarks * 10}% / 敵命中-${monster.flawMarks * 10}%)</span>`;
    }
    if (roomState?.arrowTrapTurns > 0 || roomState?.arrowTrap?.turns > 0) {
      const trapTurns = roomState?.arrowTrapTurns || roomState?.arrowTrap?.turns || 1;
      buffHtml += `<span class="buff-badge tag-arrow-trap" style="background: rgba(34, 197, 94, 0.25); border: 1px solid #22c55e; color: #86efac;">🏹 箭刺陷阱區域 (${trapTurns} 回合 · 敵方每次行動受 25%×A 傷害)</span>`;
    }
    elements.monsterBuffsRow.innerHTML = buffHtml;
    elements.monsterBuffsRow.querySelectorAll('.enemy-target-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetEnemyId = btn.getAttribute('data-enemy-id');
        if (!targetEnemyId || !isBattleEnemySelectable(targetEnemyId)) return;
        currentSelectedEnemyId = targetEnemyId;
        socket.emit('battle:select_target', { targetEnemyId });
        renderBattle(getMyPlayer(), getMyPlayer()?.id === roomState.leaderId);
      });
    });
  }

  // 護盾與隊伍增益提示
  const activeShieldBadges = [];
  if (roomState.warriorShieldTurn === 1) {
    activeShieldBadges.push('壁壘守護：第1回合阻擋90%傷害！');
  } else if (roomState.warriorShieldTurn === 2) {
    activeShieldBadges.push('壁壘守護：第2回合阻擋40%傷害！');
  }
  if (roomState.alcShieldTurns > 0) {
    activeShieldBadges.push(`命運護盾：持續 ${roomState.alcShieldTurns} 回合阻擋 70% 傷害！`);
  }
  if (roomState.alcVulnerableTurns > 0) {
    activeShieldBadges.push(`試劑反噬：本回合受傷增加 20%！`);
  } else if (roomState.alcVulnerableNextTurn) {
    activeShieldBadges.push('試劑反噬：下回合受傷增加 20%！');
  }

  if (activeShieldBadges.length > 0) {
    elements.shieldNoticeBadge.classList.remove('hidden');
    elements.shieldNoticeBadge.innerHTML = activeShieldBadges.map(b => `${getIconSvg('shield')} ${b}`).join(' | ');
  } else {
    elements.shieldNoticeBadge.classList.add('hidden');
  }

  // 渲染隊友卡片網格
  renderTeammatesGrid(me);
  renderEnemyTelegraphs(enemies);
  syncEnemyArenaVisual(roomState.enemyArena || roomState.arena || null);

  // 渲染我的專屬操作列
  renderMyActionBar(me);
  BattleHud.updatePlayer(me);
  if (!isProcessingPresentationQueue && roomState.selectionState === 'SELECTING') BattleHud.setPhase('SELECTING');
}

// Buff / Debuff 圖示對應表 (使用 /buff icon 資料夾中的 webp 圖示)
function renderSageEquationPreview(me) {
  BattleHud.renderEquation(me,currentPendingAction);
}

// 玩家專屬技能列
function renderMyActionBar(me) {
  syncEnemyTargetIndicators();
  if (!me || !me.role || !classesData[me.role]) return;
  const pendingKey=battleRoundKey();
  if(!isProcessingPresentationQueue&&roomState.selectionState==='SELECTING'&&pendingActionRoundKey!==pendingKey){
    pendingActionRoundKey=pendingKey;currentPendingAction=null;currentPendingTarget=null;
  }

  const roleConfig = classesData[me.role];
  if (elements.myRoleEmoji) elements.myRoleEmoji.innerHTML = getPlayerAvatarHtml(me, 'my-role-avatar-img');
  if (elements.myRoleName) elements.myRoleName.textContent = window.StudioContent?.find('role_profiles',me.role)?.name_zh||roleConfig.name;

  // 狀態簡報（包含狼人/樹精/夥伴狀態）
  let stanceHtml = '';
  if (me.druidForm === 'werewolf') {
    stanceHtml += ` <span class="badge-form-wolf">${getIconSvg('summon')} 狼人形態 (傷害35點，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'treant') {
    stanceHtml += ` <span class="badge-form-treant">${getIconSvg('shield')} 樹精形態 (護盾85%/減傷30%/替全隊吸收50%，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'tree') {
    stanceHtml += ` <span class="badge-form-treant">${getIconSvg('cooldown')} 古樹休眠 (無法行動，剩餘${me.druidFormTurns}R)</span>`;
  } else if (me.druidForm === 'bear') {
    stanceHtml += ` <span class="badge-form-bear" style="background:rgba(180,83,9,0.25);border:1px solid rgba(245,158,11,0.5);color:#fde68a;border-radius:4px;padding:2px 6px;font-size:11px;">${getIconSvg('shield')} 巨熊形態 (血量/攻擊強化，剩餘${me.druidFormTurns}R)</span>`;
  }
  if (me.minion) {
    stanceHtml += ` <span class="badge-minion">${getIconSvg('summon')} 夥伴: ${escapeHtml(me.minion.name)} (HP ${me.minion.hp}/${me.minion.maxHp} | 攻 ${me.minion.atk})</span>`;
  }

  if (elements.myHpSummary) elements.myHpSummary.innerHTML = `HP: ${me.hp}/${me.maxHp}${stanceHtml}`;
  if (elements.myAtkSummary) elements.myAtkSummary.textContent = `ATK ${me.ATK_base ?? 0} · 物 +${me.PAtk_gear ?? 0} · 魔 +${me.MAtk_gear ?? 0} · DEF ${me.DEF ?? 0}`;
  let compact=document.getElementById('compactRoleState');
  if(!compact){compact=document.createElement('div');compact.id='compactRoleState';compact.className='compact-role-state';elements.mySkillsRow.parentNode.insertBefore(compact,elements.mySkillsRow);}
  compact.replaceChildren();
  if(me.resourceSummary||roleConfig.stateHint){const text=document.createElement('span');text.textContent=[me.resourceSummary,roleConfig.stateHint].filter(Boolean).join(' · ');compact.appendChild(text);}
  const detail=document.createElement('button');detail.className='btn btn-secondary btn-tiny';detail.textContent='職業詳情';detail.onclick=()=>openRoleDetailModal(me.role);compact.appendChild(detail);
  renderSageEquationPreview(me);
  if(me.arenaBlocked){elements.mySkillsRow.innerHTML='<div class="action-status-badge">死亡角鬥場進行中，本輪無法行動。</div>';elements.btnConfirmLock.disabled=true;return;}

  // 玩家當前裝備列表 [裝備 X/3]
  const myEquips = me.equips || [];
  const myEquipCount = myEquips.length;
  if (elements.myEquipsSummary) {
    if (myEquipCount === 0) {
      elements.myEquipsSummary.innerHTML = `[裝備 0/4]: 無`;
    } else {
      const itemsHtml = myEquips.map((e, idx) => {
        const override = window.StudioContent?.rows('story_copies').find(s=>s.category==='equipment'&&s.story_key===('equip.'+e.role+'.'+e.id));
        const name = override?.title || e.name;
        return `<span class="equip-pill" data-equip-index="${idx}" style="cursor:help;">${escapeHtml(name)}<button type="button" class="unequip-btn" data-equip-index="${idx}" title="卸下裝備">卸下</button></span>`;
      }).join(', ');
      elements.myEquipsSummary.innerHTML = `[裝備 ${myEquipCount}/4]: ${itemsHtml}`;

      elements.myEquipsSummary.querySelectorAll('.equip-pill').forEach(pill => {
        const idx = parseInt(pill.getAttribute('data-equip-index'), 10);
        const equipItem = myEquips[idx];
        if (equipItem) {
          pill.addEventListener('mouseenter', (ev) => showItemTooltip(equipItem, ev));
          pill.addEventListener('mousemove', (ev) => positionItemTooltip(ev));
          pill.addEventListener('mouseleave', () => hideItemTooltip());
        }
      });

      elements.myEquipsSummary.querySelectorAll('.unequip-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-equip-index'), 10);
          socket.emit('equip:unequip', { index: idx });
        });
      });
    }
  }

  const isDead = me.hp <= 0;
  const isStunned = me.stunnedNextTurn;
  const isSurrendered = me.isSurrendered;
  const isTree = me.druidForm === 'tree';
  const isNarrating = Boolean(roomState.isNarrating || isPlayingBattleNarrative || battlePhaseController || battleControlsReadyKey !== battleRoundKey());

  // 狀態提醒
  if (isDead) {
    elements.btnConfirmLock.disabled=true;
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你已倒地陣亡，本回合無法行動...';
    elements.mySkillsRow.innerHTML = '<div style="color:#dc2626; font-weight: 600; padding: 10px;">你已倒下，本回合無法行動。</div>';
    return;
  }

  if (isSurrendered) {
    elements.btnConfirmLock.disabled=true;
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你陷入【暗影魔狼族長】的血脈壓制臣服狀態，無法行動！';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 700; padding: 12px; font-size: 1rem;">源自靈魂深處的始祖狼王威壓讓你跪地臣服，全身無法動彈，直到暗影魔狼族長倒下！</div>';
    return;
  }

  if (isTree) {
    elements.btnConfirmLock.disabled=true;
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你受到致命傷化為古樹休眠中，本回合無法行動...';
    elements.mySkillsRow.innerHTML = '<div style="color:#16a34a; font-weight: 700; padding: 12px; font-size: 1rem;">沉睡古樹休眠中，正在凝聚自然生機，本回合無法行動！</div>';
    return;
  }

  if (isStunned) {
    elements.btnConfirmLock.disabled=true;
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '你處於脫力虛弱狀態，正在喘息休息...';
    elements.mySkillsRow.innerHTML = '<div style="color:#b45309; font-weight: 600; padding: 10px;">脫力後遺症中，本回合無法行動。</div>';
    return;
  }

  const isResolving = roomState?.selectionState === 'RESOLVING';
  const isLocked = Boolean(me.isLocked);

  if (isLocked && me.action) {
    currentPendingAction = me.action;
    currentPendingTarget = me.targetPlayerId;
  }

  if (isResolving || isNarrating) {
    elements.myActionStatus.className = 'action-status-badge narrating';
    elements.myActionStatus.textContent = '全員鎖定！戰況交鋒結算中... (請觀看演出)';
  } else if (isLocked) {
    elements.myActionStatus.className = 'action-status-badge submitted';
    elements.myActionStatus.textContent = '指令已鎖定！等待全體隊友確認 (全員鎖定前可取消)';
  } else if (currentPendingAction) {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '已選取技能，請確認目標並按下「確定鎖定」';
  } else {
    elements.myActionStatus.className = 'action-status-badge';
    elements.myActionStatus.textContent = '請點擊指定本回合施放行動：';
  }

  elements.mySkillsRow.innerHTML = '';

  // 渲染自身所有技能
  const activeSkills = ((me.availableSkills && me.availableSkills.length > 0) ? me.availableSkills : roleConfig.skills).map(skill=>window.StudioGame?.skillDisplay(me.role,skill,me)||skill);

  activeSkills.forEach(skill => {
    let cd = me.cooldowns[skill.id] || 0;
    let isCoolingDown = skill.phaseBlocked || skill.hpBlocked || cd > 0 || (skill.id==='sa_tsubame' && me.soul<4);
    let cdBadgeText = skill.hpBlocked?'生命須大於1':skill.phaseBlocked?'求解：前輪技能不可重複':`CD: ${cd}`;

    if (skill.id === 'dru_transform' && me.druidFormTurns > 0) {
      isCoolingDown = true;
      cdBadgeText = `變身中 (${me.druidFormTurns}R)`;
    }

    if (skill.id === 'dru_summon_treant' || skill.id === 'dru_summon_wolf') {
      const minionCount = (me.minions || []).length;
      if (minionCount >= 3) {
        isCoolingDown = true;
        cdBadgeText = '夥伴已滿(3/3)';
      }
    }

    if (skill.id === 'a_reload' || skill.id === 'a_frenzy_reload') {
      const ammoCount = (me.ammo || []).length;
      if (ammoCount >= 3) {
        isCoolingDown = true;
        cdBadgeText = '彈匣已滿(3/3)';
      }
    }

    let displayLabel = skill.label;
    if (skill.id === 'basic' && me.ammo && me.ammo.length > 0) {
      const ammoLabels = me.ammo.map(a => a === 'pierce' ? '貫穿' : a === 'elemental' ? '元素' : '爆裂').join('/');
      displayLabel = `普攻: 重弩齊射 [${ammoLabels}]`;
    }

    const isSelected = (currentPendingAction === skill.id);
    const tags = skill.tags || [skill.dmgType ? skill.dmgType.replace(/【|】/g, '') : '物理', '單體'];

    const btn = document.createElement('div');
    btn.className = `skill-btn skill ${isSelected ? 'selected' : ''}`;
    btn.setAttribute('aria-disabled',String(isCoolingDown||isNarrating||isResolving||isLocked));
    if (isCoolingDown || isNarrating || isResolving || isLocked) {
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    }

    btn.innerHTML = `
      <span class="skill-name">${escapeHtml(displayLabel)}</span>
      <div class="skill-bottom">
        <span class="skill-kind">${escapeHtml(tags[0] || 'ACTION')}</span>
        ${isCoolingDown ? `<span class="skill-cd">${cdBadgeText}</span>` : `<span class="skill-cd">READY</span>`}
      </div>
      <div class="skill-popover hidden">
        <div class="skill-popover-title">
          <span>${escapeHtml(skill.label)}</span>
          <span style="font-size:10.5px;color:#94a3b8;">${escapeHtml(skill.dmgType || '')}</span>
        </div>
        <div class="skill-popover-desc">${escapeHtml(getSkillDescription(me.role,skill,false))}</div>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (isCoolingDown || isNarrating || isResolving || isLocked) return;
      handleSkillClick(skill.id, me);
    });

    elements.mySkillsRow.appendChild(btn);
    BattleHud.bindSkill(btn,getSkillDescription(me.role,skill,false));
  });

  // 吟遊詩人專屬：當有隊友倒地時，動態顯示「甦生之歌」
  if (me.role === 'bard') {
    const deadPlayers = roomState.players.filter(p => p.hp <= 0 && !p.noReviveThisFloor);
    if (deadPlayers.length > 0) {
      const isSelected = (currentPendingAction === 'b_revive');
      const reviveBtn = document.createElement('div');
      reviveBtn.className = `skill-btn skill skill-revive-btn ${isSelected ? 'selected' : ''}`;
      if (isNarrating || isResolving || isLocked) {
        reviveBtn.style.opacity = '0.6';
        reviveBtn.style.cursor = 'not-allowed';
      }
      reviveBtn.innerHTML = `
        <span class="skill-name">甦生之歌</span>
        <div class="skill-bottom">
          <span class="skill-kind">奇蹟 / 復活</span>
          <span class="skill-cd">REVIVE</span>
        </div>
      `;

      reviveBtn.addEventListener('click', () => {
        if (isNarrating || isResolving || isLocked) return;
        openTargetModal('revive', deadPlayers);
      });

      elements.mySkillsRow.appendChild(reviveBtn);
    }
  }

  // 個人背包消耗品：補血藥 與 解毒劑 (放於個人隨身背包 me.bag 時於戰鬥技能列顯示)
  const personalBag = me.bag || [];
  const potionCount = personalBag.filter(i => i && (i.effectType === 'HEALING_POTION' || i.id === 'consumable_healing_potion')).length;
  const antidoteCount = personalBag.filter(i => i && (i.effectType === 'ANTIDOTE' || i.id === 'consumable_antidote')).length;

  if (potionCount > 0) {
    const isPotionSelected = (currentPendingAction === 'use_item_healing_potion');
    const potionBtn = document.createElement('div');
    potionBtn.className = `skill-btn skill skill-item-btn ${isPotionSelected ? 'selected' : ''}`;
    if (isNarrating || isResolving || isLocked) {
      potionBtn.style.opacity = '0.6';
      potionBtn.style.cursor = 'not-allowed';
    }
    potionBtn.innerHTML = `
      <span class="skill-name">治療藥 (${potionCount})</span>
      <div class="skill-bottom">
        <span class="skill-kind">補給 / 恢復</span>
        <span class="skill-cd">${me.role === 'alchemist' ? '自身40/全隊25' : 'HEAL 35'}</span>
      </div>
    `;

    potionBtn.addEventListener('click', () => {
      if (isNarrating || isResolving || isLocked) return;
      if (me.role === 'alchemist') {
        currentPendingAction = 'use_item_healing_potion';
        currentPendingTarget = me.id;
        playSound('heal');
        renderMyActionBar(me);
      } else {
        const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
        if (alivePlayers.length > 1) {
          openTargetModal('item_potion', alivePlayers);
        } else {
          currentPendingAction = 'use_item_healing_potion';
          currentPendingTarget = me.id;
          playSound('heal');
          renderMyActionBar(me);
        }
      }
    });

    elements.mySkillsRow.appendChild(potionBtn);
  }

  if (antidoteCount > 0) {
    const isAntidoteSelected = (currentPendingAction === 'use_item_antidote');
    const antidoteBtn = document.createElement('div');
    antidoteBtn.className = `skill-btn skill skill-item-btn ${isAntidoteSelected ? 'selected' : ''}`;
    if (isNarrating || isResolving || isLocked) {
      antidoteBtn.style.opacity = '0.6';
      antidoteBtn.style.cursor = 'not-allowed';
    }
    antidoteBtn.innerHTML = `
      <span class="skill-name">解毒藥 (${antidoteCount})</span>
      <div class="skill-bottom">
        <span class="skill-kind">補給 / 淨化</span>
        <span class="skill-cd">CLEANSE</span>
      </div>
    `;

    antidoteBtn.addEventListener('click', () => {
      if (isNarrating || isResolving || isLocked) return;
      const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
      if (alivePlayers.length > 1) {
        openTargetModal('item_antidote', alivePlayers);
      } else {
        currentPendingAction = 'use_item_antidote';
        currentPendingTarget = me.id;
        playSound('heal');
        renderMyActionBar(me);
      }
    });

    elements.mySkillsRow.appendChild(antidoteBtn);
  }

  // 隊長主動技 (如果是主動技，則加入技能列表，一次戰鬥只能使用一次)
  const isEffectiveLeader = (roomState?.lockedLeaderId === myId || (!roomState?.lockedLeaderId && roomState?.leaderId === myId));
  const leaderSkill = roomState?.leaderSkill;
  if (isEffectiveLeader && leaderSkill && leaderSkill.type === 'ACTIVE') {
    const isUsed = Boolean(roomState?.leaderSkillUsedThisBattle);
    const isLeaderSelected = ['leader_assassin_execute', 'onm_all_talismans', 'dru_form_wolf', 'dru_form_treant'].includes(currentPendingAction);
    const leaderBtn = document.createElement('div');
    leaderBtn.className = `skill-btn skill skill-leader-btn ${isLeaderSelected ? 'selected' : ''}`;
    if (isUsed || isNarrating || isResolving || isLocked) {
      leaderBtn.style.opacity = '0.6';
      leaderBtn.style.cursor = 'not-allowed';
    }

    let actionLabel = leaderSkill.name;
    if (currentPendingAction === 'dru_form_wolf') actionLabel = '自在化形 (狼人)';
    else if (currentPendingAction === 'dru_form_treant') actionLabel = '自在化形 (樹精)';

    leaderBtn.innerHTML = `
      <span class="skill-name">【隊長】${escapeHtml(actionLabel)}</span>
      <div class="skill-bottom">
        <span class="skill-kind">主動 / 隊長技</span>
        <span class="skill-cd">${isUsed ? '已使用' : '1場1次'}</span>
      </div>
      <div class="skill-popover hidden">
        <div class="skill-popover-title">
          <span>${escapeHtml(leaderSkill.name)}</span>
          <span style="font-size:10.5px;color:var(--rarity-exclusive,#ffd700);">主動隊長技</span>
        </div>
        <div class="skill-popover-desc">${escapeHtml(leaderSkill.desc || leaderSkill.combatDesc || '')}</div>
      </div>
    `;

    leaderBtn.addEventListener('click', () => {
      if (isUsed || isNarrating || isResolving || isLocked) return;
      if (me.role === 'druid') {
        openDruidTransformModal();
      } else if (me.role === 'onmyoji') {
        currentPendingAction = 'onm_all_talismans';
        currentPendingTarget = null;
        playSound('click');
        renderMyActionBar(me);
      } else if (me.role === 'assassin') {
        currentPendingAction = 'leader_assassin_execute';
        currentPendingTarget = null;
        playSound('click');
        renderMyActionBar(me);
      }
    });

    elements.mySkillsRow.appendChild(leaderBtn);
  }

  // 跳過回合按鈕
  const isSkipSelected = (currentPendingAction === 'skip');
  const skipBtn = document.createElement('div');
  skipBtn.className = `skill-btn skill ${isSkipSelected ? 'selected' : ''}`;
  if (isNarrating || isResolving || isLocked) {
    skipBtn.style.opacity = '0.6';
    skipBtn.style.cursor = 'not-allowed';
  }
  const hasCrossbow = (me.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
  const skipTag = (me.role === 'archer' && hasCrossbow) ? '清空弩箭' : '蓄力';

  skipBtn.innerHTML = `
    <span class="skill-name">跳過回合</span>
    <div class="skill-bottom">
      <span class="skill-kind">防守 / ${skipTag}</span>
      <span class="skill-cd">GUARD</span>
    </div>
  `;

  skipBtn.addEventListener('click', () => {
    if (isNarrating || isResolving || isLocked) return;
    currentPendingAction = 'skip';
    currentPendingTarget = null;
    if (me.role === 'archer' && hasCrossbow && me.ammo && me.ammo.length > 0) {
      me.ammo = [];
      socket.emit('battle:clear_ammo');
    }
    playSound('click');
    renderMyActionBar(me);
  });

  elements.mySkillsRow.appendChild(skipBtn);
  const bagButton=document.createElement('button');
  bagButton.type='button';bagButton.className='skill-btn skill';bagButton.textContent='背包 / INVENTORY';
  bagButton.disabled=isNarrating||isResolving||isLocked;bagButton.onclick=openInventoryModal;
  elements.mySkillsRow.appendChild(bagButton);
  BattleHud.renderEquation(me,currentPendingAction);

  // 更新下方確認/鎖定操作列
  updateSkillSelectionBar(me, isDead, isStunned, isSurrendered, isTree, isNarrating, isResolving, isLocked, activeSkills);
  for(const button of elements.mySkillsRow.querySelectorAll('.skill-btn:not([role])'))BattleHud.bindSkill(button,button.textContent.trim());
}

// 相容別名：確保任何地方呼叫 renderBattleSkills 皆可正常執行
const renderBattleSkills = renderMyActionBar;

// 技能選擇與確認狀態條更新
function updateSkillSelectionBar(me, isDead, isStunned, isSurrendered, isTree, isNarrating, isResolving, isLocked, activeSkills) {
  if (!elements.skillSelectionBar) return;

  const bar = elements.skillSelectionBar;
  const prompt = elements.selectionPromptText;
  const targetTxt = elements.selectionTargetText;
  const btnLock = elements.btnConfirmLock;
  const btnUnlock = elements.btnUnlockAction;

  if (isResolving || isNarrating) {
    bar.className = 'skill-selection-bar state-resolving';
    prompt.textContent = '全員鎖定！正在進行回合結算...';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.add('hidden');
    return;
  }

  if (isDead || isStunned || isSurrendered || isTree) {
    bar.className = 'skill-selection-bar';
    prompt.textContent = '當前狀態本回合無法自選技能';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnUnlock.classList.add('hidden');
    return;
  }

  let skillName = '';
  if (currentPendingAction === 'skip') {
    skillName = '跳過回合';
  } else if (currentPendingAction === 'b_revive') {
    skillName = '甦生之歌';
  } else if (currentPendingAction === 'use_item_healing_potion') {
    skillName = '治療藥';
  } else if (currentPendingAction === 'use_item_antidote') {
    skillName = '解毒藥';
  } else if (currentPendingAction === 'leader_assassin_execute') {
    skillName = '隊長技: 絕命處決';
  } else if (currentPendingAction === 'onm_all_talismans') {
    skillName = '隊長技: 萬符歸宗';
  } else if (currentPendingAction === 'dru_form_wolf') {
    skillName = '隊長技: 自在化形 (狼人)';
  } else if (currentPendingAction === 'dru_form_treant') {
    skillName = '隊長技: 自在化形 (樹精)';
  } else if (currentPendingAction) {
    const found = (activeSkills || []).find(s => s.id === currentPendingAction);
    skillName = found ? found.label : currentPendingAction;
  }

  let targetName = '';
  if (currentPendingTarget) {
    const tp = (roomState?.players || []).find(p => p.id === currentPendingTarget);
    if (tp) targetName = tp.name;
  }

  const descEl = document.getElementById('skillDetailDesc');
  if (descEl) {
    if (currentPendingAction === 'skip') {
      const hasCrossbow = (me.equips || []).some(e => e.id === 'a_crossbow' || e.name === '改良型重弩');
      descEl.textContent = (me.role === 'archer' && hasCrossbow)
        ? '本回合放棄行動，保留技能冷卻，並卸除清空已裝備的弩箭。'
        : '本回合放棄行動，保留技能冷卻。';
    } else if (currentPendingAction === 'b_revive') {
      descEl.textContent = '喚醒一名倒地隊友(恢復35%生命)，下回合雙方脫力無法行動！';
    } else if (currentPendingAction === 'use_item_healing_potion') {
      if (me.role === 'alchemist') {
        descEl.textContent = '消耗隨身背包中 1 瓶治療藥，恢復自身40點生命，以及除自身外隊友25點生命。';
      } else {
        descEl.textContent = '消耗隨身背包中 1 瓶治療藥，為目標恢復 35 點生命值。';
      }
    } else if (currentPendingAction === 'use_item_antidote') {
      descEl.textContent = '消耗隨身背包中 1 瓶解毒藥，徹底清除目標身上的所有負面狀態。';
    } else if (currentPendingAction === 'leader_assassin_execute') {
      descEl.textContent = '【隊長技・絕命處決】瞬身刺破死穴，打出一次必定爆擊的致命打擊（每場戰鬥限使用一次）。';
    } else if (currentPendingAction === 'onm_all_talismans') {
      descEl.textContent = '【隊長技・萬符歸宗】一次性貼上所有類型符咒各 2 張（共 10 道符咒），且此方式貼上的符咒絕不脫落（每場戰鬥限使用一次）。';
    } else if (currentPendingAction === 'dru_form_wolf') {
      descEl.textContent = '【隊長技・自在化形】化身為狼人，造成傷害提升至 40 點，持續 2 回合（每場戰鬥限使用一次）。';
    } else if (currentPendingAction === 'dru_form_treant') {
      descEl.textContent = '【隊長技・自在化形】化身為遠古樹精，獲得自身最大生命 85% 護盾與 30% 減傷，替隊友承傷 50%，持續 2 回合（每場戰鬥限使用一次）。';
    } else if (currentPendingAction) {
      const found = (activeSkills || []).find(s => s.id === currentPendingAction);
      descEl.textContent = found ? getSkillDescription(me.role, found) : '';
    } else {
      descEl.textContent = '請點選上方技能卡片，檢視技能效果並下達行動指令。';
    }
  }

  if (isLocked) {
    bar.className = 'skill-selection-bar command-details state-locked';
    prompt.textContent = `已鎖定行動：【${skillName}】${targetName ? `(目標: ${targetName})` : ''}，等待其他隊友確認...`;
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnLock.innerHTML = '<svg class="ico sm"><use href="#icon-check"></use></svg> 已鎖定 (LOCKED)';
    btnUnlock.classList.remove('hidden');
  } else if (currentPendingAction) {
    bar.className = 'skill-selection-bar command-details state-selected';
    prompt.textContent = `目前選擇：【${skillName}】${targetName ? `(目標: ${targetName})` : ''}`;
    targetTxt.classList.add('hidden');
    btnLock.disabled = false;
    btnLock.innerHTML = '<svg class="ico sm"><use href="#icon-check"></use></svg> 確定鎖定 (CONFIRM)';
    btnUnlock.classList.add('hidden');
  } else {
    bar.className = 'skill-selection-bar command-details';
    prompt.textContent = '請點選上方技能進行選擇';
    targetTxt.classList.add('hidden');
    btnLock.disabled = true;
    btnLock.innerHTML = '<svg class="ico sm"><use href="#icon-check"></use></svg> 確定鎖定';
    btnUnlock.classList.add('hidden');
  }

  // 隊長技按鈕已內嵌至下方技能列中，隱藏浮動按鈕避免重複
  const btnLeader = elements.btnUseLeaderSkill;
  if (btnLeader) {
    btnLeader.classList.add('hidden');
  }
}

// 點擊技能只代表「選擇」，不直接發動
function handleSkillClick(actionId, me) {
  if (roomState?.isNarrating || isPlayingBattleNarrative || me.isLocked) return;
  if (roomState?.selectionState === 'RESOLVING') return;

  if(actionId==='dw_butterfly') {
    const arena=roomState.enemyArena||roomState.arena;
    const enemies=(roomState.enemies?.length?roomState.enemies:[roomState.currentMonster]).filter(e=>e?.hp>0&&(!arena?.enemyId||e.instanceId===arena.enemyId));
    const allies=(roomState.players||[]).filter(p=>p.hp>0&&(!arena||p.id===arena.playerId));
    openTargetModal('dream',[...allies,...enemies.map(e=>({...e,id:e.instanceId,role:null,customAvatar:e.avatar}))]);return;
  }
  // 卜者命運繫結：若有其他存活隊友，彈出目標選擇；若無則自動指定自身
  if (actionId === 'aug_bind') {
    const aliveAllies = (roomState?.players || []).filter(p => p.hp > 0 && p.id !== me.id);
    if (aliveAllies.length > 0) {
      openTargetModal('aug_bind', aliveAllies);
      return;
    } else {
      currentPendingAction = 'aug_bind';
      currentPendingTarget = me.id;
      playSound('magic');
      renderMyActionBar(me);
      return;
    }
  }
  // 聖騎士代受恩典：若有多位活著隊友，彈出目標選擇
  if (actionId === 'pal_grace') {
    const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
    if (alivePlayers.length > 1) {
      openTargetModal('grace', alivePlayers);
      return;
    }
  }
  // 吟遊詩人治癒頌歌：若有多位活著隊友，彈出目標選擇
  if (me.role === 'bard' && actionId === 'b_heal') {
    const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
    if (alivePlayers.length > 1) {
      openTargetModal('heal', alivePlayers);
      return;
    }
  }

  currentPendingAction = actionId;
  currentPendingTarget = null;
  playSound(actionId === 'basic' ? 'hit' : 'magic');
  renderMyActionBar(me);
}

function canUseBattleItem(player) {
  return !!player && player.hp>0 && !player.isLocked && !player.stunnedNextTurn && !player.isSurrendered && player.druidForm!=='tree' && roomState?.state==='IN_BATTLE' && roomState.selectionState==='SELECTING' && !roomState.isNarrating && !isPlayingBattleNarrative;
}

// 目標選擇 Modal (治癒額外目標 / 甦生之歌目標 / 代受恩典目標 / 命運繫結目標)
function openTargetModal(type, targetList) {
  const me = getMyPlayer();
  if(elements.inventoryModal&&!elements.inventoryModal.classList.contains('hidden'))ModalMotion.hide(elements.inventoryModal);
  ModalMotion.show(elements.targetModal);
  elements.targetModalList.innerHTML = '';

  if(type==='dream'){elements.targetModalTitle.textContent='清醒夢・薛丁格之蝶・指定目標';elements.targetModalDesc.textContent='請選擇存活隊友或魔物：';}
  if (type === 'aug_bind') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('sparkle')} <span>【命運繫結】重新指定觀測目標</span>`;
    elements.targetModalDesc.textContent = '請選擇一名隊友作為命運觀測目標（當回合加護強化）：';
  } else if (type === 'grace') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('shield')} <span>【代受恩典】指定守護隊友</span>`;
    elements.targetModalDesc.textContent = '在接下來的 2 回合，該隊友受到的傷害與負面狀態將由聖騎士承受：';
  } else if (type === 'heal') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('heal')} <span>【治癒頌歌】專注目標</span>`;
    elements.targetModalDesc.textContent = '全隊將獲得群療，請指定一名隊友額外獲得專注回復：';
  } else if (type === 'revive') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('sparkle')} <span>【甦生之歌】奇蹟喚醒</span>`;
    elements.targetModalDesc.textContent = '請選擇要喚醒歸隊的倒下隊友：(下回合雙方皆會脫力)';
  } else if (type === 'item_potion') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('heal')} <span>【使用治療藥】選擇目標</span>`;
    elements.targetModalDesc.textContent = me?.role === 'alchemist'
      ? '煉金術士專屬效果：恢復自身40點生命，以及除自身外隊友25點生命。'
      : '請選擇要恢復 35 點生命值的隊友（亦可對自己使用）：';
  } else if (type === 'item_antidote') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('sparkle')} <span>【使用解毒藥】選擇目標</span>`;
    elements.targetModalDesc.textContent = '請選擇要清除所有負面狀態的隊友（亦可對自己使用）：';
  } else if (type === 'inv_potion') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('heal')} <span>【使用治療藥】選擇目標隊友</span>`;
    elements.targetModalDesc.textContent = me?.role === 'alchemist'
      ? '煉金術士專屬效果：恢復自身40點生命，以及除自身外隊友25點生命。'
      : '請選擇要恢復 35 點生命的隊員：';
  } else if (type === 'inv_antidote') {
    elements.targetModalTitle.innerHTML = `${getIconSvg('sparkle')} <span>【使用解毒藥】選擇目標隊友</span>`;
    elements.targetModalDesc.textContent = '請選擇要清除所有負面狀態的隊員：';
  }

  targetList.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'target-btn';
    btn.innerHTML = `
      <span class="target-btn-left">
        ${getPlayerAvatarHtml(p, 'target-role-avatar')}
        <span>${escapeHtml(p.name)}</span>
      </span>
      ${battleVitalsMarkup(p)}${p.hp>0?'':'<small>倒地</small>'}
    `;

    btn.addEventListener('click', () => {
      ModalMotion.hide(elements.targetModal);
      if (type === 'item_potion' || type === 'item_antidote') {
        playSound('heal');
        currentPendingAction = type === 'item_potion' ? 'use_item_healing_potion' : 'use_item_antidote';
        currentPendingTarget = p.id;
        const me = getMyPlayer();
        if (me) renderMyActionBar(me);
        return;
      }
      if (type === 'inv_potion' || type === 'inv_antidote') {
        playSound('heal');
        if (pendingInvUseItem) {
          const invMeta = pendingInvUseItem;
          pendingInvUseItem = null;
          socket.emit('inventory:use_item', {
            fromArea: invMeta.area === 'SQUAD' ? 'squad' : 'personal',
            index: invMeta.index,
            targetPlayerId: p.id
          }, (res) => {
            if (res && !res.success) alert(res.message);
            selectedInvSlot = null;
            renderInventoryModal();
          });
        }
        return;
      }
      playSound(type === 'heal' || type === 'grace' ? 'heal' : 'magic');
      currentPendingAction = type === 'dream' ? 'dw_butterfly' : type === 'heal' ? 'b_heal' : type === 'grace' ? 'pal_grace' : type === 'aug_bind' ? 'aug_bind' : 'b_revive';
      currentPendingTarget = p.id;
      const me = getMyPlayer();
      if (me) renderMyActionBar(me);
    });

    elements.targetModalList.appendChild(btn);
  });
}

// 技能確認鎖定 / 解鎖取消 按鈕事件監聽
if (elements.btnConfirmLock) {
  elements.btnConfirmLock.addEventListener('click', () => {
    const me = getMyPlayer();
    if (!me || me.isLocked || !currentPendingAction) return;
    playSound('select');
    socket.emit('battle:lock', {
      actionId: currentPendingAction,
      targetPlayerId: currentPendingTarget,
      targetEnemyId: me.targetEnemyId || currentSelectedEnemyId || null
    });
  });
}

if (elements.btnUnlockAction) {
  elements.btnUnlockAction.addEventListener('click', () => {
    const me = getMyPlayer();
    if (!me || !me.isLocked) return;
    playSound('cancel');
    socket.emit('battle:unlock');
  });
}

elements.btnCancelTarget.addEventListener('click', () => {
  ModalMotion.hide(elements.targetModal);
});

// ==========================================
// 德魯伊夥伴詳細資訊 Modal 邏輯
// ==========================================
let activeViewingMinionOwnerId = null;

function showMinionDetailModal(player) {
  if (!player || !player.minions || player.minions.length === 0) return;
  if (!elements.minionDetailModal) return;

  activeViewingMinionOwnerId = player.id;
  const totalHp = player.minions.reduce((sum, m) => sum + (m.hp || 0), 0);
  const totalMaxHp = player.minions.reduce((sum, m) => sum + (m.maxHp || 0), 0);
  const totalAtk = player.minions.reduce((sum, m) => sum + (m.atk || 0), 0);

  if (elements.minionDetailTitle) {
    elements.minionDetailTitle.innerHTML = `${getIconSvg('summon')} <span>${escapeHtml(player.name)} 的夥伴隊伍 (${player.minions.length}/3)</span>`;
  }
  if (elements.minionDetailSubtitle) {
    elements.minionDetailSubtitle.textContent = `合計生命 ${totalHp}/${totalMaxHp} · 合計攻擊力 ${totalAtk} 點`;
  }

  if (elements.minionDetailList) {
    elements.minionDetailList.innerHTML = player.minions.map((m, idx) => {
      const mHpPct = Math.max(0, Math.min(100, Math.round((m.hp / m.maxHp) * 100)));
      const isWolf = m.type === 'wolf';
      const typeBadge = isWolf ? '<span class="minion-detail-badge wolf">幼狼</span>' : '<span class="minion-detail-badge">小樹精</span>';
      const minionAvatar = m.avatar || (isWolf ? `/assets/characters/summons/druid/幼狼${m.minionIndex || (idx + 1)}.webp` : `/assets/characters/summons/druid/小樹精${m.minionIndex || (idx + 1)}.webp`);
      const desc = isWolf 
        ? '<strong>每回合自動攻擊 10 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。' 
        : '<strong>每回合自動攻擊 1 點傷害</strong>，並優先替全體隊友吸收怪物的彈射傷害。';
      const displayName = m.name?.match(/\d+$/) ? m.name : `${m.name} #${idx + 1}`;

      return `
        <div class="minion-detail-item">
          <div class="minion-detail-item-header">
            <div style="display:flex; align-items:center; gap: 8px;">
              <img src="${minionAvatar}" class="minion-modal-thumb" alt="${escapeHtml(m.name)}">
              <span class="name"><strong>${escapeHtml(displayName)}</strong></span>
            </div>
            ${typeBadge}
          </div>
          <div class="teammate-hp-bg" style="margin: 6px 0;">
            <div class="teammate-hp-fill" style="width: ${mHpPct}%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #166534;">
            <span>生命：${m.hp} / ${m.maxHp} (${mHpPct}%)</span>
            <span>攻擊力：${m.atk} 攻</span>
          </div>
          <div class="minion-detail-desc">
            ${desc}
          </div>
        </div>
      `;
    }).join('');
  }

  ModalMotion.show(elements.minionDetailModal);
}

function hideMinionDetailModal() {
  activeViewingMinionOwnerId = null;
  if (elements.minionDetailModal) {
    ModalMotion.hide(elements.minionDetailModal);
  }
}

if (elements.btnCloseMinionModal) {
  elements.btnCloseMinionModal.addEventListener('click', hideMinionDetailModal);
}
if (elements.btnConfirmMinionModal) {
  elements.btnConfirmMinionModal.addEventListener('click', hideMinionDetailModal);
}
if (elements.minionDetailModal) {
  elements.minionDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.minionDetailModal) {
      hideMinionDetailModal();
    }
  });
}

// ==========================================
// 角色詳細技能與數值介紹 Modal 邏輯
// ==========================================
function openRoleDetailModal(roleKey) {
  const baseDetails = (roleDetailsData && roleDetailsData[roleKey]) || (DEFAULT_ROLE_DETAILS && DEFAULT_ROLE_DETAILS[roleKey]);
  const profile=window.StudioContent?.find('role_profiles',roleKey);
  const details=baseDetails&&{...baseDetails,roleName:profile?.name_zh||baseDetails.roleName,enName:profile?.name_en||baseDetails.enName,type:profile?.position_label??baseDetails.type,passive:profile?.passive_full??baseDetails.passive};
  if (!details || !elements.roleDetailModal) return;
  const battlePlayers = roomState?.state === 'IN_BATTLE' ? roomState.players.filter(p => p.role === roleKey) : [];
  const battlePlayer = battlePlayers.find(p => p.id === myId) || battlePlayers[0];
  const modalSkills = (details.skills || []).map((s,index) => {
    const raw = battlePlayer?.availableSkills?.[index] || classesData[roleKey]?.skills?.[index] || s;
    const skill=window.StudioGame?.skillDisplay(roleKey,raw,battlePlayer)||raw;
    if (!skill.contextualCopy) return { ...s, name:skill.label||s.name,copySkill:skill };
    return { ...s, name:skill.label, cd:`CD ${skill.cd}`,
      dmgType:skill.dmgType === 'phys' ? '【物理】' : skill.dmgType === 'mag' ? '【魔法】' : '【輔助】', copySkill:skill };
  });

  if (elements.roleDetailTitle) {
    elements.roleDetailTitle.textContent = `${details.roleName} (${details.enName})`;
  }
  if (elements.roleDetailSubtitle) {
    elements.roleDetailSubtitle.textContent = `定位：${details.type} ｜ 基礎生命值：${details.hp} HP`;
  }
  if (elements.roleDetailAvatarWrap) {
    if (details.avatar) {
      elements.roleDetailAvatarWrap.innerHTML = `<img src="${details.avatar}" alt="${escapeHtml(details.roleName)}" class="role-detail-avatar-img">`;
    } else {
      elements.roleDetailAvatarWrap.innerHTML = `<div class="role-detail-avatar-icon">${getIconSvg(getRoleIconName(roleKey), 'svg-large')}</div>`;
    }
  }

  if (elements.roleDetailBody) {
    let html = '';
    html+='<label class="skill-copy-toggle"><input type="checkbox" id="skillCopyDetailToggle" '+(skillCopyDetailed?'checked':'')+'> 詳細技能敘述</label>';
    // 被動特性
    if (details.passive) {
      html += `
        <div class="role-detail-passive-card">
          <div style="font-weight:700; color:#fbbf24; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>${getIconSvg('sparkle')}</span> <span>職業被動與特性</span>
          </div>
          <div>${escapeHtml(details.passive)}</div>
        </div>
      `;
    }

    const leaderSkill = getLeaderSkill(roleKey);
    if (leaderSkill) {
      html += `<div class="role-detail-section role-detail-leader">
        <div class="role-detail-section-title"><span>隊長技</span></div>
        <div class="role-detail-skill-item">
          <div class="role-detail-skill-head">
            <span class="role-detail-skill-title"><strong>隊長技【${escapeHtml(getSkillDisplayName(roleKey,leaderSkill))}】</strong></span>
            <span class="role-detail-tag tag-buff">${leaderSkill.type==='ACTIVE'?'主動 · 每場戰鬥限一次':'被動'}</span>
          </div>
          <div class="role-detail-skill-desc">${escapeHtml(getSkillDescription(roleKey,leaderSkill))}</div>
        </div>
      </div>`;
    }

    // 技能清單
    if (details.skills && details.skills.length > 0) {
      html += `
        <div class="role-detail-section">
          <div class="role-detail-section-title">
            <span>${getIconSvg('sword')}</span> <span>職業技能詳細機制與數值</span>
          </div>
          ${modalSkills.map(s => {
            let tagClass = 'tag-phys';
            if (s.dmgType.includes('魔法')) tagClass = 'tag-mag';
            else if (s.dmgType.includes('治療') || s.dmgType.includes('回復')) tagClass = 'tag-heal';
            else if (s.dmgType.includes('輔助') || s.dmgType.includes('防護') || s.dmgType.includes('增益')) tagClass = 'tag-buff';
            return `
              <div class="role-detail-skill-item">
                <div class="role-detail-skill-head">
                  <span class="role-detail-skill-title"><strong>${escapeHtml(s.type)}【${escapeHtml(s.name)}】</strong></span>
                  <div class="role-detail-skill-tags">
                    <span class="role-detail-tag ${tagClass}">${escapeHtml(s.dmgType)}</span>
                    <span class="role-detail-tag tag-cd">${escapeHtml(s.cd)}</span>
                  </div>
                </div>
                <div class="role-detail-skill-desc">${escapeHtml(getSkillDescription(roleKey,s.copySkill))}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (roleKey === 'druid') {
      html += `
        <div class="role-detail-section">
          <div class="role-detail-section-title">
            <span>${getIconSvg('paw')}</span> <span>德魯伊變身形態與自然夥伴</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 8px;">
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/assets/characters/forms/druid/狼人.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="狼人形態">
              <div style="font-weight: 700; font-size: 13px; color: #f87171;">狼人形態</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">降低20%生命上限，普攻35傷</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/assets/characters/forms/druid/遠古樹精.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="遠古樹精形態">
              <div style="font-weight: 700; font-size: 13px; color: #86efac;">遠古樹精形態</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">護盾85%，減傷30%，分攤50%</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(234, 179, 8, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/assets/characters/forms/druid/巨熊.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="巨熊形態">
              <div style="font-weight: 700; font-size: 13px; color: #facc15;">巨熊形態 (野獸招喚)</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">血量+200%D，普攻10+100%A</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/assets/characters/summons/druid/小樹精1.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="夥伴：小樹精">
              <div style="font-weight: 700; font-size: 13px; color: #4ade80;">夥伴：小樹精</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">肉盾守護，替隊伍吸收彈射傷</div>
            </div>
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(249, 115, 22, 0.4); border-radius: 6px; padding: 10px 8px; text-align: center;">
              <img src="/assets/characters/summons/druid/幼狼1.webp" style="width: 54px; height: 54px; object-fit: contain; border-radius: 4px; margin: 0 auto 6px; display: block;" alt="夥伴：幼狼">
              <div style="font-weight: 700; font-size: 13px; color: #fb923c;">夥伴：幼狼</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">敏捷撕咬，高攻擊夥伴</div>
            </div>
          </div>
        </div>
      `;
    }

    if(roomState?.state!=='LOBBY'&&details.equipment?.length) {
      const noImgNames = new Set(['荊棘重鎧', '大天使重弓']);
      html+='<details><summary>專屬裝備</summary>'+details.equipment.map(e=>{
        const override = window.StudioContent?.rows('story_copies').find(s=>s.category==='equipment'&&s.story_key.startsWith('equip.'+roleKey+'.')&&(s.title===e.name||s.story_key.endsWith('.'+e.id)));
        const name = override?.title || e.name;
        const desc = override?.body || e.desc;
        const iconSrc = e.icon || (!noImgNames.has(e.name) ? `/assets/equipment/exclusive/${e.name}.webp` : '');
        const iconHtml = iconSrc ? `<img src="${iconSrc}" alt="${escapeHtml(name)}" style="width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:4px;" onerror="this.style.display='none';">` : '';
        return '<p style="display:flex;align-items:flex-start;gap:4px;">'+iconHtml+'<span><strong>'+escapeHtml(name)+'</strong>：'+escapeHtml(desc)+'</span></p>';
      }).join('')+'</details>';
    }
    elements.roleDetailBody.innerHTML = html;
    document.getElementById('skillCopyDetailToggle')?.addEventListener('change',e=>{setSkillCopyDetailed(e.target.checked);openRoleDetailModal(roleKey);if(roomState?.state==='IN_BATTLE')renderMyActionBar(getMyPlayer());});
    elements.roleDetailBody.querySelectorAll('.role-detail-passive-card,.role-detail-skill-item').forEach(card=>{
      const wrapper=document.createElement('details'),summary=document.createElement('summary');summary.textContent=card.querySelector('.role-detail-skill-title')?.textContent||'被動與完整規則';card.before(wrapper);wrapper.append(summary,card);
    });
  }

  ModalMotion.show(elements.roleDetailModal);
}

function hideRoleDetailModal() {
  if (elements.roleDetailModal) {
    ModalMotion.hide(elements.roleDetailModal);
  }
}

if (elements.btnCloseRoleDetailModal) {
  elements.btnCloseRoleDetailModal.addEventListener('click', hideRoleDetailModal);
}
if (elements.btnConfirmRoleDetailModal) {
  elements.btnConfirmRoleDetailModal.addEventListener('click', hideRoleDetailModal);
}
if (elements.roleDetailModal) {
  elements.roleDetailModal.addEventListener('click', (e) => {
    if (e.target === elements.roleDetailModal) {
      hideRoleDetailModal();
    }
  });
}

// 5. 渲染深淵休息站
function renderCheckpoint(me, isLeader) {
  const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState) || {};
  elements.cpFloorNum.textContent = state.floor || 5;
  if (isLeader) {
    elements.cpLeaderControls.classList.remove('hidden');
    elements.cpMemberNotice.classList.add('hidden');
  } else {
    elements.cpLeaderControls.classList.add('hidden');
    elements.cpMemberNotice.classList.remove('hidden');
  }
}

// 6. 渲染結算畫面
function renderGameOver(isLeader) {
  const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState) || {};
  elements.endTitle.textContent = '挑戰失敗';
  if (state.gameOverReason === 'abandon') {
    elements.endIcon.innerHTML = getIconSvg('flag', 'svg-hero-icon');
    elements.endSubtitle.textContent = `小隊於深淵第 ${state.floor || 1} 層中途結束，未能抵達第 5 層休息站，挑戰失敗！`;
  } else {
    elements.endIcon.innerHTML = getIconSvg('death', 'svg-hero-icon');
    elements.endSubtitle.textContent = `小隊全員在深淵第 ${state.floor || 1} 層壯烈倒下，未能成功突破，挑戰失敗！`;
  }
  renderEndStats();
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  if(typeof bgmManager!=='undefined')void bgmManager.battleDefeated().catch(error=>console.warn('[Defeat:BGM]',error));
}

function renderVictory(isLeader) {
  const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState) || {};
  elements.endIcon.innerHTML = getIconSvg('sparkle', 'svg-hero-icon');
  elements.endTitle.textContent = '榮耀凱旋歸來！';
  elements.endSubtitle.textContent = `小隊成功突破至深淵第 ${state.floor || 10} 層並滿載而歸！勇者威名永垂不朽！`;
  renderEndStats();
  elements.btnRestartLobby.style.display = isLeader ? 'inline-flex' : 'none';
  playSound('victory');
}

function renderEndStats() {
  if (!elements.endStatsBox) return;
  const state = (typeof roomState !== 'undefined' && roomState) || (typeof window !== 'undefined' && window.roomState) || {};
  const floor = state.floor || 1;
  const gold = state.gold || 0;
  const turns = state.turn || 1;
  const livingPlayers = (state.players || []).filter(p => p.hp > 0).length;
  const totalPlayers = (state.players || []).length || 1;

  elements.endStatsBox.innerHTML = `
    <div class="settlement-stats-grid">
      <div class="settlement-stat-cell">
        <div class="settlement-stat-label">EXPLORED FLOOR</div>
        <div class="settlement-stat-val text-amber">F${String(floor).padStart(2, '0')}</div>
      </div>
      <div class="settlement-stat-cell">
        <div class="settlement-stat-label">COLLECTED GOLD</div>
        <div class="settlement-stat-val text-gold">${gold} G</div>
      </div>
      <div class="settlement-stat-cell">
        <div class="settlement-stat-label">TOTAL TURNS</div>
        <div class="settlement-stat-val">${turns}</div>
      </div>
      <div class="settlement-stat-cell">
        <div class="settlement-stat-label">SURVIVING TEAM</div>
        <div class="settlement-stat-val text-teal">${livingPlayers} / ${totalPlayers}</div>
      </div>
    </div>
  `;
}

// 7. 日誌渲染與自動滾動
function renderLogs() {
  if (!roomState || !roomState.logs || !elements.combatLogWindow) return;
  const suppressed=document.body.classList.contains('battle-intro-active')||!['IN_BATTLE','BATTLE_VICTORY'].includes(roomState.state);
  if(elements.battleLogCard)elements.battleLogCard.dataset.suppressed=String(suppressed);
  if(suppressed)return;
  renderRecentBattleLogs(elements.combatLogWindow,roomState.logs);
}

// 輔助格式化 Markdown 粗體
function formatMarkdown(text) {
  if (!text) return '';
  return escapeHtml(String(text)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ==========================================
// 公會告示板與大廳導航系統 (Parchment Entry Flow)
// ==========================================
let currentEntryScreen = 'screenRecruit';
let currentSelectedServerId = null;
let serverPartyList = [];
let isClassArchiveMode = false;

const RANDOM_TITLES = [
  '破曉之刃', '影蝕術士', '蒼藍守望', '炎獄審判', '風行斥候',
  '星輝賢者', '荒野巨熊', '晨曦聖徒', '雷霆誓約', '深淵行者',
  '幽影獵手', '赤焰狂戰', '鐵壁衛士', '符文詠唱者'
];

function randomizeName() {
  const pick = RANDOM_TITLES[Math.floor(Math.random() * RANDOM_TITLES.length)];
  if (elements.inputPlayerName) {
    elements.inputPlayerName.value = pick;
  }
  playSound('click');
}

function goToEntryScreen(screenId) {
  playSound('click');
  const screens = ['screenRecruit', 'screenLobbyMenu', 'screenServerList'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.classList.remove('hidden');
        el.classList.add('fade-in');
      } else {
        el.classList.add('hidden');
        el.classList.remove('fade-in');
      }
    }
  });
  currentEntryScreen = screenId;
}

function submitRecruitPledge() {
  const input = elements.inputPlayerName ? elements.inputPlayerName.value.trim() : '';
  const name = input || myName || '勇者無名';
  myName = name;
  localStorage.setItem('dungeon_player_name', name);
  if (elements.inputPlayerName) elements.inputPlayerName.value = name;
  const menuNameEl = document.getElementById('menuPlayerName');
  if (menuNameEl) menuNameEl.textContent = name;
  playSound('click');
  goToEntryScreen('screenLobbyMenu');
}

function openClassArchiveFromMenu() {
  isClassArchiveMode = true;
  window.isClassArchiveMode = true;
  playSound('click');
  const teamCard = document.querySelector('.team-card');
  if (teamCard) teamCard.classList.add('hidden');
  const viewLobby = document.getElementById('viewLobby');
  if (viewLobby) viewLobby.classList.add('archive-mode');
  const btnArchiveBack = document.getElementById('btnArchiveBackToMenu');
  if (btnArchiveBack) btnArchiveBack.classList.remove('hidden');
  const exitBtn = document.getElementById('btnLobbyExitRoom');
  if (exitBtn) exitBtn.classList.add('hidden');
  const titleEl = document.getElementById('rolePanelTitle');
  if (titleEl) titleEl.innerHTML = '角色一覽 <small>CLASS ARCHIVE</small>';
  const statusEl = document.getElementById('roleSelectionStatus');
  if (statusEl) statusEl.textContent = '點擊頭像檢視檔案';

  switchView('lobby');
  renderRoleSelectionGrid();
}

function closeClassArchiveToMenu() {
  isClassArchiveMode = false;
  window.isClassArchiveMode = false;
  playSound('click');
  const teamCard = document.querySelector('.team-card');
  if (teamCard) teamCard.classList.remove('hidden');
  const viewLobby = document.getElementById('viewLobby');
  if (viewLobby) viewLobby.classList.remove('archive-mode');
  const btnArchiveBack = document.getElementById('btnArchiveBackToMenu');
  if (btnArchiveBack) btnArchiveBack.classList.add('hidden');
  const exitBtn = document.getElementById('btnLobbyExitRoom');
  if (exitBtn) exitBtn.classList.remove('hidden');
  const titleEl = document.getElementById('rolePanelTitle');
  if (titleEl) titleEl.innerHTML = '選擇職業 <small>SELECT CHARACTER</small>';
  const statusEl = document.getElementById('roleSelectionStatus');
  if (statusEl) statusEl.textContent = '點擊頭像選擇職業';

  switchView('entry');
  goToEntryScreen('screenLobbyMenu');
}

function renderServerSlots() {
  const container = document.getElementById('serverSlotsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!serverPartyList || serverPartyList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--ui-text-primary, #F0E8D9); font-family: var(--font-display, 'Noto Serif TC', serif);">
        <div style="margin-bottom: 12px; color: var(--gold);"><svg class="svg-icon" style="width:36px;height:36px;"><use href="#icon-log"></use></svg></div>
        <div style="font-size: 16px; font-weight: 700; color: var(--ui-text-primary, #F0E8D9);">目前尚無公開的深淵討伐隊伍</div>
        <div style="font-size: 14px; margin-top: 6px; color: var(--ui-text-muted, #979D94);">您可以點擊「創建討伐房間」發起新隊伍，或使用代碼直接連線！</div>
      </div>
    `;
    const joinBtn = document.getElementById('btnJoinServer');
    if (joinBtn) joinBtn.disabled = true;
    return;
  }

  serverPartyList.forEach(srv => {
    const isSelected = srv.id === currentSelectedServerId || srv.code === currentSelectedServerId;
    const slot = document.createElement('div');
    slot.className = `kraft-server-slot ${isSelected ? 'selected' : ''}`;
    slot.onclick = () => selectServerSlot(srv.id || srv.code);
    slot.ondblclick = () => {
      selectServerSlot(srv.id || srv.code);
      confirmJoinSelectedServer();
    };

    let pingBarsHtml = '';
    const bars = srv.pingBars || 5;
    for (let b = 1; b <= 5; b++) {
      const activeColor = b <= bars ? '#15803d' : '#cbd5e1';
      pingBarsHtml += `<div class="server-ping-bar" style="height: ${b * 3}px; background: ${activeColor};"></div>`;
    }

    slot.innerHTML = `
      <div class="server-slot-left">
        <div class="server-slot-icon" style="color: ${srv.iconColor || '#d97706'};">
          <svg class="svg-icon" style="width: 24px; height: 24px;"><use href="#icon-sword"></use></svg>
        </div>
        <div class="server-slot-info">
          <div class="server-slot-name-row">
            <span>${srv.name || '冒險者隊伍'}</span>
            <span class="server-slot-code-badge">#${srv.code}</span>
          </div>
          <div class="server-slot-motd1">${srv.subtitleLine1 || '>> 王立公會認證懸賞'}</div>
          <div class="server-slot-motd2">${srv.subtitleLine2 || '1~10 人皆可出發，等待隊友入駐！'}</div>
        </div>
      </div>
      <div class="server-slot-meta">
        <span class="server-slot-count">${srv.players || 1}/${srv.maxPlayers || 10}</span>
        <div class="server-ping-bars" title="公會連線延遲: 良好">
          ${pingBarsHtml}
        </div>
      </div>
    `;
    container.appendChild(slot);
  });

  const joinBtn = document.getElementById('btnJoinServer');
  if (joinBtn) joinBtn.disabled = !currentSelectedServerId;
}

function selectServerSlot(srvId) {
  playSound('click');
  currentSelectedServerId = srvId;
  renderServerSlots();
}

function refreshServerList() {
  playSound('click');
  socket.emit('room:list', (res) => {
    if (res && res.success) {
      serverPartyList = res.rooms || [];
    }
    renderServerSlots();
  });
}

function confirmJoinSelectedServer() {
  if (!currentSelectedServerId) return;
  const target = serverPartyList.find(s => s.id === currentSelectedServerId || s.code === currentSelectedServerId);
  if (!target) return;

  const name = myName || (elements.inputPlayerName ? elements.inputPlayerName.value.trim() : '') || '勇者無名';
  myName = name;
  localStorage.setItem('dungeon_player_name', name);
  const savedAvatar = localStorage.getItem('dungeon_custom_avatar') || null;
  initAudio();
  playSound('click');

  socket.emit('room:join', { name, code: target.code, avatar: savedAvatar }, (res) => {
    if (!res.success) alert(res.message);
  });
}

function openDirectConnectModal() {
  playSound('click');
  const modal = document.getElementById('directConnectModal');
  if (modal) {
    ModalMotion.show(modal);
    if (elements.inputRoomCode) {
      elements.inputRoomCode.value = '';
      elements.inputRoomCode.focus();
    }
  }
}

function closeDirectConnectModal() {
  const modal = document.getElementById('directConnectModal');
  if (modal) ModalMotion.hide(modal);
}

function openProfileModal() {
  if (roomState && roomState.state === 'LOBBY') {
    return;
  }
  playSound('click');
  const modal = document.getElementById('profileModal');
  const input = document.getElementById('profileNewNameInput');
  const currentClassText = document.getElementById('profileCurrentClassText');
  if (input) input.value = myName || '';
  if (currentClassText) {
    const me = (typeof getMyPlayer === 'function') ? getMyPlayer() : null;
    const myRole = me?.role;
    const roleName = myRole && classesData[myRole]?.name ? classesData[myRole].name : '戰士';
    currentClassText.textContent = roleName;
  }
  updateEntryAvatarPreview();
  if (modal) {
    ModalMotion.show(modal);
    modal.style.display = 'flex';
  }
}
window.openProfileModal = openProfileModal;

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) {
    ModalMotion.hide(modal);
    modal.style.display = 'none';
  }
}
window.closeProfileModal = closeProfileModal;

function quickSelectProfileEmoji(emoji) {
  playSound('click');
  saveCustomAvatar(emoji);
  updateEntryAvatarPreview();
}
window.quickSelectProfileEmoji = quickSelectProfileEmoji;

function saveProfileModal() {
  const input = document.getElementById('profileNewNameInput');
  const newName = input ? input.value.trim() : '';
  if (newName) {
    myName = newName;
    localStorage.setItem('dungeon_player_name', newName);
    if (elements.inputPlayerName) elements.inputPlayerName.value = newName;
    const menuNameEl = document.getElementById('menuPlayerName');
    if (menuNameEl) menuNameEl.textContent = newName;
    playSound('click');
  }
  closeProfileModal();
}
window.saveProfileModal = saveProfileModal;

// ==========================================
// 按鈕事件綁定
// ==========================================

// 建立房間
if (elements.btnCreateRoom) {
  elements.btnCreateRoom.addEventListener('click', () => {
    const name = (elements.inputPlayerName ? elements.inputPlayerName.value.trim() : '') || myName || '勇者無名';
    myName = name;
    localStorage.setItem('dungeon_player_name', name);
    const savedAvatar = localStorage.getItem('dungeon_custom_avatar') || null;
    initAudio();
    playSound('click');

    socket.emit('room:create', { name, avatar: savedAvatar }, (res) => {
      if (res.success) {
        currentRoomCode = res.roomCode;
      } else {
        alert(res.message);
      }
    });
  });
}

// 加入房間
if (elements.btnJoinRoom) {
  elements.btnJoinRoom.addEventListener('click', () => {
    const name = (elements.inputPlayerName ? elements.inputPlayerName.value.trim() : '') || myName || '勇者無名';
    const code = elements.inputRoomCode ? elements.inputRoomCode.value.trim().toUpperCase() : '';
    if (!code) {
      alert('請輸入 5 碼房間代碼！');
      return;
    }
    closeDirectConnectModal();
    myName = name;
    localStorage.setItem('dungeon_player_name', name);
    const savedAvatar = localStorage.getItem('dungeon_custom_avatar') || null;
    initAudio();
    playSound('click');

    socket.emit('room:join', { name, code, avatar: savedAvatar }, (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

// 招募令與選單事件綁定
if (elements.btnRandomName) elements.btnRandomName.addEventListener('click', randomizeName);
if (elements.btnSubmitRecruit) elements.btnSubmitRecruit.addEventListener('click', submitRecruitPledge);
if (elements.inputPlayerName) {
  elements.inputPlayerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitRecruitPledge();
  });
}

if (elements.btnOpenServerList) {
  elements.btnOpenServerList.addEventListener('click', () => {
    goToEntryScreen('screenServerList');
    refreshServerList();
  });
}
if (elements.btnOpenClassArchive) elements.btnOpenClassArchive.addEventListener('click', openClassArchiveFromMenu);
if (elements.btnOpenProfileModal) elements.btnOpenProfileModal.addEventListener('click', openProfileModal);
if (elements.btnExitToRecruit) {
  elements.btnExitToRecruit.addEventListener('click', () => {
    goToEntryScreen('screenRecruit');
  });
}

if (elements.btnJoinServer) elements.btnJoinServer.addEventListener('click', confirmJoinSelectedServer);
if (elements.btnDirectConnectModalOpen) elements.btnDirectConnectModalOpen.addEventListener('click', openDirectConnectModal);
if (elements.btnRefreshServerList) elements.btnRefreshServerList.addEventListener('click', refreshServerList);
if (elements.btnBackToLobbyMenu) {
  elements.btnBackToLobbyMenu.addEventListener('click', () => {
    goToEntryScreen('screenLobbyMenu');
  });
}
if (elements.btnArchiveBackToMenu) elements.btnArchiveBackToMenu.addEventListener('click', closeClassArchiveToMenu);

if (elements.btnCloseDirectConnectModal) elements.btnCloseDirectConnectModal.addEventListener('click', closeDirectConnectModal);
if (elements.directConnectModal) {
  elements.directConnectModal.addEventListener('click', (e) => {
    if (e.target === elements.directConnectModal) closeDirectConnectModal();
  });
}

if (elements.btnCloseProfileModal) elements.btnCloseProfileModal.addEventListener('click', closeProfileModal);
if (elements.btnCancelProfileModal) elements.btnCancelProfileModal.addEventListener('click', closeProfileModal);
if (elements.btnSaveProfileModal) elements.btnSaveProfileModal.addEventListener('click', saveProfileModal);
if (elements.profileModal) {
  elements.profileModal.addEventListener('click', (e) => {
    if (e.target === elements.profileModal) closeProfileModal();
  });
}

// 點擊房間代碼直接複製
function copyRoomCode() {
  if (!currentRoomCode) return;
  navigator.clipboard.writeText(currentRoomCode).then(() => {
    if (elements.roomCopyToast) {
      elements.roomCopyToast.classList.remove('hidden');
      setTimeout(() => {
        elements.roomCopyToast.classList.add('hidden');
      }, 1500);
    }
    playSound('click');
  }).catch(() => {
    prompt('請手動複製房間代碼：', currentRoomCode);
  });
}

if (elements.roomCodeText) {
  elements.roomCodeText.addEventListener('click', copyRoomCode);
}

// 音效開關與圖示切換
function updateSoundIcon() {
  if(elements.soundToggleIcon){
    elements.soundToggleIcon.querySelector('.sound-on').style.display=soundEnabled?'':'none';
    elements.soundToggleIcon.querySelector('.sound-off').style.display=soundEnabled?'none':'';
    elements.soundToggleBtn.setAttribute('aria-label',soundEnabled?'靜音所有聲音':'開啟所有聲音');
    elements.soundToggleBtn.setAttribute('aria-pressed',String(!soundEnabled));
  }
  if (elements.soundToggleBtn) {
    elements.soundToggleBtn.title = soundEnabled ? '切換音效 (目前已開啟)' : '切換音效 (目前已靜音)';
  }
}

if (elements.soundToggleBtn) {
  elements.soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (sfx) sfx.soundEnabled = soundEnabled;
    updateSoundIcon();
  });
}

// Music volume is independent of sound effects and the shared mute switch.
{
 const button=document.getElementById('bgmVolumeBtn'),panel=document.getElementById('bgmVolumePanel'),slider=document.getElementById('bgmVolumeSlider'),value=document.getElementById('bgmVolumeValue');
 if(button&&panel&&slider&&value&&typeof bgmManager!=='undefined'){
  let initial=.5;try{const saved=localStorage.getItem('dungeon-bgm-volume');if(saved!==null&&Number.isFinite(Number(saved)))initial=Math.max(0,Math.min(1,Number(saved)));}catch{}
  bgmManager.setVolume(initial);slider.value=String(Math.round(initial*100));value.textContent=slider.value+'%';
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));});
  slider.addEventListener('input',()=>{bgmManager.setVolume(Number(slider.value)/100);value.textContent=slider.value+'%';try{localStorage.setItem('dungeon-bgm-volume',String(bgmManager.volume));}catch{}});
  document.addEventListener('click',event=>{if(!button.parentElement.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();}});
 }
}
updateSoundIcon();

// 頂欄漢堡選單控制器 (Header Burger Menu Controller)
const burgerBtn = document.getElementById('btnHeaderBurger');
const burgerMenu = document.getElementById('headerBurgerMenu');

function toggleBurgerMenu(forceOpen) {
  if (!burgerBtn || !burgerMenu) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : burgerMenu.hidden;
  burgerMenu.hidden = !shouldOpen;
  burgerBtn.setAttribute('aria-expanded', String(shouldOpen));
  burgerBtn.classList.toggle('active', shouldOpen);
}

function closeBurgerMenu() {
  toggleBurgerMenu(false);
}

if (burgerBtn && burgerMenu) {
  burgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof playSound === 'function') playSound('click');
    toggleBurgerMenu();
  });

  document.addEventListener('click', (e) => {
    if (!burgerBtn.contains(e.target) && !burgerMenu.contains(e.target)) {
      closeBurgerMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBurgerMenu();
    }
  });

  if (elements.btnEndBattle) {
    elements.btnEndBattle.addEventListener('click', closeBurgerMenu);
  }
  if (elements.btnLeaveParty) {
    elements.btnLeaveParty.addEventListener('click', closeBurgerMenu);
  }
}

// 隊長出發探險
elements.btnStartGame.addEventListener('click', () => {
  playSound('victory');
  socket.emit('game:start', (res) => {
    if (!res.success) alert(res.message);
  });
});

// 隊員切換準備狀態
let pendingTransferTarget = null;
function openTransferLeaderModal(targetPlayer) {
  if (!targetPlayer) return;
  pendingTransferTarget = targetPlayer;
  if (elements.transferLeaderModalDesc) {
    elements.transferLeaderModalDesc.textContent = `確定要將房主位子移交給 ${targetPlayer.name} 嗎？`;
  }
  if (elements.transferLeaderModal) {
    ModalMotion.show(elements.transferLeaderModal);
  }
}

function closeTransferLeaderModal() {
  pendingTransferTarget = null;
  if (elements.transferLeaderModal) {
    ModalMotion.hide(elements.transferLeaderModal);
  }
}

if (elements.btnCancelTransferLeader) {
  elements.btnCancelTransferLeader.addEventListener('click', closeTransferLeaderModal);
}

if (elements.btnConfirmTransferLeader) {
  elements.btnConfirmTransferLeader.addEventListener('click', () => {
    if (!pendingTransferTarget) return;
    const targetId = pendingTransferTarget.id;
    closeTransferLeaderModal();
    playSound('click');
    socket.emit('room:transfer_leader', { targetId }, (res) => {
      if (res && !res.success) alert(res.message);
    });
  });
}

if (elements.transferLeaderModal) {
  elements.transferLeaderModal.addEventListener('click', (e) => {
    if (e.target === elements.transferLeaderModal) {
      closeTransferLeaderModal();
    }
  });
}

if (elements.btnToggleReady) {
  elements.btnToggleReady.addEventListener('click', () => {
    playSound('click');
    socket.emit('room:toggle_ready', (res) => {
      if (res && !res.success) alert(res.message);
    });
  });
}

// 離開隊伍 / 退出房間回到大廳選單
function exitRoomToLobbyMenu() {
  playSound('click');
  sfx?.stopAll();
  roomState = null;
  currentRoomCode = null;
  lobbyRoleUi.confirmedRole = null;
  isClassArchiveMode = false;
  window.isClassArchiveMode = false;
  const teamCard = document.querySelector('.team-card');
  if (teamCard) teamCard.classList.remove('hidden');
  const viewLobby = document.getElementById('viewLobby');
  if (viewLobby) viewLobby.classList.remove('archive-mode');
  const btnArchiveBack = document.getElementById('btnArchiveBackToMenu');
  if (btnArchiveBack) btnArchiveBack.classList.add('hidden');
  const exitBtn = document.getElementById('btnLobbyExitRoom');
  if (exitBtn) exitBtn.classList.remove('hidden');
  const titleEl = document.getElementById('rolePanelTitle');
  if (titleEl) titleEl.innerHTML = '選擇職業 <small>SELECT CHARACTER</small>';
  const statusEl = document.getElementById('roleSelectionStatus');
  if (statusEl) statusEl.textContent = '點擊頭像選擇職業';
  renderRoleSelectionGrid();
  currentActiveStage = 'NONE';
  if (typeof presentationManager !== 'undefined' && typeof presentationManager.clear === 'function') {
    presentationManager.clear();
  }
  if (elements.btnLeaveParty) elements.btnLeaveParty.classList.add('hidden');
  if (elements.roomBadge) elements.roomBadge.classList.add('hidden');
  switchView('entry');
  goToEntryScreen('screenLobbyMenu');
  const menuPlayerName = document.getElementById('menuPlayerName');
  if (menuPlayerName && myName) menuPlayerName.textContent = myName;
  try {
    socket.emit('leave_party');
  } catch (e) {
    console.warn(e);
  }
}
window.exitRoomToLobbyMenu = exitRoomToLobbyMenu;

if (elements.btnLeaveParty) {
  elements.btnLeaveParty.addEventListener('click', exitRoomToLobbyMenu);
}

const btnLobbyExitRoom = document.getElementById('btnLobbyExitRoom');
if (btnLobbyExitRoom) {
  btnLobbyExitRoom.addEventListener('click', exitRoomToLobbyMenu);
}

// 休息站選擇：繼續
elements.btnCpContinue.addEventListener('click', () => {
  playSound('heal');
  socket.emit('checkpoint:choice', { choice: 'continue' }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// 休息站選擇：結束
elements.btnCpEnd.addEventListener('click', () => {
  playSound('victory');
  socket.emit('checkpoint:choice', { choice: 'end' }, (res) => {
    if (!res.success) alert(res.message);
  });
});

// 重啟冒險回大廳
elements.btnRestartLobby.addEventListener('click', () => {
  playSound('click');
  socket.emit('game:restart', (res) => {
    if (!res.success) alert(res.message);
  });
});

// ==========================================
// 懸浮聊天室與 30 秒訊息氣泡邏輯
// ==========================================
let isChatOpen = false;
let unreadChatCount = 0;
let chatBubbleTimer = null;
const renderedChatIds = new Set();

function toggleChat(open = null) {
  if (open === null) {
    isChatOpen = !isChatOpen;
  } else {
    isChatOpen = open;
  }

  if (elements.chatPopupCard) {
    if (isChatOpen) {
      elements.chatPopupCard.classList.remove('hidden');
      dismissChatBubble();
      unreadChatCount = 0;
      if (elements.chatUnreadBadge) {
        elements.chatUnreadBadge.classList.add('hidden');
        elements.chatUnreadBadge.textContent = '0';
      }
      setTimeout(() => {
        if (elements.chatInput) elements.chatInput.focus();
      }, 100);
      scrollChatToBottom();
    } else {
      elements.chatPopupCard.classList.add('hidden');
    }
  }
}

function showChatBubble(senderName, message) {
  if (!elements.chatToastBubble) return;
  if (elements.chatBubbleSender) {
    elements.chatBubbleSender.innerHTML = `${getIconSvg('log')} <span>${escapeHtml(senderName)}</span>`;
  }
  if (elements.chatBubbleText) {
    elements.chatBubbleText.textContent = message;
  }

  // 重啟 30 秒倒數進度條動畫
  const timerBar = elements.chatToastBubble.querySelector('.chat-bubble-timer-bar');
  if (timerBar) {
    timerBar.style.animation = 'none';
    void timerBar.offsetWidth;
    timerBar.style.animation = 'bubbleCountdown 30s linear forwards';
  }

  elements.chatToastBubble.classList.remove('hidden');

  if (chatBubbleTimer) clearTimeout(chatBubbleTimer);
  chatBubbleTimer = setTimeout(() => {
    dismissChatBubble();
  }, 30000);
}

function dismissChatBubble() {
  if (chatBubbleTimer) {
    clearTimeout(chatBubbleTimer);
    chatBubbleTimer = null;
  }
  if (elements.chatToastBubble) {
    elements.chatToastBubble.classList.add('hidden');
  }
}

function renderChatMessage(chatData, scroll = true) {
  if (!elements.chatMessageList) return;
  const isMe = chatData.senderId === myId;
  const row = document.createElement('div');
  row.className = `chat-msg-row ${isMe ? 'is-me' : 'is-other'}`;

  const senderLabel = isMe ? '你' : escapeHtml(chatData.senderName);
  row.innerHTML = `
    <div class="chat-msg-meta">
      <span>${senderLabel}</span>
      <span>${chatData.time || ''}</span>
    </div>
    <div class="chat-msg-bubble">${escapeHtml(chatData.message)}</div>
  `;

  const emptyHint = elements.chatMessageList.querySelector('.chat-empty-hint');
  if (emptyHint) emptyHint.remove();

  elements.chatMessageList.appendChild(row);
  if (scroll) scrollChatToBottom();
}

function scrollChatToBottom() {
  if (elements.chatMessageList) {
    elements.chatMessageList.scrollTop = elements.chatMessageList.scrollHeight;
  }
}

function syncChatMessages(chatList) {
  if (!chatList || !Array.isArray(chatList) || !elements.chatMessageList) return;
  chatList.forEach(chatData => {
    if (!renderedChatIds.has(chatData.id)) {
      renderedChatIds.add(chatData.id);
      renderChatMessage(chatData, false);
    }
  });
}

function sendChat() {
  if (!elements.chatInput) return;
  const msg = elements.chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat:send', { message: msg });
  elements.chatInput.value = '';
}

socket.on('chat:message', (chatData) => {
  if (renderedChatIds.has(chatData.id)) return;
  renderedChatIds.add(chatData.id);
  renderChatMessage(chatData, true);

  if (chatData.senderId !== myId) {
    playSound('click');
    // 如果聊天室未展開，在右下角圖示上方彈出維持 30 秒的對話氣泡
    if (!isChatOpen) {
      showChatBubble(chatData.senderName, chatData.message);
      unreadChatCount++;
      if (elements.chatUnreadBadge) {
        elements.chatUnreadBadge.textContent = unreadChatCount > 9 ? '9+' : unreadChatCount;
        elements.chatUnreadBadge.classList.remove('hidden');
      }
    }
  }
});

// 事件綁定
if (elements.floatingChatBtn) {
  elements.floatingChatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChat();
  });
}

if (elements.btnCloseChatPopup) {
  elements.btnCloseChatPopup.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleChat(false);
  });
}

if (elements.chatToastBubble) {
  elements.chatToastBubble.addEventListener('click', (e) => {
    if (!e.target.closest('#btnCloseChatBubble')) {
      toggleChat(true);
    }
  });
}

if (elements.btnCloseChatBubble) {
  elements.btnCloseChatBubble.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissChatBubble();
  });
}

if (elements.btnSendChat) {
  elements.btnSendChat.addEventListener('click', sendChat);
}

if (elements.chatInput) {
  elements.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChat();
    }
  });
}

// 點擊聊天室外部收起聊天視窗；點擊技能詳情外部收起 Popover
document.addEventListener('click', (e) => {
  if (isChatOpen && elements.chatPopupCard && elements.floatingChatBtn) {
    if (!elements.chatPopupCard.contains(e.target) && !elements.floatingChatBtn.contains(e.target)) {
      toggleChat(false);
    }
  }

  // 若點擊處不在任何 Popover 或觸發按鈕內，隱藏所有 Popover
  if (!e.target.closest('.skill-popover') && !e.target.closest('.skill-detail-trigger')) {
    document.querySelectorAll('.skill-popover').forEach(p => p.classList.add('hidden'));
  }
});

// ==========================================
// ==========================================
// 大廳成員卡片：修改暱稱功能
// ==========================================
function submitInlineRename(newName) {
  newName = (newName || '').trim();
  if (!newName) {
    alert('暱稱不能為空！');
    return;
  }
  if (newName.length > 12) {
    alert('暱稱長度不可超過 12 個字元！');
    return;
  }

  socket.emit('player:rename', { newName }, (res) => {
    if (res.success) {
      myName = res.newName;
      localStorage.setItem('dungeon_player_name', res.newName);
      if (elements.playerNameText) elements.playerNameText.textContent = res.newName;
      isEditingMyName = false;
      editingNameValue = '';
      playSound('click');
    } else {
      alert(res.message);
    }
  });
}

// ==========================================
// 戰鬥打擊感、視覺特效與浮動戰鬥數字
// ==========================================
// ==========================================
// 戰鬥打擊感、視覺特效與浮動戰鬥數字
// ==========================================
function spawnFloatingText(container, text, type = 'damage') {
  if (!container) return;
  const numEl = document.createElement('div');
  numEl.className = `floating-num ${type}`;
  numEl.textContent = text;
  container.appendChild(numEl);
  setTimeout(() => {
    numEl.remove();
  }, 1200);
}

// 播放 Pixel FX 特效 (自動清理，零記憶體殘留)
function playPixelFx(container, fxType) {
  if (!container) return;
  const fx = document.createElement('div');
  fx.className = `pixel-fx pixel-fx-${fxType}`;
  container.appendChild(fx);
  setTimeout(() => {
    fx.remove();
  }, 450);
}

// 首領受擊演出 (帶有 x+8, y+3 之右後方向性位移 + Pixel FX)
function triggerHitOnMonster(isCrit = false, fxType = 'slash', value = 0, targetEnemyId = null) {
  const targetSlot = targetEnemyId ? getEnemyAnchor(targetEnemyId)?.element : document.querySelector('.battle-enemy-slot.is-target');

  if (targetSlot) {
    targetSlot.classList.remove('hit-displace-boss', 'crit-frame-flash', 'shaking');
    void targetSlot.offsetWidth;
    targetSlot.classList.add('hit-displace-boss');
    if (isCrit) {
      targetSlot.classList.add('crit-frame-flash');
    }
    setTimeout(() => {
      targetSlot.classList.remove('hit-displace-boss', 'crit-frame-flash', 'shaking');
    }, 420);

    const fxContainer = targetSlot.querySelector('.pixel-fx-container') || elements.monsterPixelFx;
    if (fxContainer) {
      playPixelFx(fxContainer, fxType);
    }
  }

  if (elements.monsterCard && elements.monsterCard !== targetSlot) {
    if (isCrit) {
      elements.monsterCard.classList.add('crit-frame-flash');
      setTimeout(() => elements.monsterCard.classList.remove('crit-frame-flash'), 250);
    }
  }
}

function triggerSlashOnMonster(isCrit = false) {
  triggerHitOnMonster(isCrit, 'slash');
}

function triggerMagicOnMonster() {
  triggerHitOnMonster(false, 'magic-runes');
}

function triggerHealOnTeammate(playerId, value) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  card.classList.remove('heal-flash');
  void card.offsetWidth;
  card.classList.add('heal-flash');
  setTimeout(() => card.classList.remove('heal-flash'), 700);

  playPixelFx(card, 'heal-spark');

  const container = card.querySelector('.floating-text-container');
  spawnFloatingText(container, `+${value}`, 'heal');
}

function triggerShieldOnTeam(label = '壁壘守護 90%!') {
  const cards = document.querySelectorAll('.teammate-card');
  cards.forEach(card => {
    card.classList.remove('shield-flash');
    void card.offsetWidth;
    card.classList.add('shield-flash');
    setTimeout(() => card.classList.remove('shield-flash'), 800);

    playPixelFx(card, 'shield-flare');

    const container = card.querySelector('.floating-text-container');
    spawnFloatingText(container, label, 'shield');
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 隊友受擊演出 (帶有 x-8, y+3 之左後方向性位移)
function triggerHitOnTeammate(playerId, value, dodged = false, stealthed = false, shieldMod = 1.0, tempAbsorbed = 0, hpDmg = null) {
  const card = document.querySelector(`.teammate-card[data-player-id="${playerId}"]`);
  if (!card) return;
  const container = card.querySelector('.floating-text-container');

  if (stealthed) {
    spawnFloatingText(container, '匿蹤避開', 'dodge');
    playPixelFx(card, 'shield-flare');
    return;
  }
  if (dodged) {
    spawnFloatingText(container, '閃避 MISS!', 'dodge');
    return;
  }

  card.classList.remove('hit-displace-player', 'hit-flash', 'shaking');
  void card.offsetWidth;
  card.classList.add('hit-displace-player', 'hit-flash');
  setTimeout(() => card.classList.remove('hit-displace-player', 'hit-flash'), 420);

  if (tempAbsorbed > 0) {
    spawnFloatingText(container, `超量吸收 -${tempAbsorbed}`, 'buff');
    playPixelFx(card, 'shield-flare');
  }
  const actualHpDmg = hpDmg !== null ? hpDmg : (value - tempAbsorbed);
  if (actualHpDmg > 0) {
    spawnFloatingText(container, `-${actualHpDmg}`, 'damage');
  }
}

// 輔助函式：播放單一玩家行動的打擊特效與專屬 Pixel FX
function playSinglePlayerVisualEvent(ev) {
  if (!ev) return;
  if (ev.type === 'player_attack') {
    let fxType = 'slash';
    let sfxName = 'sword_slash';

    if (ev.dmgType === 'phys') {
      if (ev.sourceRole === 'assassin' || ev.isCrit) {
        fxType = 'x-slash';
        sfxName = 'dagger_crit';
      } else if (ev.sourceRole === 'archer') {
        fxType = 'arrow';
        sfxName = 'arrow_hit';
      } else if (ev.sourceRole === 'druid') {
        fxType = 'wolf-claw';
        sfxName = 'wolf_howl';
      } else {
        fxType = 'slash';
        sfxName = 'sword_slash';
      }
    } else {
      if (ev.sourceRole === 'alchemist') {
        fxType = 'acid-bubble';
        sfxName = 'acid_hiss';
      } else if (ev.sourceRole === 'druid') {
        fxType = 'treant-vine';
        sfxName = 'treant_creak';
      } else {
        fxType = 'magic-runes';
        sfxName = 'magic';
      }
    }

    triggerHitOnMonster(ev.isCrit, fxType, ev.value, ev.targetEnemyId);
    playSound(sfxName);

    const floatTarget = ev.targetEnemyId ? getEnemyAnchor(ev.targetEnemyId)?.element.querySelector('.floating-text-container') : document.querySelector('.battle-enemy-slot.is-target .floating-text-container');
    if (ev.isCrit) {
      spawnFloatingText(floatTarget, `CRIT -${ev.value}!`, 'crit');
    } else {
      spawnFloatingText(floatTarget, `-${ev.value}`, 'damage');
    }
  } else if (ev.type === 'shield_cast') {
    triggerShieldOnTeam('築起壁壘守護！');
    playSound('shield_cast');
  } else if (ev.type === 'stealth') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '煙霧匿蹤', 'dodge');
      playPixelFx(card, 'shield-flare');
    }
    playSound('unlock');
  } else if (ev.type === 'heal_group') {
    playSound('heal_chime');
    roomState?.players?.forEach(p => {
      if (p.hp > 0) {
        let totalHeal = ev.groupValue;
        if (p.id === ev.singleTargetId) totalHeal += ev.singleValue;
        triggerHealOnTeammate(p.id, totalHeal);
      }
    });
  } else if (ev.type === 'revive') {
    playSound('heal_chime');
    triggerHealOnTeammate(ev.targetId, ev.value);
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `甦生 +${ev.value}!`, 'heal');
      playPixelFx(card, 'heal-spark');
    }
  } else if (ev.type === 'heal') {
    triggerHealOnTeammate(ev.targetId, ev.value);
    playSound('heal_chime');
  } else if (ev.type === 'self_damage') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), `自傷 -${ev.value}`, 'damage');
    playSound('hit');
  } else if (ev.type === 'alc_shield') {
    triggerShieldOnTeam('命運護盾 70%減傷！');
    playSound('shield_cast');
  } else if (ev.type === 'transform_wolf') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '變身狼人!', 'buff');
      playPixelFx(card, 'wolf-claw');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/assets/characters/forms/druid/狼人.webp';
    }
    playSound('wolf_howl');
  } else if (ev.type === 'transform_treant') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '變身樹精!', 'heal');
      playPixelFx(card, 'treant-vine');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/assets/characters/forms/druid/遠古樹精.webp';
    }
    playSound('treant_creak');
  } else if (ev.type === 'transform_bear') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '變身巨熊!', 'buff');
      playPixelFx(card, 'wolf-claw');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/assets/characters/forms/druid/巨熊.webp';
    }
    playSound('wolf_howl');
  } else if (ev.type === 'transform_tree') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '化身古樹(免死)!', 'heal');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) avatarImg.src = '/assets/characters/forms/druid/遠古樹精.webp';
    }
    playSound('heal_chime');
  } else if (ev.type === 'transform_end') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), '解除變身', 'buff');
      const avatarImg = card.querySelector('.teammate-avatar-img');
      if (avatarImg) {
        const p = (roomState && roomState.players && roomState.players.find(x => x.id === ev.sourceId));
        const originalAvatar = (p && p.customAvatar) || (p && p.avatar) || (classesData['druid']?.avatar) || '/assets/characters/portraits/Druid.webp';
        avatarImg.src = originalAvatar;
        avatarImg.alt = (p && p.name) || '德魯伊';
        avatarImg.classList.remove('druid-transformed-avatar');
      }
    }
    playSound('buff');
  } else if (ev.type === 'surrender') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.targetId}"]`);
    if (card) spawnFloatingText(card.querySelector('.floating-text-container'), '狼王威壓·臣服!', 'dodge');
  } else if (ev.type === 'summon_minion') {
    const card = document.querySelector(`.teammate-card[data-player-id="${ev.sourceId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `召喚${ev.minionName}!`, 'buff');
      playPixelFx(card, 'heal-spark');
    }
    playSound('select');
  } else if (ev.type === 'minion_hit') {
    const card = document.querySelector(`.teammate-card-minion[data-minion-owner-id="${ev.ownerId}"]`) || document.querySelector(`.teammate-card[data-player-id="${ev.ownerId}"]`);
    if (card) {
      spawnFloatingText(card.querySelector('.floating-text-container'), `夥伴抵擋 -${ev.value}`, 'shield');
      playPixelFx(card, 'shield-flare');
    }
    playSound('shield_block');
  }
}

// 輔助函式：播放怪物攻擊視覺事件 (支援 40ms AoE 漣漪序列)
async function playMonsterVisualEvent(monsterAction) {
  if (!monsterAction) return;
  if (elements.monsterCard) {
    elements.monsterCard.classList.add('shaking');
    setTimeout(() => elements.monsterCard.classList.remove('shaking'), 450);
  }

  if (monsterAction.isUlt) {
    playSound('boss_roar');
  } else {
    playSound('hit');
  }

  // 如果有護盾阻擋，先閃出金色盾牌
  if (monsterAction.shieldMod < 1.0) {
    const shieldText = monsterAction.shieldMod === 0.1 ? '90% 傷害格擋！' : '40% 傷害格擋！';
    triggerShieldOnTeam(shieldText);
    playSound('shield_block');
  }

  const hits = monsterAction.hits || [];
  for (let idx = 0; idx < hits.length; idx++) {
    const hit = hits[idx];
    triggerHitOnTeammate(
      hit.targetId,
      hit.value,
      hit.dodged,
      hit.stealthed,
      monsterAction.shieldMod,
      hit.tempAbsorbed || 0,
      hit.hpDmg
    );
    if (idx < hits.length - 1) {
      await sleep(40); // 隊友間 40ms 漣漪受擊間隔
    }
  }
}

// ==========================================
// 沉浸式 Action Banner (3 欄式 CSS Grid: 來源頭像 - 行動意圖 - 目標頭像)
// ==========================================
function showCombatActionBanner({
  theme = 'player',
  badge = '',
  title = '',
  tags = [],
  hiddenNote = null,
  actorAvatarHtml = '',
  actorName = '',
  targetAvatarHtml = '',
  targetName = ''
}) {
  if (!elements.combatActionBanner) return;

  const banner = elements.combatActionBanner;
  banner.className = `combat-action-banner ${theme === 'boss' ? 'boss-theme' : 'player-theme'}`;

  // 1. 來源欄位
  if (elements.combatBannerActorAvatar) {
    elements.combatBannerActorAvatar.innerHTML = actorAvatarHtml || '';
  }
  if (elements.combatBannerActorName) {
    elements.combatBannerActorName.textContent = actorName || '';
  }

  // 2. 中央意圖欄位
  if (elements.combatBannerBadge) {
    elements.combatBannerBadge.textContent = badge;
  }
  if (elements.combatBannerTitle) {
    elements.combatBannerTitle.textContent = title;
  }
  if (elements.combatBannerTags) {
    if (tags && tags.length > 0) {
      elements.combatBannerTags.innerHTML = tags.map(t => {
        const tagLabel = typeof t === 'object' ? (t.label || '') : String(t);
        const tagType = typeof t === 'object' ? (t.type || '') : '';
        const cls = tagType ? `skill-tag ${tagType}` : 'skill-tag';
        return `<span class="${cls}">[${escapeHtml(tagLabel)}]</span>`;
      }).join(' ');
      elements.combatBannerTags.classList.remove('hidden');
    } else {
      elements.combatBannerTags.innerHTML = '';
      elements.combatBannerTags.classList.add('hidden');
    }
  }
  if (elements.combatBannerHiddenNote) {
    if (hiddenNote) {
      elements.combatBannerHiddenNote.textContent = `${hiddenNote}`;
      elements.combatBannerHiddenNote.classList.remove('hidden');
    } else {
      elements.combatBannerHiddenNote.textContent = '';
      elements.combatBannerHiddenNote.classList.add('hidden');
    }
  }

  // 3. 目標欄位
  if (elements.combatBannerTargetAvatar) {
    elements.combatBannerTargetAvatar.innerHTML = targetAvatarHtml || '';
  }
  if (elements.combatBannerTargetName) {
    elements.combatBannerTargetName.textContent = targetName || '';
  }

  banner.classList.remove('hidden');
  void banner.offsetWidth; // 重新觸發進場 CSS 動畫
}

function hideCombatActionBanner() {
  if (!elements.combatActionBanner) return;
  elements.combatActionBanner.classList.add('hidden');
}

// 根據戰鬥邏輯產生的快照精準更新顯示生命，確保演出與數值步調完全一致
function applyHpSnapshot(snapshot) {
  if (!snapshot) return;
  if (expandedDisplay) expandedDisplay.snapshot = mergePresentationSnapshot(expandedDisplay.snapshot, snapshot);
  updateBattleHudFromSnapshot(snapshot);
  if (typeof BattleHud !== 'undefined') BattleHud.updatePlayer(getMyPlayer());
  if(Object.hasOwn(snapshot,'arena')){
    if(roomState){roomState.arena=snapshot.arena?.enemyForced?null:snapshot.arena;roomState.enemyArena=snapshot.arena?.enemyForced?snapshot.arena:null;}
    syncEnemyArenaVisual(snapshot.arena);
  }
}

// 單一步驟演出 (P2-R1.1 Section 8-11: 14 步嚴格演出順序)
async function playPresentationStep(step, round) {
  if (!step) return;
  if(step.type==='status_action')return playBattlefieldTick(step,activeCombatContext);
  if(step.actionId==='a_trap')return playBattlefieldTick(step,activeCombatContext);
  if(step.type==='enemy_mechanic')return playEnemyMechanicPresentation(step,activeCombatContext);
  if(step.category==='STATUS_TICK'&&!isPhase6TimedStep(step))return playBattlefieldTick(step,activeCombatContext);
  if(step.type==='boss_action'&&!step.hpSnapshotBefore?.arena)return playEnemyMechanicPresentation(step,activeCombatContext);

  // 1. 更新戰況交鋒字幕
  if (step.narrative && elements.battleNarrativeText) {
    elements.battleNarrativeText.innerHTML = formatMarkdown(step.narrative);
    elements.battleNarrativeText.classList.remove('narrative-fade');
    void elements.battleNarrativeText.offsetWidth;
    elements.battleNarrativeText.classList.add('narrative-fade');
  }

  if (isBattlefieldPlayerStep(step)) {
    await playBattlefieldPlayerPresentation(step, activeCombatContext);
    return;
  }
  if (step.category) {
    await playExpandedCombatPresentation(adaptLegacyPresentationStep(step), activeCombatContext);
    return;
  }
  if (step.type === 'player_action' || step.type === 'boss_action') {
    if (typeof playCombatActionPresentation === 'function') {
      await playCombatActionPresentation(adaptLegacyPresentationStep(step), activeCombatContext);
    } else {
      if (step.visualEvents && step.visualEvents.length > 0) {
        step.visualEvents.forEach(ev => playSinglePlayerVisualEvent(ev));
      }
      if (step.hpSnapshot) {
        updateBattleHudFromSnapshot(step.hpSnapshot);
      }
      await sleep(1000);
    }

  } else if (step.type === 'status_cleanup') {
    if(step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);
    await waitForPresentation(150,activeCombatContext.signal);
  } else if (step.type === 'overheal_cleanup') {
    hideCombatActionBanner();
    if (step.hpSnapshot) {
      updateBattleHudFromSnapshot(step.hpSnapshot);
    }
    await sleep(400);

  } else if (step.type === 'kill') {
    const allDead = (
      step.hpSnapshot?.enemies?.length > 0
        ? step.hpSnapshot.enemies.every(e => e.hp <= 0)
        : (step.hpSnapshot?.monster ? step.hpSnapshot.monster.hp <= 0 : true)
    );
    if (allDead && typeof bgmManager !== 'undefined') {
      void bgmManager.bossDefeated();
    }
    if (step.hpSnapshot) applyHpSnapshot(step.hpSnapshot);
    await waitForPresentation(300, activeCombatContext.signal);
  }
}

let isProcessingPresentationQueue = false;
let combatQueueController = null;
let activeCombatContext = {};
let lastCombatPresentationId = null;
function isRoundStartPresentationState(state, round) {
  return Boolean(state?.currentMonster && state.battleRound === round &&
    state.state === 'IN_BATTLE');
}
function waitForBattleRoundState(round, signal) {
  const matches = state => isRoundStartPresentationState(state, round);
  const current = pendingAuthoritativeState || roomState;
  if (matches(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const cleanup = () => { socket.off('room:update', update); signal?.removeEventListener('abort', abort); };
    const update = state => { if (matches(state)) { cleanup(); resolve(state); } };
    const abort = () => { cleanup(); reject(new DOMException('Presentation cancelled', 'AbortError')); };
    socket.on('room:update', update);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
async function runPresentationQueue(queue, round, monsterKilled, presentationId) {
  const queueKey = roomState?.code + ':' + presentationId;
  if (!queue?.length || queueKey === lastCombatPresentationId) return;
  combatQueueController?.abort();
  const controller = new AbortController();
  controller.battleKey = battleSceneKey();
  combatQueueController = controller;
  lastCombatPresentationId = queueKey;
  const roundStartPresentation=lastAnnouncedBattleRound!==round || queue.some(step=>
    step.type==='status_action'&&step.category==='STATUS_TICK'&&step.skillName===`ROUND ${round}`);
  activeCombatContext = {
    controller,
    signal: controller.signal,
    monsterKilled,
    onTiming: beat => {
      if (beat === 'boss_death_start') {
        const allDead = Boolean(monsterKilled) || (
          Array.isArray(roomState?.enemies) && roomState.enemies.length > 0
            ? roomState.enemies.every(e => e.hp <= 0)
            : Boolean(roomState?.currentMonster && roomState.currentMonster.hp <= 0)
        );
        if (allDead && typeof bgmManager !== 'undefined') {
          void bgmManager.bossDefeated();
        }
      }
    }
  };
  isProcessingPresentationQueue = true;
  isPlayingBattleNarrative = true;
  presentationManager.setBlocking(true);
  let completed = false;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if(controller.signal.aborted&&typeof clearSageSamplingIndicators==='function')clearSageSamplingIndicators();
    if (combatQueueController === controller) {
      if (controller.signal.aborted && queue.at(-1)?.hpSnapshot) applyHpSnapshot(queue.at(-1).hpSnapshot);
      combatQueueController = null;
      isProcessingPresentationQueue = false;
      isPlayingBattleNarrative = false;
      presentationManager.setBlocking(false);
      const stage = document.getElementById('presentationCombatStage');
      if(stage)stage.style.visibility = '';
      if(controller.signal.aborted&&typeof clearGladiatorPresentationState==='function')clearGladiatorPresentationState();
      if(typeof hasGladiatorArenaStage!=='function'||!hasGladiatorArenaStage()){
        stage?.replaceChildren();stage?.classList.remove('is-active','is-exiting');
      }
      document.getElementById('app').inert = false;
      BattleHud.reset(roomState?.selectionState==='SELECTING'?'SELECTING':'ROUND_TICK');
      // The authoritative SELECTING update/reveal owns reopening controls.
      if (roomState?.selectionState !== 'SELECTING') elements.views.battle.classList.add('battle-phase-pending');
    }
  };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  try {
    // Round-start queues (including Augur observation) can precede room:update.
    // Enter the battle and finish its round banner before playing these effects.
    if (queue[0]?.category === 'STATUS_TICK' || queue[0]?.type === 'arena_enter' || queue[0]?.actionId === 'aug_observe') {
      const state = await waitForBattleRoundState(round, controller.signal);
      const snapshot = queue[0].hpSnapshotBefore;
      roomState = { ...state,
        players: mergePresentationSnapshot(state, snapshot).players,
        enemies: mergePresentationSnapshot(state, snapshot).enemies,
        currentMonster: { ...state.currentMonster, ...snapshot?.monster } };
      renderApp();
    }
    await ensureBattlePhase(round);
    if (controller.signal.aborted) throw new DOMException('Presentation cancelled', 'AbortError');
    appliedBattleResults.clear();
    if (queue[0]?.hpSnapshotBefore) applyHpSnapshot(queue[0].hpSnapshotBefore);
    const steps = groupEnemyPresentationSteps(queue).map(filterLivingPresentationResults);
    BattleHud.begin(steps);
    let legacyStageEntered = false;
    for (const step of steps) {
      if (controller.signal.aborted) throw new DOMException('Presentation cancelled', 'AbortError');
      if (step.skipInvalidAttack) {if(step.hpSnapshot)applyHpSnapshot(step.hpSnapshot);BattleHud.finish(step,activeCombatContext);continue;}
      const official = isBattlefieldPlayerStep(step) || step.category==='STATUS_TICK' || ['boss_action','enemy_mechanic','kill','status_cleanup','overheal_cleanup'].includes(step.type);
      // Choosing a skill can scroll the actual actors out of view. Bring the
      // official stage back once, before its choreography begins.
      if (!official && !legacyStageEntered) { await enterCombatStage(activeCombatContext); legacyStageEntered = true; }
      const legacyStage = document.getElementById('presentationCombatStage');
      if (legacyStage) legacyStage.style.visibility = official ? 'hidden' : '';
      document.getElementById('app').inert = true;
      const previousHudPhase=BattleHud.phase;
      BattleHud.start(step);
      BattleHud.setPhase(BattleHud.phaseFor(step,roundStartPresentation));
      await BattleHud.announce(step,activeCombatContext);
      await playPresentationStep(step, round);
      BattleHud.finish(step,activeCombatContext);
      if(['sa_counter','w_counter'].includes(step.actionId)&&previousHudPhase==='ENEMY_ACTIONS')BattleHud.setPhase(previousHudPhase);
    }
    if (legacyStageEntered) await exitCombatStage(activeCombatContext);
    const legacyStage = document.getElementById('presentationCombatStage');
    if (legacyStage) legacyStage.style.visibility = '';
    completed = true;
  } catch (error) {
    if (error.name !== 'AbortError') console.error('[PresentationQueue]', error);
  } finally {
    controller.signal.removeEventListener('abort', cleanup);
    cleanup();
  }
  if (combatQueueController && combatQueueController !== controller) return;
  if (!completed && !controller.signal.aborted && queue.at(-1)?.hpSnapshot) applyHpSnapshot(queue.at(-1).hpSnapshot);
  if (!controller.signal.aborted) {
    if (pendingAuthoritativeState) { roomState = pendingAuthoritativeState; pendingAuthoritativeState = null; }
    renderApp();
    socket.emit('battle:presentation_complete', { round, presentationId });
  }
}
socket.on('battle:presentation_queue', async ({ queue, round, monsterKilled, presentationId }) => {
  await runPresentationQueue(queue, round, monsterKilled, presentationId);
});

// 監聽後端結算的戰鬥視覺事件（相容性 Fallback；若 presentation_queue 正在執行則自動略過）
socket.on('battle:visual_events', ({ events, narratives, round, monsterKilled, duration }) => {
  if (isProcessingPresentationQueue) return;
  if (!events || events.length === 0) return;

  const playerActions = events.filter(e =>
    ['player_attack', 'shield_cast', 'stealth', 'heal_group', 'revive', 'heal', 'self_damage', 'alc_shield', 'transform_wolf', 'transform_treant', 'transform_tree', 'transform_bear', 'transform_end', 'surrender', 'summon_minion', 'minion_hit'].includes(e.type)
  );
  const monsterAction = events.find(e => e.type === 'monster_attack');

  if (narratives && narratives.length > 0) {
    isPlayingBattleNarrative = true;
    const me = getMyPlayer();
    if (me) renderMyActionBar(me);

    if (elements.battleNarrativeBox) {
      elements.battleNarrativeBox.style.display = 'block';
    }

    const totalMs = Math.max(4000, (duration || 5) * 1000);
    const stepMs = Math.floor((totalMs - 800) / narratives.length);

    let playerActionIdx = 0;
    narratives.forEach((nar, idx) => {
      setTimeout(() => {
        if (elements.battleNarrativeText) {
          elements.battleNarrativeText.innerHTML = formatMarkdown(nar.text);
          elements.battleNarrativeText.classList.remove('narrative-fade');
          void elements.battleNarrativeText.offsetWidth;
          elements.battleNarrativeText.classList.add('narrative-fade');
        }

        if (nar.type === 'player') {
          const ev = playerActions[playerActionIdx++];
          if (ev) playSinglePlayerVisualEvent(ev);
        } else if (nar.type === 'monster') {
          if (monsterAction) playMonsterVisualEvent(monsterAction);
        } else if (nar.type === 'kill') {
          playSound('victory');
          const killTarget1 = document.querySelector('.battle-enemy-slot.is-target .floating-text-container')
            || document.querySelector('.battle-enemy-slot .floating-text-container')
            || elements.monsterFloatingContainer;
          spawnFloatingText(killTarget1, '擊殺！VICTORY', 'crit');
          const activeSprite1 = document.querySelector('.battle-enemy-slot.is-target .enemy-sprite-wrap')
            || document.querySelector('.battle-enemy-slot .enemy-sprite-wrap')
            || elements.monsterAvatar;
          if (activeSprite1) {
            activeSprite1.classList.add('shaking');
            setTimeout(() => activeSprite1.classList.remove('shaking'), 500);
          }
        }
      }, idx * stepMs);
    });

    setTimeout(() => {
      isPlayingBattleNarrative = false;
      const meNow = getMyPlayer();
      if (meNow) renderMyActionBar(meNow);
    }, totalMs);

  } else {
    playerActions.forEach((ev, idx) => {
      setTimeout(() => {
        playSinglePlayerVisualEvent(ev);
      }, idx * 280);
    });

    const monsterDelay = Math.max(500, playerActions.length * 280 + 350);
    setTimeout(() => {
      if (monsterKilled) {
        playSound('victory');
        const killTarget2 = document.querySelector('.battle-enemy-slot.is-target .floating-text-container')
          || document.querySelector('.battle-enemy-slot .floating-text-container')
          || elements.monsterFloatingContainer;
        spawnFloatingText(killTarget2, '擊殺！VICTORY', 'crit');
        const activeSprite2 = document.querySelector('.battle-enemy-slot.is-target .enemy-sprite-wrap')
          || document.querySelector('.battle-enemy-slot .enemy-sprite-wrap')
          || elements.monsterAvatar;
        if (activeSprite2) {
          activeSprite2.classList.add('shaking');
          setTimeout(() => activeSprite2.classList.remove('shaking'), 500);
        }
        return;
      }

      if (monsterAction) {
        playMonsterVisualEvent(monsterAction);
      }
    }, monsterDelay);
  }
});

// ==========================================
// 暫停遊戲與結束戰鬥按鈕事件
// ==========================================
if (elements.btnPauseGame) {
  elements.btnPauseGame.addEventListener('click', () => {
    playSound('click');
    socket.emit('game:toggle_pause', (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

if (elements.btnResumeGameBanner) {
  elements.btnResumeGameBanner.addEventListener('click', () => {
    playSound('click');
    socket.emit('game:toggle_pause', (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

if (elements.btnEndBattle) {
  elements.btnEndBattle.addEventListener('click', () => {
    playSound('click');
    ModalMotion.show(elements.endBattleModal);
  });
}

if (elements.btnCancelEndBattle) {
  elements.btnCancelEndBattle.addEventListener('click', () => {
    ModalMotion.hide(elements.endBattleModal);
  });
}

if (elements.btnConfirmRetreat) {
  elements.btnConfirmRetreat.addEventListener('click', () => {
    ModalMotion.hide(elements.endBattleModal);
    playSound('click');
    socket.emit('game:end_battle', {}, (res) => {
      if (!res.success) alert(res.message);
    });
  });
}

// ==========================================
// 頭貼自訂功能 (表情符號 & 照片上傳)
// ==========================================
let pendingAvatar = null;

function getMyPlayer() {
  if (!roomState || !roomState.players) return null;
  return roomState.players.find(p => p.id === myId) || null;
}

function updateEntryAvatarPreview() {
  let savedAvatar = localStorage.getItem('dungeon_custom_avatar');
  // Older choices stored local paths, including two nonexistent English filenames.
  const canonicalPath = savedAvatar === '/photo/Sage.webp' ? '/assets/characters/portraits/智者.webp' : savedAvatar === '/photo/Samurai.webp' ? '/assets/characters/portraits/武士.webp' : (window.LocalPaths?.canonical(savedAvatar) || savedAvatar);
  const hero = HERO_CLASS_PORTRAITS.find(h => h.photo === canonicalPath);
  if (hero) {
    savedAvatar = window.assetRegistry?.resolve('role.'+hero.key+'.avatar',hero.photo)||hero.photo;
    localStorage.setItem('dungeon_custom_avatar',savedAvatar);
  }
  const previewEls = [elements.entryAvatarPreview, document.getElementById('profileAvatarPreview')].filter(Boolean);
  if (previewEls.length === 0) return;
  previewEls.forEach(el => {
    if (savedAvatar) {
      if (savedAvatar.startsWith('data:image/') || savedAvatar.startsWith('http') || savedAvatar.startsWith('/')) {
        el.innerHTML = `<img src="${savedAvatar}" alt="avatar">`;
      } else {
        el.innerHTML = `<span class="avatar-emoji-badge" style="width:100%; height:100%; font-size:26px;">${escapeHtml(savedAvatar)}</span>`;
      }
    } else {
      el.innerHTML = getIconSvg('user');
    }
  });
}

function updateModalPreview(avatar) {
  const me = getMyPlayer();
  const roleInfo = (me && me.role) ? classesData[me.role] : null;

  if (!elements.modalAvatarPreview || !elements.modalAvatarTypeLabel) return;

  if (avatar) {
    if (avatar.startsWith('data:image/') || avatar.startsWith('http') || avatar.startsWith('/')) {
      elements.modalAvatarPreview.innerHTML = `<img src="${avatar}" alt="preview">`;
      elements.modalAvatarTypeLabel.textContent = '已選擇：自訂照片';
    } else {
      elements.modalAvatarPreview.innerHTML = `<span class="avatar-emoji-badge" style="width:100%; height:100%; font-size:32px;">${escapeHtml(avatar)}</span>`;
      elements.modalAvatarTypeLabel.textContent = `已選擇：自訂圖示【${avatar}】`;
    }
  } else {
    // 官方職業頭貼 (依玩家所選職業決定)
    if (roleInfo && roleInfo.avatar) {
      elements.modalAvatarPreview.innerHTML = `<img src="${roleInfo.avatar}" alt="${roleInfo.name}">`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else if (roleInfo) {
      elements.modalAvatarPreview.innerHTML = `<div class="avatar-icon-badge" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">${getIconSvg(getRoleIconName(me.role), 'svg-large')}</div>`;
      elements.modalAvatarTypeLabel.textContent = `職業專屬頭貼【${roleInfo.name}】`;
    } else {
      elements.modalAvatarPreview.innerHTML = getIconSvg('user');
      elements.modalAvatarTypeLabel.textContent = '職業專屬頭貼（在大廳選職後自動換上立繪）';
    }
  }
}

function updateHeroRoleOptionUI() {
  const me = getMyPlayer();
  const roleInfo = (me && me.role) ? classesData[me.role] : null;

  if (!elements.heroRoleOptionCard) return;

  if (roleInfo) {
    if (roleInfo.avatar) {
      elements.heroRoleOptionPreview.innerHTML = `<img src="${roleInfo.avatar}" alt="${roleInfo.name}">`;
    } else {
      elements.heroRoleOptionPreview.innerHTML = getIconSvg(getRoleIconName(me.role));
    }
    elements.heroRoleOptionTitle.textContent = `職業官方立繪：${roleInfo.name}`;
    elements.heroRoleOptionDesc.textContent = `使用【${roleInfo.name}】官方頭貼。若更換職業將自動同步切換！`;
  } else {
    elements.heroRoleOptionPreview.innerHTML = getIconSvg('user');
    elements.heroRoleOptionTitle.textContent = '職業官方專屬頭貼';
    elements.heroRoleOptionDesc.textContent = '自動隨你選擇的職業切換專屬立繪頭像（請至大廳挑選職業）';
  }

  if (pendingAvatar === null) {
    elements.heroRoleOptionCard.classList.add('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '目前選用中';
  } else {
    elements.heroRoleOptionCard.classList.remove('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
  }
}

const HERO_CLASS_PORTRAITS = [
  { key: 'warrior', name: '戰士', photo: '/assets/characters/portraits/Warrior.webp' },
  { key: 'mage', name: '法師', photo: '/assets/characters/portraits/Mage.webp' },
  { key: 'archer', name: '弓手', photo: '/assets/characters/portraits/Archer.webp' },
  { key: 'assassin', name: '刺客', photo: '/assets/characters/portraits/Assassin.webp' },
  { key: 'bard', name: '吟遊詩人', photo: '/assets/characters/portraits/Bard.webp' },
  { key: 'alchemist', name: '鍊金術士', photo: '/assets/characters/portraits/Alchemist.webp' },
  { key: 'druid', name: '德魯伊', photo: '/assets/characters/portraits/Druid.webp' },
  { key: 'paladin', name: '聖騎士', photo: '/assets/characters/portraits/Paladin.webp' },
  { key: 'gladiator', name: '角鬥士', photo: '/assets/characters/portraits/Gladiator.webp' },
  { key: 'stargazer', name: '觀星者', photo: '/assets/characters/portraits/Stargazer.webp' },
  { key: 'dreamweaver', name: '織夢術士', photo: '/assets/characters/portraits/Dreamweaver.webp' },
  { key: 'samurai', name: '武士', photo: '/assets/characters/portraits/武士.webp' },
  { key: 'sage', name: '智者', photo: '/assets/characters/portraits/智者.webp' },
  { key: 'onmyoji', name: '陰陽師', photo: '/assets/characters/portraits/Onmyōji.webp' }
];

function openAvatarChoiceModal() {
  if (roomState && roomState.state === 'LOBBY') {
    return;
  }
  playSound('click');
  const modal = document.getElementById('avatarChoiceModal');
  if (modal) {
    ModalMotion.show(modal);
    modal.style.display = 'flex';
  }
  initHeroAvatarGrid();
}
window.openAvatarChoiceModal = openAvatarChoiceModal;

function closeAvatarChoiceModal() {
  const modal = document.getElementById('avatarChoiceModal');
  if (modal) {
    ModalMotion.hide(modal);
    modal.style.display = 'none';
  }
}
window.closeAvatarChoiceModal = closeAvatarChoiceModal;

function triggerProfilePhotoUpload() {
  playSound('click');
  const fileInput = document.getElementById('profileDirectFileInput');
  if (fileInput) fileInput.click();
}
window.triggerProfilePhotoUpload = triggerProfilePhotoUpload;

function handleProfileDirectFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('請上傳圖片檔案 (JPG、PNG、WebP、GIF 等)！');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);
      const dataUrl = canvas.toDataURL('image/webp', 0.85);

      saveCustomAvatar(dataUrl);
      updateEntryAvatarPreview();
      closeAvatarChoiceModal();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.handleProfileDirectFile = handleProfileDirectFile;

function toggleHeroAvatarList() {
  playSound('click');
  const gridContainer = document.getElementById('heroAvatarGridContainer');
  const chevron = document.getElementById('heroChoiceChevron');
  if (!gridContainer) return;
  const isHidden = gridContainer.classList.contains('hidden');
  if (isHidden) {
    gridContainer.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    initHeroAvatarGrid();
  } else {
    gridContainer.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}
window.toggleHeroAvatarList = toggleHeroAvatarList;

function initHeroAvatarGrid() {
  const grid = document.getElementById('heroAvatarOptionsGrid');
  if (!grid) return;
  grid.innerHTML = HERO_CLASS_PORTRAITS.map(h => `
    <button type="button" class="hero-avatar-choice-item" data-role="${h.key}" title="選用【${h.name}】官方頭貼">
      <img src="${escapeHtml(window.assetRegistry?.resolve('role.'+h.key+'.avatar',h.photo)||h.photo)}" alt="${h.name}">
      <span>${h.name}</span>
    </button>
  `).join('');
  grid.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => {
    const hero = HERO_CLASS_PORTRAITS.find(h => h.key === button.dataset.role);
    selectClassAvatar(window.assetRegistry?.resolve('role.'+hero.key+'.avatar',hero.photo)||hero.photo,hero.name);
  }));
}

function selectClassAvatar(photoUrl, roleName) {
  playSound('click');
  if (photoUrl) {
    saveCustomAvatar(photoUrl);
  } else {
    saveCustomAvatar(null);
  }
  updateEntryAvatarPreview();
  closeAvatarChoiceModal();
}
window.selectClassAvatar = selectClassAvatar;

function openAvatarModal() {
  openAvatarChoiceModal();
}

function closeAvatarModal() {
  closeAvatarChoiceModal();
  if (elements.avatarModalOverlay) {
    ModalMotion.hide(elements.avatarModalOverlay);
  }
}
window.openAvatarModal = openAvatarModal;
window.closeAvatarModal = closeAvatarModal;

function switchAvatarTab(tab) {
  const tabs = {
    hero: { btn: elements.tabHeroBtn, content: elements.tabHeroContent },
    emoji: { btn: elements.tabEmojiBtn, content: elements.tabEmojiContent },
    upload: { btn: elements.tabUploadBtn, content: elements.tabUploadContent }
  };

  Object.keys(tabs).forEach(key => {
    const item = tabs[key];
    if (key === tab) {
      if (item.btn) item.btn.classList.add('active');
      if (item.content) item.content.classList.add('active');
    } else {
      if (item.btn) item.btn.classList.remove('active');
      if (item.content) item.content.classList.remove('active');
    }
  });
}

function selectModalEmoji(emoji, btnElement) {
  pendingAvatar = emoji;
  if (elements.heroRoleOptionCard) {
    elements.heroRoleOptionCard.classList.remove('selected');
    if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
  }
  document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
  if (btnElement) btnElement.classList.add('selected');
  updateModalPreview(pendingAvatar);
  playSound('click');
}

function handleAvatarFileUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('請上傳圖片檔案 (JPG、PNG、WebP、GIF 等)！');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 裁切縮放為 128x128 圓形/方形頭像
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);

      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      pendingAvatar = dataUrl;
      if (elements.heroRoleOptionCard) {
        elements.heroRoleOptionCard.classList.remove('selected');
        if (elements.heroRoleOptionBadge) elements.heroRoleOptionBadge.textContent = '點擊選用';
      }
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateModalPreview(pendingAvatar);
      playSound('click');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveCustomAvatar(avatar) {
  if (avatar) {
    localStorage.setItem('dungeon_custom_avatar', avatar);
  } else {
    localStorage.removeItem('dungeon_custom_avatar');
  }

  // 同步更新發起組隊頁面之頭貼預覽
  updateEntryAvatarPreview();

  if (roomState) {
    socket.emit('player:update_avatar', { avatar }, (res) => {
      if (res && !res.success) {
        alert(res.message || '更新頭貼失敗');
      }
    });
  }

  closeAvatarModal();
  playSound('click');
}

function initAvatarModal() {
  const adventureEmojis = [];
  const creatureEmojis = [];
  const weaponEmojis = [];

  function populateEmojiGrid(container, emojis) {
    if (!container) return;
    container.innerHTML = '';
    emojis.forEach(emo => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-option-btn';
      btn.textContent = emo;
      btn.addEventListener('click', () => {
        selectModalEmoji(emo, btn);
      });
      container.appendChild(btn);
    });
  }

  populateEmojiGrid(elements.emojiGridAdventure, adventureEmojis);
  populateEmojiGrid(elements.emojiGridCreatures, creatureEmojis);
  populateEmojiGrid(elements.emojiGridWeapons, weaponEmojis);

  // Tab 切換
  if (elements.tabHeroBtn) elements.tabHeroBtn.addEventListener('click', () => switchAvatarTab('hero'));
  if (elements.tabEmojiBtn) elements.tabEmojiBtn.addEventListener('click', () => switchAvatarTab('emoji'));
  if (elements.tabUploadBtn) elements.tabUploadBtn.addEventListener('click', () => switchAvatarTab('upload'));

  // 點擊「職業原本頭貼」卡片選用
  if (elements.heroRoleOptionCard) {
    elements.heroRoleOptionCard.addEventListener('click', () => {
      pendingAvatar = null;
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateHeroRoleOptionUI();
      updateModalPreview(null);
      playSound('click');
    });
  }

  // 開啟 Modal (登入頁面與個人檔案之頭貼按鈕)
  if (elements.btnEntryAvatar) elements.btnEntryAvatar.addEventListener('click', openAvatarModal);
  const btnProfileAvatar = document.getElementById('btnProfileAvatar');
  if (btnProfileAvatar) btnProfileAvatar.addEventListener('click', openAvatarModal);

  // 關閉 Modal
  if (elements.btnCloseAvatarModal) elements.btnCloseAvatarModal.addEventListener('click', closeAvatarModal);
  if (elements.btnCancelAvatar) elements.btnCancelAvatar.addEventListener('click', closeAvatarModal);
  if (elements.avatarModalOverlay) {
    elements.avatarModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.avatarModalOverlay) closeAvatarModal();
    });
  }

  // 自訂 Emoji 套用
  if (elements.btnApplyCustomEmoji && elements.customEmojiInput) {
    elements.btnApplyCustomEmoji.addEventListener('click', () => {
      const val = elements.customEmojiInput.value.trim();
      if (val) {
        selectModalEmoji(val);
      }
    });
    elements.customEmojiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = elements.customEmojiInput.value.trim();
        if (val) selectModalEmoji(val);
      }
    });
  }

  // 檔案上傳
  if (elements.btnBrowseFile && elements.avatarFileInput) {
    elements.btnBrowseFile.addEventListener('click', () => elements.avatarFileInput.click());
  }
  if (elements.avatarDropzone && elements.avatarFileInput) {
    elements.avatarDropzone.addEventListener('click', (e) => {
      if (e.target !== elements.btnBrowseFile) {
        elements.avatarFileInput.click();
      }
    });
    elements.avatarDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.avatarDropzone.classList.add('dragover');
    });
    elements.avatarDropzone.addEventListener('dragleave', () => {
      elements.avatarDropzone.classList.remove('dragover');
    });
    elements.avatarDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.avatarDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleAvatarFileUpload(e.dataTransfer.files[0]);
      }
    });
  }

  if (elements.avatarFileInput) {
    elements.avatarFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAvatarFileUpload(e.target.files[0]);
      }
    });
  }

  // 重設為職業預設
  if (elements.btnResetAvatarDefault) {
    elements.btnResetAvatarDefault.addEventListener('click', () => {
      pendingAvatar = null;
      updateHeroRoleOptionUI();
      document.querySelectorAll('.emoji-option-btn').forEach(b => b.classList.remove('selected'));
      updateModalPreview(null);
      playSound('click');
    });
  }

  // 確認套用
  if (elements.btnSaveAvatar) {
    elements.btnSaveAvatar.addEventListener('click', () => {
      saveCustomAvatar(pendingAvatar);
    });
  }
}

// 啟動初始化頭貼視窗與發起組隊頁面之頭貼預覽及音效圖示
initAvatarModal();
updateEntryAvatarPreview();
updateSoundIcon();

document.getElementById('logDrawerHandle')?.addEventListener('click',()=>{
    const card=elements.battleLogCard;
    if (!card) return;
    const open=card.classList.toggle('is-open');
    const handle=document.getElementById('logDrawerHandle');
    if (handle) {
      handle.setAttribute('aria-expanded',String(open));
      handle.innerHTML = open ? '收合紀錄 <svg class="ico sm"><use href="#icon-arrow-up"></use></svg>' : '完整紀錄 <svg class="ico sm"><use href="#icon-arrow-down"></use></svg>';
    }
  });
['equipDropModal', 'targetModal', 'endBattleModal', 'avatarModalOverlay', 'minionDetailModal', 'roleDetailModal', 'transferLeaderModal', 'inventoryModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
});

installNarrativeControls();

// ==========================================
// Phase 3: 雙層背包、裝備穿戴與合成鍛造
// ==========================================
const CRAFTING_RECIPE_TEMPLATES = [
  { item1: 'short_sword', item2: 'magic_crystal', result: 'rune_greatsword', name: '符文長劍', desc: '物攻 +8、魔攻 +8' },
  { item1: 'short_sword', item2: 'bronze_ring', result: 'assault_blade', name: '破陣鋒刃', desc: '物攻 +11、最大 HP +5' },
  { item1: 'leather_armor', item2: 'buckler', result: 'steel_plate_armor', name: '精鋼鎧', desc: '最大 HP +30、防禦 +5' },
  { item1: 'ruby', item2: 'regen_herb_ring', result: 'ring_of_life', name: '生命指環', desc: '最大 HP +18；每回合初恢復 5 HP' },
  { item1: 'buckler', item2: 'ruby', result: 'guardian_pendant', name: '守護者吊墜', desc: '最大 HP +20、防禦 +1；每場戰鬥開始獲得 12 護盾' },
  { item1: 'star_staff', item2: 'starlight_earring', result: 'hymn_scepter', name: '聖歌權杖', desc: '魔攻 +9；自身受到治療量 +8%' },
  { item1: 'hunter_bow', item2: 'hawkeye_feather', result: 'hunting_bow', name: '追獵長弓', desc: '百步穿楊神弓，物攻 +12' },
  { item1: 'armor_cleaver', item2: 'steel_armor', result: 'siege_axe', name: '破城巨斧', desc: '物攻 +13、防禦 +2、最大 HP -10' },
  { item1: 'forbidden_tome', item2: 'frost_ring', result: 'frost_tome', name: '霜蝕秘典', desc: '魔攻 +12、防禦 +2、最大 HP -8' },
  { item1: 'arcane_dagger', item2: 'balance_talisman', result: 'dual_phase_dagger', name: '雙相短刃', desc: '物攻 +7、魔攻 +7、最大 HP +8' },
  { item1: 'ragged_robe', item2: 'traveler_robe', result: 'ancient_robe', name: '古紋長袍', desc: '古老長袍，最大 HP +40' },
  { item1: 'copper_armor', item2: 'guardian_amulet', result: 'city_guard_armor', name: '守城戰衣', desc: '最大 HP +22、防禦 +3；每場戰鬥開始獲得 12 護盾' }
];

const SLOT_WATERMARK_SVGS = {
  SWORD: `
    <svg viewBox="0 0 100 100" fill="#ffffff">
      <path d="M12 12 L28 15 L68 55 L55 68 L15 28 Z" />
      <rect x="52" y="62" width="26" height="7" rx="3.5" transform="rotate(-45 65 65.5)" />
      <rect x="67" y="67" width="12" height="20" rx="5" transform="rotate(-45 73 77)" />
      <path d="M88 12 L85 28 L63 50 L50 37 L72 15 Z" />
      <path d="M32 55 L45 68 L37 76 L24 63 Z" />
      <rect x="22" y="62" width="26" height="7" rx="3.5" transform="rotate(45 35 65.5)" />
      <rect x="21" y="67" width="12" height="20" rx="5" transform="rotate(45 27 77)" />
    </svg>
  `,
  BOOK: `
    <svg viewBox="0 0 100 100" fill="#ffffff">
      <path d="M22 10 C15 10 11 15 11 22 L11 82 C11 90 16 95 24 95 L84 95 C87 95 89 93 89 90 C89 87 87 85 84 85 L25 85 C21 85 19 83 19 79 C19 75 21 73 25 73 L84 73 C87 73 89 71 89 68 L89 16 C89 12 86 10 82 10 L22 10 Z M26 16 L26 67 L21 67 L21 16 Z" />
      <path fill="#0c2144" d="M32 18 L46 18 C46 26 40 32 32 32 Z M80 18 L80 32 C72 32 66 26 66 18 Z M32 64 C40 64 46 70 46 78 L32 78 Z M80 64 L80 78 L66 78 C66 70 72 64 80 64 Z" />
      <path fill="#0c2144" d="M56 27 C58 37 61 40 71 42 C61 44 58 47 56 57 C54 47 51 44 41 42 C51 40 54 37 56 27 Z" />
      <path fill="#ffffff" d="M56 34 C57 39 59 41 64 42 C59 43 57 45 56 50 C55 45 53 43 48 42 C53 41 55 39 56 34 Z" />
    </svg>
  `,
  ARMOR: `
    <svg viewBox="0 0 100 100" fill="#ffffff">
      <path d="M25 10 L38 10 C39 22 61 22 62 10 L75 10 L96 27 L86 42 L68 30 L80 46 L74 86 L50 95 L26 86 L20 46 L32 30 L14 42 L4 27 Z" />
      <path fill="#0c2144" d="M50 38 L68 62 L58 86 L50 90 L42 86 L32 62 Z" />
      <path fill="#ffffff" d="M50 45 L62 63 L54 83 L50 85 L46 83 L38 63 Z" />
    </svg>
  `,
  RING: `
    <svg viewBox="0 0 100 100" fill="none" stroke="#ffffff">
      <polygon points="38,8 62,8 70,22 30,22" fill="#ffffff" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
      <path d="M24 32 C22 22 30 18 35 24 L65 24 C70 18 78 22 76 32 L68 40 L32 40 Z" fill="#ffffff" stroke="none" />
      <circle cx="50" cy="60" r="32" stroke="#ffffff" stroke-width="12" />
      <circle cx="50" cy="60" r="22" stroke="#0c2144" stroke-width="2.5" />
    </svg>
  `
};

const CLASS_ATK_TYPES = {
  warrior: 'PHYS',
  paladin: 'PHYS',
  assassin: 'PHYS',
  samurai: 'PHYS',
  archer: 'PHYS',
  gladiator: 'PHYS',
  stargazer: 'MAG',
  augur: 'MAG',
  mage: 'MAG',
  bard: 'MAG',
  alchemist: 'MAG',
  druid: 'MAG',
  onmyoji: 'MAG',
  dreamweaver: 'MAG',
  diviner: 'MAG',
  sage: 'MAG',
  cleric: 'MAG'
};

const CLASS_EXCLUSIVE_SVGS = {
  warrior: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20 L30 20 L80 70 L70 80 L20 30 Z" fill="#ffffff"/><path d="M82 20 L70 20 L20 70 L30 80 L80 30 Z" fill="#ffffff"/><line x1="65" y1="85" x2="85" y2="65" stroke-width="7"/><line x1="15" y1="65" x2="35" y2="85" stroke-width="7"/></svg>`,
  paladin: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><path d="M18 20 L58 20 L58 52 C58 70 38 84 38 84 C38 84 18 70 18 52 Z" fill="#ffffff" fill-opacity="0.25"/><line x1="38" y1="22" x2="38" y2="80" stroke-width="6"/><line x1="20" y1="45" x2="56" y2="45" stroke-width="6"/><rect x="58" y="18" width="28" height="16" rx="3" transform="rotate(15 72 26)" fill="#ffffff"/><line x1="70" y1="34" x2="56" y2="86" stroke-width="6" stroke-linecap="round"/></svg>`,
  stargazer: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="34" width="58" height="16" rx="3" transform="rotate(-22 51 42)" fill="#ffffff"/><line x1="50" y1="50" x2="34" y2="86"/><line x1="50" y1="50" x2="66" y2="86"/><line x1="50" y1="50" x2="50" y2="88"/><path d="M24 16 A10 10 0 1 0 34 28 A8 8 0 1 1 24 16 Z" fill="#ffffff" stroke="none"/><circle cx="72" cy="18" r="3" fill="#ffffff"/></svg>`,
  augur: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="34" width="58" height="16" rx="3" transform="rotate(-22 51 42)" fill="#ffffff"/><line x1="50" y1="50" x2="34" y2="86"/><line x1="50" y1="50" x2="66" y2="86"/><line x1="50" y1="50" x2="50" y2="88"/><path d="M24 16 A10 10 0 1 0 34 28 A8 8 0 1 1 24 16 Z" fill="#ffffff" stroke="none"/><circle cx="72" cy="18" r="3" fill="#ffffff"/></svg>`,
  mage: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"><line x1="20" y1="82" x2="68" y2="34"/><circle cx="72" cy="30" r="9" fill="#ffffff"/><line x1="72" y1="10" x2="72" y2="15" stroke-width="4"/><line x1="90" y1="30" x2="85" y2="30" stroke-width="4"/><line x1="85" y1="16" x2="81" y2="20" stroke-width="4"/><path d="M35 28 L38 35 L45 38 L38 41 L35 48 L32 41 L25 38 L32 35 Z" fill="#ffffff" stroke="none"/></svg>`,
  bard: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M26 18 C20 18 20 28 26 28 L26 78 L72 78 C78 55 84 35 84 26 C64 26 50 18 26 18 Z"/><line x1="38" y1="22" x2="38" y2="78" stroke-width="3"/><line x1="48" y1="24" x2="48" y2="78" stroke-width="3"/><line x1="58" y1="26" x2="58" y2="78" stroke-width="3"/><line x1="20" y1="82" x2="76" y2="82" stroke-width="7"/></svg>`,
  alchemist: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><path d="M40 16 L60 16 M44 16 L44 34 A28 28 0 1 0 56 34 L56 16"/><path d="M26 65 Q50 58 74 65 A25 25 0 0 1 26 65 Z" fill="#ffffff"/><circle cx="44" cy="52" r="3" fill="#ffffff"/><circle cx="56" cy="45" r="4" fill="#ffffff"/></svg>`,
  assassin: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 22 C24 45 36 58 46 68 L54 60 C44 48 32 34 18 22 Z" fill="#ffffff"/><line x1="42" y1="72" x2="58" y2="56" stroke-width="6"/><line x1="50" y1="64" x2="62" y2="78" stroke-width="7"/><path d="M48 30 C58 24 66 30 68 32 C70 30 78 24 88 30 C86 42 76 44 68 38 C60 44 50 42 48 30 Z" fill="#ffffff"/><circle cx="58" cy="34" r="3" fill="#0c2144" stroke="none"/><circle cx="78" cy="34" r="3" fill="#0c2144" stroke="none"/></svg>`,
  druid: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M40 46 C26 42 18 28 22 14 M26 34 L16 28 M32 40 L30 24"/><path d="M60 46 C74 42 82 28 78 14 M74 34 L84 28 M68 40 L70 24"/><path d="M35 55 C55 50 70 65 68 84 C48 86 33 72 35 55 Z" fill="#ffffff"/><line x1="35" y1="55" x2="65" y2="82" stroke="#0c2144" stroke-width="3"/></svg>`,
  onmyoji: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="4"><circle cx="50" cy="50" r="36" stroke-opacity="0.6"/><rect x="34" y="16" width="32" height="68" rx="2" transform="rotate(8 50 50)" fill="#ffffff"/><path d="M48 28 L56 28 M46 40 L56 40 L48 54 L56 54 M44 68 L56 68 M50 24 L46 74" stroke="#0c2144" stroke-width="4" stroke-linecap="round"/></svg>`,
  dreamweaver: `<svg viewBox="0 0 100 100" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"><path d="M48 48 C34 24 14 22 18 42 C20 52 36 54 48 52 C34 56 22 68 28 78 C34 86 46 74 48 58 Z"/><path d="M52 48 C66 24 86 22 82 42 C80 52 64 54 52 52 C66 56 78 68 72 78 C66 86 54 74 52 58 Z"/><line x1="50" y1="32" x2="50" y2="72" stroke-width="5" stroke-linecap="round"/></svg>`,
  diviner: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5"><circle cx="50" cy="46" r="28" fill="#ffffff" fill-opacity="0.25"/><path d="M30 74 L70 74 L76 86 L24 86 Z" fill="#ffffff"/><path d="M58 32 L61 39 L68 42 L61 45 L58 52 L55 45 L48 42 L55 39 Z" fill="#ffffff" stroke="none"/></svg>`,
  samurai: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 22 C32 36 42 42 50 42 C58 42 68 36 68 22" stroke-width="6"/><path d="M26 48 C26 32 74 32 74 48 L82 68 L18 68 Z" fill="#ffffff" fill-opacity="0.3"/><line x1="16" y1="22" x2="84" y2="84" stroke-width="7"/></svg>`,
  sage: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><text x="20" y="34" fill="#ffffff" stroke="none" font-size="22" font-weight="bold">π Σ √</text><path d="M16 48 L48 52 L48 84 L16 80 Z" fill="#ffffff"/><path d="M84 48 L52 52 L52 84 L84 80 Z" fill="#ffffff"/></svg>`,
  archer: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M26 18 C66 24 76 58 56 86"/><line x1="26" y1="18" x2="56" y2="86" stroke-width="3"/><line x1="22" y1="78" x2="78" y2="22" stroke-width="5"/><polygon points="78,22 65,24 76,35" fill="#ffffff"/></svg>`,
  gladiator: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="18" x2="82" y2="82" stroke-width="6"/><line x1="82" y1="18" x2="18" y2="82" stroke-width="6"/><path d="M30 42 C30 24 70 24 70 42 L70 74 L56 84 L56 58 L44 58 L44 84 L30 74 Z" fill="#ffffff"/><path d="M36 48 L46 52 L36 56 Z M64 48 L54 52 L64 56 Z" fill="#0c2144" stroke="none"/></svg>`,
  cleric: `<svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"><rect x="38" y="14" width="24" height="72" rx="4" fill="#ffffff"/><rect x="18" y="34" width="64" height="24" rx="4" fill="#ffffff"/><circle cx="50" cy="46" r="14" fill="#0c2144"/></svg>`
};

let selectedInvSlot = null;

function renderItemIconHtml(item, iconClass = 'item-equipment-img') {
  if (!item) return '';
  if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE') {
    let svg = '';
    let fallbackImg = '';
    if (item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote') {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M10 2v7.31M14 9.3V2M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="m9 15 2 2 4-4"/></svg>`;
      fallbackImg = '/assets/equipment/general/解毒劑.webp';
    } else if (item.effectType === 'HEALING_POTION' || item.id === 'consumable_healing_potion') {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="rgba(244,63,94,0.3)"/><path d="M12 7v6M9 10h6"/></svg>`;
      fallbackImg = '/assets/equipment/general/補血藥.webp';
    } else if (item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent') {
      svg = `<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M3.5 21 12 3l8.5 18H3.5Z" fill="rgba(251,191,36,0.2)"/><path d="M12 3v18M8.5 21l3.5-7 3.5 7"/></svg>`;
      fallbackImg = '/assets/equipment/general/修整帳篷.webp';
    }
    let imgUrl = (item.icon && item.icon.startsWith('/')) ? item.icon : (fallbackImg || `/assets/equipment/general/${encodeURIComponent(item.name)}.webp`);
    imgUrl = imgUrl.replace(/^\/?assets\/assets\//, '/assets/');
    return `
      <img src="${imgUrl}" class="${iconClass}" alt="${escapeHtml(item.name || '')}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" />
      <div class="consumable-svg-wrap ${iconClass}-svg" style="display:none;">${svg}</div>
    `;
  }
  const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
  if (isExclusive) {
    const meRole = (typeof roomState !== 'undefined' && roomState?.players?.[window.currentSocketId]?.role) || (typeof me !== 'undefined' && me?.role);
    const roleKey = item.role || meRole || 'warrior';
    const svg = CLASS_EXCLUSIVE_SVGS[roleKey] || CLASS_EXCLUSIVE_SVGS.warrior || '';
    const exclusiveImgMap = {};
    const noImgNames = new Set(['荊棘重鎧', '大天使重弓']);
    let imgUrl = (item.icon && item.icon.startsWith('/'))
      ? item.icon.replace(/^\/?assets\/assets\//, '/assets/')
      : (item.name && !noImgNames.has(item.name) ? (exclusiveImgMap[item.name] || `/assets/equipment/exclusive/${encodeURIComponent(item.name)}.webp`) : '');
    if (imgUrl) {
      return `
        <img src="${imgUrl}" class="${iconClass}" alt="${escapeHtml(item.name || '')}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" />
        <div class="exclusive-equip-svg-wrap ${iconClass}-svg" style="display:none;">${svg}</div>
      `;
    }
    return `<div class="exclusive-equip-svg-wrap ${iconClass}-svg">${svg}</div>`;
  }
  let imgUrl = (item.icon && item.icon.startsWith('/')) ? item.icon : `/assets/equipment/general/${encodeURIComponent(item.name)}.webp`;
  imgUrl = imgUrl.replace(/^\/?assets\/assets\//, '/assets/');
  const fallbackSvgId = item.slot === 'WEAPON' ? '#icon-sword' : (item.slot === 'ARMOR' ? '#icon-shield' : '#icon-chest');
  return `
    <img src="${imgUrl}" class="${iconClass}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';" />
    <span class="item-fallback-icon" style="display:none;"><svg class="svg-icon" style="width:24px;height:24px;"><use href="${fallbackSvgId}"></use></svg></span>
  `;
}

function createHexBgSvg() {
  return `
    <svg class="hex-bg-svg" viewBox="0 0 100 115.47" preserveAspectRatio="none">
      <polygon class="hex-polygon" points="50,2 98,29.5 98,85.97 50,113.47 2,85.97 2,29.5" />
    </svg>
  `;
}

function renderHexSlotContent(item, badgeText, watermarkSvg = '') {
  if (item) {
    return `
      ${createHexBgSvg()}
      <div class="item-layer">
        <div class="item-layer-icon-box">
          ${renderItemIconHtml(item, 'item-equipment-img')}
        </div>
        <span class="item-layer-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      </div>
    `;
  }
  return `
    ${createHexBgSvg()}
    ${watermarkSvg ? `<div class="equip-watermark">${watermarkSvg}</div>` : ''}
    ${(!watermarkSvg && badgeText) ? `<span class="slot-index-badge">${badgeText}</span>` : ''}
  `;
}

function updateHudInventoryButtonState() {
  const btn = elements?.btnOpenInventory || document.getElementById('btnOpenInventory');
  const img = document.getElementById('hudBagIcon');
  const modal = elements?.inventoryModal || document.getElementById('inventoryModal');
  if (!btn || !img || !modal) return;
  const isClosing = modal.classList.contains('is-closing');
  const isHidden = modal.classList.contains('hidden');
  const isOpen = !isHidden && !isClosing;

  btn.classList.toggle('active', isOpen);
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  const targetKey = isOpen ? 'ui.bag.open' : 'ui.bag.closed';
  const fallbackPath = isOpen ? '/assets/ui/inventory/bag2.webp' : '/assets/ui/inventory/bag1.webp';
  const resolved = window.assetRegistry ? window.assetRegistry.resolve(targetKey, fallbackPath) : fallbackPath;
  if (img.getAttribute('src') !== resolved) {
    img.src = resolved;
  }
}
window.updateHudInventoryButtonState = updateHudInventoryButtonState;

function preloadBagAssets() {
  const closedSrc = window.assetRegistry ? window.assetRegistry.resolve('ui.bag.closed', '/assets/ui/inventory/bag1.webp') : '/assets/ui/inventory/bag1.webp';
  const openSrc = window.assetRegistry ? window.assetRegistry.resolve('ui.bag.open', '/assets/ui/inventory/bag2.webp') : '/assets/ui/inventory/bag2.webp';
  [closedSrc, openSrc].forEach(src => {
    if (!src) return;
    const img = new Image();
    img.src = src;
  });
}
window.preloadBagAssets = preloadBagAssets;

function toggleInventoryModal() {
  if (!elements.inventoryModal) return;
  const isHidden = elements.inventoryModal.classList.contains('hidden');
  const isClosing = elements.inventoryModal.classList.contains('is-closing');
  const isOpen = !isHidden && !isClosing && elements.inventoryModal.classList.contains('is-open');
  if (isOpen) {
    closeInventoryModal();
  } else {
    openInventoryModal();
  }
}
window.toggleInventoryModal = toggleInventoryModal;

function openInventoryModal() {
  if (!elements.inventoryModal) return;
  playSound('click');
  try {
    renderInventoryModal();
  } catch (err) {
    console.error('Error rendering inventory modal:', err);
  }
  elements.inventoryModal.inert = false;
  elements.inventoryModal.setAttribute('aria-hidden', 'false');
  elements.inventoryModal.classList.remove('hidden', 'is-closing');
  elements.inventoryModal.classList.add('is-open');
  if (window.ModalMotion) {
    ModalMotion.show(elements.inventoryModal);
  }
  updateHudInventoryButtonState();
}

function closeInventoryModal() {
  if (!elements.inventoryModal) return;
  hideItemTooltip(true);
  playSound('click');
  if (window.ModalMotion) {
    ModalMotion.hide(elements.inventoryModal);
  } else {
    elements.inventoryModal.classList.remove('is-open');
    elements.inventoryModal.classList.add('hidden');
  }
  updateHudInventoryButtonState();
}
window.openInventoryModal = openInventoryModal;
window.closeInventoryModal = closeInventoryModal;

// ============================================================================
// 背包裝備欄位判斷、懸浮提示面板與拖曳放置 (Drag and Drop)
// ============================================================================
const EQUIP_SLOTS = Object.freeze({
  WEAPON: 'WEAPON',
  ARMOR: 'ARMOR',
  ACCESSORY: 'ACCESSORY',
  CLASS_EXCLUSIVE: 'CLASS_EXCLUSIVE'
});

function determineEquipSlot(item) {
  if (!item) return EQUIP_SLOTS.ACCESSORY;
  if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE') return 'CONSUMABLE';
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

function getItemBasePrice(item) {
  if (!item) return 50;
  if (item.basePrice) return item.basePrice;
  if (item.tier === 'CLASS_EXCLUSIVE' || item.slot === EQUIP_SLOTS.CLASS_EXCLUSIVE || item.role) return 250;
  if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE') {
    if (item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote') return 30;
    if (item.effectType === 'HEALING_POTION' || item.id === 'consumable_healing_potion') return 40;
    if (item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent') return 100;
    return item.cost || 50;
  }
  if (item.tier === 2) return item.cost || 120;
  if (item.tier === 1) return item.cost || 50;
  return item.cost || 50;
}

let draggedInventorySlot = null;
let pinnedTooltipInfo = null; // { item, area, index, key }
let pendingDiscardSlot = null;
let pendingInvUseItem = null;

function openDiscardConfirmModal(meta) {
  if (!meta || !meta.item) return;
  pendingDiscardSlot = meta;
  if (elements.discardModalDesc) {
    elements.discardModalDesc.innerHTML = `確定要丟棄【<span style="color:var(--gold, #f59e0b);">${escapeHtml(meta.item.name)}</span>】嗎？`;
  }
  if (window.ModalMotion) {
    ModalMotion.show(elements.discardConfirmModal);
  } else {
    elements.discardConfirmModal?.classList.remove('hidden');
  }
}

function getGoldIncomeMultiplierClient(col) {
  const step = Math.max(0, (col || 1) - 1);
  return 1 + 0.18 * step;
}

function calculateItemSellPriceClient(item, shopSession = null) {
  if (!item) return 1;
  const shop = shopSession || (roomState?.currentEvent?.type === 'shop' ? roomState.currentEvent : {});
  const basePrice = item.basePrice ?? getItemBasePrice(item);
  const valuation = basePrice;
  const ratio = shop.sellRatio ?? shop.recycleRate ?? (shop.isShady ? 0.15 : 0.55);
  return Math.max(1, Math.round(valuation * ratio));
}

function isPlayerInShop() {
  return (roomState?.state === 'EVENT' && roomState?.currentEvent?.type === 'shop') ||
         Boolean(elements.eventCardBox && !elements.eventCardBox.classList.contains('hidden') && elements.eventDetails?.querySelector('.shop-container'));
}

function getFloatingItemTooltip() {
  if (!elements.floatingItemTooltip) {
    elements.floatingItemTooltip = document.getElementById('floatingItemTooltip');
  }
  return elements.floatingItemTooltip;
}

function positionItemTooltip(e, tooltip, force = false) {
  if (pinnedTooltipInfo && !force) {
    return;
  }
  tooltip = tooltip || getFloatingItemTooltip();
  if (!tooltip || !e) return;
  const tw = 240; // 固定寬度 240px
  const th = tooltip.offsetHeight || 160;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 12;

  // 滑鼠游標右側 clientX + 16px (超出右邊界時才翻轉至左側)
  let left = e.clientX + 16;
  if (left + tw > vw - pad) {
    left = e.clientX - tw - 16;
  }
  if (left < pad) {
    left = pad;
  }

  let top = e.clientY - 20;
  if (top + th > vh - pad) {
    top = Math.max(pad, vh - th - pad);
  }
  if (top < pad) top = pad;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showItemTooltip(item, e, isShop = false, options = {}) {
  if (pinnedTooltipInfo && !options.isPinned) {
    return;
  }
  const tooltip = getFloatingItemTooltip();
  if (!tooltip || !item) return;

  const isPinned = Boolean(options.isPinned);
  const isConsumable = item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT';
  const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
  const isT2 = item.tier === 2;
  const isT1 = item.tier === 1;

  let tierClass = 'tier-common';
  let slotLabel = '裝備';

  if (isConsumable) {
    tierClass = 'tier-consumable';
    slotLabel = '消耗品 (冒險道具)';
  } else if (isExclusive) {
    tierClass = 'tier-exclusive';
    const roleName = item.role ? (classesData[item.role]?.name || item.role) : '職業專屬';
    slotLabel = `專屬裝備 (${roleName})`;
  } else {
    const slotKey = determineEquipSlot(item);
    if (slotKey === 'WEAPON') {
      slotLabel = isT2 ? '武器 (T2)' : (isT1 ? '武器 (T1)' : '武器');
      tierClass = isT2 ? 'tier-t2' : 'tier-t1';
    } else if (slotKey === 'ARMOR') {
      slotLabel = isT2 ? '裝備 / 防具 (T2)' : (isT1 ? '裝備 / 防具 (T1)' : '裝備 / 防具');
      tierClass = isT2 ? 'tier-t2' : 'tier-t1';
    } else {
      slotLabel = isT2 ? '飾品 (T2)' : (isT1 ? '飾品 (T1)' : '飾品');
      tierClass = isT2 ? 'tier-t2' : 'tier-t1';
    }
  }

  const stats = [];
  if (item.bonusAtk) stats.push(`攻擊力 +${item.bonusAtk}`);
  if (item.bonusDef) stats.push(`防禦力 +${item.bonusDef}`);
  if (item.bonusPhysAtk) stats.push(`物攻 +${item.bonusPhysAtk}`);
  if (item.bonusMagAtk) stats.push(`魔攻 +${item.bonusMagAtk}`);
  if (item.bonusHp) stats.push(`生命上限 +${item.bonusHp}`);
  if (item.regenPerRound) stats.push(`每回合回血 +${item.regenPerRound}`);
  if (item.battleStartShield) stats.push(`開場護盾 +${item.battleStartShield}`);
  if (item.bonusCrit) stats.push(`暴擊率 +${Math.round(item.bonusCrit * 100)}%`);

  const isHealingPotion = item.id === 'consumable_healing_potion' || item.effectType === 'HEALING_POTION';
  let passiveDesc = item.passive || item.desc || item.statDesc || '無特殊說明';
  if (isHealingPotion) {
    const isAlchemistPersonalBag = (options?.area === 'PERSONAL' || options?.slotMeta?.area === 'PERSONAL') && (getMyPlayer()?.role === 'alchemist');
    if (isAlchemistPersonalBag) {
      passiveDesc = '恢復自身40點生命，以及除自身外隊友25點生命。';
    } else {
      passiveDesc = '使用後恢復單一目標 35 點生命值。';
    }
  }
  const statsHtml = stats.length > 0 ? `<div class="item-tooltip-stats">${stats.map(s => `<span>${s}</span>`).join('')}</div>` : '';
  const iconHtml = renderItemIconHtml(item, 'tooltip-item-icon');

  let bottomActionHtml = '';
  if (isPinned) {
    if (isConsumable) {
      // 補血藥、解毒劑、修整帳篷只能使用或丟棄，不可販售！
      const isRestTent = item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent';
      const useBtnText = isRestTent ? '<svg class="svg-icon sm"><use href="#icon-camp"></use></svg> 搭建帳篷休整' : '<svg class="svg-icon sm"><use href="#icon-potion"></use></svg> 使用道具';
      bottomActionHtml = `
        <div class="item-tooltip-actions-section">
          <button type="button" class="btn-tooltip-use" id="btnTooltipUse">${useBtnText}</button>
          <button type="button" class="btn-tooltip-discard" id="btnTooltipDiscard"><svg class="svg-icon sm"><use href="#icon-trash"></use></svg> 丟棄物品</button>
        </div>
      `;
    } else {
      // 一般或專屬裝備：在商店可販賣或丟棄；非商店只能丟棄不可販賣
      if (isPlayerInShop()) {
        const sellPrice = calculateItemSellPriceClient(item);
        bottomActionHtml = `
          <div class="item-tooltip-actions-section">
            <button type="button" class="btn-tooltip-sell" id="btnTooltipSell">
              <svg class="svg-icon sm"><use href="#icon-gold"></use></svg> 販售裝備 (+${sellPrice}G)
            </button>
            <button type="button" class="btn-tooltip-discard" id="btnTooltipDiscard">
              <svg class="svg-icon sm"><use href="#icon-trash"></use></svg> 丟棄裝備
            </button>
          </div>
        `;
      } else {
        bottomActionHtml = `
          <div class="item-tooltip-actions-section">
            <button type="button" class="btn-tooltip-discard" id="btnTooltipDiscard">
              <svg class="svg-icon sm"><use href="#icon-trash"></use></svg> 丟棄裝備
            </button>
          </div>
        `;
      }
    }
  } else if (isShop) {
    bottomActionHtml = `
      <div style="margin-top:8px;font-size:11px;color:#94a3b8;border-top:1px dashed rgba(255,255,255,0.1);padding-top:4px;display:flex;align-items:center;gap:4px;">
        <svg class="svg-icon sm" style="color:var(--gold);"><use href="#icon-gold"></use></svg>
        <span>${item.sold ? '已售罄' : (item.soldPrice ? `原價買回: ${item.soldPrice} G` : (item.price ? `售價: ${item.price} G` : '商店販售中'))}</span>
      </div>
    `;
  }

  tooltip.innerHTML = `
    <div class="item-tooltip-top-bar">
      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
        <div style="width:28px;height:28px;flex-shrink:0;">${iconHtml}</div>
        <div class="item-tooltip-name ${tierClass}">${escapeHtml(item.name)}${item.sold ? ' (售罄)' : ''}</div>
      </div>
      ${isPinned ? `<button type="button" class="btn-tooltip-close" id="btnTooltipClose" title="關閉"><svg class="svg-icon" style="width:12px;height:12px;"><use href="#icon-close"></use></svg></button>` : ''}
    </div>
    <div class="item-tooltip-slot-row">
      <span class="tooltip-label">穿戴位子：</span>
      <span class="item-tooltip-slot-badge">${escapeHtml(slotLabel)}</span>
    </div>
    <div class="item-tooltip-effect-section">
      <div class="item-tooltip-effect-title">被動：</div>
      ${statsHtml}
      <div class="item-tooltip-desc">${escapeHtml(passiveDesc)}</div>
    </div>
    ${bottomActionHtml}
  `;

  if (isPinned) {
    tooltip.classList.add('is-pinned');
    const closeBtn = tooltip.querySelector('#btnTooltipClose');
    if (closeBtn) {
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        hideItemTooltip(true);
      };
    }
    const sellBtn = tooltip.querySelector('#btnTooltipSell');
    if (sellBtn && options.slotMeta) {
      sellBtn.onclick = (ev) => {
        ev.stopPropagation();
        const meta = options.slotMeta;
        hideItemTooltip(true);
        socket.emit('event:shop_action', {
          action: 'sell',
          fromArea: meta.area ? meta.area.toLowerCase() : 'squad',
          index: meta.index,
          key: meta.key,
          slotKey: meta.key
        }, (res) => {
          if (res && !res.success) alert(res.message);
        });
      };
    }
    const discardBtn = tooltip.querySelector('#btnTooltipDiscard');
    if (discardBtn && options.slotMeta) {
      discardBtn.onclick = (ev) => {
        ev.stopPropagation();
        hideItemTooltip(true);
        openDiscardConfirmModal({ ...options.slotMeta, item });
      };
    }
    const useBtn = tooltip.querySelector('#btnTooltipUse');
    if (useBtn && options.slotMeta) {
      useBtn.onclick = (ev) => {
        ev.stopPropagation();
        const meta = options.slotMeta;
        const isRestTent = item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent';
        if (isRestTent) {
          if (roomState?.state === 'IN_BATTLE') {
            alert('修整帳篷僅限在「選路階段」使用！');
            return;
          }
          hideItemTooltip(true);
          socket.emit('inventory:use_item', {
            fromArea: meta.area === 'SQUAD' ? 'squad' : 'personal',
            index: meta.index
          }, (res) => {
            if (res && !res.success) alert(res.message);
            selectedInvSlot = null;
            renderInventoryModal();
          });
          return;
        }

        // 戰鬥中使用道具：消耗回合行動，視為施放技能，鎖定後不可再施放其他技能
        if (roomState?.state === 'IN_BATTLE') {
          const me = getMyPlayer();
          if (!me) return;
          if (me.isLocked) {
            alert('本回合已鎖定行動，不可再施放其他技能或使用道具！');
            return;
          }
          if (!canUseBattleItem(me)) {
            alert('當前狀態本回合無法行動！');
            return;
          }

          hideItemTooltip(true);
          if (window.ModalMotion) ModalMotion.hide(elements.inventoryModal);
          else elements.inventoryModal?.classList.add('hidden');

          const actionId = (item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote') ? 'use_item_antidote' : 'use_item_healing_potion';
          const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
          if (alivePlayers.length > 1) {
            openTargetModal(actionId === 'use_item_antidote' ? 'item_antidote' : 'item_potion', alivePlayers);
          } else {
            currentPendingAction = actionId;
            currentPendingTarget = me.id;
            playSound('heal');
            renderMyActionBar(me);
            socket.emit('battle:lock', { actionId, targetPlayerId: me.id }, (res) => {
              if (res && !res.success) alert(res.message);
            });
          }
          return;
        }

        // 非戰鬥時：即時使用道具
        const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
        if (alivePlayers.length > 1) {
          hideItemTooltip(true);
          pendingInvUseItem = { ...meta, item };
          openTargetModal(item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote' ? 'inv_antidote' : 'inv_potion', alivePlayers);
        } else {
          hideItemTooltip(true);
          socket.emit('inventory:use_item', {
            fromArea: meta.area === 'SQUAD' ? 'squad' : 'personal',
            index: meta.index,
            targetPlayerId: myId
          }, (res) => {
            if (res && !res.success) alert(res.message);
            selectedInvSlot = null;
            renderInventoryModal();
          });
        }
      };
    }
  } else {
    tooltip.classList.remove('is-pinned');
  }

  tooltip.classList.add('visible');
  positionItemTooltip(e, tooltip, isPinned);
}

function pinItemTooltip(item, e, slotMeta) {
  if (!item) return;
  pinnedTooltipInfo = { item, ...slotMeta };
  showItemTooltip(item, e, false, { isPinned: true, slotMeta, area: slotMeta?.area });
}

function hideItemTooltip(force = false) {
  if (pinnedTooltipInfo && !force) return;
  const tooltip = getFloatingItemTooltip();
  if (tooltip) {
    tooltip.classList.remove('visible', 'is-pinned');
  }
  pinnedTooltipInfo = null;
}

document.addEventListener('pointerdown', (e) => {
  if (!pinnedTooltipInfo) return;
  const tooltip = getFloatingItemTooltip();
  if (tooltip && tooltip.contains(e.target)) return;
  if (e.target.closest('.hex-slot') || e.target.closest('.shop-item-card')) return;
  hideItemTooltip(true);
});

// 丟棄確認彈窗按鈕事件監聽
if (elements.btnCancelDiscard) {
  elements.btnCancelDiscard.addEventListener('click', () => {
    pendingDiscardSlot = null;
    if (window.ModalMotion) {
      ModalMotion.hide(elements.discardConfirmModal);
    } else {
      elements.discardConfirmModal?.classList.add('hidden');
    }
  });
}

if (elements.btnConfirmDiscard) {
  elements.btnConfirmDiscard.addEventListener('click', () => {
    if (!pendingDiscardSlot) {
      if (window.ModalMotion) {
        ModalMotion.hide(elements.discardConfirmModal);
      } else {
        elements.discardConfirmModal?.classList.add('hidden');
      }
      return;
    }
    const meta = pendingDiscardSlot;
    pendingDiscardSlot = null;
    if (window.ModalMotion) {
      ModalMotion.hide(elements.discardConfirmModal);
    } else {
      elements.discardConfirmModal?.classList.add('hidden');
    }
    hideItemTooltip(true);
    socket.emit('inventory:discard_item', {
      fromArea: (meta.area || 'squad').toLowerCase(),
      index: meta.index,
      key: meta.key,
      slotKey: meta.key,
      itemId: meta.item?.id
    }, (res) => {
      if (res && !res.success) alert(res.message);
      selectedInvSlot = null;
      renderInventoryModal();
    });
  });
}

if (elements.discardConfirmModal) {
  elements.discardConfirmModal.addEventListener('click', (e) => {
    if (e.target === elements.discardConfirmModal) {
      pendingDiscardSlot = null;
      if (window.ModalMotion) {
        ModalMotion.hide(elements.discardConfirmModal);
      } else {
        elements.discardConfirmModal.classList.add('hidden');
      }
    }
  });
}

// 拖曳到空白非欄位區域丟棄物品
document.addEventListener('dragover', (e) => {
  if (draggedInventorySlot) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
});

document.addEventListener('drop', (e) => {
  if (!draggedInventorySlot) return;
  if (e.target.closest('.hex-slot') || e.target.closest('.inv-discard-dropzone') || e.target.closest('.shop-sell-dropzone')) return; // 若落在六角格上則交由格子的 drop listener 處理
  e.preventDefault();
  const source = draggedInventorySlot;
  draggedInventorySlot = null;
  openDiscardConfirmModal(source);
});

function handleInventoryDrop(source, target) {
  if (!source || !target) return;
  if (!source.item) return;

  const slotLabels = {
    WEAPON: '武器',
    ARMOR: '裝備(防具)',
    ACCESSORY: '飾品',
    CLASS_EXCLUSIVE: '職業專屬'
  };

  const me = getMyPlayer();

  // Case 1: 拖曳至裝備欄 (EQUIP) - 嚴格限制欄位
  if (target.area === 'EQUIP') {
    if (source.area === 'EQUIP') {
      alert('裝備欄位不符！無法在不同類型的裝備欄位之間交換。');
      return;
    }
    if (source.item.type === 'CONSUMABLE' || source.item.slot === 'CONSUMABLE' || source.item.effectType) {
      alert('裝備欄位不符！消耗品無法穿戴至裝備欄位。');
      return;
    }
    const requiredSlot = determineEquipSlot(source.item);
    if (requiredSlot !== target.key) {
      const reqName = slotLabels[requiredSlot] || requiredSlot;
      const targetName = slotLabels[target.key] || target.key;
      alert(`裝備欄位不符！此裝備為【${reqName}】，無法穿戴在【${targetName}】欄位。`);
      return;
    }
    if (target.key === 'CLASS_EXCLUSIVE' && source.item.role && me?.role && source.item.role !== me.role) {
      alert(`此裝備為【${source.item.role}】專屬裝備，非本職業（${me.role}）無法穿戴！`);
      return;
    }

    if (source.area === 'PERSONAL') {
      socket.emit('inventory:equip_from_bag', { bagIndex: source.index, preferredSlot: target.key }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    } else if (source.area === 'SQUAD') {
      socket.emit('inventory:equip_from_squad', { squadIndex: source.index, preferredSlot: target.key }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    }
    return;
  }

  // Case 2: 拖曳至個人背包 (PERSONAL)
  if (target.area === 'PERSONAL') {
    if (source.area === 'EQUIP') {
      const targetItem = (me?.bag || [])[target.index];
      if (targetItem) {
        if (targetItem.type === 'CONSUMABLE' || targetItem.slot === 'CONSUMABLE' || targetItem.effectType) {
          alert('裝備欄位不符！消耗品無法穿戴至裝備欄位。');
          return;
        }
        const reqSlot = determineEquipSlot(targetItem);
        if (reqSlot !== source.key) {
          const reqName = slotLabels[reqSlot] || reqSlot;
          const sourceName = slotLabels[source.key] || source.key;
          alert(`裝備欄位不符！【${targetItem.name}】為【${reqName}】，無法穿戴在【${sourceName}】欄位。`);
          return;
        }
        if (source.key === 'CLASS_EXCLUSIVE' && targetItem.role && me?.role && targetItem.role !== me.role) {
          alert(`此裝備為【${targetItem.role}】專屬裝備，非本職業（${me.role}）無法穿戴！`);
          return;
        }
      }
      socket.emit('inventory:unequip_to_bag', {
        slotKey: source.key,
        targetBagIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
      return;
    }

    if (source.area === 'PERSONAL') {
      if (source.index === target.index) return;
      socket.emit('inventory:swap_slots', {
        fromArea: 'PERSONAL',
        fromIndex: source.index,
        toArea: 'PERSONAL',
        toIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    } else if (source.area === 'SQUAD') {
      socket.emit('inventory:swap_slots', {
        fromArea: 'SQUAD',
        fromIndex: source.index,
        toArea: 'PERSONAL',
        toIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    }
    return;
  }

  // Case 3: 拖曳至小隊背包 (SQUAD)
  if (target.area === 'SQUAD') {
    if (source.area === 'EQUIP') {
      const targetItem = (roomState?.squadInventory || [])[target.index];
      if (targetItem) {
        if (targetItem.type === 'CONSUMABLE' || targetItem.slot === 'CONSUMABLE' || targetItem.effectType) {
          alert('裝備欄位不符！消耗品無法穿戴至裝備欄位。');
          return;
        }
        const reqSlot = determineEquipSlot(targetItem);
        if (reqSlot !== source.key) {
          const reqName = slotLabels[reqSlot] || reqSlot;
          const sourceName = slotLabels[source.key] || source.key;
          alert(`裝備欄位不符！【${targetItem.name}】為【${reqName}】，無法穿戴在【${sourceName}】欄位。`);
          return;
        }
        if (source.key === 'CLASS_EXCLUSIVE' && targetItem.role && me?.role && targetItem.role !== me.role) {
          alert(`此裝備為【${targetItem.role}】專屬裝備，非本職業（${me.role}）無法穿戴！`);
          return;
        }
      }
      socket.emit('inventory:unequip_to_squad', {
        slotKey: source.key,
        targetSquadIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
      return;
    }

    if (source.area === 'SQUAD') {
      if (source.index === target.index) return;
      socket.emit('inventory:swap_slots', {
        fromArea: 'SQUAD',
        fromIndex: source.index,
        toArea: 'SQUAD',
        toIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    } else if (source.area === 'PERSONAL') {
      socket.emit('inventory:swap_slots', {
        fromArea: 'PERSONAL',
        fromIndex: source.index,
        toArea: 'SQUAD',
        toIndex: target.index
      }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    }
    return;
  }
}

function attachSlotDragAndTooltip(slot, area, idx, key, item) {
  // 懸浮提示面板與拖曳起點
  if (item) {
    slot.addEventListener('mouseenter', (e) => {
      if (pinnedTooltipInfo) return;
      showItemTooltip(item, e, false, { area, index: idx, key });
    });
    slot.addEventListener('mousemove', (e) => {
      if (pinnedTooltipInfo) return;
      positionItemTooltip(e, elements.floatingItemTooltip);
    });
    slot.addEventListener('mouseleave', () => {
      if (pinnedTooltipInfo) return;
      hideItemTooltip();
    });

    slot.setAttribute('draggable', 'true');
    slot.addEventListener('dragstart', (e) => {
      draggedInventorySlot = { area, index: idx, key, item };
      slot.classList.add('is-dragging');
      hideItemTooltip(true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ area, index: idx, key }));
    });
    slot.addEventListener('dragend', () => {
      slot.classList.remove('is-dragging');
      draggedInventorySlot = null;
      document.querySelectorAll('.hex-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  }

  // 拖曳放置目標
  slot.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  slot.addEventListener('dragenter', (e) => {
    e.preventDefault();
    slot.classList.add('drag-over');
  });
  slot.addEventListener('dragleave', (e) => {
    if (!slot.contains(e.relatedTarget)) {
      slot.classList.remove('drag-over');
    }
  });
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    if (!draggedInventorySlot) return;
    const source = draggedInventorySlot;
    draggedInventorySlot = null;
    handleInventoryDrop(source, { area, index: idx, key });
  });
}


// 初始化背包專用丟棄熱區 (Drop Zone)
function initDiscardDropzone() {
  const dropzone = document.getElementById('invDiscardDropzone');
  if (!dropzone || dropzone.dataset.initialized) return;
  dropzone.dataset.initialized = 'true';

  dropzone.addEventListener('dragover', (e) => {
    if (draggedInventorySlot) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dropzone.classList.add('drag-over');
    }
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('drag-over');
    }
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (!draggedInventorySlot) return;
    const source = draggedInventorySlot;
    draggedInventorySlot = null;
    openDiscardConfirmModal(source);
  });
}

function renderInventoryModal() {
  initDiscardDropzone();
  if (!elements.inventoryModal) return;

  const me = (roomState?.players || []).find(p => p.id === myId) || (roomState?.players || [])[0] || null;
  const gold = roomState?.gold ?? 0;
  if (elements.inventoryGoldCount) {
    elements.inventoryGoldCount.textContent = `${gold} G`;
  }
  if (elements.headerGoldDisplay) {
    elements.headerGoldDisplay.textContent = `${gold} G`;
  }

  // 頂部即時屬性列 (HP 物攻+ 魔攻+ 防禦力)
  const isPhys = me?.role ? (CLASS_ATK_TYPES[me.role] === 'PHYS') : true;
  if (elements.invStatHp) {
    elements.invStatHp.textContent = me ? `${Math.round(me.hp)} / ${me.maxHp}` : '-- / --';
  }
  const physVal = me?.PAtk_gear ?? (isPhys ? (me?.bonusAtk || 0) : (me?.bonusPhysAtk || 0));
  const magVal = me?.MAtk_gear ?? (!isPhys ? (me?.bonusAtk || 0) : (me?.bonusMagAtk || 0));
  const defVal = me?.DEF ?? (me?.bonusDef || 0);
  if (elements.invStatPhys) {
    elements.invStatPhys.textContent = me ? `+${physVal}` : '+0';
  }
  if (elements.invStatMag) {
    elements.invStatMag.textContent = me ? `+${magVal}` : '+0';
  }
  if (elements.invStatDef) {
    elements.invStatDef.textContent = me ? `${defVal}` : '0';
  }

  // 1. 小隊背包 (3-4-5-4-3 蜂巢連體共 19 格)
  const squad = roomState?.squadInventory || [];
  if (elements.squadCapacityText) {
    elements.squadCapacityText.textContent = `${squad.length} / 19 格`;
  }
  if (elements.squadGrid) {
    const rowCounts = [3, 4, 5, 4, 3];
    let currentIdx = 0;
    let squadHtml = '';
    for (let r = 0; r < rowCounts.length; r++) {
      const count = rowCounts[r];
      squadHtml += `<div class="hex-row">`;
      for (let c = 0; c < count; c++) {
        const idx = currentIdx++;
        const item = squad[idx];
        const isSelected = selectedInvSlot && selectedInvSlot.area === 'SQUAD' && selectedInvSlot.index === idx;
        squadHtml += `
          <div class="hex-slot ${item ? 'has-item' : ''} ${isSelected ? 'selected-slot' : ''}" data-area="SQUAD" data-idx="${idx}" title="${item ? escapeHtml(item.name + ': ' + (item.desc || '')) : `第 ${idx + 1} 格`}">
            ${renderHexSlotContent(item, idx + 1)}
          </div>
        `;
      }
      squadHtml += `</div>`;
    }
    elements.squadGrid.innerHTML = squadHtml;
    elements.squadGrid.querySelectorAll('.hex-slot').forEach(slot => {
      const idx = Number(slot.dataset.idx);
      const item = squad[idx];
      attachSlotDragAndTooltip(slot, 'SQUAD', idx, null, item);
        slot.onclick = (e) => {
        selectedInvSlot = { area: 'SQUAD', index: idx, item: squad[idx] };
        renderInventoryModal();
        if (item) {
          pinItemTooltip(item, e, { area: 'SQUAD', index: idx, key: null });
        } else {
          hideItemTooltip(true);
        }
      };
    });
  }

  // 2. 裝備欄 (4格連體：武器、裝備、飾品、專屬裝備)
  const roleName = me?.role ? (classesData[me.role]?.name || me.role) : '專屬';
  const equipSlotsMeta = [
    { key: 'WEAPON', label: isPhys ? '武器(劍)' : '武器(書)', watermark: isPhys ? SLOT_WATERMARK_SVGS.SWORD : SLOT_WATERMARK_SVGS.BOOK },
    { key: 'ARMOR', label: '裝備', watermark: SLOT_WATERMARK_SVGS.ARMOR },
    { key: 'ACCESSORY', label: '飾品', watermark: SLOT_WATERMARK_SVGS.RING },
    { key: 'CLASS_EXCLUSIVE', label: `專屬(${roleName})`, watermark: (me?.role && CLASS_EXCLUSIVE_SVGS[me.role]) || SLOT_WATERMARK_SVGS.SWORD }
  ];

  if (elements.equippedSlotsGrid) {
    let equipHtml = '';
    equipSlotsMeta.forEach((s, idx) => {
      const item = me?.equipSlots?.[s.key];
      const isSelected = selectedInvSlot && selectedInvSlot.area === 'EQUIP' && selectedInvSlot.key === s.key;
      equipHtml += `
        <div class="hex-slot ${item ? 'has-item' : ''} ${isSelected ? 'selected-slot' : ''}" data-area="EQUIP" data-key="${s.key}" data-idx="${idx}" title="${item ? escapeHtml(item.name + ': ' + (item.desc || '')) : s.label}">
          ${renderHexSlotContent(item, '', s.watermark)}
        </div>
      `;
    });
    elements.equippedSlotsGrid.innerHTML = equipHtml;
    elements.equippedSlotsGrid.querySelectorAll('.hex-slot').forEach(slot => {
      const key = slot.dataset.key;
      const idx = Number(slot.dataset.idx);
      const item = me?.equipSlots?.[key];
      attachSlotDragAndTooltip(slot, 'EQUIP', idx, key, item);
      slot.onclick = (e) => {
        selectedInvSlot = { area: 'EQUIP', key, index: idx, item: me?.equipSlots?.[key] };
        renderInventoryModal();
        if (item) {
          pinItemTooltip(item, e, { area: 'EQUIP', index: idx, key });
        } else {
          hideItemTooltip(true);
        }
      };
    });

    const labelWeapon = document.getElementById('labelEquipWeapon');
    if (labelWeapon) labelWeapon.textContent = isPhys ? '武器(劍)' : '武器(書)';
    const labelExclusive = document.getElementById('labelEquipExclusive');
    if (labelExclusive) labelExclusive.textContent = me?.role ? `專屬` : '專屬';
  }

  // 3. 個人隨身背包 (4格連體)
  const bag = me?.bag || [];
  if (elements.personalBagCapacityText) {
    elements.personalBagCapacityText.textContent = `${bag.length} / 4 格`;
  }
  if (elements.personalBagGrid) {
    let bagHtml = '';
    for (let i = 0; i < 4; i++) {
      const item = bag[i];
      const isSelected = selectedInvSlot && selectedInvSlot.area === 'PERSONAL' && selectedInvSlot.index === i;
      bagHtml += `
        <div class="hex-slot ${item ? 'has-item' : ''} ${isSelected ? 'selected-slot' : ''}" data-area="PERSONAL" data-idx="${i}" title="${item ? escapeHtml(item.name + ': ' + (item.desc || '')) : `P${i + 1}`}">
          ${renderHexSlotContent(item, `P${i + 1}`)}
        </div>
      `;
    }
    elements.personalBagGrid.innerHTML = bagHtml;
    elements.personalBagGrid.querySelectorAll('.hex-slot').forEach(slot => {
      const idx = Number(slot.dataset.idx);
      const item = bag[idx];
      attachSlotDragAndTooltip(slot, 'PERSONAL', idx, null, item);
      slot.onclick = (e) => {
        selectedInvSlot = { area: 'PERSONAL', index: idx, item: bag[idx] };
        renderInventoryModal();
        if (item) {
          pinItemTooltip(item, e, { area: 'PERSONAL', index: idx, key: null });
        } else {
          hideItemTooltip(true);
        }
      };
    });
  }

  // 4. 詳情與操作面板 (Inspector Panel)
  if (elements.invInspectorContent) {
    if (selectedInvSlot && selectedInvSlot.item) {
      const item = selectedInvSlot.item;
      const isConsumable = item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT';
      const isInShop = isPlayerInShop();
      let actionButtons = '';

      if (isConsumable) {
        const isRestTent = item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent';
        actionButtons += `<button type="button" class="btn-inv-action btn-inv-use" id="btnInspectUse">${isRestTent ? '<svg class="svg-icon sm"><use href="#icon-camp"></use></svg> 搭建帳篷休整' : '<svg class="svg-icon sm"><use href="#icon-potion"></use></svg> 使用道具'}</button>`;
      }

      if (selectedInvSlot.area === 'SQUAD') {
        actionButtons += `<button type="button" class="btn-inv-action btn-inv-transfer" id="btnInspectTransfer">領取至個人背包</button>`;
      } else if (selectedInvSlot.area === 'PERSONAL') {
        if (!isConsumable) {
          actionButtons += `<button type="button" class="btn-inv-action btn-inv-equip" id="btnInspectEquip">穿戴裝備</button>`;
        }
        actionButtons += `<button type="button" class="btn-inv-action btn-inv-transfer" id="btnInspectToSquad">存入小隊背包</button>`;
      } else if (selectedInvSlot.area === 'EQUIP') {
        actionButtons += `<button type="button" class="btn-inv-action btn-inv-unequip" id="btnInspectUnequip">卸下裝備</button>`;
      }

      if (isInShop && !isConsumable) {
        const sellPrice = calculateItemSellPriceClient(item);
        actionButtons += `<button type="button" class="btn-inv-action btn-inv-sell" id="btnInspectSell"><svg class="svg-icon sm"><use href="#icon-gold"></use></svg> 賣給商人 (+${sellPrice}G)</button>`;
      }

      actionButtons += `<button type="button" class="btn-inv-action btn-inv-discard" id="btnInspectDiscard" style="border-color: rgba(239, 68, 68, 0.4); color: #fca5a5;"><svg class="svg-icon sm"><use href="#icon-trash"></use></svg> 丟棄${isConsumable ? '物品' : '裝備'}</button>`;

      const rarityClass = item.rarity ? 'rarity-' + item.rarity.toLowerCase() : '';
      const rarityLabel = item.rarity === 'EXCLUSIVE' ? '專屬' : (item.rarity === 'RARE' ? '稀有' : (isConsumable ? '消耗品' : '普通'));
      elements.invInspectorContent.innerHTML = `
        <div class="inv-inspector-body">
          <div class="inv-inspector-info">
            <div class="inv-inspector-title">
              <div class="inv-inspector-icon-box">${renderItemIconHtml(item, 'item-equipment-img')}</div>
              <span class="inv-inspector-name">${escapeHtml(item.name)}</span>
              <span class="inv-inspector-rarity-badge ${rarityClass}">${rarityLabel}</span>
              <span class="inv-inspector-slot-tag">[${item.slot || item.type || '裝備'}]</span>
            </div>
            <div class="inv-inspector-desc">${escapeHtml(item.desc || item.statDesc || '無特殊說明')}</div>
          </div>
          <div class="inv-inspector-actions">
            ${actionButtons}
          </div>
        </div>
      `;

      document.getElementById('btnInspectUse')?.addEventListener('click', () => {
        const isRestTent = item.effectType === 'REST_TENT' || item.id === 'consumable_rest_tent';
        if (isRestTent) {
          if (roomState?.state === 'IN_BATTLE') {
            alert('修整帳篷僅限在「選路階段」使用！');
            return;
          }
          socket.emit('inventory:use_item', {
            fromArea: selectedInvSlot.area === 'SQUAD' ? 'squad' : 'personal',
            index: selectedInvSlot.index
          }, (res) => {
            if (res && !res.success) alert(res.message);
            selectedInvSlot = null;
            renderInventoryModal();
          });
          return;
        }

        // 戰鬥中使用道具：消耗回合行動，視為施放技能，鎖定後不可再施放其他技能
        if (roomState?.state === 'IN_BATTLE') {
          const me = getMyPlayer();
          if (!me) return;
          if (me.isLocked) {
            alert('本回合已鎖定行動，不可再施放其他技能或使用道具！');
            return;
          }
          if (!canUseBattleItem(me)) {
            alert('當前狀態本回合無法行動！');
            return;
          }

          hideItemTooltip(true);
          if (window.ModalMotion) ModalMotion.hide(elements.inventoryModal);
          else elements.inventoryModal?.classList.add('hidden');

          const actionId = (item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote') ? 'use_item_antidote' : 'use_item_healing_potion';
          const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
          if (alivePlayers.length > 1) {
            openTargetModal(actionId === 'use_item_antidote' ? 'item_antidote' : 'item_potion', alivePlayers);
          } else {
            currentPendingAction = actionId;
            currentPendingTarget = me.id;
            playSound('heal');
            renderMyActionBar(me);
            socket.emit('battle:lock', { actionId, targetPlayerId: me.id }, (res) => {
              if (res && !res.success) alert(res.message);
            });
          }
          return;
        }

        // 非戰鬥時：即時使用道具
        const alivePlayers = (roomState?.players || []).filter(p => p.hp > 0);
        if (alivePlayers.length > 1) {
          pendingInvUseItem = {
            area: selectedInvSlot.area,
            index: selectedInvSlot.index,
            item
          };
          openTargetModal(item.effectType === 'ANTIDOTE' || item.id === 'consumable_antidote' ? 'inv_antidote' : 'inv_potion', alivePlayers);
        } else {
          socket.emit('inventory:use_item', {
            fromArea: selectedInvSlot.area === 'SQUAD' ? 'squad' : 'personal',
            index: selectedInvSlot.index,
            targetPlayerId: myId
          }, (res) => {
            if (res && !res.success) alert(res.message);
            selectedInvSlot = null;
            renderInventoryModal();
          });
        }
      });
      document.getElementById('btnInspectDiscard')?.addEventListener('click', () => {
        openDiscardConfirmModal({
          area: selectedInvSlot.area,
          index: selectedInvSlot.index,
          key: selectedInvSlot.key,
          item: selectedInvSlot.item
        });
      });
      document.getElementById('btnInspectSell')?.addEventListener('click', () => {
        socket.emit('event:shop_action', {
          action: 'sell',
          fromArea: selectedInvSlot.area === 'SQUAD' ? 'squad' : (selectedInvSlot.area === 'EQUIP' ? 'equip' : 'personal'),
          index: selectedInvSlot.index,
          key: selectedInvSlot.key,
          slotKey: selectedInvSlot.key
        }, (res) => {
          if (res && !res.success) alert(res.message);
          selectedInvSlot = null;
          renderInventoryModal();
        });
      });
      document.getElementById('btnInspectTransfer')?.addEventListener('click', () => {
        socket.emit('inventory:transfer_to_personal', { squadIndex: selectedInvSlot.index });
        selectedInvSlot = null;
      });
      document.getElementById('btnInspectToSquad')?.addEventListener('click', () => {
        socket.emit('inventory:transfer_to_squad', { bagIndex: selectedInvSlot.index });
        selectedInvSlot = null;
      });
      document.getElementById('btnInspectEquip')?.addEventListener('click', () => {
        socket.emit('inventory:equip_from_bag', { bagIndex: selectedInvSlot.index });
        selectedInvSlot = null;
      });
      document.getElementById('btnInspectUnequip')?.addEventListener('click', () => {
        socket.emit('inventory:unequip_to_bag', { slotKey: selectedInvSlot.key });
        selectedInvSlot = null;
      });
    } else if (selectedInvSlot && !selectedInvSlot.item) {
      const areaName = selectedInvSlot.area === 'SQUAD' ? `小隊背包第 ${selectedInvSlot.index + 1} 格` : (selectedInvSlot.area === 'PERSONAL' ? `個人背包第 ${selectedInvSlot.index + 1} 格` : `裝備欄【${selectedInvSlot.key}】`);
      elements.invInspectorContent.innerHTML = `
        <div class="inv-inspector-empty">【${areaName}】目前為空，可由其他背包移入或穿戴裝備。</div>
      `;
    } else {
      elements.invInspectorContent.innerHTML = `
        <div class="inv-inspector-empty">請選取格位查看物品資訊。</div>
      `;
    }
  }

  // 5. 鍛造工坊
  if (elements.craftingRecipesList) {
    const squadIds = squad.filter(i => i && i.id).map(i => i.id);
    elements.craftingRecipesList.innerHTML = CRAFTING_RECIPE_TEMPLATES.map(r => {
      const has1 = squadIds.includes(r.item1);
      const remainingIds = squadIds.slice();
      if (has1) remainingIds.splice(remainingIds.indexOf(r.item1), 1);
      const has2 = remainingIds.includes(r.item2);
      const canCraft = has1 && has2;

      return `
        <div class="crafting-recipe-card ${canCraft ? 'can-craft' : ''}">
          <div class="recipe-header">
            <span class="recipe-title">【${r.name}】</span>
            <span class="recipe-status ${canCraft ? 'ready' : 'missing'}">${canCraft ? '【可鍛造】' : '【材料不足】'}</span>
          </div>
          <div class="recipe-desc">${r.desc}</div>
          <div class="recipe-materials">
            <span class="mat-badge ${has1 ? 'have' : 'lack'}">${r.item1} ${has1 ? '[已備齊]' : '[缺少]'}</span>
            <span class="mat-plus">+</span>
            <span class="mat-badge ${has2 ? 'have' : 'lack'}">${r.item2} ${has2 ? '[已備齊]' : '[缺少]'}</span>
          </div>
          <button type="button" class="btn-craft-item" data-i1="${r.item1}" data-i2="${r.item2}" ${canCraft ? '' : 'disabled'}>
            立即鍛造 (CRAFT)
          </button>
        </div>
      `;
    }).join('');

    elements.craftingRecipesList.querySelectorAll('.btn-craft-item').forEach(b => {
      b.onclick = () => {
        if (b.disabled) return;
        b.disabled = true;
        socket.emit('inventory:craft', { item1Id: b.dataset.i1, item2Id: b.dataset.i2, fromSquad: true }, (res) => {
          b.disabled = false;
          if (res && !res.success) {
            alert(res.message || '合成失敗');
          } else if (res?.success && res.item && window.RewardPresentation) {
            RewardPresentation.enqueue({
              type: 'item',
              item: res.item,
              title: '鍛造合成成功！',
              meta: '全新神兵已妥善存入團隊行囊！'
            });
          }
        });
      };
    });
  }
}

// ==========================================
// Phase 3: 商店、寶箱與隨機事件互動渲染
// ==========================================
let currentShopCategoryTab = 'all';

let currentInteractiveEventKey = null;
let interactiveEventNarrativeDone = false;


// ==========================================
// 隨機事件模組：重鑄系統 & 20面骰賭博系統
// ==========================================
let selectedReforgeIndex = null;
let currentGambleBet = 10;
let gambleChoice = 'SMALL'; // 'SMALL' | 'BIG'
let isGambleRolling = false;
let gambleAudioCtx = null;

function getGambleAudioContext() {
  if (!gambleAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) gambleAudioCtx = new AudioCtx();
  }
  if (gambleAudioCtx && gambleAudioCtx.state === 'suspended') {
    gambleAudioCtx.resume().catch(() => {});
  }
  return gambleAudioCtx;
}

function playNativeAudioTick(freq = 220) {
  try {
    const ctx = getGambleAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch (e) {}
}

function playNativeAudioOutcome(type) {
  try {
    const ctx = getGambleAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    let notes = [];
    if (type === 'JACKPOT') {
      notes = [523.25, 659.25, 783.99, 1046.50];
    } else if (type === 'WIN') {
      notes = [523.25, 659.25, 783.99];
    } else if (type === 'PUSH') {
      notes = [293.66, 440.00];
    } else {
      notes = [130.81, 185.00];
    }
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = (type === 'LOSE') ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.5);
    });
  } catch (e) {}
}

function spawnGambleSpark(container, x, y, color = '#fbbf24') {
  if (!container) return;
  const p = document.createElement('div');
  p.className = 'spark-particle';
  const size = 4 + Math.random() * 6;
  p.style.width = `${size}px`;
  p.style.height = `${size}px`;
  p.style.background = color;
  p.style.boxShadow = `0 0 10px ${color}`;
  p.style.left = `calc(50% + ${x}px)`;
  p.style.top = `calc(50% + ${y}px)`;
  container.appendChild(p);

  const dx = (Math.random() - 0.5) * 80;
  const dy = (Math.random() - 0.5) * 80;
  p.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 0.95 },
      { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 }
    ],
    { duration: 450 + Math.random() * 200, easing: 'ease-out' }
  ).onfinish = () => p.remove();
}

function renderReforgeEvent(ev) {
  const squadItems = roomState?.squadInventory || [];
  const currentGold = roomState?.gold || 0;
  const rowCounts = [3, 4, 5, 4, 3];
  let slotIdx = 0;

  if (selectedReforgeIndex !== null && (!squadItems[selectedReforgeIndex] || !squadItems[selectedReforgeIndex].name)) {
    selectedReforgeIndex = null;
  }
  const selectedItem = (selectedReforgeIndex !== null && squadItems[selectedReforgeIndex]) ? squadItems[selectedReforgeIndex] : null;

  const hexGridHtml = `
    <div class="hex-grid-squad reforge-squad-grid">
      ${rowCounts.map(count => {
        const slotsInRow = [];
        for (let i = 0; i < count; i++) {
          const curIdx = slotIdx++;
          const item = squadItems[curIdx] || null;
          if (item) {
            const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
            const isRare = item.tier === 2;
            const rarityStroke = isExclusive ? 'var(--rarity-exclusive)' : (isRare ? 'var(--rarity-rare)' : 'var(--hex-border)');
            const isSelected = (selectedReforgeIndex === curIdx);
            slotsInRow.push(`
              <div class="hex-slot has-item squad-item-slot ${isSelected ? 'is-reforge-selected' : ''}"
                   data-index="${curIdx}"
                   draggable="true"
                   tabindex="0"
                   role="button"
                   aria-label="${escapeHtml(item.name)}">
                <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                  <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="stroke: ${rarityStroke};" />
                </svg>
                <div class="item-layer">
                  <div class="item-layer-icon-box">
                    ${renderItemIconHtml(item, 'item-equipment-img')}
                  </div>
                  <div class="item-layer-name">${escapeHtml(item.name)}</div>
                </div>
              </div>
            `);
          } else {
            slotsInRow.push(`
              <div class="hex-slot empty-slot squad-empty-slot" data-index="${curIdx}">
                <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                  <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="opacity: 0.8;" />
                </svg>
              </div>
            `);
          }
        }
        return `<div class="hex-row">${slotsInRow.join('')}</div>`;
      }).join('')}
    </div>
  `;

  function formatReforgeStats(it) {
    if (!it) return '';
    const parts = [];
    if (it.bonusAtk) parts.push(`物攻 +${it.bonusAtk}`);
    if (it.bonusMatk) parts.push(`魔攻 +${it.bonusMatk}`);
    if (it.bonusHp) parts.push(`生命 +${it.bonusHp}`);
    if (it.bonusDef) parts.push(`物防 +${it.bonusDef}`);
    if (it.bonusMdef) parts.push(`魔防 +${it.bonusMdef}`);
    if (it.role || it.slot === 'CLASS_EXCLUSIVE' || it.tier === 'CLASS_EXCLUSIVE') parts.push('專屬神裝');
    else if (it.tier === 2) parts.push('二階稀有');
    else parts.push('一階裝備');
    return parts.join(' | ') || '基本屬性';
  }

  elements.eventDetails.innerHTML = `
    <div class="reforge-container">
      <div class="shop-header-row">
        <div class="shop-gold-badge">
          ${getIconSvg('gold', 'ui-icon--sm')}
          <span>小隊金幣：<b>${currentGold}</b> G</span>
        </div>
        <div style="font-size:13px;color:var(--ui-text-muted);">
          ※ 矮人古法重鑄鐵砧：消耗 10G，隨機將選取的裝備重鑄為同階、二階稀有或職業專屬神裝
        </div>
        <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" data-act="leave">
          ${getIconSvg('leave', 'ui-icon--sm')}
          <span>告別離開 ›</span>
        </button>
      </div>

      <div class="reforge-main-layout">
        <div class="reforge-inventory-col">
          <div class="shop-col-header">
            <span class="shop-col-title">
              ${getIconSvg('chest', 'ui-icon--sm')}
              <span>小隊背包 (19格)</span>
            </span>
            <small>點選或拖曳裝備至鐵砧</small>
          </div>
          ${hexGridHtml}
        </div>

        <div class="reforge-anvil-col">
          <div class="shop-col-header">
            <span class="shop-col-title">
              ${getIconSvg('anvil', 'ui-icon--sm')}
              <span>重鑄鐵砧</span>
            </span>
            <small>重鑄消耗 10G</small>
          </div>

          <div class="reforge-slot-box ${selectedItem ? 'has-slotted-item' : 'empty'}" id="reforgeDropTarget">
            ${selectedItem ? `
              <div class="reforge-slotted-preview">
                <div class="reforge-slotted-icon">${renderItemIconHtml(selectedItem, 'reforge-preview-img')}</div>
                <div class="reforge-slotted-name">${escapeHtml(selectedItem.name)}</div>
                <div class="reforge-slotted-stats">${formatReforgeStats(selectedItem)}</div>
                <button type="button" class="btn-shop-action reforge-remove-btn" id="btnRemoveReforgeItem">
                  ${getIconSvg('close', 'ui-icon--sm')}
                  <span>取出</span>
                </button>
              </div>
            ` : `
              <div class="reforge-placeholder-icon">${getIconSvg('anvil', 'reforge-placeholder-svg')}</div>
              <div class="reforge-placeholder-text">點選左側背包裝備<br>或將裝備拖曳至此處</div>
            `}
          </div>

          <div class="reforge-info-panel">
            <div class="reforge-info-row">
              <span>重鑄費用：</span>
              <b>10 G</b>
            </div>
            <div class="reforge-info-row">
              <span>持有金幣：</span>
              <b style="${currentGold < 10 ? 'color: #f87171;' : 'color: #34d399;'}">${currentGold} G</b>
            </div>
          </div>

          <div class="reforge-tip-text">
            消耗 10G，隨機重鑄為一件裝備（可能變為一階、二階或各職業專屬神裝）。
          </div>

          <div class="reforge-actions-bar">
            <button type="button" class="btn-shop-action btn-reforge-execute ui-button ui-button--primary" id="btnExecuteReforge" ${(!selectedItem || currentGold < 10) ? 'disabled' : ''}>
              ${getIconSvg('anvil', 'ui-icon--sm')}
              <span>開始重鑄 (10G)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach slot click & drag & hover events
  elements.eventDetails.querySelectorAll('.hex-slot.squad-item-slot').forEach(slot => {
    const idx = Number(slot.dataset.index);
    const item = squadItems[idx];
    if (item) {
      slot.addEventListener('click', () => {
        selectedReforgeIndex = idx;
        renderInteractiveEvent(ev);
      });
      slot.addEventListener('mouseenter', (e) => showItemTooltip(item, e, true));
      slot.addEventListener('mousemove', (e) => positionItemTooltip(e, elements.floatingItemTooltip));
      slot.addEventListener('mouseleave', () => hideItemTooltip());

      slot.addEventListener('dragstart', (e) => {
        draggedInventorySlot = { area: 'REFORGE_SQUAD', index: idx, item };
        slot.classList.add('is-dragging');
        hideItemTooltip(true);
        e.dataTransfer.effectAllowed = 'move';
      });
      slot.addEventListener('dragend', () => {
        slot.classList.remove('is-dragging');
        draggedInventorySlot = null;
      });
    }
  });

  // Drop target
  const dropTarget = document.getElementById('reforgeDropTarget');
  if (dropTarget) {
    dropTarget.addEventListener('dragover', (e) => {
      if (draggedInventorySlot && draggedInventorySlot.area === 'REFORGE_SQUAD') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropTarget.classList.add('drag-over-reforge');
      }
    });
    dropTarget.addEventListener('dragleave', () => {
      dropTarget.classList.remove('drag-over-reforge');
    });
    dropTarget.addEventListener('drop', (e) => {
      if (draggedInventorySlot && draggedInventorySlot.area === 'REFORGE_SQUAD') {
        e.preventDefault();
        dropTarget.classList.remove('drag-over-reforge');
        selectedReforgeIndex = draggedInventorySlot.index;
        draggedInventorySlot = null;
        renderInteractiveEvent(ev);
      }
    });
  }

  // Remove button
  const btnRemove = document.getElementById('btnRemoveReforgeItem');
  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedReforgeIndex = null;
      renderInteractiveEvent(ev);
    });
  }

  // Execute button
  const btnExec = document.getElementById('btnExecuteReforge');
  if (btnExec) {
    btnExec.onclick = () => {
      if (!selectedItem || currentGold < 10) return;
      btnExec.disabled = true;
      socket.emit('event:random_action', { action: 'reforge', itemIndex: selectedReforgeIndex }, (res) => {
        btnExec.disabled = false;
        if (res && !res.success) {
          alert(res.message);
        } else if (res?.success) {
          playNativeAudioTick(340);
          if (window.RewardPresentation && res.item) {
            RewardPresentation.enqueue({ type: 'item', item: res.item, title: `重鑄完成 (${res.poolName || '裝備'})` });
          }
          renderInteractiveEvent(ev);
        }
      });
    };
  }

  // Leave button
  elements.eventDetails.querySelectorAll('.btn-rand-leave, .btn-shop-leave, [data-act="leave"]').forEach(btn => {
    btn.onclick = () => {
      socket.emit('event:random_action', { action: 'leave' });
    };
  });
}

function renderGambleEvent(ev) {
  if (isGambleRolling) {
    const walletEl = document.getElementById('gambleWalletGold');
    if (walletEl) walletEl.textContent = roomState?.gold || 0;
    return;
  }

  const currentGold = roomState?.gold || 0;
  const minBet = currentGold >= 10 ? 10 : Math.max(1, currentGold);
  const maxBet = Math.max(1, currentGold);
  if (currentGambleBet > currentGold) currentGambleBet = Math.max(minBet, currentGold);
  if (currentGambleBet < minBet && currentGold >= minBet) currentGambleBet = minBet;

  elements.eventDetails.innerHTML = `
    <div class="gamble-container">
      <div class="shop-header-row">
        <div class="shop-gold-badge">
          ${getIconSvg('gold', 'ui-icon--sm')}
          <span>小隊金幣：<b>${currentGold}</b> G</span>
        </div>
        <div style="font-size:13px;color:var(--ui-text-muted);">
          ※ 矮人幸運二十面骰：設定押注並決定押大或小，擲出幸運特賞點數可獲 3倍 獎金
        </div>
        <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" data-act="leave">
          ${getIconSvg('leave', 'ui-icon--sm')}
          <span>告別離開 ›</span>
        </button>
      </div>

      <div class="gamble-rule-banner">
        <div class="gamble-rule-icon">${getIconSvg('scroll', 'ui-icon--sm')}</div>
        <div class="gamble-rule-content">
          <div class="gamble-rule-title">矮人幸運二十面骰・賭局規則</div>
          <div class="gamble-rule-text">
            【押注大或小：小 (1～9) 贏 2倍；大 (11～20) 贏 2倍。擲出 10 為平局退還押注。若押小擲出 1 或押大擲出 20，觸發極限大獎 3倍回饋！】
          </div>
        </div>
      </div>

      <div class="gamble-arena">
        <div class="gamble-wallet-bar">
          <div style="display:flex;align-items:center;gap:6px;">
            ${getIconSvg('gold', 'ui-icon--sm')}
            <span>小隊金幣：</span>
            <span class="gamble-wallet-amount" id="gambleWalletGold">${currentGold}</span>
            <span>G</span>
          </div>
        </div>

        <!-- 畫面 1：下注設定 -->
        <div id="gambleScreenBet" class="gamble-screen">
          <div class="gamble-bet-display">
            <span id="gambleBetAmountDisplay">${currentGambleBet}</span> <span class="gamble-g-unit">G</span>
          </div>

          <div class="gamble-slider-container">
            <input type="range" id="gambleBetSlider" class="gold-slider" min="${minBet}" max="${maxBet}" step="10" value="${currentGambleBet}">
            <div class="gamble-quick-buttons">
              <button type="button" class="gamble-btn-quick" data-val="min">最小</button>
              <button type="button" class="gamble-btn-quick" data-val="25%">25%</button>
              <button type="button" class="gamble-btn-quick" data-val="50%">50%</button>
              <button type="button" class="gamble-btn-quick" data-val="all">全押</button>
            </div>
          </div>

          <div class="gamble-choice-grid">
            <button type="button" id="gambleBtnSmall" class="gamble-choice-card is-small ${gambleChoice === 'SMALL' ? 'is-selected' : ''}">
              <div class="gamble-choice-label">小</div>
              <div class="gamble-choice-sub">1 ～ 9 (贏 2倍)</div>
              <div class="gamble-choice-tag">1點特賞 3倍</div>
            </button>
            <button type="button" id="gambleBtnBig" class="gamble-choice-card is-big ${gambleChoice === 'BIG' ? 'is-selected' : ''}">
              <div class="gamble-choice-label">大</div>
              <div class="gamble-choice-sub">11 ～ 20 (贏 2倍)</div>
              <div class="gamble-choice-tag">20點特賞 3倍</div>
            </button>
          </div>

          <div style="display:flex;justify-content:center;width:100%;max-width:440px;">
            <button type="button" id="btnStartGambleRoll" class="btn-shop-action btn-gamble-roll ui-button ui-button--primary" ${currentGold <= 0 ? 'disabled' : ''} style="width:100%;">
              ${getIconSvg('dice', 'ui-icon--sm')}
              <span>擲骰子</span>
            </button>
          </div>
        </div>

        <!-- 畫面 2：20面骰子滾動動畫舞台與結算 -->
        <div id="gambleScreenRoll" class="gamble-screen hidden" style="position:relative;min-height:330px;justify-content:center;">
          <div id="gambleArcaneRing" class="arcane-ring"></div>
          <div id="gambleParticleContainer" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>
          <div class="d20-stage">
            <div id="gambleD20Wrapper" class="d20-wrapper">
              <img id="gambleD20Img" class="d20-img" src="/assets/ui/events/d20.webp" alt="二十面骰" />
            </div>
            <div id="gambleBigNumber" class="gamble-big-number font-cinzel hidden">20</div>
          </div>

          <!-- 結算結果 (直接置於骰子原位下方) -->
          <div id="gambleScreenResult" class="gamble-screen-result hidden">
            <div id="gambleOutcomeBadge" class="gamble-outcome-badge jackpot">贏 (3倍)</div>
            <div id="gambleGoldDelta" class="gamble-gold-delta">+300 G</div>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:6px;width:100%;max-width:320px;">
              <button type="button" id="btnGambleAgain" class="btn-shop-action btn-gamble-again ui-button ui-button--primary" style="flex:1;">
                ${getIconSvg('dice', 'ui-icon--sm')}
                <span>再來一局</span>
              </button>
              <button type="button" class="btn-shop-action btn-shop-leave btn-rand-leave ui-button ui-button--secondary" data-act="leave" style="flex:1;">
                ${getIconSvg('leave', 'ui-icon--sm')}
                <span>離開據點 ›</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // UI bindings
  const slider = document.getElementById('gambleBetSlider');
  const display = document.getElementById('gambleBetAmountDisplay');

  function updateSliderFill() {
    if (!slider) return;
    const pct = maxBet > 0 ? Math.round((currentGambleBet / maxBet) * 100) : 0;
    slider.style.background = `linear-gradient(90deg, #b45309 0%, #fbbf24 ${pct}%, #1e293b ${pct}%)`;
    if (display) display.textContent = currentGambleBet;
  }
  updateSliderFill();

  if (slider) {
    slider.oninput = (e) => {
      currentGambleBet = Number(e.target.value);
      updateSliderFill();
    };
  }

  elements.eventDetails.querySelectorAll('.gamble-btn-quick').forEach(btn => {
    btn.onclick = () => {
      const v = btn.dataset.val;
      if (v === 'min') currentGambleBet = minBet;
      else if (v === '25%') currentGambleBet = Math.max(minBet, Math.floor(currentGold * 0.25));
      else if (v === '50%') currentGambleBet = Math.max(minBet, Math.floor(currentGold * 0.5));
      else if (v === 'all') currentGambleBet = currentGold;
      if (slider) slider.value = currentGambleBet;
      updateSliderFill();
    };
  });

  const btnSmall = document.getElementById('gambleBtnSmall');
  const btnBig = document.getElementById('gambleBtnBig');
  if (btnSmall && btnBig) {
    btnSmall.onclick = () => {
      if (isGambleRolling) return;
      gambleChoice = 'SMALL';
      btnSmall.classList.add('is-selected');
      btnBig.classList.remove('is-selected');
    };
    btnBig.onclick = () => {
      if (isGambleRolling) return;
      gambleChoice = 'BIG';
      btnBig.classList.add('is-selected');
      btnSmall.classList.remove('is-selected');
    };
  }

  const btnRoll = document.getElementById('btnStartGambleRoll');
  if (btnRoll) {
    btnRoll.onclick = () => {
      if (isGambleRolling || currentGold <= 0 || currentGambleBet <= 0) return;
      getGambleAudioContext();

      isGambleRolling = true;
      const wager = Math.min(currentGold, currentGambleBet);

      const screenBet = document.getElementById('gambleScreenBet');
      const screenRoll = document.getElementById('gambleScreenRoll');
      const screenResult = document.getElementById('gambleScreenResult');
      const d20Wrapper = document.getElementById('gambleD20Wrapper');
      const arcaneRing = document.getElementById('gambleArcaneRing');
      const particleBox = document.getElementById('gambleParticleContainer');
      const bigNumber = document.getElementById('gambleBigNumber');

      if (screenBet) screenBet.classList.add('hidden');
      if (screenResult) screenResult.classList.add('hidden');
      if (bigNumber) {
        bigNumber.classList.add('hidden');
        bigNumber.classList.remove('number-pop');
      }
      if (screenRoll) screenRoll.classList.remove('hidden');

      if (d20Wrapper) {
        d20Wrapper.classList.remove('d20-vanish');
        d20Wrapper.style.opacity = '1';
        d20Wrapper.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)';
      }
      if (arcaneRing) arcaneRing.classList.add('active-roll');

      let serverRes = null;
      socket.emit('event:random_action', { action: 'd20_gamble', amount: wager, choice: gambleChoice }, (res) => {
        serverRes = res;
        if (!res || !res.success) {
          alert(res?.message || '賭局發生錯誤');
          isGambleRolling = false;
          if (screenRoll) screenRoll.classList.add('hidden');
          if (screenBet) screenBet.classList.remove('hidden');
        }
      });

      const totalDuration = 2200;
      const startTime = performance.now();
      let currentAngle = 0;
      let lastSoundTick = 0;

      function animateFrame(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalDuration);
        const speedFactor = Math.pow(1 - progress, 2.35);

        currentAngle += 36 * speedFactor + 0.3;
        const bounceRadius = 55 * speedFactor;
        const offsetX = Math.sin(elapsed * 0.019) * bounceRadius;
        const offsetY = Math.cos(elapsed * 0.025) * (bounceRadius * 0.75);
        const scale = 1 + Math.sin(elapsed * 0.04) * 0.12 * speedFactor;

        if (d20Wrapper) {
          d20Wrapper.style.transform = `translate3d(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px, 0) rotate(${currentAngle.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
        }

        const tickInterval = 55 + progress * 260;
        if (now - lastSoundTick > tickInterval && progress < 0.94) {
          lastSoundTick = now;
          playNativeAudioTick(180 + (1 - progress) * 240);
          spawnGambleSpark(particleBox, offsetX, offsetY, Math.random() > 0.5 ? '#fbbf24' : '#38bdf8');
        }

        if (progress < 1) {
          requestAnimationFrame(animateFrame);
        } else {
          if (d20Wrapper) d20Wrapper.style.transform = 'translate3d(0px, 0px, 0px) rotate(0deg) scale(1.05)';
          playNativeAudioTick(140);

          const checkResultReady = () => {
            if (serverRes) {
              if (!serverRes.success) return;
              if (d20Wrapper) d20Wrapper.classList.add('d20-vanish');
              for (let i = 0; i < 16; i++) {
                spawnGambleSpark(particleBox, 0, 0, i % 2 === 0 ? '#fde047' : '#ffffff');
              }
              setTimeout(() => {
                if (arcaneRing) arcaneRing.classList.remove('active-roll');
                isGambleRolling = false;
                const sResult = document.getElementById('gambleScreenResult');
                const numEl = document.getElementById('gambleBigNumber');
                const badgeEl = document.getElementById('gambleOutcomeBadge');
                const deltaEl = document.getElementById('gambleGoldDelta');
                const walletEl = document.getElementById('gambleWalletGold');

                if (walletEl) walletEl.textContent = serverRes.currentGold ?? (roomState?.gold || 0);

                if (numEl) {
                  numEl.textContent = serverRes.roll;
                  numEl.classList.remove('hidden');
                  numEl.classList.remove('number-pop');
                  void numEl.offsetWidth;
                  numEl.classList.add('number-pop');

                  if (serverRes.outcomeType === 'JACKPOT') {
                    numEl.style.color = '#fbbf24';
                    numEl.style.textShadow = '0 0 35px rgba(251, 191, 36, 0.95)';
                  } else if (serverRes.outcomeType === 'WIN') {
                    numEl.style.color = '#34d399';
                    numEl.style.textShadow = '0 0 25px rgba(52, 211, 153, 0.8)';
                  } else if (serverRes.outcomeType === 'PUSH') {
                    numEl.style.color = '#38bdf8';
                    numEl.style.textShadow = '0 0 25px rgba(56, 189, 248, 0.8)';
                  } else {
                    numEl.style.color = '#f43f5e';
                    numEl.style.textShadow = '0 0 25px rgba(244, 63, 94, 0.85)';
                  }
                }

                if (sResult && badgeEl && deltaEl) {
                  sResult.classList.remove('hidden');

                  if (serverRes.outcomeType === 'JACKPOT') {
                    badgeEl.className = 'gamble-outcome-badge jackpot outcome-stamp';
                    badgeEl.textContent = '贏 (3倍)';
                    deltaEl.style.color = '#fbbf24';
                    deltaEl.textContent = `+${serverRes.payout} G`;
                  } else if (serverRes.outcomeType === 'WIN') {
                    badgeEl.className = 'gamble-outcome-badge win outcome-stamp';
                    badgeEl.textContent = '贏 (2倍)';
                    deltaEl.style.color = '#34d399';
                    deltaEl.textContent = `+${serverRes.payout} G`;
                  } else if (serverRes.outcomeType === 'PUSH') {
                    badgeEl.className = 'gamble-outcome-badge push outcome-stamp';
                    badgeEl.textContent = '平局';
                    deltaEl.style.color = '#7dd3fc';
                    deltaEl.textContent = `退回 ${serverRes.wager} G`;
                  } else {
                    badgeEl.className = 'gamble-outcome-badge lose outcome-stamp';
                    badgeEl.textContent = '輸';
                    deltaEl.style.color = '#fb7185';
                    deltaEl.textContent = `-${serverRes.wager} G`;
                  }
                }

                playNativeAudioOutcome(serverRes.outcomeType);
              }, 380);
            } else {
              setTimeout(checkResultReady, 50);
            }
          };
          setTimeout(checkResultReady, 200);
        }
      }

      requestAnimationFrame(animateFrame);
    };
  }

  const btnAgain = document.getElementById('btnGambleAgain');
  if (btnAgain) {
    btnAgain.onclick = () => {
      if (isGambleRolling) return;
      const screenRoll = document.getElementById('gambleScreenRoll');
      const screenResult = document.getElementById('gambleScreenResult');
      const screenBet = document.getElementById('gambleScreenBet');
      const numEl = document.getElementById('gambleBigNumber');
      const d20Wrapper = document.getElementById('gambleD20Wrapper');

      if (screenRoll) screenRoll.classList.add('hidden');
      if (screenResult) screenResult.classList.add('hidden');
      if (numEl) numEl.classList.add('hidden');
      if (screenBet) screenBet.classList.remove('hidden');
      if (d20Wrapper) {
        d20Wrapper.classList.remove('d20-vanish');
        d20Wrapper.style.opacity = '1';
      }
      renderInteractiveEvent(ev);
    };
  }

  elements.eventDetails.querySelectorAll('.btn-rand-leave, .btn-shop-leave, [data-act="leave"]').forEach(btn => {
    btn.onclick = () => {
      socket.emit('event:random_action', { action: 'leave' });
    };
  });
}

function renderInteractiveEvent(ev) {
  if (!elements.eventCardBox) return;
  elements.eventCardBox.classList.remove('hidden');
  const evFooter = document.querySelector('.event-footer');
  if (evFooter) evFooter.style.display = 'none';

  // 隨機事件背景插圖（鑄造台、賭博、獻祭台）
  const eventIllustrations = {
    'REFORGE': '/assets/environments/events/鑄造台.webp',
    'GAMBLE': '/assets/environments/events/賭博.webp',
    'ALTAR': '/assets/environments/events/獻祭台.webp'
  };
  const illustSrc = (ev.type === 'random_event' && eventIllustrations[ev.subType]) ? eventIllustrations[ev.subType] : null;
  let bgImg = elements.eventCardBox.querySelector('.event-bg-illustration');
  if (illustSrc) {
    if (!bgImg) {
      bgImg = document.createElement('img');
      bgImg.className = 'event-bg-illustration';
      bgImg.alt = '';
      bgImg.setAttribute('aria-hidden', 'true');
      elements.eventCardBox.prepend(bgImg);
    }
    if (bgImg.getAttribute('src') !== illustSrc) {
      bgImg.src = illustSrc;
    }
  } else if (bgImg) {
    bgImg.remove();
  }

  const isBorderlessRandomEvent = Boolean(ev.type === 'random_event' && eventIllustrations[ev.subType]);
  elements.eventCardBox?.classList.toggle('is-borderless-event', isBorderlessRandomEvent);
  elements.eventCardBox?.classList.toggle('is-altar-event', Boolean(ev.type === 'random_event' && ev.subType === 'ALTAR'));
  elements.eventCardBox?.classList.toggle('is-gamble-event', Boolean(ev.type === 'random_event' && ev.subType === 'GAMBLE'));
  elements.eventCardBox?.classList.toggle('is-reforge-event', Boolean(ev.type === 'random_event' && ev.subType === 'REFORGE'));

  const eventKey = `${roomState?.code || ''}:${roomState?.floor || 1}:${ev.hexId || (ev.type + '_' + (ev.subType || '') + '_' + (ev.title || ''))}`;
  const isNewEventInstance = (currentInteractiveEventKey !== eventKey);
  if (isNewEventInstance) {
    currentInteractiveEventKey = eventKey;
    interactiveEventNarrativeDone = false;
  }

  if (ev.type === 'shop') {
    elements.eventIcon.innerHTML = getIconSvg(ev.isWanderingMerchant ? 'camp' : 'shop', 'svg-hero-icon');
    elements.eventTitle.textContent = (ev.title || (ev.isWanderingMerchant ? '迷途流浪商人' : '迷宮行商據點')).replace(/^[🛒🏕️\s]+/, '');

    const currentGold = roomState.gold || 0;
    const squadItems = roomState.squadInventory || [];
    const hasEquipment = (ev.items || []).length > 0;
    const hasConsumables = (ev.consumables || []).length > 0;
    const hasBuyback = (ev.buybackPool || []).length > 0;

    const availableTabs = [
      { id: 'all', label: '全部商品', count: (ev.items?.length || 0) + (ev.consumables?.length || 0) + (ev.buybackPool?.length || 0) }
    ];
    if (hasEquipment) availableTabs.push({ id: 'equipment', label: '精選裝備', count: ev.items.length, icon: 'sword' });
    if (hasConsumables) availableTabs.push({ id: 'consumables', label: '冒險補給', count: ev.consumables.length, icon: 'potion' });
    if (hasBuyback) availableTabs.push({ id: 'buyback', label: '原價購回', count: ev.buybackPool.length, icon: 'cooldown' });

    if (!availableTabs.some(t => t.id === currentShopCategoryTab)) {
      currentShopCategoryTab = 'all';
    }

    const tabsNavHtml = availableTabs.length > 2 ? `
      <div class="shop-tabs-nav">
        ${availableTabs.map(t => `
          <button type="button" class="shop-tab-btn ${currentShopCategoryTab === t.id ? 'active' : ''}" data-tab="${t.id}">
            ${t.icon ? getIconSvg(t.icon, 'ui-icon--sm') : ''}
            <span>${t.label} (${t.count})</span>
          </button>
        `).join('')}
      </div>
    ` : '';

    // Collect goods matching the current tab
    let allGoods = [];
    if (currentShopCategoryTab === 'all' || currentShopCategoryTab === 'equipment') {
      (ev.items || []).forEach((item, idx) => {
        allGoods.push({ ...item, _type: 'equip', _idx: idx });
      });
    }
    if (currentShopCategoryTab === 'all' || currentShopCategoryTab === 'consumables') {
      (ev.consumables || []).forEach((c, idx) => {
        allGoods.push({ ...c, _type: 'consumable', _idx: idx, price: c.price });
      });
    }
    if (currentShopCategoryTab === 'all' || currentShopCategoryTab === 'buyback') {
      (ev.buybackPool || []).forEach((bb, idx) => {
        allGoods.push({ ...bb, _type: 'buyback', _idx: idx, price: bb.soldPrice });
      });
    }

    // 19-Slot Layout helper: rows of 3, 4, 5, 4, 3
    const rowCounts = [3, 4, 5, 4, 3];

    // Helper to render a 19-hex honeycomb grid
    function buildHexGrid(items, isMerchant) {
      let slotIdx = 0;
      return `
        <div class="hex-grid-squad ${isMerchant ? 'shop-goods-grid' : ''}">
          ${rowCounts.map(count => {
            const slotsInRow = [];
            for (let i = 0; i < count; i++) {
              const curIdx = slotIdx++;
              const item = items[curIdx] || null;
              if (item) {
                const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
                const isRare = item.tier === 2;
                const rarityStroke = isExclusive ? 'var(--rarity-exclusive)' : (isRare ? 'var(--rarity-rare)' : 'var(--hex-border)');
                const isSold = Boolean(item.sold);
                const priceTag = isMerchant && (item.price || isSold) ? `<span class="shop-slot-price-tag ${isSold ? 'is-sold' : ''}">${isSold ? '已售罄' : `${item.price}G`}</span>` : '';
                slotsInRow.push(`
                  <div class="hex-slot has-item ${isMerchant ? 'shop-item-card' : 'squad-item-slot'} ${isSold ? 'is-sold-out' : ''}"
                       data-is-merchant="${isMerchant}"
                       data-index="${curIdx}"
                       data-type="${item._type || 'item'}"
                       data-sold="${isSold}"
                       ${item._type === 'consumable' ? `data-consumable-idx="${item._idx}"` : ''}
                       ${item._type === 'buyback' ? `data-buyback-idx="${item._idx}"` : ''}
                       tabindex="0"
                       role="button"
                       aria-label="${escapeHtml(item.name)}${isSold ? ' (售罄)' : (item.price ? ' ' + item.price + '金幣' : '')}">
                    <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                      <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="stroke: ${rarityStroke};" />
                    </svg>
                    ${priceTag}
                    <div class="item-layer">
                      <div class="item-layer-icon-box">
                        ${renderItemIconHtml(item, 'item-equipment-img')}
                      </div>
                      <div class="item-layer-name">${escapeHtml(item.name)}${isSold ? ' (售罄)' : ''}</div>
                    </div>
                  </div>
                `);
              } else {
                slotsInRow.push(`
                  <div class="hex-slot empty-slot ${isMerchant ? 'merchant-empty-slot' : 'squad-empty-slot'}"
                       data-is-merchant="${isMerchant}"
                       data-index="${curIdx}">
                    <svg class="hex-bg-svg" viewBox="0 0 100 115.47">
                      <polygon class="hex-polygon" points="50 0, 100 28.87, 100 86.6, 50 115.47, 0 86.6, 0 28.87" style="opacity: ${isMerchant ? 0.4 : 0.8};" />
                    </svg>
                    ${isMerchant ? '<svg class="svg-icon" style="width:14px;height:14px;opacity:0.25;"><use href="#icon-lock"></use></svg>' : ''}
                  </div>
                `);
              }
            }
            return `<div class="hex-row">${slotsInRow.join('')}</div>`;
          }).join('')}
        </div>
      `;
    }

    elements.eventDetails.innerHTML = `
      <div class="shop-container">
        <div class="shop-header-row">
          <div class="shop-gold-badge">
            ${getIconSvg('gold', 'ui-icon--sm')}
            <span>小隊金幣：<b>${currentGold}</b> G</span>
          </div>
          <div style="font-size:13px;color:var(--ui-text-muted);">
            ${ev.isWanderingMerchant ? '※ 迷途流浪商人攜帶少量物資，提供以物易物與地圖情報服務' : '※ 可瀏覽裝備與補給，或出售行囊中的物資'}
          </div>
          ${(() => {
            const readyList = ev.readyToLeave || [];
            const myPlayerId = getMyPlayer()?.id || myId;
            const isMeReady = readyList.includes(myPlayerId);
            const connectedList = (roomState?.players || []).filter(p => p.connected !== false);
            const totalMembers = connectedList.length || 1;
            const readyMembers = connectedList.filter(p => readyList.includes(p.id)).length;
            const leaveBtnText = isMeReady
              ? `已準備 (${readyMembers}/${totalMembers})`
              : (readyMembers > 0 ? `告別離開 (${readyMembers}/${totalMembers}) ›` : '告別離開 ›');
            return `
              <button type="button" class="btn-shop-action btn-shop-leave ui-button ${isMeReady ? 'ui-button--secondary is-ready' : 'ui-button--secondary'}" ${isMeReady ? 'disabled style="opacity:0.8;cursor:default;"' : ''}>
                ${getIconSvg(isMeReady ? 'check' : 'leave', 'ui-icon--sm')}
                <span>${leaveBtnText}</span>
              </button>
            `;
          })()}
        </div>

        ${tabsNavHtml}

        <!-- 雙欄對開攤位 -->
        <div class="shop-dual-column">
          <!-- 左欄：小隊行囊 (19 格) + 出售熱區 -->
          <div class="shop-squad-col">
            <div class="shop-col-header">
              <span class="shop-col-title">${getIconSvg('chest', 'ui-icon--sm')} 小隊背包 (19格)</span>
              <small>${squadItems.length} / 19 格</small>
            </div>
            ${buildHexGrid(squadItems, false)}
            <div id="shopSellDropzone" class="shop-sell-dropzone" title="點選或拖曳道具至此出售">
              ${getIconSvg('gold', 'ui-icon--sm')}
              <span>出售物資 (+金幣)</span>
            </div>
          </div>

          <!-- 右欄：商人貨架 (19 格) -->
          <div class="shop-goods-col">
            <div class="shop-col-header">
              <span class="shop-col-title">${getIconSvg('shop', 'ui-icon--sm')} 商人貨架 (${allGoods.length}件上架)</span>
              <small>點選查看並購買</small>
            </div>
            ${buildHexGrid(allGoods, true)}
          </div>
        </div>

        <!-- 交易與檢視區 (Trade Inspector) -->
        <div id="shopTradeInspector" class="shop-trade-inspector">
          <div class="shop-trade-info">
            <div class="shop-trade-title" id="shopTradeTitle">選取商品或背包物品進行交易</div>
            <div class="shop-trade-desc" id="shopTradeDesc">點選或拖曳交換以完成交易。</div>
          </div>
          <div class="shop-trade-actions" id="shopTradeActions"></div>
        </div>

        <!-- 特殊操作列 -->
        <div class="shop-special-actions">
          ${ev.isWanderingMerchant ? `
            <button type="button" class="btn-shop-action btn-wm-info ui-button ui-button--secondary" ${ev.infoUsed || (currentGold < (roomState.lockedLeaderRole === 'bard' ? 0 : 15)) ? 'disabled' : ''}>
              ${getIconSvg('camp', 'ui-icon--sm')}
              <span>${ev.infoUsed ? '已購買情報 (只能使用一次)' : `購買情報 (${roomState.lockedLeaderRole === 'bard' ? '免費' : '15G'})`}</span>
            </button>
            <button type="button" class="btn-shop-action btn-wm-barter ui-button ui-button--secondary" ${ev.barterUsed ? 'disabled' : ''}>
              ${getIconSvg('chest', 'ui-icon--sm')}
              <span>${ev.barterUsed ? '以物易物 (只能使用一次)' : '以物易物 (隨機同階裝備)'}</span>
            </button>
            ${roomState.lockedLeaderRole === 'dreamweaver' ? `
              <button type="button" class="btn-shop-action btn-wm-reshape ui-button ui-button--secondary">
                ${getIconSvg('sparkle', 'ui-icon--sm')}
                <span>幻象重塑 (織夢術士)</span>
              </button>
            ` : ''}
          ` : `

            ${ev.isAssassinCaptain && !ev.isPrepShop ? `
              <button type="button" class="btn-shop-action btn-shop-steal ui-button ui-button--secondary">
                ${getIconSvg('lock', 'ui-icon--sm')}
                <span>暗中行竊 (刺客)</span>
              </button>
            ` : ''}
          `}
        </div>
      </div>
    `;

    // 類別標籤切換
    elements.eventDetails.querySelectorAll('.shop-tab-btn').forEach(btn => {
      btn.onclick = () => {
        currentShopCategoryTab = btn.getAttribute('data-tab') || 'all';
        renderInteractiveEvent(ev);
      };
    });

    // Inspector Updater
    function updateShopInspector(item, isMerchant, itemIndex) {
      const tradeTitle = document.getElementById('shopTradeTitle');
      const tradeDesc = document.getElementById('shopTradeDesc');
      const tradeActions = document.getElementById('shopTradeActions');
      if (!tradeTitle || !tradeDesc || !tradeActions) return;

      if (!item) {
        tradeTitle.textContent = '選取商品或背包物品進行交易';
        tradeDesc.textContent = '點選或拖曳交換以完成交易。';
        tradeActions.innerHTML = '';
        return;
      }

      const isExclusive = Boolean(item.role || item.slot === 'CLASS_EXCLUSIVE' || item.tier === 'CLASS_EXCLUSIVE');
      const isRare = item.tier === 2;
      const tagLabel = isExclusive ? `專屬(${item.role || '職業'})` : (isRare ? 'T2 珍品' : (item._type === 'consumable' ? '消耗品' : (item._type === 'buyback' ? '購回' : '通用')));

      tradeTitle.innerHTML = `
        <div class="shop-trade-item-icon">${renderItemIconHtml(item, 'item-equipment-img')}</div>
        <span>【${escapeHtml(item.name)}】</span>
        <span class="shop-item-tag" style="font-size:12px;padding:1px 6px;">${tagLabel}</span>
      `;
      let itemDesc = item.desc || item.statDesc || '無特殊說明';
      if (item.id === 'consumable_healing_potion' || item.effectType === 'HEALING_POTION') {
        itemDesc = '使用後恢復單一目標 35 點生命值。';
      }
      tradeDesc.textContent = itemDesc;

      if (isMerchant) {
        if (item.sold) {
          tradeTitle.innerHTML = `
            <div class="shop-trade-item-icon" style="filter:grayscale(1);opacity:0.6;">${renderItemIconHtml(item, 'item-equipment-img')}</div>
            <span>【${escapeHtml(item.name)}】(售罄)</span>
            <span class="shop-item-tag" style="font-size:12px;padding:1px 6px;background:#475569;">已售罄</span>
          `;
          tradeActions.innerHTML = `
            <button type="button" class="ui-button ui-button--secondary" disabled style="opacity:0.6;cursor:not-allowed;">
              已售罄
            </button>
          `;
        } else {
          const canAfford = currentGold >= item.price;
          tradeActions.innerHTML = `
            <span style="font-weight:700;color:var(--ui-accent);">${getIconSvg('gold', 'ui-icon--sm')} ${item.price} G</span>
            <button type="button" class="ui-button ui-button--primary btn-shop-buy btn-shop-buy-equip" id="btnShopInspectorBuy" ${!canAfford ? 'disabled' : ''}>
              購買 (${item.price}G)
            </button>
          `;
          document.getElementById('btnShopInspectorBuy')?.addEventListener('click', (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = '購買中...';
            executeShopBuy(item, b);
          });
        }
      } else {
        const sellPrice = calculateItemSellPriceClient(item);
        tradeActions.innerHTML = `
          <span style="font-weight:700;color:var(--ui-accent);">賣出價值：+${sellPrice} G</span>
          <button type="button" class="ui-button ui-button--danger" id="btnShopInspectorSell">
            ${getIconSvg('gold', 'ui-icon--sm')} 出售給商人 (+${sellPrice}G)
          </button>
        `;
        document.getElementById('btnShopInspectorSell')?.addEventListener('click', () => {
          executeShopSell(item, itemIndex);
        });
      }
    }

    // Buying logic with Toast (and preserves 購回成功 for tests)
    function executeShopBuy(item, triggerBtn) {
      const originalText = triggerBtn ? triggerBtn.textContent : '';
      if ((roomState.gold || 0) < item.price) {
        if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalText; }
        showToast(`金幣不足！購買【${item.name}】需要 ${item.price}G，目前小隊僅有 ${roomState.gold || 0}G`, 'danger');
        return;
      }
      if (item._type === 'consumable') {
        socket.emit('event:shop_action', { action: 'buy', isConsumable: true, consumableIndex: item._idx }, (res) => {
          if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalText; }
          if (res && !res.success) {
            showToast(res.message || '購買失敗', 'danger');
          } else if (res?.success && res.item) {
            showToast(`購入【${res.item.name}】(-${item.price}G)`, 'success');
          }
        });
      } else if (item._type === 'buyback') {
        socket.emit('event:shop_action', { action: 'buyback', buybackIndex: item._idx }, (res) => {
          if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalText; }
          if (res && !res.success) {
            showToast(res.message || '購回失敗', 'danger');
          } else if (res?.success && res.item) {
            showToast(`購回成功！購入【${res.item.name}】(-${item.price}G)`, 'success');
            // 購回成功
          }
        });
      } else {
        socket.emit('event:shop_action', { action: 'buy', itemIndex: item._idx }, (res) => {
          if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalText; }
          if (res && !res.success) {
            showToast(res.message || '購買失敗', 'danger');
          } else if (res?.success && res.item) {
            showToast(`購入【${res.item.name}】(-${res.item.price || item.price}G)`, 'success');
          }
        });
      }
    }

    // Selling logic with Toast
    function executeShopSell(item, index) {
      if (!item) return;
      if (item.type === 'CONSUMABLE' || item.slot === 'CONSUMABLE' || item.effectType === 'HEALING_POTION' || item.effectType === 'ANTIDOTE' || item.effectType === 'REST_TENT') {
        showToast('補血藥、解毒劑與修整帳篷只能丟棄，不能販售！', 'warning');
        return;
      }
      const sellPrice = calculateItemSellPriceClient(item);
      socket.emit('event:shop_action', {
        action: 'sell',
        fromArea: 'squad',
        index: index,
        key: index,
        slotKey: index
      }, (res) => {
        if (res && !res.success) {
          showToast(res.message || '販售失敗', 'danger');
        } else {
          showToast(`售出【${item.name}】(+${sellPrice}G)`, 'success');
        }
      });
    }

    // Click on merchant item -> inspect
    elements.eventDetails.querySelectorAll('.hex-slot.shop-item-card').forEach(slot => {
      const idx = Number(slot.dataset.index);
      const item = allGoods[idx];
      if (item) {
        slot.addEventListener('click', () => {
          elements.eventDetails.querySelectorAll('.hex-slot').forEach(s => s.classList.remove('selected-slot'));
          slot.classList.add('selected-slot');
          updateShopInspector(item, true, idx);
        });
        slot.addEventListener('mouseenter', (e) => showItemTooltip(item, e, true));
        slot.addEventListener('mousemove', (e) => positionItemTooltip(e, elements.floatingItemTooltip));
        slot.addEventListener('mouseleave', () => hideItemTooltip());

        // Drag from shop shelf to squad
        if (!item.sold) {
          slot.setAttribute('draggable', 'true');
          slot.addEventListener('dragstart', (e) => {
            draggedInventorySlot = { area: 'SHOP', index: idx, item };
            slot.classList.add('is-dragging');
            hideItemTooltip(true);
            e.dataTransfer.effectAllowed = 'move';
          });
          slot.addEventListener('dragend', () => {
            slot.classList.remove('is-dragging');
            draggedInventorySlot = null;
          });
        } else {
          slot.setAttribute('draggable', 'false');
        }
      }
    });

    // Click on squad item -> inspect for selling
    elements.eventDetails.querySelectorAll('.hex-slot.squad-item-slot').forEach(slot => {
      const idx = Number(slot.dataset.index);
      const item = squadItems[idx];
      if (item) {
        slot.addEventListener('click', () => {
          elements.eventDetails.querySelectorAll('.hex-slot').forEach(s => s.classList.remove('selected-slot'));
          slot.classList.add('selected-slot');
          updateShopInspector(item, false, idx);
        });
        slot.addEventListener('mouseenter', (e) => showItemTooltip(item, e, true));
        slot.addEventListener('mousemove', (e) => positionItemTooltip(e, elements.floatingItemTooltip));
        slot.addEventListener('mouseleave', () => hideItemTooltip());

        // Drag from squad bag to sell zone
        slot.setAttribute('draggable', 'true');
        slot.addEventListener('dragstart', (e) => {
          draggedInventorySlot = { area: 'SQUAD', index: idx, item };
          slot.classList.add('is-dragging');
          hideItemTooltip(true);
          e.dataTransfer.effectAllowed = 'move';
        });
        slot.addEventListener('dragend', () => {
          slot.classList.remove('is-dragging');
          draggedInventorySlot = null;
        });
      }
    });

    // Drag-to-buy on squad empty slots
    elements.eventDetails.querySelectorAll('.hex-slot.squad-empty-slot').forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        if (draggedInventorySlot && draggedInventorySlot.area === 'SHOP') {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      });
      slot.addEventListener('drop', (e) => {
        if (draggedInventorySlot && draggedInventorySlot.area === 'SHOP') {
          e.preventDefault();
          const item = draggedInventorySlot.item;
          draggedInventorySlot = null;
          executeShopBuy(item, null);
        }
      });
    });

    // 在商店的購買介面時，玩家可以將小隊背包內的物品拖曳到商品區，來觸發賣出效果
    const shopGoodsCol = elements.eventDetails.querySelector('.shop-goods-col');
    if (shopGoodsCol) {
      shopGoodsCol.addEventListener('dragover', (e) => {
        if (draggedInventorySlot && draggedInventorySlot.area === 'SQUAD') {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          shopGoodsCol.classList.add('drag-over-sell');
        }
      });
      shopGoodsCol.addEventListener('dragleave', (e) => {
        if (!shopGoodsCol.contains(e.relatedTarget)) {
          shopGoodsCol.classList.remove('drag-over-sell');
        }
      });
      shopGoodsCol.addEventListener('drop', (e) => {
        shopGoodsCol.classList.remove('drag-over-sell');
        if (draggedInventorySlot && draggedInventorySlot.area === 'SQUAD') {
          e.preventDefault();
          const source = draggedInventorySlot;
          draggedInventorySlot = null;
          executeShopSell(source.item, source.index);
        }
      });
    }

    // Wire Sell Dropzone
    const sellDropzone = document.getElementById('shopSellDropzone');
    if (sellDropzone) {
      sellDropzone.addEventListener('dragover', (e) => {
        if (draggedInventorySlot && draggedInventorySlot.area !== 'SHOP') {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          sellDropzone.classList.add('drag-over');
        }
      });
      sellDropzone.addEventListener('dragleave', (e) => {
        if (!sellDropzone.contains(e.relatedTarget)) {
          sellDropzone.classList.remove('drag-over');
        }
      });
      sellDropzone.addEventListener('drop', (e) => {
        sellDropzone.classList.remove('drag-over');
        if (draggedInventorySlot && draggedInventorySlot.area !== 'SHOP') {
          e.preventDefault();
          const source = draggedInventorySlot;
          draggedInventorySlot = null;
          executeShopSell(source.item, source.index);
        }
      });
    }

    elements.eventDetails.querySelector('.btn-wm-info')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'info' }, (res) => {
        if (res && !res.success) {
          showToast(res.message || '購買情報失敗', 'danger');
          btn.disabled = false;
        } else {
          showToast('成功購買情報！地圖上已標記出秘密事件據點！', 'success');
        }
      });
    });

    elements.eventDetails.querySelector('.btn-wm-barter')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'barter' }, (res) => {
        if (res && !res.success) {
          showToast(res.message || '以物易物失敗', 'danger');
          btn.disabled = false;
        } else if (res?.success && res.item) {
          showToast(`以物易物成功！換得同階【${res.item.name}】`, 'success');
          if (window.RewardPresentation) {
            RewardPresentation.enqueue({
              type: 'item',
              item: res.item,
              title: '以物易物交換成功！',
              meta: `清除了【${res.removedItem?.name || '裝備'}】，獲得了同階【${res.item.name}】！`
            });
          }
        }
      });
    });

    elements.eventDetails.querySelector('.btn-wm-reshape')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'reshape' }, (res) => {
        if (res && !res.success) {
          showToast(res.message || '幻象重塑失敗', 'danger');
          btn.disabled = false;
        } else if (res?.success && res.item) {
          showToast(`幻象重塑成功！換得同階【${res.item.name}】`, 'success');
          if (window.RewardPresentation) {
            RewardPresentation.enqueue({
              type: 'item',
              item: res.item,
              title: '幻象重塑成功！',
              meta: '獲得同階配飾！'
            });
          }
        }
      });
    });

    elements.eventDetails.querySelector('.btn-shop-rest')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'rest' }, (res) => {
        btn.disabled = false;
        if (res && !res.success) showToast(res.message, 'danger');
        else showToast('全員休整完畢，體力已大幅恢復！', 'success');
      });
    });

    elements.eventDetails.querySelector('.btn-shop-rob')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'rob' }, (res) => {
        btn.disabled = false;
        if (res && !res.success) showToast(res.message, 'danger');
      });
    });

    elements.eventDetails.querySelector('.btn-shop-steal')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      socket.emit('event:shop_action', { action: 'steal' }, (res) => {
        btn.disabled = false;
        if (res && !res.success) showToast(res.message, 'danger');
      });
    });

    elements.eventDetails.querySelector('.btn-shop-leave')?.addEventListener('click', (e) => {
      hideItemTooltip(true);
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = `${getIconSvg('check', 'ui-icon--sm')} <span>已準備...</span>`;
      socket.emit('event:shop_action', { action: 'leave' }, (res) => {
        if (res && !res.success) {
          showToast(res.message || '操作失敗', 'danger');
          btn.disabled = false;
        }
      });
    });

  } else if (ev.type === 'chest') {
    elements.eventCardBox?.classList.remove('is-shop-event');
    elements.eventIcon.innerHTML = getIconSvg('chest', 'svg-hero-icon');
    elements.eventTitle.textContent = (ev.title || '發現寶箱！').replace(/^[📦🎁\s]+/, '');

    if (!ev.opened) {
      elements.eventDetails.innerHTML = `
        <div class="normal-chest-container" style="text-align:center;padding:20px 10px;">
          <div style="margin-bottom:14px;color:var(--color-brass-bright);">
            ${getIconSvg('chest', 'svg-large')}
          </div>
          <p style="color:var(--color-text-secondary);font-size:14px;margin-bottom:20px;line-height:1.7;">
            深淵角落中靜靜躺著一具精緻的封印寶箱，周遭瀰漫著神秘微光……
          </p>
          <div class="chest-actions-row" style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-chest-action btn-chest-open">
              ${getIconSvg('sparkle', 'ui-icon--sm')}
              <span>開啟寶箱</span>
            </button>
            <button type="button" class="btn btn-ghost btn-chest-action btn-chest-leave">
              ${getIconSvg('leave', 'ui-icon--sm')}
              <span>繞道而行</span>
            </button>
          </div>
        </div>
      `;
      elements.eventDetails.querySelector('.btn-chest-open')?.addEventListener('click', (e) => {
        e.currentTarget.disabled = true;
        socket.emit('event:chest_action', { action: 'open' }, (res) => {
          if (res?.success && window.RewardPresentation) {
            if (res.goldGain) RewardPresentation.enqueue({ type: 'gold', amount: res.goldGain });
            if (res.drop) RewardPresentation.enqueue({ type: 'item', item: res.drop, title: '寶箱戰利品' });
          }
        });
      });
      elements.eventDetails.querySelector('.btn-chest-leave')?.addEventListener('click', () => {
        socket.emit('event:chest_action', { action: 'leave' });
      });
    } else {
      elements.eventDetails.innerHTML = `
        <div class="normal-chest-container" style="text-align:center;padding:16px;">
          <div class="normal-chest-loot" style="background:var(--surface-inset);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;">
            <p style="display:flex;align-items:center;justify-content:center;gap:6px;color:var(--color-loot-gold);font-weight:700;margin-bottom:8px;">
              ${getIconSvg('gold', 'ui-icon--sm')} 金幣獎勵：<b>+${ev.goldGain || 30} G</b>
            </p>
            ${ev.drop ? `
              <p style="display:flex;align-items:center;justify-content:center;gap:6px;color:var(--color-warm-white);font-weight:700;margin-bottom:8px;">
                ${getIconSvg('chest', 'ui-icon--sm')} 獲得裝備：<b>【${escapeHtml(ev.drop.name)}】</b>
              </p>
            ` : ''}
            <p style="display:flex;align-items:center;justify-content:center;gap:6px;color:var(--color-success);font-weight:700;">
              ${getIconSvg('heal', 'ui-icon--sm')} 探險療癒：全員生命回復 <b>+25 HP</b>
            </p>
          </div>
          <button type="button" class="btn btn-primary btn-chest-action btn-chest-leave">
            ${getIconSvg('leave', 'ui-icon--sm')}
            <span>收下戰利品前進 ›</span>
          </button>
        </div>
      `;
      elements.eventDetails.querySelector('.btn-chest-leave')?.addEventListener('click', () => {
        socket.emit('event:chest_action', { action: 'leave' });
      });
    }
  } else if (ev.type === 'random_event') {
    elements.eventCardBox?.classList.remove('is-shop-event');
    const subTypeIcon = ev.subType === 'WANDERING_MERCHANT' ? 'camp' : (ev.subType === 'ALTAR' ? 'torii' : (ev.subType === 'GAMBLE' ? 'dice' : 'anvil'));
    elements.eventIcon.innerHTML = getIconSvg(subTypeIcon, 'svg-hero-icon');
    elements.eventTitle.textContent = (ev.title || '神秘據點').replace(/^[🏕️⛩️🎲⚒️\s]+/, '');

    const leaderRole = roomState.lockedLeaderRole;

    if (ev.subType === 'REFORGE') {
      renderReforgeEvent(ev);
    } else if (ev.subType === 'GAMBLE') {
      renderGambleEvent(ev);
    } else {
      let actionsHtml = '';
      if (ev.subType === 'WANDERING_MERCHANT') {
        actionsHtml = `
          <button type="button" class="btn-rand-action" data-act="info">
            ${getIconSvg('camp', 'ui-icon--sm')}
            <span>打探路況情報 (${leaderRole === 'bard' ? '免費' : '15G'})</span>
          </button>
          <button type="button" class="btn-rand-action" data-act="barter">
            ${getIconSvg('chest', 'ui-icon--sm')}
            <span>以物易物 (隨機交換小隊背包首件物品)</span>
          </button>
          ${leaderRole === 'dreamweaver' ? `
            <button type="button" class="btn-rand-action" data-act="reshape">
              ${getIconSvg('sparkle', 'ui-icon--sm')}
              <span>幻象重塑 (織夢術士專屬重塑配飾)</span>
            </button>
          ` : ''}
        `;
      } else if (ev.subType === 'ALTAR') {
        actionsHtml = `
          <button type="button" class="btn-rand-action" data-act="sacrifice">
            ${getIconSvg('torii', 'ui-icon--sm')}
            <span>鮮血獻祭 (${leaderRole === 'warrior' ? '扣10%HP' : '扣20%HP'}，全員永久+3攻擊 & T2裝備)</span>
          </button>
          <button type="button" class="btn-rand-action" data-act="desecrate">
            ${getIconSvg('gold', 'ui-icon--sm')}
            <span>搜刮祭壇 (+60G & T1裝備${leaderRole === 'onmyoji' ? '，陰陽師免除詛咒' : '，受減防詛咒'})</span>
          </button>
          ${leaderRole === 'paladin' ? `
            <button type="button" class="btn-rand-action" data-act="purify">
              ${getIconSvg('shield', 'ui-icon--sm')}
              <span>聖光淨化 (聖騎士專屬免代價回復30%HP與15護盾)</span>
            </button>
          ` : ''}
        `;
      }

      elements.eventDetails.innerHTML = `
        <div class="rand-event-container altar-container">
          <div class="rand-event-actions">${actionsHtml}</div>
          <button type="button" class="btn btn-ghost btn-rand-action btn-rand-leave" data-act="leave">
            ${getIconSvg('leave', 'ui-icon--sm')}
            <span>離開據點 ›</span>
          </button>
        </div>
      `;

      elements.eventDetails.querySelectorAll('.btn-rand-action').forEach(b => {
        b.onclick = () => {
          b.disabled = true;
          const act = b.dataset.act;
          socket.emit('event:random_action', { action: act }, (res) => {
            b.disabled = false;
            if (res && !res.success) {
              alert(res.message);
            } else if (res?.success && window.RewardPresentation) {
              const reward = res.item || res.rewardItem || res.drop;
              if (reward) RewardPresentation.enqueue({ type: 'item', item: reward, title: '事件戰利品' });
              if (res.goldGain) RewardPresentation.enqueue({ type: 'gold', amount: res.goldGain });
            }
          });
        };
      });
    }
  }

  const storyText = ev.story || '';
  const finishNarrative = () => {
    if (interactiveEventNarrativeDone) return;
    interactiveEventNarrativeDone = true;
    currentTypewriterContext?.cancel?.();
    if (elements.eventStoryText) elements.eventStoryText.textContent = storyText;
    elements.eventCardBox?.classList.remove('event-narrative-playing');
    if (ev.type === 'shop') {
      elements.eventCardBox?.classList.add('is-shop-event');
    }
    if (elements.eventDetails) {
      elements.eventDetails.style.display = 'block';
      requestAnimationFrame(() => {
        elements.eventDetails.classList.add('is-interactive-ready');
      });
    }
  };

  if (!interactiveEventNarrativeDone && storyText) {
    elements.eventCardBox?.classList.remove('is-shop-event');
    elements.eventCardBox?.classList.add('event-narrative-playing');
    if (elements.eventDetails) {
      elements.eventDetails.style.display = 'none';
      elements.eventDetails.classList.remove('is-interactive-ready');
    }
    typeWriterEffect(elements.eventStoryText, storyText, 25, finishNarrative);

    const skipHandler = () => {
      elements.eventCardBox?.removeEventListener('click', skipHandler);
      finishNarrative();
    };
    elements.eventCardBox?.addEventListener('click', skipHandler, { once: true });
  } else {
    elements.eventCardBox?.classList.remove('event-narrative-playing');
    if (ev.type === 'shop') {
      elements.eventCardBox?.classList.add('is-shop-event');
    }
    if (elements.eventStoryText) elements.eventStoryText.textContent = storyText;
    if (elements.eventDetails) {
      elements.eventDetails.style.display = 'block';
      elements.eventDetails.classList.add('is-interactive-ready');
    }
  }
}

// ==========================================
// Phase 5: 深淵遭遇與四階段對話系統
// ==========================================
function renderAbyssDialogue(me, isLeader) {
  const abyss = roomState?.abyssState;
  if (!abyss) return;

  if (elements.abyssBossAvatar) {
    syncAbyssDialoguePortrait(elements.abyssBossAvatar,abyss);
  }
  if (elements.abyssBossName) {
    elements.abyssBossName.textContent = abyss.bossName || '深淵化身';
  }
  if (elements.abyssStageTag) {
    const titles = {
      1: '階段 1/4 · 命運的相逢',
      2: '階段 2/4 · 哲思與嘲諷',
      3: '階段 3/4 · 深淵的抉擇',
      4: '階段 4/4 · 命運的終局'
    };
    elements.abyssStageTag.textContent = titles[abyss.stage] || `階段 ${abyss.stage}/4`;
  }
  if (elements.abyssDialogueTextBox) {
    elements.abyssDialogueTextBox.textContent = abyss.dialogueText || '……';
  }

  if (abyss.stage === 3) {
    elements.abyssActionsContainer?.classList.add('hidden');
    elements.abyssChoicesContainer?.classList.remove('hidden');

    const choices = abyss.choices || [
      { id: 'apology', label: '謝罪求和', desc: '低頭向昔日夥伴哀求原諒，承擔懦弱的代價' },
      { id: 'rational', label: '理性析構', desc: '冷靜分析方程式，以智慧重構破綻' },
      { id: 'provoke', label: '譏諷挑釁', desc: '拔劍怒斥昔日同伴，激起深淵狂怒' }
    ];

    const myVote = abyss.votes?.[myId];
    const voteCounts = { apology: 0, rational: 0, provoke: 0 };
    for (const v of Object.values(abyss.votes || {})) {
      if (voteCounts[v] !== undefined) voteCounts[v] += 1;
    }

    elements.abyssChoicesContainer.innerHTML = choices.map(c => `
      <button type="button" class="btn-abyss-choice ${myVote === c.id ? 'voted' : ''}" data-id="${c.id}">
        <div class="choice-title-row">
          <span class="choice-label">${escapeHtml(c.label)}</span>
          <span class="choice-votes">票數：${voteCounts[c.id] || 0}</span>
        </div>
        <div class="choice-desc">${escapeHtml(c.desc)}</div>
      </button>
    `).join('');

    elements.abyssChoicesContainer.querySelectorAll('.btn-abyss-choice').forEach(b => {
      b.onclick = () => {
        socket.emit('abyss:vote', { choiceId: b.dataset.id });
      };
    });
  } else {
    elements.abyssChoicesContainer?.classList.add('hidden');
    elements.abyssActionsContainer?.classList.remove('hidden');

    if (elements.btnAdvanceAbyss) {
      elements.btnAdvanceAbyss.textContent = abyss.stage === 4 ? '拔劍迎戰！(ENTER BATTLE)' : '繼續聆聽 (ADVANCE) ›';
      elements.btnAdvanceAbyss.onclick = () => {
        socket.emit('abyss:advance_stage');
      };
    }
  }
}

// 註冊紅眼閃爍演出
socket.on('abyss:red_eye_flash', () => {
  const overlay = elements.abyssRedEyeOverlay;
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('abyss-red-eye-anim');
    setTimeout(() => {
      overlay.classList.remove('abyss-red-eye-anim');
      overlay.classList.add('hidden');
    }, 1500);
  }
});

// 行囊視窗按鈕綁定
elements.btnOpenInventory?.addEventListener('click', toggleInventoryModal);
elements.btnCloseInventoryModal?.addEventListener('click', closeInventoryModal);
elements.inventoryModal?.addEventListener('click', (e) => {
  if (e.target === elements.inventoryModal) {
    closeInventoryModal();
  }
});

// 行囊開啟/關閉狀態即時同步 HUD 按鈕 (bag1.webp / bag2.webp)
if (elements.inventoryModal) {
  const invObserver = new MutationObserver(() => {
    updateHudInventoryButtonState();
  });
  invObserver.observe(elements.inventoryModal, { attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
}
preloadBagAssets();
updateHudInventoryButtonState();
window.addEventListener('studio:content-ready', () => {
  preloadBagAssets();
  updateHudInventoryButtonState();
});
elements.btnToggleCraftingPanel?.addEventListener('click', () => {
  if (!elements.craftingPanelBody) return;
  const isHidden = elements.craftingPanelBody.classList.toggle('hidden');
  if (elements.craftingToggleArrow) {
    elements.craftingToggleArrow.textContent = isHidden ? '▼' : '▲';
  }
});

window.addEventListener('scroll', () => {
  if (typeof hideEnemyTooltip === 'function') hideEnemyTooltip();
  if (typeof hideItemTooltip === 'function') hideItemTooltip();
}, { passive: true });

window.addEventListener('resize', () => {
  if (typeof hideEnemyTooltip === 'function') hideEnemyTooltip();
  if (typeof hideItemTooltip === 'function') hideItemTooltip();
}, { passive: true });

// ============================================================================
// 統一 Modal 與 Escape 關閉管理系統 (Modal Dismissal & Accessibility Manager)
// ============================================================================
function closeDiscardConfirmModal() {
  pendingDiscardSlot = null;
  if (elements.discardConfirmModal) {
    if (window.ModalMotion) {
      ModalMotion.hide(elements.discardConfirmModal);
    } else {
      elements.discardConfirmModal.classList.add('hidden');
    }
  }
}
window.closeDiscardConfirmModal = closeDiscardConfirmModal;

function isModalVisible(modalEl) {
  if (!modalEl) return false;
  return !modalEl.classList.contains('hidden') && (modalEl.classList.contains('is-open') || modalEl.style.display !== 'none');
}

// 嚴格鎖定：必要流程 Modal (裝備領取 #equipDropModal, 戰鬥目標選擇 #targetModal) 禁止點擊背景關閉
[elements.equipDropModal, elements.targetModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
});

// 全域 Escape 鍵統一關閉管理
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // 1. 若獎勵佇列正在演出，按 Escape 可跳過演出
  if (window.RewardPresentation?.isPlaying) {
    window.RewardPresentation.skip();
    return;
  }

  // 2. 關閉懸浮 Tooltip
  if (typeof hideEnemyTooltip === 'function') hideEnemyTooltip();
  if (typeof hideItemTooltip === 'function') hideItemTooltip(true);

  // 3. 嚴格防護：若當前處於必要流程 Modal (裝備領取 / 戰鬥目標選擇)，不得按 ESC 關閉
  if (isModalVisible(elements.equipDropModal) || isModalVisible(elements.targetModal)) {
    return;
  }

  // 4. 依照層級依序關閉最上層的非必要 Modal
  if (isModalVisible(elements.inventoryModal)) {
    closeInventoryModal();
  } else if (isModalVisible(elements.profileModal)) {
    closeProfileModal();
  } else if (isModalVisible(elements.directConnectModal)) {
    closeDirectConnectModal();
  } else if (isModalVisible(elements.roleDetailModal)) {
    hideRoleDetailModal();
  } else if (isModalVisible(elements.minionDetailModal)) {
    hideMinionDetailModal();
  } else if (isModalVisible(elements.transferLeaderModal)) {
    closeTransferLeaderModal();
  } else if (isModalVisible(elements.discardConfirmModal)) {
    closeDiscardConfirmModal();
  } else if (isModalVisible(elements.avatarModalOverlay)) {
    closeAvatarModal();
  }
});

// 德魯伊隊長主動技：自在化形選擇彈窗
function openDruidTransformModal() {
  const existing = document.getElementById('druidTransformModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'druidTransformModal';
  modal.className = 'modal-backdrop is-active';
  modal.style.zIndex = '99999';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:440px;text-align:center;padding:24px;border:1.5px solid var(--rarity-exclusive,#ffd700);box-shadow:0 12px 36px rgba(0,0,0,0.7);">
      <h3 style="font-size:18px;font-weight:700;color:var(--ui-text-primary);margin-bottom:10px;">👑【自在化形】選擇化身形態</h3>
      <p style="font-size:13px;color:var(--ui-text-muted);margin-bottom:18px;line-height:1.5;">德魯伊隊長技：請自選本回合轉變的形態（每場戰鬥限使用一次）</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button type="button" class="btn btn-primary btn-choose-wolf" style="padding:12px;font-size:14px;font-weight:700;display:flex;flex-direction:column;gap:4px;align-items:center;">
          <span style="font-size:15px;">🐺 化身為【狼人形態】</span>
          <span style="font-size:12px;opacity:0.85;">暫扣最大生命，本回合造成傷害提升至 40 點（持續2回合）</span>
        </button>
        <button type="button" class="btn btn-success btn-choose-treant" style="padding:12px;font-size:14px;font-weight:700;display:flex;flex-direction:column;gap:4px;align-items:center;">
          <span style="font-size:15px;">🌳 化身為【遠古樹精】</span>
          <span style="font-size:12px;opacity:0.85;">獲得85%生命護盾，減傷30%，替全體隊友承傷50%（持續2回合）</span>
        </button>
        <button type="button" class="btn btn-ghost btn-cancel-transform" style="margin-top:6px;">取消返回</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.btn-choose-wolf').onclick = () => {
    currentPendingAction = 'dru_form_wolf';
    currentPendingTarget = null;
    modal.remove();
    playSound('click');
    renderMyActionBar(getMyPlayer());
  };
  modal.querySelector('.btn-choose-treant').onclick = () => {
    currentPendingAction = 'dru_form_treant';
    currentPendingTarget = null;
    modal.remove();
    playSound('click');
    renderMyActionBar(getMyPlayer());
  };
  modal.querySelector('.btn-cancel-transform').onclick = () => {
    modal.remove();
  };
}
