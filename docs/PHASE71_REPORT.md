# Phase 7.1 完成報告

日期：2026-10-06

## Audit 與 owner

| Owner | 責任 |
| --- | --- |
| `public/combat.js` | 職業／技能／變身 profile、攻擊 Cut-in、集中素材 mapping、素材 preload、共用 `createCombatFx()` |
| `public/combat-expansion.js` | 分類 dispatcher、共用 Skill Cast、召喚／變身／上膛結果、僕從共擊、逐目標結果 |
| `public/presentation-core.js` | `resolveBattlePortrait()`、HTML wrapper、來源快照解析與共用音效 |
| `public/app.js` | Queue lifecycle、權威狀態暫存、局部 HP／頭像／僕從 HUD 投影 |
| `game/Room.js`、`game/combat-schema.js` | 遊戲權威結果、逐擊快照、owner 後僕從追擊、變身後獨立強化普攻、上膛資料 |
| `public/presentation-lab.js` | 呼叫正式演出 API 與投影正式快照，沒有 Lab 專用特效 |

## 1–7：素材與攻擊特效

`public/assets/` 實際只有 `beast-claw-scratch.svg`（23,538 bytes，viewBox 600 × 600）。直接使用原始素材，未下載圖片、生成 placeholder 或改寫來源 SVG。

| Mapping | Browser URL／fallback |
| --- | --- |
| `werewolfClaw` | `/assets/beast-claw-scratch.svg` |
| `bossClaw` | `/assets/beast-claw-scratch.svg` |
| `swordSlash`、`slashTexture` | `null`；同一 FX engine 的 CSS 劍弧 |
| `vineStrike` | `null`；同一 FX engine 的 CSS 藤蔓／根鞭 |
| `impactSpark` | `null`；同一 FX engine 的 CSS 金屬火花 |
| `acidSplash` | `null`；保留酸蝕 splash，前置 DOM 藥瓶投射 |

3. `createCombatFx()` 是 Attack FX owner。profile 決定語意，helper 建立 transient FX；動作 canvas 與 abort owner 清理整組內容。正式素材 decode 只初始化一次，重複演出沿用瀏覽器快取；載入失敗由同一 engine 使用 CSS 爪痕 fallback。
4. 狼人爪擊以素材 alpha mask 染色，保留不等長撕裂邊緣；三個斜向區帶依序 reveal，55ms stagger，暖白／琥珀／低彩紅色。使用 clip reveal，而非整圖淡入。
5. Boss 共用 claw engine 與現有素材，尺寸更大、鏡像與角度不同、65ms stagger、較慢且較重，使用暗紅／白色；正式全螢幕 target 接收左下 knock、紅閃與傷害。
6. 戰士使用寬幅弧形劍氣 fallback，左往右 reveal，impact 加金屬火花；刺客使用兩道交叉刀弧，第二刀延遲 80ms，暴擊時第二刀更亮。
7. 樹精普通攻擊由 form profile 選擇 `vine_strike`，使用左下抽出的綠色藤蔓與褐色根鞭；一般德魯伊使用 nature strike，狼人使用 claw。弓箭保持 DOM travel，MISS 偏離目標；彈匣箭種有 `data-ammo` hook。

## 8–10：頭像解析與持續性

8. `resolveBattlePortrait()` 接受 role、druidForm、avatarOverride、entityType、僕從 avatar／index；HUD 的 custom avatar 由明確 option 開啟。職業圖、變身圖、Boss、僕從與 emoji 使用相同解析入口。
9. 原本攻擊演出直接由角色名稱拼接 `/photo/Druid.webp`，忽略 druidForm；`app.js` 與核心另有重複 resolver。現在 offensive actor／target、support、cast、transform、result、HUD、技能列與 Lab 都共用核心 resolver。
10. `combatActorDescriptor()` 優先使用 `hpSnapshotBefore`，防止最終權威狀態洩漏未來形態。只有伺服器快照將 druidForm 設為 null 時才恢復原頭像；沒有動畫 timeout 自行恢復。emoji DIV 與 IMG 切換只替換頭像，沒有 `src.endsWith()` 錯誤。

## 11–18：Cast、召喚、變身與追擊

11. `playSkillCastPresentation()` 使用既有 combat stage／canvas owner、同一條實色藍色橫幅、左側角色與交錯進場。Cast 畫面沒有 Boss、HP bar、傷害數字或結果卡；完成後才進入結果 beat。
12. 召喚：角色 Cast → nature energy → Cast exit → 右下僕從揭露及 HP／ATK → 局部 HUD 新增僕從 → 獨立僕從共擊。召喚事件的 Boss HP 保持攻擊前數值。
13. 變身：before-form Cast → 橫幅退場 → 角色 silhouette／crossfade → 狼人或樹精 → 小型 Max HP／DR 結果 → 投影 after-form 快照。
14. 狼人強化普攻由伺服器拆出 `OFFENSIVE`／`dru_claw` 事件，變身揭露後 hold 200ms，再走正常 offensive Cut-in、狼人頭像、爪擊、受擊、傷害與血條。樹精没有虛構攻擊。
15. 既有僕從由回合最前移到 owner 行動之後；新召喚僕從加入同一組追擊，一隻一次。玩家技能優先序未改；owner 跳過、脫力或休眠時保留原有僕從可行動規則。
16. `playMinionComboPresentation()` 一次進場，最多三個僕從 portrait 疊放，前／中／後為 100%／92%／84%，14px offset；右側為 Boss 與血條，不是三張大卡。
17. 每 hit 獨立 FX、方向性 knock、damage float 與 authoritative HP 投影，hit 間 100ms；沒有合併傷害數字或一次跳到最後 HP。
18. 所有 player action 沒有直接敵方 damage result 時走 Cast → Result，含防禦、Buff、治療、復活、淨化、召喚、變身及 Reload。具有實際敵方攻擊結果的技能保留 offensive 流程，群體攻擊保留逐目標結果。

## 19–21：Reload 與快照

19. Reload：Archer Cast → 角色旁最多三格小型 magazine → 真正箭矢 silhouette 插入 → mechanical lock → 箭種名稱 → 小型架弩蹲伏 DR 結果。穿甲為鋼白、元素為藍紫、爆裂為低彩橙紅；不用 circle placeholder。
20. `Room.getHpSnapshot()` 包含 ammo；`buildActionResults()` 根據伺服器 `crouch_reload` 事件輸出 `reload` result、ammoBefore／ammoAfter／loaded。狂熱裝填只動畫呈現伺服器新增的箭，100ms stagger，保留原有彈藥。酸蝕造成的裝填數差异也由伺服器 after 決定。
21. 沿用 `pendingAuthoritativeState` 與局部 snapshot 投影。Cast 期間不提前更新形態、召喚數或彈匣；結果揭露完成才更新相關 HUD。没有呼叫 renderBattle() 重建演出中的全頁。

## 22–24：驗證

22. Lab 共 96 個 engine-generated fixtures，新增 form basic／support／damage target、1／2／3 僕從、18 個 Reload／Frenzy／箭種組合與劍弧／刺客 X／Boss claw。Lab 與 production 直接使用同一組 API。
23. 自動測試：159 項通過；真實 Chrome 瀏覽器測試結果與桌機／390px stage 截圖儲存在 `artifacts/phase71/`，完整明細為 `report.json`。瀏覽器涵蓋 40 個 Lab 場景與七個獨立 Socket.IO 客戶端、七職業、三回合戰鬥，包含 summon、reload、frenzy、transform、form basic、minion combo。
24. Console／未處理例外由瀏覽器 harness 收集，最終為零錯誤、零未處理 Promise rejection。另通過五個 Cast／Summon／Transform／Reload／Minion abort 點的 DOM 清理與零未來快照投影測試，以及 reduced motion 保留 claw identity 的檢查（`lifecycle.json`）。驗證過程發現並修正兩個既有問題：Lab 背景使用不存在的 Dungeon.webp，改用現有 `/icon/background.webp`；玩家離線呼叫不存在的 isAllPlayersDead()，改為等價存活判斷並新增測試。ACK／計時架構未改。

## 25：仍保留的 fallback 與範圍

只有 claw 有正式 FX 素材。劍弧、X 斬、藤蔓、金屬 spark、酸蝕 splash 保留同一 engine 內的 CSS／DOM fallback；Mage arcane burst、箭雨等非本階段主要目標維持既有效果。Reduced motion 保留特效 identity，縮短位移；手機 Cast、僕從 stack 與 magazine 使用 container query 限定尺寸。

未修改傷害公式、召喚數值、變身 duration、Boss AI、刺客機制、Victory 或 ACK／Timer 架構。本階段完成後停止；沒有開始 Status Loop FX、Boss Warning／Smoke Entrance 或下一組精修。

## 重現

```powershell
node --test tests/*.test.js
node tests/generate-combat-lab.js
node tests/phase71-preview.js
# 另一個 terminal；使用已安裝 Chrome 與 Codex bundled Playwright。
node scripts/verify-phase71.mjs
node scripts/verify-phase71-lifecycle.mjs
```
