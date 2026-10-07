// Visual routines transplanted from temp/script.js; queue, audio and HP remain production-owned.
async function playStargazerPresentation(step, context = {}) {
  // Lab speed is absolute; production casts default to half the queue's playback rate.
  context = {...context, speed: context.mode === 'lab' ? (context.speed ?? .5) : (context.speed ?? 1) * .5};
  return withSkillPresentationStage(step, context, async s => {
    s.root.classList.add('stargazer-prototype-stage');
    s.root.style.setProperty('--stargazer-breathe', (1.5 / context.speed) + 's');
    const fx = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fx.setAttribute('viewBox', '0 0 1440 810'); fx.classList.add('skill-fx-layer', 'stargazer-prototype-fx'); s.frame.appendChild(fx);
    const document = {getElementById: id => fx.querySelector('#' + id)};
    const targetUnit = s.cards.get('monster')?.parentElement || s.el('div', 'stargazer-empty-target');
    const skillName = s.frame.querySelector('.skill-production-title');
    const strip = s.el('div', 'stargazer-action-strip');
    const reveal = s.el('div', 'skill-reveal');
    // Display authoritative result names, including the original special terminology.
    const actorStatus = {style: reveal.style, set innerText(value) {reveal.textContent = step.outcome?.label || value;}};
    const getStageCenter = () => ({cx:720, cy:405});
    const cues = {focus:'mage_skill2', snap:'magic_impact', barrier_hit:'shield_block', heavy_impact:'physical_hit', blade_spin:'air_pass', overload_glitch:'magic_impact', slash:'warrior_basic', whiff_drop:'air_pass'};
    const sfx = {play: key => context.audioScope.play(cues[key], {noHold:true})};
    const tl = {
      get isAborted() {return s.signal.aborted;},
      sec: seconds => (seconds / context.speed) + 's',
      async wait(ms) {await s.wait(ms); if(s.signal.aborted) throw new DOMException('Presentation aborted', 'AbortError');}
    };
  function getOrbitPos(rx, ry, tiltDeg, angle) {
    const rad = (tiltDeg * Math.PI) / 180;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    return {
      x: x * Math.cos(rad) - y * Math.sin(rad),
      y: x * Math.sin(rad) + y * Math.cos(rad)
    };
  }

  function generateArcPath(rx, ry, tiltDeg, curAngle, trailSpan) {
    let d = '';
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = curAngle - trailSpan * (1 - i / steps);
      const p = getOrbitPos(rx, ry, tiltDeg, a);
      d += (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
    }
    return d;
  }

  function getAmbientStarsMarkup() {
    const starPositions = [
      { x: -250, y: -120, s: 0.8, op: 0.5 },
      { x: -190, y: 110,  s: 0.6, op: 0.6 },
      { x: -280, y: 10,   s: 1.0, op: 0.8 },
      { x: -140, y: -160, s: 0.5, op: 0.4 },
      { x: 240,  y: -130, s: 0.8, op: 0.5 },
      { x: 280,  y: 40,   s: 0.9, op: 0.7 },
      { x: 190,  y: 130,  s: 0.6, op: 0.6 },
      { x: 150,  y: -160, s: 0.5, op: 0.4 },
      { x: -90,  y: 170,  s: 0.7, op: 0.6 },
      { x: 90,   y: 170,  s: 0.7, op: 0.6 }
    ];

    return starPositions.map(p => `
      <polygon class="ambient-star" transform="translate(${p.x}, ${p.y}) scale(${p.s})"
        points="0,-12 3,-3 12,0 3,3 0,12 -3,3 -12,0 -3,-3"
        opacity="${p.op}"
      />
    `).join('');
  }

  function getCelestialIconSvgMarkup(type) {
    if (type === 'constellation') {
      return `
        <g class="celestial-display-icon" transform="scale(0.85)">
          <g transform="translate(-45, -40)">
            <polyline points="0,55 35,10 65,42 52,85 0,55" fill="rgba(255,255,255,0.12)" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="35" y1="10" x2="68" y2="2" stroke="#ffffff" stroke-dasharray="6,6" stroke-width="3"/>
            <line x1="68" y1="2" x2="92" y2="-6" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
            <circle cx="0" cy="55" r="8" fill="#ffffff"/>
            <circle cx="35" cy="10" r="9" fill="#ffffff"/>
            <circle cx="65" cy="42" r="8" fill="#ffffff"/>
            <circle cx="52" cy="85" r="9" fill="#ffffff"/>
            <circle cx="92" cy="-6" r="8.5" fill="#ffffff"/>
            <polygon points="85,32 88,38 95,39 90,44 91,50 85,46 79,50 81,44 76,39 82,38" fill="#ffffff"/>
            <polygon points="80,72 82,77 88,78 83,82 85,88 80,84 74,88 76,82 71,78 77,77" fill="#ffffff"/>
          </g>
        </g>
      `;
    } else if (type === 'planet') {
      return `
        <g class="celestial-display-icon" transform="scale(0.95)">
          <ellipse cx="0" cy="0" rx="66" ry="26" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="14,10" transform="rotate(-30)" opacity="0.5"/>
          <circle cx="0" cy="0" r="40" fill="#0d1b2a" stroke="#ffffff" stroke-width="5"/>
          <path d="M -26,-26 A 40 40 0 0 1 26,26 Z" fill="rgba(255,255,255,0.18)"/>
          <path d="M -56,20 A 66 26 0 0 0 56,-20" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" transform="rotate(-30)"/>
        </g>
      `;
    } else if (type === 'galaxy') {
      return `
        <g class="celestial-display-icon" transform="scale(0.9)" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round">
          <circle cx="0" cy="0" r="10" fill="#ffffff"/>
          <path d="M 0,0 C 18,-12 40,-18 60,-6 C 72,0 76,18 70,34" />
          <path d="M 0,0 C -18,12 -40,18 -60,6 C -72,0 -76,-18 -70,-34" />
          <path d="M 0,0 C 12,18 18,40 6,60 C 0,72 -18,76 -34,70" />
          <path d="M 0,0 C -12,-18 -18,-40 -6,-60 C 0,-72 18,-76 34,-70" />
          <circle cx="40" cy="-32" r="3.5" fill="#ffffff" stroke="none"/>
          <circle cx="-40" cy="32" r="3.5" fill="#ffffff" stroke="none"/>
          <circle cx="32" cy="40" r="3" fill="#ffffff" stroke="none"/>
          <circle cx="-32" cy="-40" r="3" fill="#ffffff" stroke="none"/>
        </g>
      `;
    } else if (type === 'blackhole') {
      return `
        <g class="celestial-display-icon" transform="scale(0.88)">
          <g stroke="#ffffff" stroke-width="3.5" fill="none" opacity="0.9">
            <path d="M -16,-22 Q -45,-50 -68,-16 Q -45,6 -22,16" />
            <path d="M 22,-16 Q 50,-45 16,-68 Q -6,-45 -16,-22" />
            <path d="M 16,22 Q 45,50 68,16 Q 45,-6 22,-16" />
            <path d="M -22,16 Q -50,45 -16,68 Q 6,45 16,22" />
          </g>
          <circle cx="0" cy="0" r="30" fill="#050608" stroke="#ffffff" stroke-width="5"/>
          <circle cx="0" cy="0" r="18" fill="#000000"/>
          <polygon points="-52,-52 -50,-47 -45,-46 -49,-43 -47,-38 -52,-41 -57,-38 -55,-43 -59,-46 -54,-47" fill="#ffffff"/>
          <polygon points="52,52 50,47 45,46 49,43 47,38 52,41 57,38 55,43 59,46 54,47" fill="#ffffff"/>
        </g>
      `;
    } else {
      return '<g class="celestial-display-icon" fill="none" stroke="white" stroke-width="2"><g transform="translate(-120 -120)"><circle cx="120" cy="120" r="95" stroke-width="7"/><circle cx="120" cy="120" r="76" opacity=".6"/><circle cx="120" cy="120" r="55" opacity=".3"/></g></g>';
    }
  }

  function getReticleMarkup() {
    return `<g id="stargazerReticle" class="stargazer-reticle-frame" fill="none" stroke-linecap="square">
          <polyline points="-60,-35 -60,-60 -35,-60" stroke-width="3"/>
          <polyline points="35,-60 60,-60 60,-35" stroke-width="3"/>
          <polyline points="60,35 60,60 35,60" stroke-width="3"/>
          <polyline points="-35,60 -60,60 -60,35" stroke-width="3"/>
        </g>`;
  }

  async function runStargazerBasic() {
    const {cx, cy} = getStageCenter();
    const target = s.anchors.get('monster') || SKILL_STAGE.target;
    fx.innerHTML = `<g id="stargazerBasicAim" transform="translate(${cx}, ${cy})">${getReticleMarkup()}</g>`;
    const aim = document.getElementById('stargazerBasicAim');
    context.onTiming?.('stargazer_aim_start', {step, x:cx, y:cy});
    await tl.wait(180);
    await s.tick(500, p => {
      const progress = p * p * (3 - 2 * p);
      aim.setAttribute('transform', `translate(${cx + (target.x - cx) * progress}, ${cy + (target.y - cy) * progress})`);
    });
    if (s.signal.aborted) return;
    context.onTiming?.('stargazer_aim_contact', {step, x:target.x, y:target.y});
    await s.resolveResults();
    s.animate(aim, [{opacity:1}, {opacity:0}], 180);
    await tl.wait(180);
  }

  async function runStargazerObservation(tl, outcomeType, outcomeTitle) {
    targetUnit.style.display = 'none';
    skillName.innerText = '【天體觀測・深空探索】';
    strip.classList.add('active');
    skillName.classList.add('active');
    await tl.wait(250);

    sfx.play('focus');
    const { cx, cy } = getStageCenter();

    fx.innerHTML = `
      <g transform="translate(${cx}, ${cy})">
        <g id="ambientStarsGroup">${getAmbientStarsMarkup()}</g>
        ${getReticleMarkup()}
        <g id="starFlareNode" style="transform-origin: 0px 0px; opacity: 1; transition: opacity ${tl.sec(0.25)} ease-out, transform ${tl.sec(0.35)} ease-out;">
          <polygon class="stargazer-star-flare" points="0,-22 4.5,-4.5 22,0 4.5,4.5 0,22 -4.5,4.5 -22,0 -4.5,-4.5"/>
          <circle cx="0" cy="0" r="3.5" fill="#ffffff"/>
        </g>
        <g id="celestialSlot"></g>
      </g>
    `;

    await tl.wait(400);

    const flareNode = document.getElementById('starFlareNode');
    if (flareNode) {
      flareNode.style.transform = 'scale(2.2)';
      flareNode.style.opacity = '0';
    }
    await tl.wait(260);
    if (flareNode) flareNode.remove();

    const reticleNode = document.getElementById('stargazerReticle');
    if (outcomeType === 'boundary') {
      if (reticleNode) reticleNode.remove();
      sfx.play('barrier_hit');
    } else if (outcomeType === 'blackhole') {
      sfx.play('heavy_impact');
    } else {
      sfx.play('snap');
    }

    actorStatus.innerText = outcomeTitle;
    actorStatus.style.opacity = '1';

    const slot = document.getElementById('celestialSlot');
    if (slot) slot.innerHTML = getCelestialIconSvgMarkup(outcomeType);

    await tl.wait(900);
    strip.classList.remove('active');
    skillName.classList.remove('active');
  }

  // ==========================================
  // 9. 觀星者：【星軌干涉・時計重塑】核心動態引擎 (長曝光星軌 + 四向分支)
  // ==========================================
  async function runOrbitReshapeEvent(tl, eventType) {
    targetUnit.style.display = 'none'; // 全隊輔助，無目標 Boss
    skillName.innerText = '【星軌干涉・時計重塑】';
    strip.classList.add('active');
    skillName.classList.add('active');
    await tl.wait(250);

    sfx.play('focus');
    const { cx, cy } = getStageCenter();

    // 1. 建立渾天星軌基底 (3 道傾斜軌道環 + 方位盤 + 長曝光星軌層)
    fx.innerHTML = `
      <g transform="translate(${cx}, ${cy})">
        <g id="ambientStarsGroup">${getAmbientStarsMarkup()}</g>

        <!-- 渾天儀經緯方位盤刻度 (青色) -->
        <g stroke="var(--cyan)" stroke-width="1" opacity="0.4" fill="none">
          <circle cx="0" cy="0" r="145" stroke-dasharray="4,8"/>
          <line x1="-155" y1="0" x2="155" y2="0" stroke-dasharray="2,6"/>
          <line x1="0" y1="-155" x2="0" y2="155" stroke-dasharray="2,6"/>
          <polygon points="0,-148 4,-142 -4,-142" fill="var(--cyan)"/>
          <polygon points="0,148 4,142 -4,142" fill="var(--cyan)"/>
          <polygon points="-148,0 -142,4 -142,-4" fill="var(--cyan)"/>
          <polygon points="148,0 142,4 142,-4" fill="var(--cyan)"/>
        </g>

        <!-- 3 道立體傾斜公轉軌道基底環 -->
        <g id="orbitRingsBase">
          <ellipse class="orbit-ring" cx="0" cy="0" rx="60" ry="34" transform="rotate(-15)"/>
          <ellipse class="orbit-ring" cx="0" cy="0" rx="100" ry="56" transform="rotate(25)"/>
          <ellipse class="orbit-ring" cx="0" cy="0" rx="140" ry="78" transform="rotate(-38)"/>
        </g>

        <!-- 動態長曝光星軌光弧 -->
        <path id="trail1" class="orbit-trail" stroke-width="2.4" />
        <path id="trail2" class="orbit-trail" stroke-width="2.8" />
        <path id="trail3" class="orbit-trail" stroke-width="3.2" />

        <!-- 3 顆核心公轉星體 -->
        <circle id="star1" class="orbit-node" r="4.5" />
        <circle id="star2" class="orbit-node" r="5.5" />
        <circle id="star3" class="orbit-node" r="6.5" />

        <!-- 爆發/重置特效插槽 -->
        <g id="orbitEventSlot"></g>
      </g>
    `;

    const trail1 = document.getElementById('trail1');
    const trail2 = document.getElementById('trail2');
    const trail3 = document.getElementById('trail3');
    const star1 = document.getElementById('star1');
    const star2 = document.getElementById('star2');
    const star3 = document.getElementById('star3');
    const eventSlot = document.getElementById('orbitEventSlot');

    // ----------------------------------------------------
    // 前置動畫：星軌長曝光流動 (向前差速公轉蓄能，36 影格)
    // ----------------------------------------------------
    sfx.play('blade_spin');
    const preFrames = 36;
    let curAngle1 = 0;
    let curAngle2 = 0;
    let curAngle3 = 0;

    for (let f = 0; f <= preFrames; f++) {
      if (tl.isAborted) return;
      const p = f / preFrames;
      const trailSpan = Math.min(p * 2.2, 1) * Math.PI * 1.1;

      curAngle1 = p * Math.PI * 5.5;
      curAngle2 = -p * Math.PI * 4.0;
      curAngle3 = p * Math.PI * 2.6;

      const p1 = getOrbitPos(60, 34, -15, curAngle1);
      const p2 = getOrbitPos(100, 56, 25, curAngle2);
      const p3 = getOrbitPos(140, 78, -38, curAngle3);

      star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
      star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
      star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);

      trail1.setAttribute('d', generateArcPath(60, 34, -15, curAngle1, trailSpan));
      trail2.setAttribute('d', generateArcPath(100, 56, 25, curAngle2, -trailSpan));
      trail3.setAttribute('d', generateArcPath(140, 78, -38, curAngle3, trailSpan));

      await tl.wait(14);
    }

    // ----------------------------------------------------
    // 分支演出：4 種時空干涉結果
    // ----------------------------------------------------
    switch (eventType) {
      // ----------------------------------------------------
      // 事件 A：【軌道微調】(70%) - 星星優雅往回轉半圈 (180° / π rad)
      // ----------------------------------------------------
      case 'minor_shift': {
        sfx.play('snap');
        const rewindFrames = 26;
        const startA1 = curAngle1;
        const startA2 = curAngle2;
        const startA3 = curAngle3;

        for (let f = 0; f <= rewindFrames; f++) {
          if (tl.isAborted) return;
          const p = f / rewindFrames;
          const ease = Math.sin((p * Math.PI) / 2);

          const a1 = startA1 - ease * Math.PI;
          const a2 = startA2 + ease * Math.PI;
          const a3 = startA3 - ease * Math.PI;

          const span = (1 - p * 0.4) * Math.PI * 0.9;

          const p1 = getOrbitPos(60, 34, -15, a1);
          const p2 = getOrbitPos(100, 56, 25, a2);
          const p3 = getOrbitPos(140, 78, -38, a3);

          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);

          trail1.setAttribute('d', generateArcPath(60, 34, -15, a1, -span));
          trail2.setAttribute('d', generateArcPath(100, 56, 25, a2, span));
          trail3.setAttribute('d', generateArcPath(140, 78, -38, a3, -span));

          await tl.wait(14);
        }

        eventSlot.innerHTML = `
          <circle cx="0" cy="0" r="30" fill="none" stroke="#ffffff" stroke-width="2.5">
            <animate attributeName="r" values="30;140" dur="${tl.sec(0.55)}" fill="freeze" />
            <animate attributeName="opacity" values="1;0" dur="${tl.sec(0.55)}" fill="freeze" />
          </circle>
        `;

        actorStatus.innerText = '【軌道微調・CD -1】';
        actorStatus.style.opacity = '1';
        await tl.wait(750);
        break;
      }

      // ----------------------------------------------------
      // 事件 B：【超新星重啟】(10%) - 星星激昂倒轉一整圈 (360° / 2π)，純白衝擊波爆散（無大星星）
      // ----------------------------------------------------
      case 'supernova': {
        sfx.play('blade_spin');
        const fullRewindFrames = 30;
        const startA1 = curAngle1;
        const startA2 = curAngle2;
        const startA3 = curAngle3;

        for (let f = 0; f <= fullRewindFrames; f++) {
          if (tl.isAborted) return;
          const p = f / fullRewindFrames;
          const ease = p * p;

          const a1 = startA1 - ease * Math.PI * 2;
          const a2 = startA2 + ease * Math.PI * 2;
          const a3 = startA3 - ease * Math.PI * 2;

          const span = Math.PI * 1.4;

          const p1 = getOrbitPos(60, 34, -15, a1);
          const p2 = getOrbitPos(100, 56, 25, a2);
          const p3 = getOrbitPos(140, 78, -38, a3);

          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);

          trail1.setAttribute('d', generateArcPath(60, 34, -15, a1, -span));
          trail2.setAttribute('d', generateArcPath(100, 56, 25, a2, span));
          trail3.setAttribute('d', generateArcPath(140, 78, -38, a3, -span));

          await tl.wait(14);
        }

        // 抵達歸零點，純淨白熱衝擊波擴散（已移除大星星本體）
        sfx.play('heavy_impact');
        eventSlot.innerHTML = `
          <circle class="supernova-shockwave" cx="0" cy="0" r="10">
            <animate attributeName="r" values="10;175" dur="${tl.sec(0.45)}" fill="freeze" />
            <animate attributeName="opacity" values="1;0" dur="${tl.sec(0.45)}" fill="freeze" />
          </circle>
          <circle class="supernova-shockwave" cx="0" cy="0" r="5" stroke-dasharray="8,6" opacity="0.8">
            <animate attributeName="r" values="5;130" dur="${tl.sec(0.35)}" fill="freeze" />
            <animate attributeName="opacity" values="0.8;0" dur="${tl.sec(0.35)}" fill="freeze" />
          </circle>
        `;

        actorStatus.innerText = '【超新星重啟・CD 歸零】';
        actorStatus.style.opacity = '1';
        await tl.wait(900);
        break;
      }

      // ----------------------------------------------------
      // 事件 C：【過載躍遷】(10%) - 星星往後顫動縮回一點點，接著瞬間爆裂往前狂飆！
      // ----------------------------------------------------
      case 'overload': {
        sfx.play('overload_glitch');
        trail1.setAttribute('stroke', '#fc8181');
        trail2.setAttribute('stroke', '#fc8181');
        trail3.setAttribute('stroke', '#fc8181');

        for (let f = 0; f < 8; f++) {
          if (tl.isAborted) return;
          const joltA1 = curAngle1 - 0.35 + (Math.random() - 0.5) * 0.15;
          const joltA2 = curAngle2 + 0.35 + (Math.random() - 0.5) * 0.15;
          const joltA3 = curAngle3 - 0.35 + (Math.random() - 0.5) * 0.15;

          const p1 = getOrbitPos(60, 34, -15, joltA1);
          const p2 = getOrbitPos(100, 56, 25, joltA2);
          const p3 = getOrbitPos(140, 78, -38, joltA3);

          star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
          star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
          star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);

          await tl.wait(16);
        }

        sfx.play('slash');
        const snapA1 = curAngle1 + 1.8;
        const snapA2 = curAngle2 - 1.8;
        const snapA3 = curAngle3 + 1.8;

        const p1 = getOrbitPos(60, 34, -15, snapA1);
        const p2 = getOrbitPos(100, 56, 25, snapA2);
        const p3 = getOrbitPos(140, 78, -38, snapA3);

        star1.setAttribute('cx', p1.x); star1.setAttribute('cy', p1.y);
        star2.setAttribute('cx', p2.x); star2.setAttribute('cy', p2.y);
        star3.setAttribute('cx', p3.x); star3.setAttribute('cy', p3.y);

        trail1.setAttribute('stroke', '#ffffff');
        trail2.setAttribute('stroke', '#ffffff');
        trail3.setAttribute('stroke', '#ffffff');
        trail1.setAttribute('d', generateArcPath(60, 34, -15, snapA1, Math.PI * 1.5));
        trail2.setAttribute('d', generateArcPath(100, 56, 25, snapA2, -Math.PI * 1.5));
        trail3.setAttribute('d', generateArcPath(140, 78, -38, snapA3, Math.PI * 1.5));

        eventSlot.innerHTML = `
          <g class="overload-arc">
            <path d="M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y}" />
          </g>
        `;

        actorStatus.innerText = '【過載躍遷・傷+5 / CD+1】';
        actorStatus.style.opacity = '1';
        await tl.wait(850);
        break;
      }

      // ----------------------------------------------------
      // 事件 D：【星軌虛耗】(10%) - 星星失去引力向下墜出星軌外消失
      // ----------------------------------------------------
      case 'whiff': {
        sfx.play('whiff_drop');
        trail1.setAttribute('d', '');
        trail2.setAttribute('d', '');
        trail3.setAttribute('d', '');

        const startP1 = getOrbitPos(60, 34, -15, curAngle1);
        const startP2 = getOrbitPos(100, 56, 25, curAngle2);
        const startP3 = getOrbitPos(140, 78, -38, curAngle3);

        const ringsBase = document.getElementById('orbitRingsBase');
        if (ringsBase) {
          ringsBase.style.transition = `opacity ${tl.sec(0.35)}`;
          ringsBase.style.opacity = '0.15';
        }

        const dropFrames = 24;
        for (let f = 0; f <= dropFrames; f++) {
          if (tl.isAborted) return;
          const p = f / dropFrames;
          const dropDist = p * p * 150;
          const op = (1 - p).toFixed(2);

          star1.setAttribute('cy', startP1.y + dropDist);
          star2.setAttribute('cy', startP2.y + dropDist * 1.15);
          star3.setAttribute('cy', startP3.y + dropDist * 1.3);

          star1.style.opacity = op;
          star2.style.opacity = op;
          star3.style.opacity = op;

          await tl.wait(14);
        }

        star1.remove();
        star2.remove();
        star3.remove();

        actorStatus.innerText = '【星軌虛耗・星辰脫軌】';
        actorStatus.style.opacity = '1';
        await tl.wait(750);
        break;
      }
    }

    strip.classList.remove('active');
    skillName.classList.remove('active');
  }


    try {
      if(step.actionId === 'basic') {await runStargazerBasic(); return;}
      if(step.actionId === 'sg_observe') await runStargazerObservation(tl, step.outcome.type === 'star' ? 'constellation' : step.outcome.type, step.outcome.label);
      else await runOrbitReshapeEvent(tl, {accelerate:'minor_shift', reset:'supernova', overload:'overload', nothing:'whiff'}[step.outcome.type]);
      targetUnit.style.display = ''; context.onTiming?.('outcome_reveal', {step});
      await s.resolveResults(); await s.wait(300);
    } finally {fx.pauseAnimations?.();}
  });
}
