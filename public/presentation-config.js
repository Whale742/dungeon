// ==========================================================================
// 地城深淵 (DUNGEON ABYSS) - Presentation 核心全域設定 (presentation-config.js)
// Single Source of Truth for timing, tokens, and presentation defaults.
// ==========================================================================

const PRESENTATION_CONFIG = Object.freeze({
  narrative: {
    characterDelay: 40,
    commaDelay: 140,
    sentenceDelay: 280,
    newlineDelay: 380,
    paragraphDelay: 600
  },
  prologue: {
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
  },
  exploration: {
    floorEnter: 600,
    floorHold: 1400,
    floorExit: 600,
    sectionEnter: 600,
    narrativeDelay: 400,
    narrativeHold: 1100,
    promptEnter: 250,
    choiceEnter: 350,
    choiceStagger: 90,
    character: 35,
    comma: 140,
    sentence: 280,
    newline: 380,
    paragraph: 600
  },
  trap: {
    sectionEnter: 600,
    narrativeDelay: 400,
    narrativeHold: 1000,
    storyExit: 500,
    character: 45,
    comma: 140,
    sentence: 280,
    newline: 380,
    paragraph: 600,
    stageEnter: 300,
    anticipation: 200,
    stagger: 150,
    numberDelay: 75,
    numberFloat: 700,
    hold: 650,
    exit: 500
  },
  chest: {
    variant: 'current', // 'current' | 'ancient' | 'abyss'
    scale: 1.0,
    glow: 'low', // 'off' | 'low' | 'medium'
    particles: 'low', // 'off' | 'low' | 'medium'
    shakeStrength: 'subtle', // 'off' | 'subtle' | 'medium'
    sectionEnter: 600,
    narrativeDelay: 400,
    narrativeHold: 1200,
    character: 40,
    comma: 140,
    sentence: 280,
    newline: 380,
    paragraph: 600,
    chestReveal: 450,
    buttonReveal: 250,
    anticipation: 150,
    shake: 260,
    openHold: 400,
    commonReveal: 400,
    commonHold: 1000,
    rareReveal: 550,
    rareHold: 1500,
    exit: 500
  },
  combat: {
    overlayEnter: 300,
    actionEnter: 420,
    actorEnter: 430,
    entryStagger: 70,
    portraitEntryDelay: 70,
    targetEntryDelay: 130,
    intentEntryDelay: 160,
    panelSweepTiming: 240,
    settle: 200,
    anticipation: 250,
    attackCueDelay: 180,
    impact: 220,
    impactDelay: 90,
    hitImpactDelay: 180,
    damageDelay: 75,
    damageFloat: 750,
    hpBarDuration: 420,
    normalKnockDistance: 8,
    normalKnockDuration: 210,
    hitKnockDuration: 210,
    resultHold: 280,
    lethalHold: 350,
    deathDuration: 650,
    actionExit: 400,
    exitStagger: 80,
    sequenceBreathing: 400,
    actionGap: 200,
    bossGap: 350,
    overlayExit: 300
  }
});

// Global export for script tags
if (typeof window !== 'undefined') {
  window.PRESENTATION_CONFIG = PRESENTATION_CONFIG;
}
if (typeof globalThis !== 'undefined') {
  globalThis.PRESENTATION_CONFIG = PRESENTATION_CONFIG;
}
