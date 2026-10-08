// Boss and round choreography share the existing Presentation Root and wait/abort contract.
function createBattlePhaseStage(className, context = {}) {
  const root = document.getElementById('presentationRoot');
  if (!root) return null;
  const stage = document.createElement('div');
  stage.className = className;
  stage.style.setProperty('--phase-speed', context.speed || 1);
  stage.dataset.reducedMotion = String(context.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  root.appendChild(stage);
  return stage;
}

const BOSS_ENCOUNTER_STORIES = Object.freeze({
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
});

function resolveRouteBossStory(routeId, bossName) {
  const cleanName = (bossName || '').replace(/^【削弱】/, '');
  const stories = BOSS_ENCOUNTER_STORIES[routeId] || BOSS_ENCOUNTER_STORIES['route_trail'];
  if (stories && stories[cleanName]) return stories[cleanName];
  for (const r of Object.values(BOSS_ENCOUNTER_STORIES)) {
    if (r[cleanName]) return r[cleanName];
  }
  return `前方的迷霧驟然撕裂，強大的魔物【${cleanName || '首領'}】帶著無盡殺意現身！`;
}

async function typeBossStoryParagraphs(container, paragraphs, signal, timing, onHalfway, speed = 1) {
  container.replaceChildren();
  const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const halfway = Math.max(1, Math.floor(totalChars / 2));
  let typedCount = 0;
  let halfwayTriggered = false;

  for (let index = 0; index < paragraphs.length; index++) {
    if (signal?.aborted) return;
    const paragraph = document.createElement('p');
    container.appendChild(paragraph);
    const characters = Array.from(paragraphs[index]);
    for (let charIndex = 0; charIndex < characters.length; charIndex++) {
      if (signal?.aborted) return;
      await waitForPresentation((timing?.character || 40) / speed, signal);
      const character = characters[charIndex];
      paragraph.appendChild(document.createTextNode(character));
      typedCount++;
      if (charIndex % 2 === 1 && !/\s/.test(character)) {
        if (typeof playTypewriterClick === 'function') playTypewriterClick();
      }
      if (!halfwayTriggered && typedCount >= halfway) {
        halfwayTriggered = true;
        if (typeof onHalfway === 'function') onHalfway();
      }
      const pause = /[，、,；;：:]/.test(character) ? (timing?.comma || 140)
        : /[。！？!?…]/.test(character) ? (timing?.sentence || 280)
        : character === '\n' ? (timing?.newline || 380) : 0;
      if (pause) await waitForPresentation(pause / speed, signal);
    }
    if (index < paragraphs.length - 1) {
      await waitForPresentation((timing?.paragraph || 600) / speed, signal);
    }
  }
  if (!halfwayTriggered && typeof onHalfway === 'function') {
    onHalfway();
  }
}

async function playBossIntro(monster, context = {}) {
  await sfxManager.preload();
  document.querySelector('.encounter-scene-snapshot')?.remove();
  if (context.signal?.aborted) return;
  const stage = createBattlePhaseStage('boss-encounter-stage', context);
  if (!stage) return;
  const wait = ms => waitForPresentation(ms, context.signal, context.speed);
  const beat = name => context.onTiming?.(name, performance.now());
  const timing = PRESENTATION_CONFIG.bossEncounter;
  const audio = createSfxPresentationScope(context);
  const sound = name => context.playSound ? context.playSound(name, { signal: context.signal }) : audio.play(name);
  stage.style.setProperty('--darken-duration', `${timing.darkenDuration}ms`);
  stage.innerHTML = `<div class="boss-encounter-backdrop"></div>
    <div class="boss-encounter-layout game-container">
      <header class="app-header" style="visibility: hidden; opacity: 0; pointer-events: none;"></header>
      <main class="main-content" style="background: transparent; border: 0; box-shadow: none; backdrop-filter: none; pointer-events: none;">
        <div class="boss-encounter-story-section exploration-trap enter">
          <div class="boss-encounter-story exploration-trap-story" aria-live="off"></div>
        </div>
      </main>
    </div>
    <div class="boss-encounter-impact-stage">
      <div class="boss-warning" hidden><div class="boss-warning-strip"></div><div class="boss-warning-copy"><strong>WARNING</strong><span>偵測到敵對存在 · ENEMY ENCOUNTER</span></div></div>
      <div class="boss-entry-flash"></div>
      <div class="boss-encounter-art"></div>
      <div class="boss-encounter-name"><h1></h1><span></span></div><div class="boss-encounter-resistances"></div>
    </div>`;
  const storySection = stage.querySelector('.boss-encounter-story-section');
  const storyElement = stage.querySelector('.boss-encounter-story');
  const warning = stage.querySelector('.boss-warning');
  const impact = stage.querySelector('.boss-encounter-impact-stage');
  const art = stage.querySelector('.boss-encounter-art');
  const name = stage.querySelector('.boss-encounter-name');
  name.querySelector('h1').textContent = monster.name || 'ABYSS LORD';
  name.querySelector('span').textContent = monster.isWeakened ? 'WEAKENED' : 'ABYSS LORD';
  const resistance = monster.resistances || {};
  stage.querySelector('.boss-encounter-resistances').textContent = '本次抗性 · 物理 ' + (resistance.physical ?? monster.physicalResistance ?? 0) + '% · 魔法 ' + (resistance.magic ?? monster.magicResistance ?? 0) + '% · 效果 ' + (resistance.effect ?? monster.effectResistance ?? 0) + '%';
  if (monster.avatar) {
    const image = document.createElement('img');
    image.src = monster.avatar; image.alt = monster.name || 'Boss';
    art.appendChild(image);
  }
  try {
    if (context.segment !== 'reveal') {
      const routeId = context.routeId ||
        (typeof roomState !== 'undefined' ? (roomState?.currentTransition?.routeId || roomState?.currentMonster?.routeId) : null) ||
        'route_trail';
      const rawStory = monster.encounterStory ||
        resolveRouteBossStory(routeId, monster.originalName || monster.name);
      const paragraphs = (rawStory || '').split(/\n\s*\n/).filter(Boolean);

      let warningTriggered = false;
      let warningAudioStartTime = 0;
      let warningPromise = null;

      const triggerWarning = () => {
        if (warningTriggered) return;
        warningTriggered = true;
        stage.classList.add('is-darkening');
        beat('encounter_darken');

        warningPromise = (async () => {
          if (typeof bgmManager !== 'undefined') void bgmManager.prepareBoss(context.signal);
          warningAudioStartTime = performance.now();
          void sound('boss_warning');
          beat('warning_audio_start');

          await wait(timing.warningRevealAt || 3000);

          warning.hidden = false;
          warning.classList.add('is-entering');
          beat('warning_entry');
          await wait(timing.warningEntry);
          beat('warning_hold');
          await wait(timing.warningHold);
          warning.classList.add('is-exiting');
          beat('warning_exit');
          await wait(timing.warningExit);
          warning.hidden = true;
          beat('warning_complete');
        })();
      };

      if (paragraphs.length) {
        await typeBossStoryParagraphs(storyElement, paragraphs, context.signal, timing, () => {
          triggerWarning();
        }, context.speed || 1);
      }

      if (!warningTriggered) {
        triggerWarning();
      }

      await wait(600);
      storySection?.classList.add('is-exiting');
      await wait(350);
      storySection?.remove();

      if (warningPromise) {
        await warningPromise;
      }

      if (context.segment === 'warning') return;
    } else {
      storySection?.remove();
      stage.classList.add('is-darkening');
    }

    await wait(timing.preBossBeat);
    impact.classList.add('is-pre-tremor'); beat('boss_rumble');
    if (typeof bgmManager !== 'undefined') await bgmManager.bossEntrance(context);
    else sound('boss_entrance');
    sfxManager.duck('boss_warning', .4);

    // Audio buildup: wait 1 second (1000ms / speed) before boss appearance!
    await wait(1000);

    // 1 second into entrance audio: BOOM and Boss appears!
    impact.classList.remove('is-pre-tremor'); impact.classList.add('is-boom');
    art.classList.add('is-entering'); beat('boss_boom'); beat('boss_art_entry');
    await wait(timing.bossSettle); beat('boss_art_settle');
    name.classList.add('is-entering'); beat('boss_name_entry'); await wait(300);
    beat('boss_hold'); await wait(timing.bossHold); await audio.hold();
    beat('boss_portrait_handoff');
    await handoffBossPortrait(stage, art, context);
    return { hudRevealed: true };
  } finally {
    if (context.signal?.aborted && typeof bgmManager !== 'undefined') bgmManager.reset();
    stage.remove();
    document.querySelector('.encounter-scene-snapshot')?.remove();
    beat('boss_complete');
  }
}

async function playRoundStartBanner(round, context = {}) {
  const stage = createBattlePhaseStage('round-start-overlay', context);
  if (!stage) return;
  const wait = ms => waitForPresentation(ms, context.signal, context.speed);
  const beat = name => context.onTiming?.(name, performance.now());
  stage.innerHTML = '<div class="round-start-banner"><div class="round-start-strip"></div><strong class="round-start-main"></strong><span class="round-start-sub"></span></div>';
  stage.querySelector('.round-start-main').textContent = `ROUND ${round}`;
  stage.querySelector('.round-start-sub').textContent = context.phase || 'ADVENTURER PHASE';
  try {
    (context.playSound || playSound)('round_start');
    stage.classList.add('is-entering'); beat('round_strip_entry');
    await wait(90); beat('round_main_entry'); await wait(90); beat('round_sub_entry');
    await wait(320); beat('round_hold'); await wait(550);
    stage.classList.add('is-exiting'); beat('round_sub_exit');
    await wait(90); beat('round_main_exit'); await wait(90); beat('round_strip_exit');
    await wait(180);
  } finally { stage.remove(); beat('round_complete'); }
}

// Production handoff helper; Lab calls this same sequence with a HUD callback.
async function playBattlePhaseOpening(monster, round, context = {}) {
  if (context.encounter) {
    const intro=await playBossIntro(monster, context);
    if(!intro?.hudRevealed)await context.revealHud?.();
    context.onTiming?.('battle_hud_reveal', performance.now());
    await waitForPresentation(400, context.signal, context.speed);
    await waitForPresentation(250, context.signal, context.speed);
  }
  await playRoundStartBanner(round, context);
}

// Fade the encounter scenery while the same portrait settles into the battle HUD.
async function handoffBossPortrait(stage,art,context){
 const source=art.querySelector('img'),from=source?.getBoundingClientRect();
 await context.revealHud?.();
 const target=document.getElementById('monsterAvatar'),to=target?.getBoundingClientRect();
 const animations=[];let flight;const visibility=target?.style.visibility;
 const duration=(stage.dataset.reducedMotion==='true'?300:1000)/(context.speed||1);
 const animate=(node,frames)=>{if(node)animations.push(node.animate(frames,{duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'}));};
 const abort=()=>animations.forEach(animation=>animation.cancel());
 context.signal?.addEventListener('abort',abort,{once:true});
 try{
  if(context.signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(source&&from?.width&&to?.width&&stage.dataset.reducedMotion!=='true'){
   flight=document.createElement('div');flight.className='boss-portrait-flight';
   flight.appendChild(source.cloneNode(true));stage.appendChild(flight);
   art.style.visibility='hidden';target.style.visibility='hidden';
   animate(flight,[{left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',borderRadius:'0px'},{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px',borderRadius:getComputedStyle(target).borderRadius}]);
  }
  animate(stage,[{backgroundColor:getComputedStyle(stage).backgroundColor},{backgroundColor:'transparent'}]);
  animate(stage.querySelector('.boss-encounter-backdrop'),[{opacity:1},{opacity:0}]);
  animate(stage.querySelector('.boss-encounter-impact-stage'),[{opacity:1},{opacity:0}]);
  await waitForPresentation(duration,context.signal);
 }finally{
  context.signal?.removeEventListener('abort',abort);abort();flight?.remove();
  if(target)target.style.visibility=visibility;
 }
}
