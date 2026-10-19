# UI/UX 重構交接 — 2026-10-19

## 暫停原因

使用者要求剩餘額度 <20% 時暫停並交接。最後查詢：5 小時已用 82%（剩 18%）；每週已用 29%（剩 71%）。已停止功能實作，僅整理此交接。未宣稱完成全案。

## 工作位置與需求

- Repository：`D:\My Files\web\dungeon`，分支 `main`。
- 原始附件：`C:\Users\orgal\.codex\attachments\f314236f-3efe-4529-acc3-be6c1fdbe047\貼上的文字.txt`。
- 基準 commit：`41f7175`。
- 已完成實作 commit：`def729516974cc43c95d34e67788280b0fe226f1` — `fix(ui): restore pending equipment choice with regression coverage`。
- 沒有 push、沒有部署。開始時工作樹乾淨。
- 無 AGENTS.md 被 rg 搜尋到。未使用 subagent。

## 已完成並提交

1. `public/app.js` 的 `renderPendingDropModal()`：取得 `dropInfo.drop`，修復 drop 未宣告的 ReferenceError。
2. 缺失道具資料顯示「未命名裝備」；禁止無 id 的裝備操作，保留放棄路徑；Studio 文案列表使用安全存取。
3. 滿格替換選項改原生 button，讓鍵盤可選擇。
4. `tests/ui-pending-drop.test.js`：執行 renderer 的 VM 行為測試，涵蓋正常顯示／伺服器確認後關閉、缺失資料／放棄、滿格替換、寶箱演出 gate、非持有者。
5. `docs/UI-REFACTOR.md`：主要 26 類畫面的資料、DOM、renderer、樣式、演出與顯示條件對照表，及已確認風險。

## 已修改但未提交、未驗收

這些是第二階段進行中的修改，**不能當作已完成 Design System**。請直接沿用工作樹，不要覆寫或重跑遷移腳本。

- `public/design-tokens.css`（新檔）：移入原 style.css 與 lobby.css 的 root tokens；新增羊皮紙／石板／黃銅／封蠟色、間距、字級與動畫層級 tokens，調整部分舊色彩別名。
- `public/index.html`：於 style.css 前載入 design-tokens.css。
- `public/style.css`：移除原 root token 區，改由新檔管理；尚未整理元件硬編碼色彩與大量歷史重複規則。
- `public/lobby.css`：移除 root palette，移至集中 tokens。
- `public/exploration-immersive.css`：替換原大範圍透明化規則，將閱讀容器改為不透明皮革表面、黃銅邊框；電影舞台保留透明。
- `git diff --check` 通過（僅 CRLF 提示）。**未跑這批 CSS 修改後的全套測試、視覺驗證或六尺寸驗收。**
- `artifacts/refactor-tokens.mjs` 為已執行的一次性本地腳本，不應重跑，亦不用提交。

## 實際測試與限制

### 已通過

`node --test tests/ui-pending-drop.test.js tests/modal-motion.test.js tests/chest-client.test.js`

11 tests / 11 pass / 0 fail。紀錄：`artifacts/ui-stage1-tests.log`。

### 修改前基準已有失敗

完整 `npm test`：967 tests / 959 pass / 8 fail，約 42 秒。
紀錄：`artifacts/ui-baseline-tests.log`。

8 failures 是兩個測試在多個入口重複執行：
- `boundary locks HP and enhanced barrier separately resists one lethal`
- `actual boss dream healing is a heal result, nightmare true damage ignores DR, and source follows server snapshots`

尚未調查／修改這兩個戰鬥規則問題；本任務禁止任意調整戰鬥數值或公式。

### 本機環境

- `npm` 包裝程式會找不存在的 roaming npm-cli 路徑。可執行：
  `& 'C:\Program Files\nodejs\node.exe' 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' test`
- 本地 server 已在埠 3100 啟動（exec session 16724）；接手時先檢查是否仍存活，不要重複占用埠。
- 以 in-app browser 實際開啟 `http://localhost:3100/`，入口招募令與簽名輸入正常顯示。只檢視修改前入口；**未完成房間、戰鬥、多玩家等瀏覽器驗收**。
- `.git` 為受限目錄，一般 git add/commit 會 Permission denied；已用工具 `require_escalated` 成功提交。使用者附件授權分階段 commit。
- `artifacts/` 被 gitignore，測試 log 留在本機，不在 commit 中。

## 後續建議順序

1. 重新讀附件與這份盤點，先確認額度符合使用者門檻。
2. 驗證未提交 token 遷移：CSS 變數定義完整、Lobby 未退化、地圖／事件／寶箱內容背景與演出層級；整理現有元件原規則，不在檔尾堆 !important。通過後單獨提交第二階段。
3. 戰鬥單一舞台遷移，**尚未開始修改**：
   - `index.html` 仍保留 monster-body；不可直接刪，先遷移下列依賴。
   - `battle-phase.js` 的 `handoffBossPortrait()` 仍用 monsterAvatar 作終點，要改為對應敵人舞台 sprite；兼容單目標與多目標。
   - `app.js` 的 renderBattle 同時更新舊面板；updateMonsterHpDisplay、updateBattleHudFromSnapshot、triggerHitOnMonster、舊 visual_events 也依賴舊 monsterAvatar／HP／floating／pixel 元素。
   - renderBattleEnemiesStage 每次 innerHTML 全量重建，需改為保留節點的更新，避免打斷 hover、鍵盤焦點及動畫。
   - 目前 slot 有 role/button/tabindex，但沒有鍵盤 handler、focus 詳情或觸控詳情；showEnemyTooltip 仍有 Emoji 與推算值，須依伺服器欄位審核。
   - snapshot.enemies 需逐目標更新，不能只更新 snapshot.monster。
   - `combat.js` getOrCreateCombatStage 目前全螢幕；一般攻擊需舞台 FX 層，特殊職業保留全螢幕。不要直接縮小全部職業的 1440×810 演出。
   - ensureBattlePhase finally 已有 revealDestinationView；需測 abort、重入、round key、inert 與 revealBattleControls 的恢復。
4. 地圖、事件 SVG（已有 index.html symbol 庫、getIconSvg 可沿用）；exploration.js 已走過節點仍使用 Emoji，不要洩漏未揭露節點類型。
5. 商店（app.js renderInteractiveEvent）圖像優先卡、實際有商品的分類、可觸控／鍵盤詳情；保留 buy/buyback/rest/rob/steal/leave/sell。
   - 目前多數購買 socket.emit 不讀 ack；server.js event:shop_action 已有 callback 能沿用。
   - 須防連點，成功獎勵動畫只在伺服器確認後觸發；失敗有原因。
6. 共用 RewardPresentation：chest.js playRewardReveal 已被 victory.js 共用，但尚無全來源佇列；需伺服器確認事件、去重、獲得者範圍、合併、跳過、reduced motion、abort 清理。不得用 UI 推算或重發獎勵。
7. 背包、Modal、Tooltip 整理：ModalMotion 現有動畫及 inert，尚缺焦點管理／focus trap。必須抉擇的 equipDropModal 等不能因 ESC／遮罩誤關。floating-item-tooltip 有大量 !important 與固定 240px、狀態 tooltip 無 max-height，需從原規則修。
8. 完成六尺寸（1920×1080、1440×900、1366×768、1280×720、768×1024、390×844）與多人流程、Boss 全流程、特殊技能、獎勵佇列等驗收，再跑 npm test 比對基準，按階段提交。

## 尚未完成範圍

除已提交的裝備領取修復與初步盤點外，整體共用元件、完整資訊缺失掃描、單一敵人舞台、戰鬥座標整合、Boss handoff 修復、商店重構、地圖／事件 SVG、全來源 Reward Queue、背包／Modal 無障礙、Responsive、多玩家與完整 E2E、Before/After 截圖皆未完成。現有資產與 Supabase asset-registry 尚未做完整驗證。不得將此交接視為全案完成。
