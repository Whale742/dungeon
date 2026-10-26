// Onmyoji Combat Presentation Lab Scenes
// 1:1 ported from public/assets/Onmyoji.html

const ONMYOJI_LAB_SCENES = Object.freeze({
  onm_basic: {
    label: "引符術｜普攻魔法飛彈",
    role: "onmyoji",
    expected: "陰陽師念動真言，靈符如電飛射 Boss 造成 10 點魔法傷害，伴隨受擊震動與衝擊波。",
    steps: [
      {
        type: "player_action",
        category: "OFFENSIVE",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "basic",
        skillName: "引符術",
        tags: ["魔法"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 10,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 490, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "damage", targetId: "monster", finalDamage: 10, damageType: "magic" }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 10, label: "引符術" }
        ],
        outcome: { type: "normal", label: "引符術" }
      }
    ]
  },

  onm_talisman_blind: {
    label: "五鬼攝魂符｜障目符 (迷霧紫・命中大幅下降)",
    role: "onmyoji",
    expected: "先造成 15 點直接魔法傷害，再貼符。令字敕令印記 ➔ 符咒現形 ➔ 重重貼上震動 ➔ 縮小沒入 ➔ 迷霧紫印記閃耀，附著第 1 張符咒。",
    steps: [
      {
        type: "player_action",
        category: "DEBUFF",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_talisman",
        skillName: "五鬼攝魂符",
        tags: ["魔法", "符咒"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 15,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 485, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":15,"absorbed":0,"tempAbsorbed":0,"hpDmg":15,"actualDamage":15,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_blind","label":"障目符","secondary":"命中大幅下降"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[]},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":15,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_talisman_blind:0:0","targetRelation":"primary"},
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":0,"absorbed":0,"tempAbsorbed":0,"hpDmg":0,"actualDamage":0,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_blind","label":"障目符","secondary":"命中大幅下降"},"damageType":"magic","targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_talisman_blind:0:1","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[{"id":"talisman_blind_0","label":"blind"}],"outcome":{"type":"talisman_blind","label":"障目符","secondary":"命中大幅下降"},"targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_talisman","skillId":"onm_talisman","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":2,"resultId":"lab-onm_talisman_blind:0:2","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 15, label: "五鬼攝魂符" },
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "障目符" }
        ],
        outcome: { type: "talisman_blind", label: "障目符", secondary: "命中大幅下降" }
      }
    ]
  },

  onm_talisman_seal: {
    label: "五鬼攝魂符｜封勁符 (寒冰藍・當回合 0 傷害)",
    role: "onmyoji",
    expected: "先造成 15 點直接魔法傷害，再貼符。四階段貼符動畫，閃耀寒冰藍五鬼印記，Boss 身上累積符咒。",
    steps: [
      {
        type: "player_action",
        category: "DEBUFF",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_talisman",
        skillName: "五鬼攝魂符",
        tags: ["魔法", "符咒"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 15,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 485, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":15,"absorbed":0,"tempAbsorbed":0,"hpDmg":15,"actualDamage":15,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_seal","label":"封勁符","secondary":"100%封勁"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":15,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_talisman_seal:0:0","targetRelation":"primary"},
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":0,"absorbed":0,"tempAbsorbed":0,"hpDmg":0,"actualDamage":0,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_seal","label":"封勁符","secondary":"100%封勁"},"damageType":"magic","targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_talisman_seal:0:1","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[{"id":"talisman_blind_0","label":"blind"},{"id":"talisman_seal_1","label":"seal"}],"outcome":{"type":"talisman_seal","label":"封勁符","secondary":"100%封勁"},"targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (1)","icon":"debuff","stacks":1,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_talisman","skillId":"onm_talisman","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":2,"resultId":"lab-onm_talisman_seal:0:2","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 15, label: "五鬼攝魂符" },
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "封勁符" }
        ],
        outcome: { type: "talisman_seal", label: "封勁符", secondary: "100%封勁" }
      }
    ]
  },

  onm_talisman_corrode: {
    label: "五鬼攝魂符｜蝕體符 (毒蝕綠・易傷 +10%)",
    role: "onmyoji",
    expected: "先造成 15 點直接魔法傷害，再貼符。四階段貼符動畫，閃耀毒蝕綠五鬼印記，Boss 獲得易傷狀態。",
    steps: [
      {
        type: "player_action",
        category: "DEBUFF",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_talisman",
        skillName: "五鬼攝魂符",
        tags: ["魔法", "符咒"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 15,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 485, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":15,"absorbed":0,"tempAbsorbed":0,"hpDmg":15,"actualDamage":15,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_corrode","label":"蝕體符","secondary":"易傷 +10%"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":15,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_talisman_corrode:0:0","targetRelation":"primary"},
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":0,"absorbed":0,"tempAbsorbed":0,"hpDmg":0,"actualDamage":0,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_corrode","label":"蝕體符","secondary":"易傷 +10%"},"damageType":"magic","targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_talisman_corrode:0:1","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[{"id":"talisman_blind_0","label":"blind"},{"id":"talisman_seal_1","label":"seal"},{"id":"talisman_corrode_2","label":"corrode"}],"outcome":{"type":"talisman_corrode","label":"蝕體符","secondary":"易傷 +10%"},"targetBefore":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (2)","icon":"debuff","stacks":2,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":485,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_talisman","skillId":"onm_talisman","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":2,"resultId":"lab-onm_talisman_corrode:0:2","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 15, label: "五鬼攝魂符" },
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "蝕體符" }
        ],
        outcome: { type: "talisman_corrode", label: "蝕體符", secondary: "易傷 +10%" }
      }
    ]
  },

  onm_talisman_confuse: {
    label: "五鬼攝魂符｜惑心符 (妖異桃紅・心智混亂出手自殘)",
    role: "onmyoji",
    expected: "先造成 16 點直接魔法傷害，再貼符。四階段貼符動畫，閃耀妖異桃紅五鬼印記，下回合出手時造成自殘反噬。",
    steps: [
      {
        type: "player_action",
        category: "DEBUFF",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_talisman",
        skillName: "五鬼攝魂符",
        tags: ["魔法", "符咒"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 16,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 484, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":16,"absorbed":0,"tempAbsorbed":0,"hpDmg":16,"actualDamage":16,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_confuse","label":"惑心符","secondary":"惑心反噬"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"targetAfter":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":16,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_talisman_confuse:0:0","targetRelation":"primary"},
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":0,"absorbed":0,"tempAbsorbed":0,"hpDmg":0,"actualDamage":0,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_confuse","label":"惑心符","secondary":"惑心反噬"},"damageType":"magic","targetBefore":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_talisman_confuse:0:1","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[{"id":"talisman_blind_0","label":"blind"},{"id":"talisman_seal_1","label":"seal"},{"id":"talisman_corrode_2","label":"corrode"},{"id":"talisman_confuse_3","label":"confuse"}],"outcome":{"type":"talisman_confuse","label":"惑心符","secondary":"惑心反噬"},"targetBefore":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (3)","icon":"debuff","stacks":3,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_talisman","skillId":"onm_talisman","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":2,"resultId":"lab-onm_talisman_confuse:0:2","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 16, label: "五鬼攝魂符" },
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "惑心符" }
        ],
        outcome: { type: "talisman_confuse", label: "惑心符", secondary: "惑心反噬" }
      }
    ]
  },

  onm_talisman_drain: {
    label: "五鬼攝魂符｜抽髓符 (血煞紅・立即扣除 5% 最大生命)",
    role: "onmyoji",
    expected: "先造成 16 點直接魔法傷害，再貼符。四階段貼符動畫，閃耀血煞紅五鬼印記，並立即削血 5% (25 HP)。",
    steps: [
      {
        type: "player_action",
        category: "DEBUFF",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_talisman",
        skillName: "五鬼攝魂符",
        tags: ["魔法", "符咒"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 41,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 459, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse", "drain"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":16,"absorbed":0,"tempAbsorbed":0,"hpDmg":16,"actualDamage":16,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_drain","label":"抽髓符","secondary":"削血 5%"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"targetAfter":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":16,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_talisman_drain:0:0","targetRelation":"primary"},
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":25,"absorbed":0,"tempAbsorbed":0,"hpDmg":25,"actualDamage":25,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"talisman_drain","label":"抽髓符","secondary":"削血 5%"},"damageType":"magic","targetBefore":{"hp":484,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":459,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"actionId":"onm_talisman","skillId":"onm_talisman","actualHpDamage":25,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_talisman_drain:0:1","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[{"id":"talisman_blind_0","label":"blind"},{"id":"talisman_seal_1","label":"seal"},{"id":"talisman_corrode_2","label":"corrode"},{"id":"talisman_confuse_3","label":"confuse"},{"id":"talisman_drain_4","label":"drain"}],"outcome":{"type":"talisman_drain","label":"抽髓符","secondary":"削血 5%"},"targetBefore":{"hp":459,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (4)","icon":"debuff","stacks":4,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}],"tempHp":0},"targetAfter":{"hp":459,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (5)","icon":"debuff","stacks":5,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1}]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_talisman","skillId":"onm_talisman","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":2,"resultId":"lab-onm_talisman_drain:0:2","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 16, label: "五鬼攝魂符" },
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 25, label: "抽髓符" }
        ],
        outcome: { type: "talisman_drain", label: "抽髓符", secondary: "削血 5%" }
      }
    ]
  },

  onm_detonate_empty: {
    label: "百符引爆｜0 張符咒 (無符咒可引爆)",
    role: "onmyoji",
    expected: "目標身上 0 張符咒時，施法後顯示無符咒可引爆 (0 傷害)，不觸發爆炸。",
    steps: [
      {
        type: "player_action",
        category: "OFFENSIVE",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_detonate",
        skillName: "急急如律令・百符引爆",
        tags: ["魔法"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "百符引爆(無符咒)" }
        ],
        outcome: { type: "detonate_empty", label: "百符引爆", secondary: "無符咒" }
      }
    ]
  },

  onm_detonate_5: {
    label: "百符引爆｜5 張符咒 (10 + 5×3 = 25 點傷害)",
    role: "onmyoji",
    expected: "5 張符咒橘光共鳴 ➔ 螺旋聚拢至中心 ➔ 轟然爆炸 ➔ 符咒化灰飄落 ➔ 扣除 25 HP 並全數清除符咒。",
    steps: [
      {
        type: "player_action",
        category: "OFFENSIVE",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_detonate",
        skillName: "急急如律令・百符引爆",
        tags: ["魔法"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 25,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "confuse", "drain", "drain"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 475, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":25,"absorbed":0,"tempAbsorbed":0,"hpDmg":25,"actualDamage":25,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"detonate_burst","label":"百符引爆","secondary":"5張符咒"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","confuse","drain","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (5)","icon":"debuff","stacks":5,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}]},"targetAfter":{"hp":475,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","confuse","drain","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (5)","icon":"debuff","stacks":5,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}],"tempHp":0},"actionId":"onm_detonate","skillId":"onm_detonate","actualHpDamage":25,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_detonate_5:0:0","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[],"outcome":{"type":"detonate_burst","label":"百符引爆","secondary":"5張符咒"},"targetBefore":{"hp":475,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","confuse","drain","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (5)","icon":"debuff","stacks":5,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":1},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}],"tempHp":0},"targetAfter":{"hp":475,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_detonate","skillId":"onm_detonate","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_detonate_5:0:1","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 25, label: "百符引爆" }
        ],
        outcome: { type: "detonate_burst", label: "百符引爆", secondary: "5張符咒" }
      }
    ]
  },

  onm_detonate_10_max: {
    label: "百符引爆｜10 張符咒滿層引爆 (基礎 40，含易傷 48 點)",
    role: "onmyoji",
    expected: "滿層 10 張符咒壯觀螺旋匯聚引爆，造成 48 點傷害（基礎 40，加上兩張蝕體符易傷），結算後全數銷毀。",
    steps: [
      {
        type: "player_action",
        category: "OFFENSIVE",
        sourceId: "p0",
        sourceName: "陰陽師",
        sourceRole: "onmyoji",
        actionId: "onm_detonate",
        skillName: "急急如律令・百符引爆",
        tags: ["魔法"],
        targetId: "monster",
        targetName: "荒神鬼王・羅剎",
        monsterName: "荒神鬼王・羅剎",
        monsterAvatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
        finalDamage: 48,
        hpSnapshotBefore: {
          monster: {
            hp: 500,
            maxHp: 500,
            name: "荒神鬼王・羅剎",
            avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp",
            talismans: ["blind", "seal", "corrode", "confuse", "drain", "blind", "seal", "corrode", "confuse", "drain"]
          },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 452, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          {"kind":"damage","targetId":"monster","targetEnemyId":"monster","finalDamage":48,"absorbed":0,"tempAbsorbed":0,"hpDmg":48,"actualDamage":48,"sourceId":"p0","isSecondaryEnemy":false,"outcome":{"type":"detonate_burst","label":"百符引爆","secondary":"10張符咒"},"damageType":"magic","targetBefore":{"hp":500,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse","drain","blind","seal","corrode","confuse","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (10)","icon":"debuff","stacks":10,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}]},"targetAfter":{"hp":452,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse","drain","blind","seal","corrode","confuse","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (10)","icon":"debuff","stacks":10,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}],"tempHp":0},"actionId":"onm_detonate","skillId":"onm_detonate","actualHpDamage":48,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":0,"resultId":"lab-onm_detonate_10_max:0:0","targetRelation":"primary"},
          {"kind":"status","targetId":"monster","statuses":[],"outcome":{"type":"detonate_burst","label":"百符引爆","secondary":"10張符咒"},"targetBefore":{"hp":452,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":["blind","seal","corrode","confuse","drain","blind","seal","corrode","confuse","drain"],"instanceId":"monster","statuses":[{"id":"talismans","label":"符咒 (10)","icon":"debuff","stacks":10,"isNegative":true,"category":"DEBUFF"},{"id":"talisman_blind","label":"障目符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_seal","label":"封勁符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_corrode","label":"蝕體符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_confuse","label":"惑心符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2},{"id":"talisman_drain","label":"抽髓符","icon":"debuff","isNegative":true,"category":"DEBUFF","stacks":2}],"tempHp":0},"targetAfter":{"hp":452,"maxHp":500,"name":"荒神鬼王・羅剎","avatar":"/assets/enemies/bosses/portraits/Ancient Guardian Golem.webp","talismans":[],"instanceId":"monster","statuses":[]},"sourceId":"p0","targetEnemyId":"monster","actionId":"onm_detonate","skillId":"onm_detonate","actualDamage":0,"actualHpDamage":0,"actualAbsorbed":0,"actualHeal":0,"actualShield":0,"sequence":1,"resultId":"lab-onm_detonate_10_max:0:1","targetRelation":"primary"}
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 48, label: "百符引爆" }
        ],
        outcome: { type: "detonate_burst", label: "百符引爆", secondary: "10張符咒" }
      }
    ]
  }
});

if (typeof window !== 'undefined') {
  window.ONMYOJI_LAB_SCENES = ONMYOJI_LAB_SCENES;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ONMYOJI_LAB_SCENES = ONMYOJI_LAB_SCENES;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ONMYOJI_LAB_SCENES };
}
