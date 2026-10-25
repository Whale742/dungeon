# Dungeon Abyss 專案索引

## 目錄分工

```text
game/                  權威遊戲邏輯、常數、回合資料與相鄰測試
studio/                Studio API、內容目錄、發布快取與 Supabase 存取
public/
  index.html           正式遊戲及 /dev 共用頁面
  presentation-lab.html /lab Combat FX 工作台（舊 HTML URL 仍轉址到 /lab）
  combat-fx-stage.html  Lab iframe：正式戰鬥 DOM、共用渲染與演出，無正式 socket
  studio-editor.html   /edit 文案編輯器
  studio-assets.html   /asset 素材管理器
  js/                  依功能分類的前端程式
  css/                 對應功能的樣式
  assets/              正式素材、仍需維護的來源圖與素材來源描述
scripts/               素材轉換及既有雲端同步工具
specs/                 設計參考、提案及演出原稿
```

## 主要入口

| 位置 | 用途 |
| --- | --- |
| `server.js` | Express、Socket.IO、遊戲房間與正式路由 |
| `game/Room.js` | 權威遊戲狀態、回合、事件、裝備與戰鬥結算 |
| `game/constants.js` | 職業、敵人、裝備與遊戲常數 |
| `studio/router.js` | `/lab`、`/edit`、`/asset` 與 Studio API |
| `studio/catalog.js` | 本地文案、素材、綁定及 Lab 場景目錄 |
| `studio/combat-lab.js` | 唯讀正式職業／敵人／裝備目錄與固定演出結果樣本 |
| `studio/content.js` | Supabase 發布內容快取與房間快照 |
| `studio/migration.js` | 素材遷移規劃與 Storage 同步 |
| `DEV_MODE.md` | 既有開發模式實作與驗證紀錄，保留原位置 |

## 常見功能與畫面

| 想修改的功能 | 主要程式 | 樣式／演出 |
| --- | --- | --- |
| 前端連線、房間狀態、共用畫面更新 | [app.js](public/js/core/app.js) | [base.css](public/css/shared/base.css)、[design-tokens.css](public/css/shared/design-tokens.css) |
| 招募、大廳、職業選擇 | [lobby.js](public/js/lobby/lobby.js)、[recruit-copy.js](public/js/lobby/recruit-copy.js) | [lobby.css](public/css/lobby/lobby.css) |
| 戰鬥 UI、階段、日誌 | [battle-renderers.js](public/js/combat/battle-renderers.js) 共用敵人／隊友渲染與 HUD 快照更新；[battle-hud.js](public/js/combat/battle-hud.js)、[battle-phase.js](public/js/combat/battle-phase.js)、[battle-log.js](public/js/combat/battle-log.js) | `public/css/combat/`；[battle-overlays.css](public/css/combat/battle-overlays.css) 含角色狀態、競技場及日誌覆蓋樣式 |
| 分層血條、目標標記、夥伴與隊伍總覽 | `battle-renderers.js` 的 `battleVitals`、`syncBattleVitals`、`battleVitalsMarkup`、`syncEnemyTargetIndicators`；`battle-hud.js` 的主角 HUD、夥伴列與「隊伍狀態」切換 | [battle-vitals.css](public/css/combat/battle-vitals.css)；護盾與暫存生命以最大 HP 縮放，命債顯示在當前生命的尾段 |
| 角色／敵人戰場錨點與立繪 | [player-battlefield.js](public/js/combat/player-battlefield.js)、[enemy-presentation.js](public/js/combat/enemy-presentation.js) | 同名檔案位於 `public/css/combat/` |
| 技能演出入口與時序 | [combat.js](public/js/combat/combat.js)、[combat-expansion.js](public/js/combat/combat-expansion.js)、[presentation-core.js](public/js/presentation/presentation-core.js) | [presentation-config.js](public/js/presentation/presentation-config.js)、[skill-production.css](public/css/presentation/skill-production.css) |
| 共用及職業戰場技能演出 | [core-role-effects.js](public/js/presentation/core-role-effects.js)（戰士、法師、聖騎士、吟遊詩人、刺客）、[extended-role-effects.js](public/js/presentation/extended-role-effects.js)（弓箭手、煉金術士、德魯伊等） | [core-role-effects.css](public/css/presentation/core-role-effects.css)；部分共用樣式仍由 `skill-production.css` 提供 |
| 武士、卜者、智者等職業演出 | `public/js/presentation/*-presentation.js`；[samurai-animation.js](public/js/presentation/samurai-animation.js) 是正式武士動畫核心 | `public/css/presentation/`，以及共用戰場樣式 |
| 奇怪寶箱戰鬥、撕咬與偷取／歸還演出 | [enemy-choreography.js](public/js/combat/enemy-choreography.js)、[victory.js](public/js/inventory/victory.js) | [enemy-presentation.css](public/css/combat/enemy-presentation.css)、[special-event-assets.js](game/special-event-assets.js)（既有已驗證雲端 URL） |
| 探索地圖、敘事、陷阱與寶箱 | `public/js/exploration/` | `public/css/exploration/` |
| 背包、裝備、合成、商店 | [app.js](public/js/core/app.js) 仍持有互動邏輯；[bag-presentation.js](public/js/inventory/bag-presentation.js)、[reward-presentation.js](public/js/inventory/reward-presentation.js) | `public/css/inventory/` |
| BGM、音效與音量 | [bgm.js](public/js/audio/bgm.js)、[sfx-assets.js](public/js/audio/sfx-assets.js)；SFXManager 在 `presentation-core.js` | [audio-controls.css](public/css/audio/audio-controls.css) |
| 模態視窗動態、技能文案 | [modal-motion.js](public/js/shared/modal-motion.js)、[skill-copy.js](public/js/shared/skill-copy.js) | [modal-motion.css](public/css/shared/modal-motion.css) |
| Dev 控制與技能文案工具 | `public/js/dev/`、`game/Dev*.js` | [dev-tools.css](public/css/dev/dev-tools.css)；`/dev` 仍由環境旗標控制 |
| Combat FX Lab 工作台 | [combat-fx-lab.js](public/js/lab/combat-fx-lab.js) 情境與操作；[combat-fx-stage.js](public/js/lab/combat-fx-stage.js) 隔離播放；[combat-fx-model.js](public/js/lab/combat-fx-model.js) 固定結果轉接 | [combat-fx-lab.css](public/css/lab/combat-fx-lab.css)、[combat-fx-stage.css](public/css/lab/combat-fx-stage.css)；技能演出直接共用正式腳本 |
| Lab 結果樣本 | [presentation-lab.js](public/js/lab/presentation-lab.js) 僅保留契約與驗收資料；`public/js/lab/*-scenes.js` | 由 `studio/combat-lab.js` 提供唯讀 API，不載入舊 Lab 控制器 |

## 素材位置

| 用途 | 位置 |
| --- | --- |
| 原始角色頭像 | `public/assets/characters/portraits/`（現有角色圖用作頭像，沒有另造不存在的完整立繪） |
| 德魯伊變身、召喚伙伴 | `public/assets/characters/forms/druid/`、`public/assets/characters/summons/druid/` |
| Boss 頭像、完整立繪 | `public/assets/enemies/bosses/portraits/`、`public/assets/enemies/bosses/fullbody/` |
| 一般敵人及 Boss 隨從 | `public/assets/enemies/minions/`（部分隨從圖亦被深淵隨從共用） |
| 奸商、奇怪寶箱等特殊菁英 | `public/assets/enemies/elites/` |
| 深淵職業敵人、變身與隨從圖 | `public/assets/enemies/abyss/portraits/`、`forms/`、`minions/` |
| 通用裝備、職業專屬裝備 | `public/assets/equipment/general/`、`public/assets/equipment/exclusive/` |
| 裝備裁切來源圖、合成參考圖 | `public/assets/equipment/source-sheets/`、`public/assets/equipment/reference-sheets/` |
| 狀態圖示、網站與對話圖示 | `public/assets/icons/status/`、`public/assets/icons/ui/` |
| 技能及敵人攻擊特效 | `public/assets/combat-fx/`，依職業、`common/`、`enemies/` 細分；武士來源描述在 `samurai/manifest.json` |
| 背景、事件場景圖 | `public/assets/environments/backgrounds/`、`public/assets/environments/events/` |
| 背包、欄位、事件、探索與大廳 UI 圖 | `public/assets/ui/inventory/`（含 `slots/`、`variants/`）、`events/`、`exploration/`、`lobby/` |
| 音樂與音效 | `public/assets/sound/bgm/`、`public/assets/sound/sfx/` |

## Studio、Supabase 與後端

- [studio/router.js](studio/router.js)：Studio 頁面及 API；前端位於 `public/js/studio/`，樣式位於 `public/css/studio/`。
- [studio/catalog.js](studio/catalog.js)：從實際程式及素材建立預設目錄；直接讀取大廳、音效、音樂與 Lab 設定。
- [studio/content.js](studio/content.js)、[public/js/studio/content-store.js](public/js/studio/content-store.js)：已發布內容快取、房間快照及前端預覽。
- [public/js/studio/asset-registry.js](public/js/studio/asset-registry.js)：語意綁定、圖片／音效解析與失敗回退。
- [studio/supabase.js](studio/supabase.js)、[studio/env.js](studio/env.js)：Supabase 存取與環境設定；Render 環境變數優先於本機設定。
- [studio/migration.js](studio/migration.js)、[scripts/sync-assets-supabase.mjs](scripts/sync-assets-supabase.mjs)：既有遷移與圖片同步；[scripts/sync-special-events.mjs](scripts/sync-special-events.mjs) 維護特殊事件的雲端素材及文案。
- [game/role-mechanics.js](game/role-mechanics.js)：擴充職業機制與狀態，透過既有方法併入 `Room`；[role-config.js](game/role-config.js) 與 [role-copy.js](game/role-copy.js) 提供職業、裝備及敘述資料。
- [game/combat-schema.js](game/combat-schema.js)：戰鬥呈現資料契約；[enemy-mechanics.js](game/enemy-mechanics.js)、[stats.js](game/stats.js) 管理敵人機制及數值結算。
- `Room.applyDamageToPlayer` 依來源區分敵方直接傷害與扣血／DOT。`tempHp` 保留相容總池，快照以 `shieldHp`、`temporaryOverheal` 分別提供護盾與暫存生命；回合清理只移除暫存生命。背包兩個戰鬥用藥入口共用 `app.js` 的 `canUseBattleItem`，友方目標選單共用正式分層血條。

## 容易混淆的依賴

- 德魯伊夥伴快照由 `combat-schema.js` 的 `companionSnapshot` 統一提供血量與 DOT；`enemy-mechanics.js` 在實際攔截者上套用及結算 DOT。`battle-renderers.js` 的 `syncCompanionUnits` 共用選技／敵方回合的個別夥伴血條與狀態提示；`BattleHud` 以單一共擊事件依序移除已攻擊夥伴。命債共用 `battle-vitals.css` 的亮紅色循環閃光。追加驗收見 [specs/druid-companion-handoff.md](specs/druid-companion-handoff.md)。

- HTML 中傳統 Script 與 CSS 的先後順序仍是相依關係的一部分。`battle-renderers.js` 的正式渲染／HUD 函式從 `app.js` 原樣移出，兩個頁面都在各自控制器前載入；Lab 控制器與結果轉接為獨立 ES 模組。
- [public/js/shared/local-paths.cjs](public/js/shared/local-paths.cjs) 是瀏覽器與 Node 共用的舊路徑對照。Express 保留舊靜態 URL；Studio 沿用舊路徑所產生的素材 ID，並讓新舊 fallback 路徑都能命中已發布綁定。`.cjs` 同時供 Node 匯入及傳統 Script 載入。
- 素材本地分類與 Supabase Storage 目錄分屬不同用途。既有雲端 URL、Storage 物件及資料格式保留；本次沒有執行雲端資料遷移。
- `phase8Methods`、`P8_ROLES`、`phase8Statuses` 等既有內部名稱與資料欄位仍保留，檔名改為功能名稱不代表資料契約也改名。
- `scripts/split_exclusive_equipments.py` 從 `equipment/source-sheets/` 讀取原圖，輸出至 `equipment/exclusive/`；`scripts/convert-buff-icons.cjs` 接受選用的來源目錄參數，輸出至 `icons/status/`。
- 測試使用 `node --test game/*.test.js server.test.js studio/combat-lab.test.js`；`server.test.js` 包含多人／Dev 隔離與靜態舊 URL 相容性驗證，Lab 測試涵蓋目標轉接、重播資料隔離與正式演出共用。

## 設計資料

- [specs/equipment/Dungeon_Abyss_通用裝備.md](specs/equipment/Dungeon_Abyss_通用裝備.md)：通用裝備規格，包含明確標示的提案數值。
- [specs/equipment/專屬裝備.md](specs/equipment/專屬裝備.md)、[specs/enemies/深淵.md](specs/enemies/深淵.md)：保留原稿的設計參考，部分內容與現行實作有差異。
- `specs/prototypes/`：卜者、陰陽師、武士、智者演出的歷史設計展示。武士的嵌入素材與正式切圖來源仍有追溯價值；這些檔案不再由正式站台公開提供。

規格與 Prototype 保留原稿，可能包含尚未採用或已調整的設計；目前權威數值與行為以 `game/` 的實作為準。
