# 卜者規格修正與驗收

比對基準：`e8bcbd84dd07b35716e79e2a12eb3ed424be9fd8`，2026-10-15 的 `augur` 提交。

## 修正內容

- 補回卜者與 Boss 頭像、生命、護盾及狀態，使用共用頭像解析器與素材綁定。修正共用表遺漏卜者、智者／武士中文檔名、手機 Lab 舞台高度。
- 開場與目標陣亡後的重新觀測，改由真實回合事件驅動。水晶球內顯示實際觀測目標；一技能使用 `augur1.png`，以食指的位置對齊球頂上方約 10px。
- 二技能只建立一張 `augur2.png`，由底部升起，置於水晶球下層；球先上浮再出現虹彩光效與凶兆牌。
- 正逆位、清償、治療抵債、聖契真傷與命債到期演出皆讀取伺服器實際結算；不再以固定 8／25 或預設傷害冒充結果。
- 正位即使未觸發加成效果，仍翻牌並消耗當回合干涉額度；繫結重設牌面，但不重置每回合一次的額度。負面區間攔截才增加命債，受 60 點總上限限制。
- 繫結在鎖定與執行時驗證存活隊友；吟遊詩人反噬移至實際施法時判定，能套用優先權 1 的當回合繫結。
- 補接鍊金普攻腐蝕／全隊腐蝕、刺客追擊暴擊、織夢普攻混淆總機率、觀星者星球暈眩。鍊金普攻先處理可攔截的反噬，再決定是否使用正位；平行抽選維持原規則。
- 命債 FIFO 抵銷治療，保留實際抵債資料；治療抵債不觸發聖契。技能清償與獲得命債會產生獨立真傷結果，避免 HP 顯示回跳。
- 星芒破障只由實際直接魔傷觸發。凶兆易傷也涵蓋 DoT、獨立方程及聖契傷害；這不會讓命運加護加成 DoT 或獨立方程。
- 到期扣血無視護盾且可致死；擊殺 Boss 後先清空命債，不再發生勝利後到期扣血。

## 規格中的時序解讀

提示詞的 Queue 範例寫 `createdRound: 1, dueRound: 4`，但後文明確定義「包含當回合在內的第 3 個完整回合」與 `N + 2`。本次依明確時序實作：R1 產生，R3 結束清算；聖契改為 R2 結束。

二技能清償至少 15 點後的額外治療，依提示詞補充，直接恢復本體生命，不再被剩餘命債吸收；獨自觀測自身時不重複治療同一角色。

## 如何確認特效

啟動 `npm start`，開啟 `/lab?role=augur`，在「選擇測試項目」切換場景並按播放。降低播放速度可逐項確認，日誌的 `EXPECT` 會列出該場景預期結果。

共 27 個場景，由真正的 `Room` 戰鬥結算產生；更新引擎後執行 `npm run build:augur-lab` 重新產生。

| 場景 ID | 檢查重點 |
| --- | --- |
| `augur_observe`、`augur_bind`、`augur_bind_solo`、`augur_reobserve` | 開場、切換、獨存、死亡後重選，球內頭像正確 |
| `augur_basic`、`augur_basic_empty` | 實際清償 8 與 0，不顯示假數字 |
| `augur_amethyst`、`augur_amethyst_stack` | 一件清償 12，兩件清償 14 |
| `augur_reckon_0`、`augur_reckon_10`、`augur_reckon`、`augur_reckon_60` | 實際清償 0／10／20／25；滿 15 才額外回血 |
| `augur_reverse`、`augur_negative_remains`、`augur_negative_safe` | 成功攔截、仍失誤、原本成功的差異 |
| `augur_upright`、`augur_upright_fail` | 正位成功與失敗都翻牌，只消耗一次額度 |
| `augur_alchemist_reverse`、`augur_alchemist_upright`、`augur_dream_upright` | 機率鉤子與負面優先 |
| `augur_gilded`、`augur_tome_gain`、`augur_tome_repay` | 專裝命債、提早到期、真傷及 18% 凶兆 |
| `augur_debt_cap` | 命債 55 → 60，攔截成功但實際只增加 5 |
| `augur_debt_heal` | 治療先還債，剩餘才回血 |
| `augur_expiry`、`augur_expiry_lethal` | 護盾保持不變、扣血及死亡頭像 |

也可直接開啟 `/lab?scene=augur_reckon` 等指定場景網址。

## 驗證

- `npm test`：755 項通過，包含新增 19 項卜者整合測試。
- `npm run verify:augur-browser`：27 場景、桌面／390px 手機、素材載入、雙方頭像、手與球圖層、食指間距、中斷清理及減少動態模式。需要可用的 Playwright 與 Chromium；可用 `STUDIO_PLAYWRIGHT_PATH`、`STUDIO_CHROME_PATH` 指定。
- 可設定 `AUGUR_QA_OUTPUT_DIR` 保存截圖；`AUGUR_QA_SCENES` 可用逗號列出要重跑的場景 ID。

## Supabase 與發布狀態

已更新本地文案及 `studio/sync-augur.js` 的上傳失敗處理。本工作區未設定 `SUPABASE_URL`／`SUPABASE_SECRET_KEY`，因此尚未同步 Storage／DB，也未部署。設定完成後，於專案根目錄執行 `node studio/sync-augur.js` 可同步卜者的三張素材、角色／技能文案與戰鬥敘述。
