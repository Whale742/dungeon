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
    const cues = {
      obv: 'stargazer_obv',
      confir: 'stargazer_confir',
      laser: 'sage_laser',
      focus: 'stargazer_obv',
      snap: 'stargazer_confir',
      barrier_hit: 'stargazer_confir',
      heavy_impact: 'stargazer_confir',
      blade_spin: 'air_pass',
      overload_glitch: 'magic_impact',
      slash: 'warrior_basic',
      whiff_drop: 'air_pass'
    };
    const sfx = {play: key => context.audioScope.play(cues[key] || key, {noHold:true})};
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
        <g class="celestial-display-icon" transform="scale(0.22)">
          <g transform="translate(-250.88, -250.88)">
            <!-- Outer Spiral Arms (Most transparent) -->
            <path fill="#ffffff" opacity="0.12" d="M477.729,22.02c-56.681-56.681-205.096-0.162-331.494,126.237 C301.69,26.208,386.373,32.094,420.799,45.168c6.279,2.178,11.918,5.232,16.835,9.192c0.077,0.062,0.151,0.128,0.228,0.191 c0.615,0.501,1.227,1.008,1.819,1.538c0.699,0.623,1.382,1.265,2.047,1.93c0,0,0.001,0.001,0.001,0.001v0h0 c20.678,20.678,21.853,57.311,7.044,101.105c-1.819,5.378-3.892,10.87-6.187,16.448c-0.493,1.198-0.995,2.4-1.51,3.607 c-20.626,48.373-58.534,103.284-109.584,154.334c-1.906,1.906-3.819,3.788-5.735,5.658c-0.585,0.571-1.172,1.134-1.758,1.701 c-1.355,1.312-2.712,2.616-4.072,3.91c-0.66,0.628-1.32,1.253-1.982,1.877c-1.362,1.285-2.727,2.558-4.093,3.824 c-0.588,0.545-1.175,1.093-1.763,1.634c-3.875,3.563-7.764,7.05-11.663,10.46c-0.582,0.509-1.164,1.01-1.746,1.515 c-1.39,1.206-2.781,2.404-4.174,3.591c-0.661,0.563-1.321,1.123-1.982,1.681c-1.393,1.176-2.786,2.341-4.18,3.497 c-0.583,0.484-1.167,0.971-1.75,1.452c-3.925,3.23-7.855,6.379-11.785,9.446c-0.568,0.443-1.135,0.878-1.702,1.318 c-1.417,1.097-2.834,2.186-4.251,3.262c-0.648,0.492-1.295,0.981-1.943,1.469c-1.414,1.063-2.826,2.115-4.239,3.156 c-0.57,0.421-1.141,0.845-1.711,1.262c-3.937,2.88-7.869,5.676-11.792,8.385c-0.539,0.372-1.078,0.737-1.617,1.106 c-1.435,0.983-2.868,1.956-4.301,2.915c-0.628,0.421-1.256,0.839-1.884,1.256c-1.421,0.943-2.841,1.873-4.259,2.792 c-0.547,0.355-1.095,0.714-1.641,1.065c-1.937,1.246-3.872,2.475-5.802,3.677c94.887-57.2,214.697-151.023,258.415-267.47 C505.886,93.897,503.887,48.178,477.729,22.02z"/>
            <path fill="#ffffff" opacity="0.12" d="M42.234,366.992c0.031-0.148,0.062-0.296,0.094-0.443c0.232-1.092,0.474-2.19,0.73-3.295 c0.06-0.258,0.122-0.517,0.183-0.775c0.244-1.034,0.494-2.07,0.758-3.114c0.083-0.326,0.171-0.655,0.255-0.983 c0.26-1.004,0.522-2.01,0.8-3.023c0.089-0.323,0.185-0.65,0.276-0.974c0.656-2.342,1.35-4.703,2.104-7.093l0-0.004 c0.005-0.016,0.01-0.032,0.015-0.048c0.051-0.161,0.105-0.323,0.156-0.483c0.356-1.171,0.744-2.354,1.162-3.549 c17.77-52.968,59.005-116.492,117.465-174.951c39.73-39.73,81.799-71.501,121.305-93.363 C35.723,211.774-36.148,423.606,19.997,479.751c47.452,47.452,159.198,15.527,268.495-70.28 c-184.956,94.549-232.601,54.07-244.957,14.421C37.86,408.438,37.614,389.008,42.234,366.992z"/>
            <!-- Outer-Mid Swirl Ring -->
            <path fill="#ffffff" opacity="0.28" d="M237.11,410.68c1.418-0.92,2.837-1.849,4.259-2.792c0.628-0.417,1.256-0.835,1.884-1.256 c1.432-0.96,2.866-1.932,4.301-2.915c0.539-0.369,1.078-0.734,1.617-1.106c3.923-2.709,7.855-5.505,11.792-8.385 c0.57-0.417,1.14-0.841,1.711-1.262c1.413-1.042,2.826-2.093,4.239-3.156c0.648-0.487,1.295-0.977,1.943-1.469 c1.417-1.076,2.834-2.164,4.251-3.262c0.568-0.439,1.135-0.875,1.702-1.318c3.93-3.067,7.86-6.216,11.785-9.446 c0.584-0.48,1.167-0.968,1.75-1.452c1.394-1.156,2.788-2.321,4.18-3.497c0.661-0.558,1.321-1.119,1.982-1.681 c1.392-1.186,2.783-2.384,4.174-3.591c0.582-0.505,1.164-1.006,1.746-1.515c3.899-3.409,7.788-6.896,11.663-10.46 c0.589-0.541,1.176-1.09,1.763-1.634c1.366-1.266,2.73-2.539,4.093-3.824c0.661-0.623,1.322-1.249,1.982-1.877 c1.36-1.293,2.717-2.598,4.072-3.91c0.586-0.567,1.173-1.131,1.758-1.701c1.916-1.869,3.829-3.752,5.735-5.658 c51.05-51.05,88.958-105.961,109.584-154.334c0.515-1.207,1.017-2.409,1.51-3.607c2.294-5.578,4.368-11.07,6.187-16.448 c14.809-43.793,13.635-80.427-7.044-101.105v0c0,0-0.001-0.001-0.001-0.001c-0.665-0.665-1.35-1.305-2.047-1.93 c-0.592-0.53-1.203-1.036-1.819-1.538c-0.077-0.063-0.151-0.129-0.228-0.191c-4.917-3.96-10.556-7.014-16.835-9.192 c-31.924-11.076-80.285,0.41-133.26,29.725c-39.506,21.862-81.575,53.633-121.305,93.363 C107.775,226.715,66.54,290.24,48.769,343.208c-0.399,1.188-0.787,2.371-1.162,3.549c-0.051,0.161-0.105,0.323-0.156,0.483 c-0.005,0.017-0.01,0.035-0.016,0.052c-0.755,2.389-1.448,4.75-2.104,7.093c-0.091,0.324-0.187,0.651-0.276,0.974 c-0.279,1.013-0.541,2.019-0.8,3.023c-0.085,0.327-0.173,0.656-0.255,0.983c-0.265,1.044-0.514,2.081-0.758,3.114 c-0.061,0.258-0.123,0.517-0.183,0.775c-0.256,1.105-0.498,2.203-0.73,3.295c-0.031,0.148-0.063,0.296-0.094,0.443 c-4.621,22.017-4.374,41.446,1.301,56.9c2.808,7.646,6.931,14.328,12.462,19.859c31.385,31.385,99.526,17.84,173.67-28.329 c1.93-1.202,3.865-2.432,5.802-3.677C236.016,411.394,236.563,411.035,237.11,410.68z M91.997,407.751 c-32.38-32.38,11.602-128.86,98.237-215.495S373.349,61.64,405.729,94.019s-11.602,128.86-98.237,215.495 C220.857,396.149,124.377,440.131,91.997,407.751z"/>
            <!-- Mid Ring -->
            <path fill="#ffffff" opacity="0.48" d="M405.729,94.019c-32.38-32.38-128.86,11.602-215.495,98.237S59.617,375.371,91.997,407.751 c32.38,32.38,128.86-11.602,215.495-98.237C394.126,222.879,438.108,126.399,405.729,94.019z M138.296,361.452 c-20.355-20.355,12.647-86.358,73.711-147.423s127.068-94.066,147.423-73.711c20.355,20.355-12.647,86.358-73.711,147.423 C224.654,348.805,158.651,381.807,138.296,361.452z"/>
            <!-- Inner Ring -->
            <path fill="#ffffff" opacity="0.75" d="M359.43,140.318c-20.355-20.355-86.358,12.647-147.423,73.711s-94.066,127.068-73.711,147.423 c20.355,20.355,86.358-12.647,147.423-73.711C346.783,226.676,379.785,160.673,359.43,140.318z M263.605,265.628 c-32.568,32.568-65.569,52.369-73.711,44.227c-8.142-8.142-0.354-53.157,32.214-85.725c32.568-32.568,77.583-40.356,85.725-32.214 C315.974,200.058,296.173,233.06,263.605,265.628z"/>
            <!-- Brightest Core Center -->
            <path fill="#ffffff" opacity="1" filter="drop-shadow(0 0 10px #ffffff)" d="M222.107,224.13c-32.568,32.568-40.356,77.583-32.214,85.725 c8.142,8.142,41.144-11.659,73.711-44.227c32.568-32.568,52.369-65.569,44.227-73.711 C299.69,183.774,254.675,191.562,222.107,224.13z"/>
          </g>
        </g>
      `;
    } else if (type === 'blackhole') {
      return `
        <g class="celestial-display-icon" transform="scale(0.95)">
          <!-- 超大白色光暈層 (圍繞黑色圓型) -->
          <circle class="blackhole-mega-glow" cx="0" cy="0" r="32" fill="none" stroke="#ffffff" stroke-width="8"/>
          <circle class="blackhole-soft-halo" cx="0" cy="0" r="37" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.75"/>
          <circle class="blackhole-outer-ambient" cx="0" cy="0" r="44" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.4"/>

          <!-- 黑色圓型：深邃純黑核心 (事件視界) -->
          <circle cx="0" cy="0" r="28" fill="#000000"/>

          <!-- 中間一條線 + 白色光暈，白線兩端為尖 (水平貫穿兩端收束) -->
          <path class="blackhole-tapered-beam" d="M -90,0 Q 0,-3.5 90,0 Q 0,3.5 -90,0 Z" fill="#ffffff"/>
          <line class="blackhole-core-line" x1="-88" y1="0" x2="88" y2="0" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
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
    fx.innerHTML = `<g id="stargazerBasicAim" transform="translate(${cx}, ${cy}) scale(2)" style="opacity: 0;">${getReticleMarkup()}</g>`;
    const aim = document.getElementById('stargazerBasicAim');
    context.onTiming?.('stargazer_aim_start', {step, x:cx, y:cy});

    // 1. 方框進場時從 scale 2 opacity 0 變成 scale 1 opacity 1 (起手完全不播放音效)
    await s.tick(280, p => {
      const scale = 2 - p;
      aim.setAttribute('transform', `translate(${cx}, ${cy}) scale(${scale})`);
      aim.style.opacity = String(p);
    });
    if (s.signal.aborted) return;
    await tl.wait(100);

    // 2. 移動到 BOSS 頭像 (保持 scale 1 opacity 1)
    await s.tick(450, p => {
      const progress = p * p * (3 - 2 * p);
      const curX = cx + (target.x - cx) * progress;
      const curY = cy + (target.y - cy) * progress;
      aim.setAttribute('transform', `translate(${curX}, ${curY}) scale(1)`);
      aim.style.opacity = '1';
    });
    if (s.signal.aborted) return;

    // 3. 移動到 BOSS 頭像後 scale 1 opacity 1 變成 scale 2 opacity 0
    await s.tick(260, p => {
      const scale = 1 + p;
      aim.setAttribute('transform', `translate(${target.x}, ${target.y}) scale(${scale})`);
      aim.style.opacity = String(1 - p);
    });
    if (s.signal.aborted) return;

    // 4. 並在 scale 2 後才造成傷害與播放音效：
    // - 僅命中時播放 sage_laser，preserveAcrossViews 避免 stage 結束被掐斷
    // - skipResultAudio: true 去除敵人預設的受擊音效 (magic_impact/physical_hit)
    sfxManager.play('sage_laser', { preserveAcrossViews: true });
    context.onTiming?.('stargazer_aim_contact', {step, x:target.x, y:target.y});
    await s.resolveResults({ skipResultAudio: true });
    await tl.wait(500);
  }

  async function runStargazerObservation(tl, outcomeType, outcomeTitle) {
    targetUnit.style.display = 'none';
    skillName.innerText = '【天體觀測・深空探索】';
    strip.classList.add('active');
    skillName.classList.add('active');
    await tl.wait(250);

    // 天體觀測時播放 stargazer-obv.mp3
    sfx.play('obv');
    const { cx, cy } = getStageCenter();

    // 模擬望遠鏡遮罩：整個天體觀測都加上，圓圈直徑再放大 (半徑 140，直徑 280) 確保觀察到的天體不被切掉
    const telescopeRadius = 140;
    const telescopeMarkup = `
      <g id="stargazerTelescopeGroup" class="stargazer-telescope-viewport">
        <!-- Outer solid black mask covering stage with centered circular opening -->
        <path class="stargazer-telescope-mask" fill="#000000" fill-rule="evenodd"
          d="M -3000,-2000 L 3000,-2000 L 3000,2000 L -3000,2000 Z M 0,-${telescopeRadius} A ${telescopeRadius} ${telescopeRadius} 0 1 0 0,${telescopeRadius} A ${telescopeRadius} ${telescopeRadius} 0 1 0 0,-${telescopeRadius} Z" />
        <!-- Telescope eyepiece cylindrical bezel rings -->
        <circle cx="0" cy="0" r="${telescopeRadius}" fill="none" stroke="#1d2433" stroke-width="3.5" />
        <circle cx="0" cy="0" r="${telescopeRadius + 2}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" />
        <circle cx="0" cy="0" r="${telescopeRadius - 2.5}" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="2" />
      </g>
    `;

    fx.innerHTML = `
      <g transform="translate(${cx}, ${cy})">
        <g id="ambientStarsGroup">${getAmbientStarsMarkup()}</g>
        ${getReticleMarkup()}
        <g id="starFlareNode" style="transform-origin: 0px 0px; opacity: 1; transition: opacity ${tl.sec(0.25)} ease-out, transform ${tl.sec(0.35)} ease-out;">
          <polygon class="stargazer-star-flare" points="0,-22 4.5,-4.5 22,0 4.5,4.5 0,22 -4.5,4.5 -22,0 -4.5,-4.5"/>
          <circle cx="0" cy="0" r="3.5" fill="#ffffff"/>
        </g>
        <g id="celestialSlot"></g>
        ${telescopeMarkup}
      </g>
    `;

    // 1. 觀察過程拉長 (深空凝視，探尋天體)
    await tl.wait(1300);

    const flareNode = document.getElementById('starFlareNode');
    if (flareNode) {
      flareNode.style.transform = 'scale(2.4)';
      flareNode.style.opacity = '0';
    }
    await tl.wait(350);
    if (flareNode) flareNode.remove();

    const reticleNode = document.getElementById('stargazerReticle');
    if (outcomeType === 'boundary') {
      if (reticleNode) reticleNode.remove();
    }

    // 2. 觀測到結果後播放 stargazer-confir.mp3
    sfx.play('confir');

    actorStatus.innerText = outcomeTitle;
    actorStatus.style.opacity = '1';

    const slot = document.getElementById('celestialSlot');
    if (slot) slot.innerHTML = getCelestialIconSvgMarkup(outcomeType);

    // 3. 觀測到結果後定格展示天體
    await tl.wait(1000);

    // 4. 望遠鏡放大並淡出：突破視場淡出
    const telescopeGroup = document.getElementById('stargazerTelescopeGroup');
    const ambientStars = document.getElementById('ambientStarsGroup');
    await s.tick(600, p => {
      const ease = p * p * (3 - 2 * p);
      const scale = 1 + ease * 1.8;
      const op = String(1 - ease);
      if (telescopeGroup) {
        telescopeGroup.setAttribute('transform', `scale(${scale})`);
        telescopeGroup.style.opacity = op;
      }
      if (slot) slot.style.opacity = String(1 - p);
      if (reticleNode) reticleNode.style.opacity = String(1 - p);
      if (ambientStars) ambientStars.style.opacity = String(1 - p);
    });

    actorStatus.style.opacity = '0';
    strip.classList.remove('active');
    skillName.classList.remove('active');
    fx.innerHTML = '';
    // 5. 等到望遠鏡完全淡出才結束，隨後交由外層解除 targetUnit 隱藏並觸發攻擊結算
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
