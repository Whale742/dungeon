# Dungeon Abyss UI 重構工作紀錄

基準：main / 41f7175。權威狀態仍由 Room 與 Socket.IO 管理；本次不更動職業倍率、戰鬥數值、交易價格、地圖生成或 Supabase schema。

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
| 獎勵演出佇列 | RewardPresentation、item/gold queue | rewardPresentationOverlay、playNext | style、reward-presentation.js |

## 各階段重構實作紀錄

### 階段一：裝備領取錯誤修復 (`def7295`)
- 修復 `public/app.js` 的 `renderPendingDropModal()` 中未宣告 `drop` 的 ReferenceError。
- 新增缺失資料防護（顯示「未命名裝備」、保留丟棄途徑）。
- 滿格替換操作改為原生 `<button>`，支援鍵盤無障礙操作。
- 新增 `tests/ui-pending-drop.test.js`，11 項測試全數通過。

### 階段二：集中 Design System 與面板可讀性升級 (`7736e48`)
- 建立 `public/design-tokens.css`：集中定義羊皮紙、深色皮革、黃銅、封蠟紅、深色石板等 Medieval / Dark Fantasy 配色。
- 定義 4px 倍數間距、文字層級（Cinzel / Chakra Petch / Noto Sans TC）、z-index 階層、蜂巢六角格半徑。
- 移除 `public/style.css` 與 `public/lobby.css` 中冗餘的 `:root` 重複定義，根除 `.inventory-modal-card`、`.floating-item-tooltip` 等以 `!important` 覆蓋樣式的做法。
- 重構 `public/exploration-immersive.css`，將探索／事件主要內容容器替換為深色皮革與黃銅質感面板，消除透明懸浮文字導致的可讀性缺陷。

### 階段三：單一敵人舞台與戰鬥演出整合 (`61b5ab4`)
- 徹底移除 `public/index.html` 下方重複的 `.monster-body`，使 `#battleEnemiesStage` 成為戰鬥唯一權威展示舞台。
- 重構 `public/battle-phase.js` 的 `handoffBossPortrait()`，使 Boss 入場立繪直接對準 `#battleEnemiesStage` 中的 Boss 槽位，具備 fallback 安全機制。
- 重構 `public/app.js` 的 `renderBattleEnemiesStage()`，採用節點就地比對（DOM diffing），保留 DOM 元素防止 hover 與鍵盤焦點中斷。
- 戰鬥內移除 Unicode Emoji，以 SVG 向量圖示（`#icon-target`、`#icon-clock`、`#icon-shield`、`#icon-bone`、`#icon-fire` 等）統一呈現 CD、護盾與狀態。
- 敵人 Tooltip (`showEnemyTooltip`) 重構為結構化卡片，完整支援 Hover、Focus 與觸控點擊。
- 新增 `tests/battle-stage.test.js`，4 項測試全數通過。

### 階段四：圖像優先商店與地圖圖示全面向量化 (`fd5bceb`)
- `public/exploration.js`：已探索六角節點全面使用 `#icon-camp`、`#icon-shop`、`#icon-chest`、`#icon-death`、`#icon-scroll`、`#icon-sword` 等 SVG 向量圖示，嚴禁 Emoji。
- `public/app.js`：重構 `renderInteractiveEvent`，導入頂部金幣徽章、動態分類頁籤（僅顯示有商品的類別）、48px 圖像優先商品卡、浮動 Tooltip、底部行動列（休息、搶劫、偷竊、販售、離開）。
- 加入防止連點保護 (`disabled`) 與伺服器 ACK 回調機制，確保交易成功後才播放反饋。
- 寶箱與隨機事件（祭壇、賭博、鍛造、流浪商人）統一遵循共用排版。
- 新增 `tests/shop-event.test.js`，3 項測試全數通過。

### 階段五：統一獎勵佇列演出與全域 Modal 關閉防護
- 建立 `public/reward-presentation.js`：提供獨立於業務邏輯的 `RewardPresentation` 佇列管理器，支援：
  - 多物品連續依序演出。
  - 同類道具自動堆疊合併 (`× N`)。
  - 跳過按鈕與 `Escape` 鍵即時中斷演出（透過 `AbortController` 清理，不阻塞後續獎勵）。
  - `prefers-reduced-motion` 無障礙自動降級（縮減至 200ms）。
  - 金幣與裝備專屬視覺徽章及音效觸發。
- 在 `public/index.html` 引入腳本，並於 `public/style.css` 添加暗黑奇幻卡片與光效樣式。
- 在 `public/app.js` 串接鍛造合成 (`inventory:craft`)、商店購回 (`buyback`)、寶箱開啟 (`event:chest_action`) 與隨機事件 (`event:random_action`)。
- 建立全域 Modal 與 `Escape` 鍵關閉防護：
  - 嚴格鎖定：必要流程 Modal (`#equipDropModal` 裝備領取、`#targetModal` 戰鬥目標選取) 嚴禁點擊背景或按 `Escape` 關閉。
  - 其餘非必要 Modal（背包、個人資料、直連、角色詳情、隨從詳情、移交隊長、丟棄確認、頭像彈窗）依優先順序優雅關閉。
  - `Escape` 鍵亦能關閉懸浮 Tooltip 與跳過獎勵演出。
- 新增 `tests/reward-queue-modal.test.js`，6 項測試全數通過。

## 完整測試狀態

- 專屬 UI 測試套件：30 / 30 通過（0 失敗）。
  - `tests/reward-queue-modal.test.js` (6/6 pass)
  - `tests/shop-event.test.js` (3/3 pass)
  - `tests/battle-stage.test.js` (4/4 pass)
  - `tests/phase2-hex-map.test.js` (6/6 pass)
  - `tests/ui-pending-drop.test.js` (4/4 pass)
  - `tests/modal-motion.test.js` (4/4 pass)
  - `tests/chest-client.test.js` (3/3 pass)
- 全專案測試套件 (`npm test`)：984 tests / 976 pass / 8 fail（8 項失敗為既有戰鬥斷言問題，0 退化）。
