// Deterministic Lab fixtures for Augur (卜者); playback calls the production dispatcher directly.
const AUGUR_LAB_SCENES = (() => {
  const clone = s => structuredClone(s);

  const baseAugur = {
    id: 'hero',
    name: '卜者',
    role: 'augur',
    hp: 70,
    maxHp: 70,
    observedTargetId: 'p2',
    augurCardState: 'empty',
    augurFateDebts: []
  };

  const baseSamurai = {
    id: 'p2',
    name: '武士',
    role: 'samurai',
    hp: 80,
    maxHp: 80
  };

  const baseMonster = {
    id: 'monster',
    name: '深淵執印者',
    hp: 500,
    maxHp: 500
  };

  const defaultSnapshot = {
    players: [clone(baseAugur), clone(baseSamurai)],
    monster: clone(baseMonster)
  };

  const scenes = {
    augur_basic: {
      label: 'Augur · 水晶折光 (Basic Attack)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'ATTACK',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        actionId: 'basic',
        skillName: '水晶折光',
        targetId: 'monster',
        finalDamage: 10,
        hpSnapshotBefore: clone(defaultSnapshot),
        hpSnapshot: {
          players: [clone(baseAugur), clone(baseSamurai)],
          monster: { ...clone(baseMonster), hp: 490 }
        },
        results: [{
          kind: 'damage',
          targetId: 'monster',
          finalDamage: 10,
          hpDamage: 10,
          targetBefore: clone(baseMonster),
          targetAfter: { ...clone(baseMonster), hp: 490 }
        }]
      }]
    },

    augur_bind: {
      label: 'Augur · 命運繫結 (Skill 1 - Fate Binding)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'BUFF',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        actionId: 'aug_bind',
        skillName: '命運繫結',
        targetPlayerId: 'p2',
        outcome: { type: 'bind', label: '命運繫結', targetId: 'p2', targetName: '武士' },
        hpSnapshotBefore: clone(defaultSnapshot),
        hpSnapshot: clone(defaultSnapshot),
        results: []
      }]
    },

    augur_reckon: {
      label: 'Augur · 命運清算・凶兆逆位 (Skill 2 - Reckoning)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'DEBUFF',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        actionId: 'aug_reckon',
        skillName: '命運清算・凶兆逆位',
        targetId: 'monster',
        finalDamage: 15,
        hpSnapshotBefore: {
          players: [{ ...clone(baseAugur), hp: 55 }, { ...clone(baseSamurai), hp: 65 }],
          monster: clone(baseMonster)
        },
        hpSnapshot: {
          players: [{ ...clone(baseAugur), hp: 65 }, { ...clone(baseSamurai), hp: 75 }],
          monster: { ...clone(baseMonster), hp: 485 }
        },
        results: [
          {
            kind: 'damage',
            targetId: 'monster',
            finalDamage: 15,
            hpDamage: 15,
            targetBefore: clone(baseMonster),
            targetAfter: { ...clone(baseMonster), hp: 485 }
          },
          {
            kind: 'heal',
            targetId: 'hero',
            finalHeal: 10,
            targetBefore: { ...clone(baseAugur), hp: 55 },
            targetAfter: { ...clone(baseAugur), hp: 65 }
          },
          {
            kind: 'heal',
            targetId: 'p2',
            finalHeal: 10,
            targetBefore: { ...clone(baseSamurai), hp: 65 },
            targetAfter: { ...clone(baseSamurai), hp: 75 }
          }
        ]
      }]
    },

    augur_reverse: {
      label: 'Augur · 逆位・違逆命運 (Reversed Intercept)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'INTERVENTION',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        actionId: 'aug_reverse',
        skillName: '逆位・違逆命運',
        targetId: 'p2',
        hpSnapshotBefore: clone(defaultSnapshot),
        hpSnapshot: clone(defaultSnapshot),
        results: []
      }]
    },

    augur_upright: {
      label: 'Augur · 正位・順應命運 (Upright Fortune)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'INTERVENTION',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        actionId: 'aug_upright',
        skillName: '正位・順應命運',
        targetId: 'p2',
        hpSnapshotBefore: clone(defaultSnapshot),
        hpSnapshot: clone(defaultSnapshot),
        results: []
      }]
    },

    augur_expiry: {
      label: 'Augur · 命債清算 (Debt Expiry Backlash)',
      role: 'augur',
      steps: [{
        type: 'player_action',
        category: 'DEBT_EXPIRY',
        sourceId: 'hero',
        sourceName: '卜者',
        sourceRole: 'augur',
        skillName: '命債清算',
        targetId: 'hero',
        hpSnapshotBefore: clone(defaultSnapshot),
        hpSnapshot: {
          players: [{ ...clone(baseAugur), hp: 50 }, clone(baseSamurai)],
          monster: clone(baseMonster)
        },
        results: [{
          kind: 'damage',
          targetId: 'hero',
          finalDamage: 20,
          hpDamage: 20,
          targetBefore: clone(baseAugur),
          targetAfter: { ...clone(baseAugur), hp: 50 }
        }]
      }]
    }
  };

  return Object.freeze(scenes);
})();

if (typeof window !== 'undefined') {
  window.AUGUR_LAB_SCENES = AUGUR_LAB_SCENES;
}
