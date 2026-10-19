# Dungeon Abyss UI 重構工作紀錄

基準：main / 41f7175。權威狀態仍由 Room 與 Socket.IO 管理；本次不更動職業倍率、交易價格、地圖生成或 Supabase schema。

## 畫面盤點

| 畫面 | 資料與事件 | DOM / renderer | 樣式與演出 / 顯示條件 |
| --- | --- | --- | --- |
| 初始畫面、建立／加入房間 | room:create/join、room list | viewEntry、entry screens | style/lobby；未加入房間 |
| Lobby、職業選擇、詳情 | init:constants、room:update、role select | viewLobby、renderLobby、role detail modal | lobby.js/css；LOBBY |
| 開場 | prologue state、prologue:skipped | viewPrologue、renderProloguePresentation | app/style；PROLOGUE、AbortController |
| 地圖、節點、選路／投票 | hexMap、routeVoteCounts、route:vote | viewRoute、renderHexGridMap/renderRouteChoice | exploration.js/css、phase8/style；CHOOSING_ROUTE、敘事完成才解鎖 |
| 樓層轉場 | currentTransition | viewTransition、renderTransition | battle-phase、presentation-core；TRANSITION |
| 一般事件、商店、隨機事件 | currentEvent、event:*_action | viewEvent、renderInteractiveEvent | style/phase8/exploration-immersive；EVENT |
| 陷阱 | authoritative snapshots、trap:*_complete | exploration/presentation trap | trap.js/css；presentationId 去重、abort 清理 |
| 寶箱 | chest:open、equipment:interaction_ready | chest.js、playRewardReveal | chest.css；先演出、再裝備抉擇 |
| Boss 遭遇 | currentMonster、scene key | playBossIntro、handoffBossPortrait | battle-phase；首回合且該場未播 |
| 戰鬥舞台、敵人詳情 | enemies、currentMonster、battle:select_target | battleEnemiesStage、renderBattleEnemiesStage | style、combat；IN_BATTLE |
| 隊友、技能、目標、鎖定 | players、selectionState、battle:* | teammatesGrid、playerActionCard、target modal | app/style；SELECTING 且演出完成 |
| 技能、回合、傷害、狀態 | battle:presentation_queue、hpSnapshot | combat/combat-expansion、portrait-status-fx | presentation-core/config、skill-presentation-stage |
| 職業特殊演出 | production queue、actionId | sage、dreamweaver、gladiator、stargazer、samurai、augur、onmyoji 模組 | 各職業 CSS、共享電影舞台；保留各職業演出 |
| 勝利、戰利品選擇 | currentVictory、pendingDrop、equip:choice | victory.js、equipDropModal | victory/combat-expansion；victoryInteractionReady |
| 共用／個人背包、裝備、合成 | squadInventory、bag、equipSlots、inventory:* | renderInventoryModal、六角格與 inspector | style/phase8；inventory modal、拖曳及按鈕操作 |
| 休息站 | checkpoint state、選擇事件 | viewCheckpoint、renderCheckpoint | style；CHECKPOINT |
| 深淵對話 | abyssDialogue、投票 | viewAbyssDialogue、renderAbyssDialogue | phase8；ABYSS_DIALOGUE |
| 失敗、通關結算 | GAME_OVER/VICTORY | viewEnd、renderGameOver/renderVictory | style、bgm |
| Modal、Tooltip、提示、日誌 | client interaction + room logs | ModalMotion、floating tooltips、renderLogs | modal-motion、battle-log、style |

## 已確認風險

- pendingDrop renderer 未宣告 drop：實際 ReferenceError，先修復並補行為測試。
- monster-body 與 battleEnemiesStage 重複；Boss handoff、舊打擊及 HP snapshot 依賴舊 DOM，移除前須一起遷移。
- 每次敵人重繪重建 DOM，會失去焦點及 hover；需要保留節點。
- exploration-immersive 把主要資訊容器透明化，再於檔尾覆蓋部分規則。
- 商店操作沒有消費 ack；重複點擊與失敗回饋不足。
- 原始 npm test：967 個、959 通過、8 失敗。8 個皆為兩項既有織夢／結界斷言在不同入口重複執行；詳見 artifacts/ui-baseline-tests.log。不得藉 UI 工作修改其戰鬥規則。
- 本機 npm 啟動器尋找錯誤的 roaming 路徑；可用 `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" test` 執行同一 npm test。

後續驗收與提交記錄會隨階段補充，未經瀏覽器驗證的項目不得視為完成。
