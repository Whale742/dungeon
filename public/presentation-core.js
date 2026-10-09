// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Presentation 核心共用庫 (presentation-core.js)
// Single Source of Truth for shared audio, visual FX, icons, and typewriter helpers.
// ==========================================================================

// --- 1. Web Audio API 音效管理器 (SFXManager) ---
function bardOffKeyDetuneCurve(duration) {
  const samples=Math.max(2,Math.ceil(duration/.025)+1);
  return Float32Array.from({length:samples},(_,i)=>{
    const t=i*duration/(samples-1);
    const envelope=Math.min(1,Math.max(0,duration-t)/.6);
    return 420*Math.sin(2*Math.PI*t/2.4)*envelope;
  });
}

class SFXManager {
  constructor() {
    this.ctx = null;
    this.lastPlayed = new Map();
    this.minInterval = 40; // 防音頻重疊破音 (ms)
    this._soundEnabled = true;
    this._volume = 1;
    this.masterGain = null;
    this.assets = new Map();
    this.activeVoices = new Set();
    this.generation = 0;
  }

  get soundEnabled() { return this._soundEnabled; }
  set soundEnabled(value) { this._soundEnabled = Boolean(value); this.updateMaster(); }
  get volume() { return this._volume; }
  set volume(value) { this._volume = Math.max(0, Math.min(1, Number(value) || 0)); this.updateMaster(); }
  updateMaster() {
    if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.value = this.soundEnabled ? this.volume : 0;
    }
  }
  init(unlock = true) {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination); this.updateMaster();
      }
    }
    if (unlock && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  loadAsset(profile) {
    if (this.assets.has(profile.src)) return this.assets.get(profile.src).promise;
    this.init(false);
    const entry = { buffer: null, failed: false, promise: null };
    entry.promise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), profile.loadTimeoutMs ?? 5000);
      try {
        const response = await fetch(profile.src, { signal: controller.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const bytes = await response.arrayBuffer();
        entry.buffer = await Promise.race([
          this.ctx.decodeAudioData(bytes),
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Audio load/decode timeout')), { once: true }))
        ]);
        return entry.buffer;
      } catch (error) {
        entry.failed = true;
        console.warn('[SFX] Asset unavailable; synth fallback:', profile.src, error.message);
        return null;
      } finally { clearTimeout(timeout); }
    })();
    this.assets.set(profile.src, entry);
    return entry.promise;
  }
  preload() {
    if (typeof SFX_ASSETS === 'undefined') return Promise.resolve([]);
    this.init(false);
    if (!this.ctx) return Promise.resolve([]);
    return Promise.all(Object.values(SFX_ASSETS).map(profile => this.loadAsset(profile)));
  }
  stopAll({preserveTails=false}={}) {
    this.generation++;
    for (const voice of [...this.activeVoices]) if(!preserveTails||!voice.preserveAcrossViews)voice.stop();
  }
  duck(key, amount = .4) {
    for (const voice of this.activeVoices) if (voice.key === key && voice.gain) {
      voice.gain.gain.setTargetAtTime(voice.level * amount, this.ctx.currentTime, .05);
    }
  }
  play(type, options = {}) {
    if (!this.soundEnabled || options.signal?.aborted) return Promise.resolve(null);
    this.init();
    if (!this.ctx) return Promise.resolve(null);
    const now = Date.now();
    const throttleKey = options.instance || type;
    if (now - (this.lastPlayed.get(throttleKey) || 0) < this.minInterval) return Promise.resolve(null);
    this.lastPlayed.set(throttleKey, now);
    const key = typeof SFX_ALIASES !== 'undefined' ? SFX_ALIASES[type] || type : type;
    const profile = typeof SFX_ASSETS !== 'undefined' ? SFX_ASSETS[key] : null;
    if (!profile || options.synthOnly) { this.playSynth(type, options); return Promise.resolve(null); }
    const generation = this.generation;
    return this.loadAsset(profile).then(buffer => {
      if (generation !== this.generation || options.signal?.aborted || !this.soundEnabled) return null;
      if (!buffer) { this.playSynth(profile.fallback, options); return null; }
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = buffer; source.playbackRate.value = 1;
      const offset = Math.max(0, Math.min(options.offset ?? profile.offset, buffer.duration - .001));
      const duration = Math.min(profile.maxDuration, buffer.duration - offset);
      const level = profile.volume * (options.volume ?? 1);
      const start = this.ctx.currentTime;
      if(options.detune && source.detune) {
        // Wide, slow pitch bends make the missed notes audible without rapid vibrato.
        source.detune.setValueCurveAtTime(bardOffKeyDetuneCurve(duration),start,duration);
      }
      gain.gain.setValueAtTime(level, start);
      gain.gain.setValueAtTime(level, start + Math.max(0, duration - .12));
      gain.gain.linearRampToValueAtTime(0, start + duration);
      source.connect(gain); gain.connect(this.masterGain);
      let disposed = false;
      let deadline;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        clearTimeout(deadline);
        source.onended = null;
        options.signal?.removeEventListener('abort', voice.stop);
        this.activeVoices.delete(voice); source.disconnect(); gain.disconnect();
      };
      const voice = { key, gain, level, source, preserveAcrossViews:!!options.preserveAcrossViews, stop: () => {
        try { source.stop(); } catch {} cleanup();
      } };
      source.onended = cleanup;
      options.signal?.addEventListener('abort', voice.stop, { once: true });
      this.activeVoices.add(voice);
      source.start(start, offset, duration);
      // A suspended context must not retain stale cues until a later gesture.
      deadline = setTimeout(voice.stop, Math.ceil(duration * 1000) + 250);
      return voice;
    }).catch(error => {
      if (!options.signal?.aborted && generation === this.generation) {
        console.warn('[SFX] Playback unavailable; synth fallback:', key, error.message);
        this.playSynth(profile.fallback, options);
      }
      return null;
    });
  }

  playSynth(type, options = {}) {

    if (!this.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;


      const ctx = this.ctx;
      const t = ctx.currentTime;
      const masterVol = options.volume ?? 1;
      const output = ctx.createGain(); output.connect(this.masterGain);
      const voice = { key: type, stop: () => {
        output.disconnect(); this.activeVoices.delete(voice);
        options.signal?.removeEventListener('abort', voice.stop); clearTimeout(timer);
      } };
      const timer = setTimeout(voice.stop, 4000);
      this.activeVoices.add(voice);
      options.signal?.addEventListener('abort', voice.stop, { once: true });

      // Phase 6 support/outcome identities, shared by production and Lab.
      const supportVoices = {
        shadow_gain: [180, 90, .10, 'triangle'], shadow_decay: [130, 70, .05, 'triangle'],
        shadow_absorb: [280, 60, .14, 'triangle'], shadow_follow_up: [600, 150, .16, 'triangle'],
        air_pass: [1200, 300, .12, 'triangle'],
        heal_wave: [392, 784, .35, 'sine'], recovery_chime: [660, 990, .22, 'sine'],
        shield_apply: [220, 440, .3, 'triangle'], shield_block: [440, 160, .16, 'square'],
        shield_break: [1800, 180, .25, 'sawtooth'], support_cast: [330, 660, .24, 'triangle'],
        cleanse: [520, 1040, .3, 'sine'], bard_off_key: [440, 415, .32, 'triangle'],
        alchemy_success: [523, 1046, .4, 'sine'], alchemy_failure: [370, 92, .3, 'sawtooth'],
        transform_wolf: [180, 75, .3, 'sawtooth'], transform_treant: [95, 48, .55, 'triangle'],
        summon_wolf: [240, 120, .24, 'sawtooth'], summon_treant: [140, 65, .45, 'triangle'],
        vine_strike: [110, 65, .22, 'triangle'], reload_pull: [150, 240, .16, 'sawtooth'],
        reload_insert: [900, 450, .07, 'triangle'], reload_lock: [1400, 850, .05, 'square'],
        minion_attack: [360, 160, .15, 'triangle'], minion_intercept: [180, 80, .18, 'square'],
        revive_chime: [523, 1569, .45, 'sine'],
        exhausted_apply: [160, 60, .32, 'sawtooth'], frenzy_burst: [587, 1174, .25, 'triangle'],
        poison_puff: [240, 110, .18, 'sine']
      };
      if (supportVoices[type]) {
        const [start, end, duration, wave] = supportVoices[type];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(start, t);
        osc.frequency.exponentialRampToValueAtTime(end, t + duration);
        gain.gain.setValueAtTime(.001, t);
        gain.gain.linearRampToValueAtTime(.24 * masterVol, t + .02);
        gain.gain.exponentialRampToValueAtTime(.002, t + duration);
        osc.connect(gain); gain.connect(output);
        osc.start(t); osc.stop(t + duration);
        return;
      }

      switch (type) {
        // --- UI 音效 ---
        case 'click': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(640, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.05);
          gain.gain.setValueAtTime(0.18 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.05);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.05);
          break;
        }
        case 'select': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(740, t + 0.06);
          gain.gain.setValueAtTime(0.15 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.06);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.06);
          break;
        }
        case 'lock': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.14);
          gain.gain.setValueAtTime(0.25 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.14);
          break;
        }
        case 'unlock': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(380, t + 0.1);
          gain.gain.setValueAtTime(0.18 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.1);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.1);
          break;
        }
        case 'type': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          const typeFreq = 950 + (Math.random() * 200 - 100);
          osc.frequency.setValueAtTime(typeFreq, t);
          osc.frequency.exponentialRampToValueAtTime(300, t + 0.035);
          gain.gain.setValueAtTime(0.12 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.035);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.035);
          break;
        }

        // --- 戰鬥打擊音效 (Phase 5.2 Audio Identity & Choreography) ---
        // A. 面板切入音效：Shoo—— (Airy, sharp, fast, clean whoosh, Medium volume)
        case 'panel_sweep':
        case 'panel_shoo':
        case 'action_whoosh':
        case 'combat_skill_sweep': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          osc.type = 'sawtooth';
          filter.type = 'bandpass';
          filter.Q.value = 1.8;

          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(1600, t + 0.04);
          osc.frequency.exponentialRampToValueAtTime(140, t + 0.22);

          filter.frequency.setValueAtTime(1600, t);
          filter.frequency.exponentialRampToValueAtTime(2800, t + 0.04);
          filter.frequency.exponentialRampToValueAtTime(320, t + 0.22);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.28 * masterVol, t + 0.035);
          gain.gain.exponentialRampToValueAtTime(0.002, t + 0.22);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.22);
          break;
        }

        // B. 戰士攻擊音效：Xing——！(Sharp metallic slash, high metal ring)
        case 'warrior_xing':
        case 'sword_slash':
        case 'sword_whoosh': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(2800, t);
          osc1.frequency.exponentialRampToValueAtTime(1400, t + 0.16);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1760, t); // High metallic chime A6
          osc2.frequency.exponentialRampToValueAtTime(1650, t + 0.28);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(2200, t);
          filter.Q.value = 4.0;

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.42 * masterVol, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);

          osc1.connect(filter);
          filter.connect(gain);
          osc2.connect(gain);
          gain.connect(output);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.16);
          osc2.stop(t + 0.28);
          break;
        }

        // C. 法師爆發音效：Bomb！(Compressed arcane burst, low-mid punch + body)
        case 'mage_burst':
        case 'arcane_bomb': {
          const oscSub = ctx.createOscillator();
          const oscBody = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          oscSub.type = 'sine';
          oscSub.frequency.setValueAtTime(110, t);
          oscSub.frequency.exponentialRampToValueAtTime(32, t + 0.28);

          oscBody.type = 'sawtooth';
          oscBody.frequency.setValueAtTime(460, t);
          oscBody.frequency.exponentialRampToValueAtTime(60, t + 0.24);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(850, t);
          filter.frequency.exponentialRampToValueAtTime(140, t + 0.24);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.52 * masterVol, t + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);

          oscBody.connect(filter);
          filter.connect(gain);
          oscSub.connect(gain);
          gain.connect(output);

          oscSub.start(t);
          oscBody.start(t);
          oscSub.stop(t + 0.28);
          oscBody.stop(t + 0.24);
          break;
        }

        // D. 弓手射擊音效：Twang + Flight + Thock
        case 'archer_twang':
        case 'bow_release': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(480, t);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
          gain.gain.setValueAtTime(0.38 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.12);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }
        case 'arrow_flight': {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          filter.type = 'bandpass';
          filter.Q.value = 3.5;
          filter.frequency.setValueAtTime(2200, t);
          filter.frequency.exponentialRampToValueAtTime(800, t + 0.14);
          osc.frequency.setValueAtTime(1200, t);
          osc.frequency.exponentialRampToValueAtTime(400, t + 0.14);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(0.24 * masterVol, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.14);
          break;
        }
        case 'arrow_impact':
        case 'arrow_thock': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(760, t);
          osc.frequency.exponentialRampToValueAtTime(85, t + 0.08);
          gain.gain.setValueAtTime(0.48 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.08);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.08);
          break;
        }

        // E. 刺客雙斬音效：Xing-Xing (70~100ms 間隔快速二連斬)
        case 'assassin_dual':
        case 'assassin_slash': {
          [0, 0.085].forEach((offset, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            const startFreq = idx === 0 ? 1700 : 1950;
            osc.frequency.setValueAtTime(startFreq, t + offset);
            osc.frequency.exponentialRampToValueAtTime(400, t + offset + 0.09);
            gain.gain.setValueAtTime(0.36 * masterVol, t + offset);
            gain.gain.exponentialRampToValueAtTime(0.005, t + offset + 0.09);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + offset);
            osc.stop(t + offset + 0.09);
          });
          break;
        }

        // F. 鍊金投擲與酸蝕音效：Bottle flight + Acid Splash
        case 'acid_throw': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(540, t);
          osc.frequency.exponentialRampToValueAtTime(260, t + 0.14);
          gain.gain.setValueAtTime(0.28 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.14);
          break;
        }
        case 'acid_splash': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(320, t);
          osc1.frequency.linearRampToValueAtTime(680, t + 0.06);
          osc1.frequency.exponentialRampToValueAtTime(120, t + 0.20);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(780, t);
          osc2.frequency.exponentialRampToValueAtTime(200, t + 0.20);
          gain.gain.setValueAtTime(0.42 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.20);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(output);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.20);
          osc2.stop(t + 0.20);
          break;
        }

        // G. 德魯伊爪擊音效：Claw Whoosh & Tear
        case 'claw_slash': {
          [0, 0.03, 0.06].forEach((offset, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            const f = 620 - idx * 70;
            osc.frequency.setValueAtTime(f, t + offset);
            osc.frequency.exponentialRampToValueAtTime(90, t + offset + 0.11);
            gain.gain.setValueAtTime(0.32 * masterVol, t + offset);
            gain.gain.exponentialRampToValueAtTime(0.005, t + offset + 0.11);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + offset);
            osc.stop(t + offset + 0.11);
          });
          break;
        }

        // H. 吟遊詩人音效：Resonant Tone
        case 'bard_tone': {
          [523.25, 659.25, 783.99].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.03);
            gain.gain.setValueAtTime(0.24 * masterVol, t + idx * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.03 + 0.25);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + idx * 0.03);
            osc.stop(t + idx * 0.03 + 0.25);
          });
          break;
        }

        // I. 命中音效 (High impact, Highest climax)
        case 'hit':
        case 'physical_hit':
        case 'physical_impact': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(32, t + 0.18);
          gain.gain.setValueAtTime(0.55 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.18);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.18);
          break;
        }
        case 'magic_cast': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc2.type = 'triangle';
          osc1.frequency.setValueAtTime(320, t);
          osc1.frequency.exponentialRampToValueAtTime(740, t + 0.22);
          osc2.frequency.setValueAtTime(480, t);
          osc2.frequency.exponentialRampToValueAtTime(960, t + 0.22);
          gain.gain.setValueAtTime(0.26 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.22);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(output);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.22);
          osc2.stop(t + 0.22);
          break;
        }
        case 'magic_impact': {
          const osc = ctx.createOscillator();
          const oscSub = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          oscSub.type = 'sine';
          osc.frequency.setValueAtTime(620, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.28);
          oscSub.frequency.setValueAtTime(140, t);
          oscSub.frequency.exponentialRampToValueAtTime(30, t + 0.28);
          gain.gain.setValueAtTime(0.52 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);
          osc.connect(gain);
          oscSub.connect(gain);
          gain.connect(output);
          osc.start(t);
          oscSub.start(t);
          osc.stop(t + 0.28);
          oscSub.stop(t + 0.28);
          break;
        }
        case 'boss_attack': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.24);
          gain.gain.setValueAtTime(0.48 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.24);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.24);
          break;
        }
        case 'boss_heavy_attack': {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(130, t);
          osc.frequency.exponentialRampToValueAtTime(28, t + 0.32);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(380, t);
          filter.frequency.exponentialRampToValueAtTime(80, t + 0.32);
          gain.gain.setValueAtTime(0.58 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.32);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.32);
          break;
        }
        case 'heavy_impact': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(160, t);
          osc1.frequency.exponentialRampToValueAtTime(25, t + 0.26);
          osc2.frequency.setValueAtTime(95, t);
          osc2.frequency.exponentialRampToValueAtTime(20, t + 0.26);
          gain.gain.setValueAtTime(0.60 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.26);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(output);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.26);
          osc2.stop(t + 0.26);
          break;
        }
        case 'dagger_crit': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(1100, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.22);
          osc2.frequency.setValueAtTime(1600, t);
          osc2.frequency.exponentialRampToValueAtTime(540, t + 0.22);
          gain.gain.setValueAtTime(0.42 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.22);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(output);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.22);
          osc2.stop(t + 0.22);
          break;
        }
        case 'arrow_hit': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1200, t);
          osc.frequency.exponentialRampToValueAtTime(160, t + 0.12);
          gain.gain.setValueAtTime(0.32 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.12);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }
        case 'magic':
        case 'magic_arcane': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(380, t);
          osc.frequency.exponentialRampToValueAtTime(920, t + 0.24);
          gain.gain.setValueAtTime(0.28 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.24);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.24);
          break;
        }
        case 'magic_fire': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.28);
          gain.gain.setValueAtTime(0.35 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.28);
          break;
        }

        // --- 治療與防護音效 ---
        case 'heal':
        case 'heal_chime': {
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.06);
            gain.gain.setValueAtTime(0.2 * masterVol, t + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.06 + 0.25);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + idx * 0.06);
            osc.stop(t + idx * 0.06 + 0.25);
          });
          break;
        }
        case 'shield_cast':
        case 'shield': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, t);
          osc.frequency.exponentialRampToValueAtTime(480, t + 0.25);
          gain.gain.setValueAtTime(0.3 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.28);
          break;
        }
        case 'shield_block': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);
          gain.gain.setValueAtTime(0.32 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.15);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.15);
          break;
        }

        // --- 狀態音效 ---
        case 'poison':
        case 'poison_bubble': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(240, t);
          osc.frequency.exponentialRampToValueAtTime(460, t + 0.07);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.14);
          gain.gain.setValueAtTime(0.22 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.14);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.14);
          break;
        }
        case 'boss_warning': {
          [620, 830].forEach((frequency, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'square'; osc.frequency.value = frequency;
            const start = t + i * .095;
            gain.gain.setValueAtTime(.055 * masterVol, start);
            gain.gain.exponentialRampToValueAtTime(.001, start + .085);
            osc.connect(gain); gain.connect(output); osc.start(start); osc.stop(start + .09);
          });
          break;
        }
        case 'round_start': {
          [330, 495].forEach((frequency, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'triangle'; osc.frequency.value = frequency;
            const start = t + i * .06;
            gain.gain.setValueAtTime(.13 * masterVol, start);
            gain.gain.exponentialRampToValueAtTime(.001, start + .17);
            osc.connect(gain); gain.connect(output); osc.start(start); osc.stop(start + .18);
          });
          break;
        }
        case 'boss_rumble':
        case 'boss_boom': {
          const boom = type === 'boss_boom';
          const duration = boom ? .42 : .32;
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(boom ? 135 : 62, t);
          osc.frequency.exponentialRampToValueAtTime(boom ? 38 : 43, t + duration);
          gain.gain.setValueAtTime(.001, t);
          gain.gain.linearRampToValueAtTime((boom ? .32 : .09) * masterVol, t + .012);
          gain.gain.exponentialRampToValueAtTime(.001, t + duration);
          osc.connect(gain); gain.connect(output); osc.start(t); osc.stop(t + duration);
          if (boom) {
            const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .2), ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            const body = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), bodyGain = ctx.createGain();
            body.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 950;
            bodyGain.gain.setValueAtTime(.12 * masterVol, t);
            bodyGain.gain.exponentialRampToValueAtTime(.001, t + .2);
            body.connect(filter); filter.connect(bodyGain); bodyGain.connect(output); body.start(t); body.stop(t + .2);
          }
          break;
        }
        case 'boss_roar': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.45);
          gain.gain.setValueAtTime(0.45 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.45);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.45);
          break;
        }

        // --- 陷阱與危險音效 ---
        case 'danger_sting':
        case 'trap_spring':
        case 'trap_trigger': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.setValueAtTime(311.13, t + 0.08);
          gain.gain.setValueAtTime(0.38 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.4);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.4);
          break;
        }
        case 'trap_impact': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(38, t + 0.24);
          gain.gain.setValueAtTime(0.48 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.3);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.3);
          break;
        }

        // --- 寶箱與獎勵音效 ---
        case 'chest_open': {
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(420, t);
          osc1.frequency.exponentialRampToValueAtTime(180, t + 0.06);
          gain1.gain.setValueAtTime(0.25 * masterVol, t);
          gain1.gain.exponentialRampToValueAtTime(0.005, t + 0.06);
          osc1.connect(gain1);
          gain1.connect(output);
          osc1.start(t);
          osc1.stop(t + 0.06);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(160, t + 0.04);
          osc2.frequency.exponentialRampToValueAtTime(80, t + 0.28);
          gain2.gain.setValueAtTime(0.28 * masterVol, t + 0.04);
          gain2.gain.exponentialRampToValueAtTime(0.005, t + 0.28);
          osc2.connect(gain2);
          gain2.connect(output);
          osc2.start(t + 0.04);
          osc2.stop(t + 0.28);
          break;
        }
        case 'chest_reveal': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(520, t + 0.3);
          gain.gain.setValueAtTime(0.18 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.35);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.35);
          break;
        }
        case 'reward_common': {
          const notes = [659.25, 880];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.1);
            gain.gain.setValueAtTime(0.22 * masterVol, t + idx * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.1 + 0.3);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + idx * 0.1);
            osc.stop(t + idx * 0.1 + 0.3);
          });
          break;
        }
        case 'reward_rare': {
          const notes = [587.33, 739.99, 880, 1174.66];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.09);
            gain.gain.setValueAtTime(0.26 * masterVol, t + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.09 + 0.4);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + idx * 0.09);
            osc.stop(t + idx * 0.09 + 0.4);
          });
          break;
        }

        // --- 橫幅與結局音效 ---
        case 'banner': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(440, t + 0.18);
          gain.gain.setValueAtTime(0.22 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.45);
          break;
        }
        case 'victory': {
          const notes = [440, 554.37, 659.25, 880];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t + idx * 0.12);
            gain.gain.setValueAtTime(0.26 * masterVol, t + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.12 + 0.4);
            osc.connect(gain);
            gain.connect(output);
            osc.start(t + idx * 0.12);
            osc.stop(t + idx * 0.12 + 0.4);
          });
          break;
        }
        case 'gameover': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(290, t);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.55);
          gain.gain.setValueAtTime(0.35 * masterVol, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.55);
          osc.connect(gain);
          gain.connect(output);
          osc.start(t);
          osc.stop(t + 0.55);
          break;
        }
      }
    } catch {
      // Audio context may not be unlocked before user gesture
    }
  }
}

// Global SFX singleton
const sfxManager = new SFXManager();
if (typeof window !== 'undefined') {
  window.sfxManager = sfxManager;
  window.SFXManager = SFXManager;
  if (!window.playSound) {
    window.playSound = (type, options) => sfxManager.play(type, options);
  }
}

if (typeof window !== 'undefined') {
  sfxManager.preload();
  const unlockAudio = () => sfxManager.init();
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  window.addEventListener('keydown', unlockAudio, { once: true, capture: true });
  window.addEventListener('pagehide', () => sfxManager.stopAll());
}

// --- 2. 非同步時序與幀輔助 ---
function waitForPresentation(ms, signal, speedScale = 1.0) {
  const globalScale = (typeof window !== 'undefined' && window.narrativeSpeedScale) || 1.0;
  const effectiveScale = globalScale > 1 ? globalScale : (speedScale || 1.0);
  const adjustedMs = effectiveScale > 1 ? Math.max(1, Math.round(ms / effectiveScale)) : Math.round(ms / (speedScale || 1.0));
  return new Promise((resolve, reject) => {
    let timer = null;
    let finishHandler = null;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      if (finishHandler && typeof window !== 'undefined' && window._activePresentationResolvers) {
        window._activePresentationResolvers.delete(finishHandler);
      }
      if (signal) signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const finish = () => {
      if (timer) clearTimeout(timer);
      if (finishHandler && typeof window !== 'undefined' && window._activePresentationResolvers) {
        window._activePresentationResolvers.delete(finishHandler);
      }
      if (signal) signal.removeEventListener('abort', cancel);
      resolve();
    };
    finishHandler = finish;
    if (typeof window !== 'undefined') {
      if (!window._activePresentationResolvers) window._activePresentationResolvers = new Set();
      window._activePresentationResolvers.add(finishHandler);
    }
    timer = setTimeout(finish, adjustedMs);
    if (signal) {
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    }
  });
}

function presentationFrame(signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      cancelAnimationFrame(frame);
      if (signal) signal.removeEventListener('abort', cancel);
      reject(new DOMException('Presentation cancelled', 'AbortError'));
    };
    const frame = requestAnimationFrame(() => {
      if (signal) signal.removeEventListener('abort', cancel);
      resolve();
    });
    if (signal) {
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    }
  });
}

// Alias fallbacks for backward compatibility
if (typeof window !== 'undefined') {
  if (!window.waitForPrologue) window.waitForPrologue = waitForPresentation;
  if (!window.prologueFrame) window.prologueFrame = presentationFrame;
}

// --- 3. 打字機逐字印出核心 (Typewriter Engine) ---
async function typewriterEffect(container, paragraphs, signal, timing = null, speedScale = 1.0) {
  const activeTiming = timing || (typeof PRESENTATION_CONFIG !== 'undefined' ? PRESENTATION_CONFIG.narrative : {
    character: 40, comma: 140, sentence: 280, newline: 380, paragraph: 600
  });

  container.replaceChildren();
  await presentationFrame(signal);
  await presentationFrame(signal);

  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = document.createElement('p');
    container.appendChild(paragraph);
    const characters = Array.from(paragraphs[index]);
    for (let charIndex = 0; charIndex < characters.length; charIndex++) {
      await waitForPresentation(activeTiming.character || 40, signal, speedScale);
      const character = characters[charIndex];
      paragraph.appendChild(document.createTextNode(character));
      if (charIndex % 2 === 1 && !/\s/.test(character)) {
        sfxManager.play('type');
      }
      const pause = /[，、,；;：:]/.test(character) ? (activeTiming.comma || 140)
        : /[。！？!?…]/.test(character) ? (activeTiming.sentence || 280)
        : character === '\n' ? (activeTiming.newline || 380) : 0;
      if (pause) await waitForPresentation(pause, signal, speedScale);
    }
    if (index < paragraphs.length - 1) {
      await waitForPresentation(activeTiming.paragraph || 600, signal, speedScale);
    }
  }
}

if (typeof window !== 'undefined') {
  if (!window.typePrologueParagraphs) window.typePrologueParagraphs = typewriterEffect;
  if (!window.typewriterEffect) window.typewriterEffect = typewriterEffect;
  if (!window.playTypewriterClick) window.playTypewriterClick = () => sfxManager.play('type');
}

// --- 4. 圖標與職業原畫輔助 (Icon & Portrait System) ---
function getIconSvg(name, extraClass = '') {
  return `<svg class="ui-icon svg-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

const DEFAULT_ROLE_AVATARS = {
  dreamweaver:{name:'織夢術士',avatar:'/photo/Dreamweaver.webp'},stargazer:{name:'觀星者',avatar:'/photo/Stargazer.webp'},gladiator:{name:'角鬥士',avatar:'/photo/Gladiator.webp'},samurai:{name:'武士',avatar:'/photo/武士.webp'},sage:{name:'智者',avatar:'/photo/智者.webp'},
  warrior: { name: '戰士', avatar: '/photo/Warrior.webp', icon: 'shield' },
  mage: { name: '法師', avatar: '/photo/Mage.webp', icon: 'sparkle' },
  archer: { name: '弓箭手', avatar: '/photo/Archer.webp', icon: 'target' },
  assassin: { name: '刺客', avatar: '/photo/Assassin.webp', icon: 'sword' },
  bard: { name: '吟遊詩人', avatar: '/photo/Bard.webp', icon: 'volume-on' },
  alchemist: { name: '鍊金術士', avatar: '/photo/Alchemist.webp', icon: 'flask' },
  druid: { name: '德魯伊', avatar: '/photo/Druid.webp', icon: 'paw' }
};

// One resolver for HUD, cast, attacks, results and Lab. Explicit form always wins.
function resolveBattlePortrait(descriptor = {}, options = {}) {
  if (typeof descriptor === 'string') descriptor = { role: descriptor };
  const role = descriptor.role || descriptor.sourceRole || 'warrior';
  const form = descriptor.druidForm;
  if (role === 'druid' && form === 'werewolf') return { src: '/photo/狼人.webp', name: '狼人', transformed: true };
  if (role === 'druid' && (form === 'treant' || form === 'tree')) return { src: '/photo/遠古樹精.webp', name: '遠古樹精', transformed: true };
  if (descriptor.entityType === 'minion' || descriptor.type === 'wolf' || descriptor.type === 'treant') {
    const index = descriptor.minionIndex || 1;
    return { src: descriptor.avatar || `/photo/${descriptor.type === 'wolf' ? '幼狼' : '小樹精'}${index}.webp`, name: descriptor.name || '自然僕從' };
  }
  if (descriptor.entityType === 'monster') return { src: descriptor.avatar || '/BOSS/Ancient Guardian Golem.webp', name: descriptor.name || '首領' };
  const override = options.allowCustom ? descriptor.customAvatar : null;
  if (override) {
    if (/^(data:image\/|https?:|\/)/.test(override)) return { src: override, name: descriptor.name || role };
    return { emoji: override, name: descriptor.name || role };
  }
  const info = (typeof classesData !== 'undefined' && classesData[role]) || DEFAULT_ROLE_AVATARS[role] || DEFAULT_ROLE_AVATARS.warrior;
  return { src: descriptor.avatarOverride || (options.allowCustom && descriptor.avatar) || info.avatar, name: descriptor.name || info.name };
}
function battlePortraitHtml(descriptor, className = 'combat-banner-portrait', options = {}) {
  const portrait = resolveBattlePortrait(descriptor, options);
  if (portrait.emoji) return `<div class="${className} avatar-emoji-badge">${escapeHtml(portrait.emoji)}</div>`;
  return `<img src="${escapeHtml(portrait.src)}" class="${className}${portrait.transformed ? ' druid-transformed-avatar' : ''}" alt="${escapeHtml(portrait.name)}">`;
}
function getClassPortraitHtml(descriptor, className = 'combat-banner-portrait') {
  return battlePortraitHtml(descriptor, className);
}
function combatActorDescriptor(step) {
  // Before snapshot prevents a final authoritative state from revealing a future form.
  const actor = step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId);
  if (actor) return actor;
  return { role: step.sourceRole, druidForm: step.druidForm, name: step.sourceName };
}

function getClassDisplayName(roleOrPlayer) {
  let roleKey = '';
  if (typeof roleOrPlayer === 'string') {
    roleKey = roleOrPlayer;
  } else if (roleOrPlayer && typeof roleOrPlayer === 'object') {
    roleKey = roleOrPlayer.role || roleOrPlayer.sourceRole || '';
  }
  const roleInfo = (typeof classesData !== 'undefined' && classesData[roleKey]) || DEFAULT_ROLE_AVATARS[roleKey];
  return roleInfo ? roleInfo.name : '冒險者';
}

if (typeof window !== 'undefined') {
  if (!window.getIconSvg) window.getIconSvg = getIconSvg;
  if (!window.getClassPortraitHtml) window.getClassPortraitHtml = getClassPortraitHtml;
  if (!window.getClassDisplayName) window.getClassDisplayName = getClassDisplayName;
}

// --- 5. 浮動數字與 Pixel 特效 ---
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

function playPixelFx(container, fxType) {
  if (!container) return;
  const fx = document.createElement('div');
  fx.className = `pixel-fx pixel-fx-${fxType}`;
  container.appendChild(fx);
  setTimeout(() => {
    fx.remove();
  }, 450);
}

if (typeof window !== 'undefined') {
  if (!window.spawnFloatingText) window.spawnFloatingText = spawnFloatingText;
  if (!window.playPixelFx) window.playPixelFx = playPixelFx;
}

// --- 6. Presentation Manager Fallback ---
if (typeof window !== 'undefined' && !window.presentationManager) {
  window.presentationManager = {
    playedKeys: new Set(),
    isBlocking: false,
    timerState: 'STOPPED',
    hasPlayed(key) { return this.playedKeys.has(key); },
    markPlayed(key) { this.playedKeys.add(key); },
    clear() { this.playedKeys.clear(); this.isBlocking = false; this.timerState = 'STOPPED'; },
    setBlocking(blocking) { this.isBlocking = blocking; }
  };
}
