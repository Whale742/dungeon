// Asset routing extends the existing SFXManager; no separate playback system.
// Durations and identity windows measured from decoded PCM (artifacts/audio).
const SFX_ASSETS = Object.freeze(Object.fromEntries([
  ['fight', 'fight', .45, 'panel_sweep', .30, 850],
  ['dreamwaver-swoosh', 'swoosh', .6, null, .05, 300],
  ['dreamwaver-rope', 'dreamwaver-rope', .65, null, 0, 816],
  ['dreamwaver-pa', 'dreamwaver-pa', .65, null, 0, 1104],
  ['dreamwaver-dream', 'dreamwaver-dream', .5, null, 0, 2350, 9.936],
  ['dreamwaver-posi', 'dreamwaver-posi', .6, null, 0, 2424],
  ['dreamwaver-nage', 'dreamwaver-nage', .6, null, 0, 4102],
  ['samurai-skill', 'samurai-skill', .65, 'warrior_skill1', 0, 1000, 30],
  ['samurai-skill2-intro', 'samurai-skill2-intro', .65, null, 0, 1000, 30],
  ['samurai_parry', 'parry', .55, 'shield_block', 0, 300],
  ['sage_snap', 'sage_snap', .55, 'physical_hit', 0, 200, 30],
  ['sage-attack', 'sage-attack', .55, 'physical_hit', 0, 200, 30],
  ['sage_func', 'sage_func', .45, 'magic_impact', 0, 200, 30],
  ['sage_cal', 'sage_cal', .45, 'magic_impact', 0, 200, 30],
  ['sage_pong', 'sage_pong', .55, 'physical_hit', 0, 200, 30],
  ['sage_laser', 'sage_laser', .55, 'magic_impact', 0, 1600, 2.5],
  ['sage-laser', 'sage_laser', .55, 'magic_impact', 0, 1600, 2.5],
  ['stargazer_obv', 'stargazer-obv', .55, 'mage_skill2', 0, 1000],
  ['stargazer-obv', 'stargazer-obv', .55, 'mage_skill2', 0, 1000],
  ['stargazer_confir', 'stargazer-confir', .6, 'magic_impact', 0, 1200],
  ['stargazer-confir', 'stargazer-confir', .6, 'magic_impact', 0, 1200],
  ['warrior_basic', 'sword-slash-light', .65, 'warrior_xing', .55, 450],
  ['warrior_skill1', 'sword-slash-heavy', .5, 'warrior_xing', .05, 750],
  ['mage_basic', 'mage-basic', .5, 'mage_burst', .30, 850],
  ['mage_skill1', 'mage-skill-1', .4, 'mage_burst', .35, 1450],
  ['mage_skill2', 'mage-skill-2', .5, 'mage_burst', .30, 1350],
  ['arrow_release', 'swoosh', .6, 'archer_twang', .05, 300],
  ['archer_rain', 'archer-skill2', .6, 'arrow_flight', 0, 2400, Infinity],
  ['gladiator_triumph', 'Gladitor-back-2', .6, 'shield_block', 0, 1200, Infinity],
  ['assassin_pursuit', 'assassin-pursuit', .55, 'shadow_follow_up', 0, 350],
  ['bard_basic', 'bard-attack', .4, 'bard_tone', 0, 1600],
  ['bard_skill1', 'bard-skill1', .35, 'bard_tone', .10, 4400],
  ['bard_skill2', 'bard-skill2', .45, 'bard_tone', .10, 2600],
  ['bottle_throw', 'swoosh', .5, 'acid_throw', .05, 300],
  ['bottle_impact', 'glass', .6, 'acid_splash', 0, 300],
  ['alchemy_skill1', 'alchemy-skill1', .4, 'acid_throw', 0, 1600],
  ['healing_result', 'healing', .55, 'recovery_chime', .30, 1400],
  ['warrior_defense', 'healing', .45, 'shield_apply', .30, 1400],
  ['transform_wolf', 'druid-transform-wolf', .4, 'transform_wolf', .05, 2900],
  ['transform_treant', 'druid-transform-treant', .7, 'transform_treant', 0, 450],
  ['treant_action', 'druid-treant-action', .7, 'vine_strike', 0, 400],
  ['wolf_action', 'druid-wolf-action', .5, 'minion_attack', .05, 800],
  ['logo_intro', 'logo-intro', .4, 'round_start', 0, 5800, Infinity],
  ['chest_reveal', 'chest-reveal', .46, 'chest_open', .25, 1900],
  ['boss_warning', 'warning', .55, 'boss_warning', 0, 4700],
  ['boss_entrance', 'boss', .27, 'boss_boom', 0, 1000, Infinity],
  ['walk', 'walk', .4, null, 0, 2000, 120],
  ['victory', 'victory', .16, 'victory', 0, 3900]
].map(([key, file, volume, fallback, offset, identityBeatMs, maxDuration]) => [key, Object.freeze({
  src: '/sound/' + file + '.mp3', bindingKey:'sfx.'+key, volume, fallback, offset, identityBeatMs,
  // A short fade preserves the tail without waiting for silence/file ended.
  maxDuration: maxDuration ?? (identityBeatMs + 200) / 1000
})])));

const SFX_ALIASES = Object.freeze({
  panel_sweep: 'fight', panel_shoo: 'fight', action_whoosh: 'fight', combat_skill_sweep: 'fight',
  'assassin-pursuit': 'assassin_pursuit', 'sword-slash-light': 'warrior_basic', 'sword-slash-heavy': 'warrior_skill1',
  warrior_xing: 'warrior_skill1', sword_slash: 'warrior_skill1', sword_whoosh: 'warrior_skill1',
  mage_burst: 'mage_skill1', arcane_bomb: 'mage_skill1', archer_twang: 'arrow_release',
  assassin_dual: 'warrior_skill1', shadow_follow_up: 'assassin_pursuit', bard_tone: 'bard_basic',
  acid_throw: 'alchemy_skill1', chest_open: 'chest_reveal', boss_boom: 'boss_entrance',
  summon_wolf: 'wolf_action', summon_treant: 'treant_action'
});

// Single owner for role + skill + form audio choices. Result cues remain server driven.
const SFX_PRESENTATION_PROFILES = Object.freeze({
  dreamweaver: {basic:null,dw_butterfly:null,dw_false_dream:null},
  stargazer: {basic:null,sg_observe:'stargazer_obv',sg_clock:'bard_skill2'},
  gladiator: {basic:'warrior_basic',g_sacrifice:'warrior_skill1',g_arena:'warrior_skill1'},
  samurai: {basic:'warrior_basic',sa_cut:'samurai-skill',sa_tsubame:'samurai-skill',sa_counter:'samurai-skill'},
  sage: {basic:'sage-attack',sge_deduce:'sage-attack',sge_induce:'sage-attack',sge_equation:null},
  warrior: { basic: 'warrior_basic', w_strike: 'warrior_skill1', w_shield_slam: 'warrior_skill1', w_cleave: 'warrior_skill1', w_shield: 'warrior_defense' },
  mage: { basic: 'mage_basic', m_blast: 'mage_skill1', m_fireball: 'mage_skill1', m_drain: 'mage_skill2' },
  archer: { basic: 'arrow_release', a_shot: 'arrow_release', a_rain: 'archer_rain', a_reload: null, a_frenzy_reload: null },
  assassin: { basic: 'warrior_basic', s_stab: 'warrior_skill1', s_smoke: 'warrior_skill1' },
  bard: { basic: 'bard_basic', b_heal: 'bard_skill1', b_revive: 'bard_skill1', b_nocturne: 'bard_skill1', b_buff: 'bard_skill2', b_frenzy: 'bard_skill2' },
  alchemist: { basic: 'bottle_throw', alc_flask: 'alchemy_skill1', alc_acid: 'alchemy_skill1', alc_poison: 'alchemy_skill1', alc_fate: null },
  druid: { basic: null, dru_transform: null, dru_summon_wolf: null, dru_summon_treant: null }
});
function resolveCombatSfxProfile(step) {
  const role = step.sourceRole || step.role;
  const action = step.actionId || step.skillId || 'basic';
  const form = step.druidForm || step.hpSnapshotBefore?.players?.find(p => p.id === step.sourceId)?.druidForm;
  let key = SFX_PRESENTATION_PROFILES[role]?.[action];
  if (role === 'druid' && action === 'basic' && ['treant', 'tree'].includes(form)) key = 'treant_action';
  if (role === 'druid' && action === 'basic' && form === 'werewolf') key = 'claw_slash';
  if (step.category === 'FOLLOW_UP') key = 'assassin_pursuit';
  const doubleSlash = role === 'assassin' && key === 'warrior_skill1' && action === 's_stab';
  return { key, doubleSlash, identityBeatMs: SFX_ASSETS[key]?.identityBeatMs || 0,
    impactKey: role === 'alchemist' ? 'bottle_impact' : null,
    suppressImpact: false,
    bottleSequence: role === 'alchemist' && key === 'alchemy_skill1',
    impactVolume: ['warrior', 'assassin', 'mage'].includes(role) ? .28 : 1 };
}

function minionSound(minion, phase = 'attack', index = 0) {
  return { key: minion?.type === 'wolf' ? 'wolf_action' : 'treant_action',
    instance: 'minion-' + minion?.id + '-' + phase,
    volume: (phase === 'hurt' ? .55 : index ? .9 : 1),
    offset: minion?.type === 'wolf' ? (phase === 'hurt' ? 2.35 : phase === 'summon' ? .05 : .5) : 0 };
}

// This hold uses the presentation clock; Lab speed never changes MP3 pitch/rate.
function createSfxPresentationScope(context = {}) {
  let holdUntil = 0;
  const playedResults = new Set();
  const speed = context.speed || 1;
  return {
    playResult(key, options = {}) {
      if (playedResults.has(key)) return Promise.resolve(null);
      playedResults.add(key);
      return this.play(key, options);
    },
    play(key, options = {}) {
      const canonical = SFX_ALIASES[key] || key;
      const profile = SFX_ASSETS[canonical];
      if (profile && !options.noHold) holdUntil = Math.max(holdUntil, performance.now() + profile.identityBeatMs / speed);
      return sfxManager.play(key, { signal: context.signal || context.controller?.signal, ...options });
    },
    async hold() {
      const remaining = holdUntil - performance.now();
      if (remaining > 0) await waitForPresentation(remaining * speed, context.signal || context.controller?.signal, speed);
    }
  };
}

if (typeof window !== 'undefined') Object.assign(window, { SFX_ASSETS, SFX_ALIASES, SFX_PRESENTATION_PROFILES, resolveCombatSfxProfile });
