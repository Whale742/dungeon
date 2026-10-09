# Studio 交接狀態（2026-10-09）

工作區：`D:\My Files\web\dungeon`。所有變更直接在目前 checkout，未 commit／push／部署。完整架構、檔案、設定、API、Seed、Registry 與驗收指令見 `STUDIO.md`。

## 已完成

- 三頁／共用內容與素材讀取／安全 Write API／真實 Supabase 連接。
- 實際 Seed：12 roles、77 skills、185 stories、94 local assets、175 bindings；第二次全部新增 0，保留既有草稿／管理員修改。
- 真實雲端 public read、anon RLS／RPC／Storage INSERT 拒絕、草稿／單一交易批次發布、失敗交易回滾、歷史新草稿還原、PNG／MP3 Signed Upload、存在性／MIME／尺寸／CORS、防覆寫。報告 `artifacts/studio/cloud-report.json`。
- Chrome 12 職業、雷達 1–5、文字／XSS、JSON 差異、跨頁未發布預覽、24 代表場景（全部職業普攻＋特殊技能）、素材搜尋／試聽、真實 UI MP3 上傳＋AudioContext 解碼、390px 畫面。
- Editor 真實 UI 儲存／原文發布／歷史／還原。版本歷史按鈕現在自動展開面板。
- Registry 圖片重用節點、相對路徑、特效預載及遊戲背景解析；失敗保留本地來源；音訊時序參數保留。

## 最新檢查與全套驗收通過

- 最後全套 npm test：413/413 通過，0 fail／skip，約 14.8s。git diff --check 通過（僅 Windows 換行提示）。
- 「發布頭像後既有 Lobby 即時更新」已排查並修復：
  - 原因定位：`public/studio/content-store.js` 中的 `key(table, row)` 判斷式先於 `binding_key` 檢查了 `row.asset_key`，導致 `asset_bindings` 資料表被錯誤地以 `asset_key` 作為 Map 索引，多個綁定引用相同素材（如 Warrior 頭像）時產生衝突覆蓋，使 `role.samurai.avatar` 遺失無法被 `assetRegistry` 解析。
  - 修復方式：明確指定 `table==='asset_bindings'?row.binding_key:...`，確保綁定表一律以不可變的 `binding_key` 唯一識別。
  - 驗證結果：`npm run verify:studio-browser` 完整 24 場景與即時頭像更新、多人房間、斷線重連全部 100% 通過（報告：`artifacts/studio/browser-report.json`，無任何 failure）。
- 雲端驗收：`npm run verify:studio-cloud` 全部通過，包含 public read、anon 拒絕、草稿、批次交易原子性與回滾、Signed Upload PNG/MP3 與 Storage 驗證（報告：`artifacts/studio/cloud-report.json`）。

## 外部設定

本機 `.env` 已有真實 Supabase URL／Publishable／Secret Key，絕不要輸出內容。没有永久 STUDIO_WRITE_TOKEN；驗收以 child process 臨時 Token 進行。Render 上線仍需設定共用 Token、Node 22＋、部署變更；部署未執行。

## 工具／注意事項

- 一般 shell 在本機 sandbox 會失敗 setup refresh；使用 `exec_command` require_escalated，理由限本專案實作／測試即可。apply_patch 正常。
- PowerShell；不要印 .env 或通行碼。npm test 日誌寫 artifacts/studio/tests.txt。
- 瀏覽器脚本預設使用本機 bundled Playwright 與 Chrome；可用 STUDIO_PLAYWRIGHT_PATH／STUDIO_CHROME_PATH 覆寫。STUDIO_QA_QUICK=1 只跳過 24 個長場景，保留其他 UI／cloud／多人驗收。子行程 Token 不回傳前端設定端點。
- 不要改戰鬥引擎數值、網路權威或特殊動畫節點，不要新增 Auth／登入頁。
- user 要求任何 Codex 用量視窗剩餘 <=15% 立即回報。已回報：短期 15%、每週 16%。請勿自動使用 reset credits。
- browser-report.json 已無 failure，24 場景與即時更新、UI、雙客戶端多人流程均通過（exit 0）。mobile 導覽 CSS 支援 390px 畫面正常顯示。
