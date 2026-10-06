# Phase 7.2 Visual Rework + Phase 7.3 完成報告

日期：2026-10-06

本次保留 `syncPortraitStatusFx()`、`triggerPortraitStatusEvent()`、三層 reconciliation 與 Production/Lab 共用狀態系統。Boss 和 Round 的視覺流程移至共用 `battle-phase.js`，仍由既有 Presentation Root、presentationManager 與 Combat Queue 驅動。沒有新增 Status Manager、Boss Queue 或 Round Queue；依使用者後續同意，僅補上進入戰鬥的一行伺服器狀態切換；沒有修改傷害／治療／護盾公式、狀態回合數、德魯伊／刺客／僕從機制或 Victory。

## 1. Phase 7.2 原始視覺審核

先在真實 Lab 擷取十二種狀態的四種肖像尺寸，逐張檢視，再修改 CSS／視覺組成。原始與完成畫面位於 `artifacts/phase73/before/`、`artifacts/phase73/after/`。

| 狀態 | 原始畫面問題 | 本次處理 |
| --- | --- | --- |
| Exhausted | 已有下降區塊，但暗色人物上辨識偏弱 | 加寬至 45% 高度，深紅能量下降 |
| Frenzy | 星星偏小，像物品 sparkle；音波不明顯 | 提升尺寸、錯開節奏，加入音波弧線 |
| Poison | 泡泡近似發光圓點 | 中空材質、大小／模糊／節奏差異與底霧 |
| Bleed | 兩條平整紅色線條 | 撕裂狀深紅傷口與慢脈動 |
| Shield | Cyan 方框與 glow | 正式多邊形護盾輪廓、裂紋與碎片 |
| Guard | 細側線，幾乎看不出防禦感 | 鋼藍防禦面與斜向反光 |
| Vulnerable | 四角概念可保留，顏色略刺眼 | 保留四角瞄準，降低飽和、放慢收放 |
| Dodge Up | 只有移動外框，缺乏人物殘影 | 當前肖像的短暫 Cyan 殘影 |
| Hidden | 全身偏紫、人物過暗；殘影只是矩形 | 邊緣深紫／海軍藍霧、短暫人物殘影 |
| Sleep | Z 位於人物臉部附近 | 移至上方，減少霓虹陰影 |
| Corruption | 只有紫色內陰影 | 紫黑邊緣侵蝕與三條不規則觸鬚 |
| Downed | 靜態概念適當 | 保留灰階、下沉和低透明度，停止狀態動畫 |

## 2–8. 狀態視覺與疊加

2. **Exhausted**：100% 寬、45% 高的紅色漸層區塊，從 top −45% 到 105%，2 秒循環；深紅最大透明度 .30。保留亮度 .92、飽和 .82，加入非常淡的縱向紋理。
3. **Frenzy**：小 HUD 三顆、其他尺寸四顆 SVG four-point stars，暖金／淡黃、尺寸與負延遲各異。`.4 → 1 → .7` 配合上浮淡出；1.6 秒音波環由 `.8 → 1.2`，另有兩道音波弧。移除原本的強發光邊緣。
4. **Poison**：三／四個不同大小的透明泡泡，2.4–3.1 秒上升，具邊緣高光、內側暗部及少量 blur；底部使用兩團低透明度毒霧，不覆蓋整張人物。
5. **Shield / Guard**：Shield 使用共用 profile 內的 inline SVG 多邊形輪廓，受擊亮起，破裂顯示裂紋及三片飛散碎片。Guard 使用寬約 15% 的鋼藍防禦面；兩者形狀與材質明顯不同。
6. **Hidden**：人物 opacity .88、brightness .88；陰霧集中在邊緣。殘影使用當前肖像，短暫偏移 4–6px 後消失，避免常駐雙重影像。
7. **Corruption**：使用不規則邊緣暗蝕與觸鬚；慢脈動保留，Tick 短暫提升亮度，不套整張紫色濾鏡。
8. **Multi-status**：驗收 Frenzy + Poison + Shield、Exhausted + Vulnerable、Hidden + Dodge、Corruption + Shield，以及 Poison + Shield + Frenzy + Exhausted。四種肖像尺寸皆維持人物可辨識。大型 Combat Portrait 的狀態層強度為 HUD 的 60%。連續同步 60 次保留原 FX 節點，變身更新殘影圖片，不重建狀態迴圈。

## 9–16. Boss Encounter

9. **Old DOM cleanup**：刪除 index.html 的舊 Boss／Round 常駐 DOM、舊 140×140 圓形立繪 CSS、舊 app.js 播放函式與失效 DOM 註冊。進入戰鬥時由新 Boss 演出負責暗化，不再疊加通用轉場布幕遮住 WARNING 入場。
10. **Warning architecture**：`playBossIntro()` 在既有 Presentation Root 建立暫態 stage。Backdrop、warning strip、warning copy、impact stage、Boss art 和 Boss name 各有自己的 DOM／動畫 owner。
11. **Warning timing**：先暗化 180ms；深紅寬帶由左入場，文字由右入場，錯開 110ms，350ms settle。顯示 WARNING 和「偵測到敵對存在 · ENEMY ENCOUNTER」，hold 720ms；文字先退，背景晚 100ms 退出。
12. **Rumble / Tremor**：Warning 完全退出後暗場 200ms，低鳴與預震 320ms。預震幅度約 2px；地下城背景位於同一 Presentation Stage，能看見局部震動。
13. **Boom SFX**：新增程序式 `boss_warning`、`boss_rumble`、`boss_boom`；Boom 為短低中頻 transient 與低通 noise body，沒有外部音檔。Round 是獨立的短雙音 cue。
14. **Boss Art**：使用 `monster.avatar` 原始圖片，桌面高約 46% stage、手機 43%；object-fit contain，沒有圓形裁切或紅圈。BOOM 時由 scale 1.16、Y 30px 進場，560ms settle，輕微 1.02 overshoot。局部不規則震動 420ms，75ms 低透明度暖紅閃光；未使用煙霧素材。
15. **Boss Name**：Art settle 後才滑入名稱，300ms。副標為 ABYSS LORD；削弱狀態獨立顯示 WEAKENED。Hold 1100ms；名稱先退出，Art 晚 100ms 退出。
16. **HUD handoff**：Boss stage 完整移除後才揭露戰鬥 HUD；Boss HP 使用 400ms 顯示動畫，未改動真實 HP。再停 250ms，播放 Round 1。技能面板在這段期間仍隱藏且 inert。

## 17–22. Round、順序、計時與裝置

17. **Round size**：深 navy／steel-blue 硬邊斜角 strip，桌面寬约 76%、高 116px；手機寬 90%、高 100px。Desktop ROUND 字體 `clamp(2.4rem, 5vw, 4rem)`，副標尺寸較小。
18. **Round stagger**：背景 T=0 左入、主標 T=90ms 右入、副標 T=180ms 左入，各 320ms。全部 settle 後 hold 550ms；副標、主標、背景以 90ms 間隔向右退出。總計 1410ms。
19. **Round status sequencing**：原 Combat Queue 在播放回合初 STATUS_TICK 前，等待同一回合的權威房間狀態和既有 `battlePhasePromise`。先完整退出 Round，再進入狀態演出；未建新 Queue。修正「Queue 先到、room:update 稍後到」的競態。使用 pre-tick 快照顯示 HUD，避免提前跳到結算後 HP。
20. **Timer verification**：技能面板先顯示，再完成 300ms entry，解除 inert、更新可操作技能，最後發送原本 `battle:selection_ready`。Boss、Round、Status 和技能進場期間都不啟動 timer。七位玩家逐個 ACK 後，伺服器沿用原本的計時啟動規則。Round 2+ 沒有 WARNING。
21. **Reduced Motion**：Warning 使用短距離 10px fade/slide；Boss 只有 4px 範圍的小震與 1.03 scale；Round 使用 12px 交錯。修正既有 status CSS 中多餘 selector 導致的語法錯誤，狀態循環可以靜態顯示，避免常駐雙重殘影。
22. **Mobile**：驗收 390×720 舞台，Warning、Boss Name 和 Round 標題不超出舞台。使用 container queries，Lab 的手機框與正式小螢幕使用相同構圖規則。Lab Presentation Root 僅調整為 sandbox 內的 absolute 定位。

## 23–25. 驗證

23. **Lab coverage**：十二個單狀態、五個疊加場景；apply／remove／tick／shield break／變身與節點重用。新增 Warning、Reveal、Full Encounter、Weakened、Round 1、Round 5、Reduced Boss、Reduced Round 共八個場景。直接呼叫 `playBossIntro()`、`playRoundStartBanner()` 和同一個 `playBattlePhaseOpening()`，沒有獨立 Lab FX。
24. **Browser verification**：
    - `scripts/verify-phase73.mjs`：17 個狀態、8 個 phase 場景，時序、5 個中止點、桌面／手機、Reduced Motion。
    - `scripts/verify-phase73-multiplayer.mjs`：七職業、三個有毒傷的回合；檢查每位客戶端的 Round exit → status → controls ACK → timer，與防重播。
    - `scripts/verify-phase71.mjs` 的 Lab-only 模式：回歸 40 個既有 Combat／Druid／Summon／Minion／Reload 場景。
    - `node --test tests/*.test.js`：171 項測試全部通過。新增五項狀態事件先後／中止回歸與一項首回合狀態傷害 ACK／計時回歸，原有 Gameplay、Assassin、Druid、Victory 與 ACK 測試保留。
25. **Console errors**：完成的 Lab／正常 IN_BATTLE 多人瀏覽器驗證皆為 `errors: []`。具體結果保存在 `artifacts/phase73/report.json`、`multiplayer.json`、`combat/report.json` 與 `unit-tests.txt`。

## 首回合伺服器狀態修正（已同意並套用）

使用者於本報告提出最小修正後回覆「OK」，已在 `Room.handleBattleEvent()` 入口補上 `this.state = 'IN_BATTLE'`。當首回合有狀態傷害 queue 時，既有演出 ACK 現在能在正確的房間狀態完成。沒有放寬 ACK 驗證、增加 timeout 或改動技能倒數規則。

更正先前診斷中的流血描述：baseHp < 100 只決定流血結算條件，不會自動附加首回合流血；遭遇入口會清除舊 debuff。因此邊界測試在入口清除後、回合結算前明確注入流血，而不是宣稱正常遭遇自動產生流血。

新增單元回歸直接從 TRANSITION 呼叫真正的 `handleBattleEvent()`，驗證狀態傷害、拒絕未知／過期／錯誤回合 ACK、等待所有演出 ACK、等待所有技能準備 ACK，最後才啟動 30 秒倒數。全部 171 項測試通過。

七個正式客戶端另以相同入口與注入的首回合流血驗證：WARNING／Boss → Round 完整退出 → STATUS_TICK → 演出 ACK → 技能介面啟用及準備 ACK → timer。七人全部完成，Console 零錯誤。結果保存在 `artifacts/phase73/actual-encounter.json`；原七職業三回合驗證仍保存在 `multiplayer.json`。`docs/PHASE73_SERVER_STATE_PROPOSAL.patch` 為已套用修正的紀錄，舊失敗診斷保留供對照。

## 本輪範圍

沒有下載、生成或新增煙霧／人物點陣素材。新視覺使用現有 portrait、dungeon background、CSS 和 inline SVG。只完成 Phase 7.2 Visual Rework + Phase 7.3；不進入下一階段，也沒有重做 Victory、Chest、Trap 或 Prologue。
