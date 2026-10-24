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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 10,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 490, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
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
    expected: "令字敕令印記 ➔ 符咒現形 ➔ 重重貼上震動 ➔ 縮小沒入 ➔ 迷霧紫印記閃耀，附著第 1 張符咒。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "status", targetId: "monster", outcome: { type: "talisman_blind" } }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "障目符" }
        ],
        outcome: { type: "talisman_blind", label: "障目符", secondary: "命中大幅下降" }
      }
    ]
  },

  onm_talisman_seal: {
    label: "五鬼攝魂符｜封勁符 (寒冰藍・當回合 0 傷害)",
    role: "onmyoji",
    expected: "四階段貼符動畫，閃耀寒冰藍五鬼印記，Boss 身上累積符咒。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "status", targetId: "monster", outcome: { type: "talisman_seal" } }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "封勁符" }
        ],
        outcome: { type: "talisman_seal", label: "封勁符", secondary: "100%封勁" }
      }
    ]
  },

  onm_talisman_corrode: {
    label: "五鬼攝魂符｜蝕體符 (毒蝕綠・易傷 +10%)",
    role: "onmyoji",
    expected: "四階段貼符動畫，閃耀毒蝕綠五鬼印記，Boss 獲得易傷狀態。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "status", targetId: "monster", outcome: { type: "talisman_corrode" } }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "蝕體符" }
        ],
        outcome: { type: "talisman_corrode", label: "蝕體符", secondary: "易傷 +10%" }
      }
    ]
  },

  onm_talisman_confuse: {
    label: "五鬼攝魂符｜惑心符 (妖異桃紅・心智混亂出手自殘)",
    role: "onmyoji",
    expected: "四階段貼符動畫，閃耀妖異桃紅五鬼印記，下回合出手時造成自殘反噬。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "status", targetId: "monster", outcome: { type: "talisman_confuse" } }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 0, label: "惑心符" }
        ],
        outcome: { type: "talisman_confuse", label: "惑心符", secondary: "惑心反噬" }
      }
    ]
  },

  onm_talisman_drain: {
    label: "五鬼攝魂符｜抽髓符 (血煞紅・立即扣除 2% 最大生命)",
    role: "onmyoji",
    expected: "四階段貼符動畫，閃耀血煞紅五鬼印記，並立即削血 2% (10 HP)。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 10,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 490, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "corrode", "confuse", "drain"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "damage", targetId: "monster", finalDamage: 10, damageType: "magic" },
          { kind: "status", targetId: "monster", outcome: { type: "talisman_drain" } }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 10, label: "抽髓符" }
        ],
        outcome: { type: "talisman_drain", label: "抽髓符", secondary: "削血 2%" }
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 0,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 25,
        hpSnapshotBefore: {
          monster: { hp: 500, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: ["blind", "seal", "confuse", "drain", "drain"] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 475, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "damage", targetId: "monster", finalDamage: 25, damageType: "magic" }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 25, label: "百符引爆" }
        ],
        outcome: { type: "detonate_burst", label: "百符引爆", secondary: "5張符咒" }
      }
    ]
  },

  onm_detonate_10_max: {
    label: "百符引爆｜10 張符咒滿層引爆 (40 點傷害上限)",
    role: "onmyoji",
    expected: "滿層 10 張符咒壯觀螺旋匯聚引爆，造成 40 點上限傷害，結算後全數銷毀。",
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
        monsterAvatar: "/BOSS/Ancient Guardian Golem.webp",
        finalDamage: 40,
        hpSnapshotBefore: {
          monster: {
            hp: 500,
            maxHp: 500,
            name: "荒神鬼王・羅剎",
            avatar: "/BOSS/Ancient Guardian Golem.webp",
            talismans: ["blind", "seal", "corrode", "confuse", "drain", "blind", "seal", "corrode", "confuse", "drain"]
          },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        hpSnapshot: {
          monster: { hp: 460, maxHp: 500, name: "荒神鬼王・羅剎", avatar: "/BOSS/Ancient Guardian Golem.webp", talismans: [] },
          players: [{ id: "p0", name: "陰陽師", role: "onmyoji", hp: 70, maxHp: 70 }]
        },
        results: [
          { kind: "damage", targetId: "monster", finalDamage: 40, damageType: "magic" }
        ],
        visualEvents: [
          { type: "player_attack", sourceId: "p0", target: "monster", dmgType: "mag", value: 40, label: "百符引爆" }
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
