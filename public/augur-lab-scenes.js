// Augur Lab Fixtures for Presentation Lab
const AUGUR_LAB_SCENES = (() => {
  const clone = s => structuredClone(s);

  function basePlayer(id, role, name, hp, maxHp) {
    return {
      id, role, name, hp, maxHp, tempHp: 0,
      equips: [], statuses: [], isHiddenThisRound: false
    };
  }

  function baseMonster(hp = 500, maxHp = 500) {
    return {
      id: 'monster', name: '深淵執印者', hp, maxHp, tempHp: 0, statuses: []
    };
  }

  function makeAugurStep(actionId, skillName, damage = 0, results = []) {
    const augur = basePlayer('hero', 'augur', '卜者', 70, 70);
    const ally = basePlayer('p1', 'sage', '智者', 66, 90);
    augur.observedTargetId = 'p1';
    const monster = baseMonster(500, 500);

    const step = {
      type: 'player_action',
      sourceId: 'hero',
      sourceRole: 'augur',
      sourceName: '卜者',
      actionId,
      skillId: actionId,
      skillName,
      targetId: 'monster',
      finalDamage: damage,
      actorHpBefore: 70,
      actorMaxHp: 70,
      monsterName: '深淵執印者',
      monsterAvatar: 'photo/boss.webp',
      hpSnapshotBefore: {
        players: [augur, ally],
        monster: clone(monster)
      },
      results: results.length ? results : (damage > 0 ? [{
        targetId: 'monster',
        kind: 'damage',
        finalDamage: damage,
        targetBefore: clone(monster),
        targetAfter: { ...clone(monster), hp: Math.max(0, monster.hp - damage) },
        hpSnapshot: {
          players: [augur, ally],
          monster: { ...clone(monster), hp: Math.max(0, monster.hp - damage) }
        }
      }] : []),
      hpSnapshot: {
        players: [augur, ally],
        monster: { ...clone(monster), hp: Math.max(0, monster.hp - damage) }
      }
    };
    return step;
  }

  const scenes = {
    augur_basic: {
      label: 'Augur · 水晶折光 (Basic)',
      role: 'augur',
      steps: [makeAugurStep('basic', '水晶折光', 10)]
    },
    augur_bind: {
      label: 'Augur · 命運繫結 (Skill 1)',
      role: 'augur',
      steps: [makeAugurStep('aug_bind', '命運繫結', 0)]
    },
    augur_reckon: {
      label: 'Augur · 命運清算・凶兆逆位 (Skill 2)',
      role: 'augur',
      steps: [makeAugurStep('aug_reckon', '命運清算・凶兆逆位', 15)]
    },
    augur_intercept: {
      label: 'Augur · 完整逆位攔截 (Scene 01)',
      role: 'augur',
      steps: [makeAugurStep('aug_bind', '逆位・違逆命運', 0)]
    },
    augur_high_debt: {
      label: 'Augur · 高命債清算 (Scene 02)',
      role: 'augur',
      steps: [makeAugurStep('aug_reckon', '命運清算 · 高命債', 15)]
    },
    augur_contract: {
      label: 'Augur · 禁忌聖契連動 (Scene 03)',
      role: 'augur',
      steps: [makeAugurStep('basic', '聖契連動 · 水晶折光', 10)]
    },
    augur_expiry: {
      label: 'Augur · 命債到期反噬 (Scene 05)',
      role: 'augur',
      steps: [makeAugurStep('basic', '命債到期清算', 0)]
    },
    augur_upright: {
      label: 'Augur · 正位・順應命運 (Scene 06)',
      role: 'augur',
      steps: [makeAugurStep('aug_bind', '正位・順應命運', 0)]
    }
  };

  return Object.freeze(scenes);
})();

if (typeof window !== 'undefined') {
  window.AUGUR_LAB_SCENES = AUGUR_LAB_SCENES;
}
