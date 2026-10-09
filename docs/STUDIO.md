# Dungeon Abyss Studio

## 架構與 ownership map

Studio 保留原 HTML／CSS／JavaScript、Express 與 Socket.IO。三頁免登入，只有雲端管理操作要求共用通行碼；沒有 Supabase Auth 或角色權限系統。

| 負責範圍 | 檔案 | 邊界 |
| --- | --- | --- |
| 權威遊戲規則 | `game/Room.js`、`game/constants.js`、`game/phase8-config.js` | HP、技能 ID、公式、狀態判定與房間流程由原程式決定；Room 僅新增展示內容快照 |
| 內建展示預設 | `game/phase81-copy.js`、`ROLE_DETAILS`、Lobby profiles、各故事配置 | CMS 不可用時保留原始內容；穩定 ID 不可編輯 |
| 正式演出 | `presentation-core.js`、`combat-expansion.js`、`skill-presentation-stage.js`、武士／智者／角鬥士／織夢／觀星演出模組 | 使用原節拍與動畫節點；新資料只替換展示文字及素材 URL |
| 音訊 | `sfx-assets.js`、SFXManager、`bgm.js` | 原 aliases／profiles、offset、identityBeatMs、maxDuration、fallback 保留；Registry 解析 URL 與音量 |
| 遊戲畫面 | `app.js`、`lobby.js`、`skill-copy.js`、`studio/game-bridge.js` | 顯示 published 職業、技能、雷達；不修改 actionId 或戰鬥常數 |
| 共用公開讀取 | `studio/content-store.js`、`asset-registry.js`、`radar-renderer.js` | 客戶端快取、素材索引及共同雷達；不在 render／技能播放時查 DB |
| 共用管理介面 | `studio/ui.js`、`write-client.js`、`studio.css` | 共用導覽、表單、提示、分頁 Session 通行碼 |
| 分頁控制器 | `studio/lab-controller.js`、`editor.js`、`assets.js` | 互相獨立，避免擴大舊 Lab 單體 |
| 後端 CMS | `studio/router.js`、`validation.js`、`supabase.js`、`content.js` | 驗證 token、來源、型別、ID、上傳、交易發布與版本還原 |
| 盤點與遷移 | `studio/catalog.js`、`scripts/seed-studio.mjs` | 從實際遊戲配置及存在的檔案建立 catalog，保留管理員修改 |

## 三個頁面

- `/lab`：原有舞台、所有 Scene Fixture、特殊動畫、HUD、SFX／BGM、播放／重播／重設、尺寸、Debug、狀態與時間日誌。設定面板可展開。舊 `/presentation-lab.html` 在 static middleware 前轉址，保留 query。已移除文案編輯器及其腳本。
- `/edit`：12 職業、實際技能與衍生／階段文案、被動、故事／路線／BOSS／戰鬥敘事。左列表、中編輯、右即時預覽。五軸 slider 為整數 1–5，D/C/B/A/S 即時計算，半徑 score/5，難度 5 代表最難操作。可讀 published、載入／儲存草稿、單項／列表批次發布、JSON 匯出／匯入差異、恢復內建文案、歷史與新草稿還原。
- `/asset`：實際圖片／音訊清單、分類、搜尋、縮圖、試聽音量、資訊、URL、使用位置、名稱與公開狀態、三種素材來源登記、Signed Upload、綁定草稿、發布、歷史與 Lab 預覽。用途與素材本體分開管理；更換檔案建立新素材，不覆寫正式檔案。

共用導覽為 Dungeon Abyss Studio／Lab／Editor／Assets／返回遊戲。樣式限定 Studio 範圍，支援窄螢幕。

跨頁預覽例：`/lab?scene=samurai_cut`、`/lab?role=samurai&skill=sa_cut`。其他場景使用 catalog／原 fixture 中的 ID。未發布預覽存在 sessionStorage，30 分鐘過期，只在 `/lab` 套用，不更新多人房間或資料庫。

## 設定及初始化

使用 Node.js 22 以上。在 Render 的 Environment 設定：

| 變數 | 用途 |
| --- | --- |
| `SUPABASE_URL` | 實際專案 URL，公開 |
| `SUPABASE_PUBLISHABLE_KEY` | 公開 SELECT published／公開素材 |
| `SUPABASE_SECRET_KEY` | 僅後端、Seed／驗收腳本使用，不能放 public |
| `STUDIO_WRITE_TOKEN` | 共用管理通行碼；缺少時所有受保護 API 回 503，錯誤／缺少 header 回 401 |
| `STUDIO_ALLOWED_ORIGINS` | 可選，以逗號分隔 Origin；通常同站即可，跨站瀏覽器請求仍拒絕 |
| `PORT` | Render 提供；本地預設 3000 |

本地 `.env` 同樣支援，已被 Git 忽略；既有 process.env 優先。不會將 Secret Key、通行碼或敏感環境變數送到前端。`SUPABASE_JWKS_URL` 不是本架構必要設定。

```sh
npm install
npm run seed:studio
npm start
```

Seed 讀取全部 12 職業、ROLE_DETAILS、PHASE81_COPY、Lobby profiles、STORY_TEXTS、ROUTE_STORIES、ROUTE_BOSS_STORIES、BATTLE_NARRATIVES、實际 SFX／BGM／圖片配置及檔案。現有 catalog 有 12 職業、77 技能文案、185 故事、94 素材、175 綁定。雷達 S/A/B/C/D 正規化為 5/4/3/2/1。動態故事仍使用原 JavaScript 分支及受控模板。

Seed 初始寫入 published，素材全部 source_type=local。任何已存在的發布或草稿識別碼都保留，衝突忽略，重跑不覆蓋管理員修改。實際第二次執行五類皆新增 0 筆。Seed 使用後端 Secret Key，不經瀏覽器，也不生成假 Storage URL。

沿用使用者既有六張表及 `studio_publish_one`／`studio_publish_batch`，沒有重建 Schema，也沒有需要套用的增量 migration。Storage 使用現有 Public Bucket `game-assets`，尺寸上限取 Bucket 設定與 50 MB 較小值，沒有新增 anon INSERT policy。

## API

| 方法與路徑 | 驗證 | 功能 |
| --- | --- | --- |
| GET `/api/studio/config` | 公開 | 僅回 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY |
| GET `/api/studio/defaults` | 公開 | 實際內建 catalog／穩定 ID／使用位置 |
| GET `/api/studio/drafts` | Token | 四類 draft 資料 |
| POST `/api/studio/drafts` | Token | 驗證全部項目後存草稿，不發布 |
| POST `/api/studio/publish` | Token | 單項 one RPC；2–100 項單次 batch RPC、單一 DB 交易 |
| GET `/api/studio/revisions?kind=role&key=samurai` | Token | 歷史；技能另帶 role_id |
| POST `/api/studio/restore` | Token | `{revision_id,snapshot:"published"或"previous"}` 還原新草稿 |
| GET `/api/studio/assets` | Token | 包含未公開素材的管理清單 |
| POST `/api/studio/assets/sign-upload` | Token | 檢查 filename、mime_type、size_bytes、category，產生 UUID 路徑及上傳憑證 |
| POST `/api/studio/assets/register` | Token | `{asset,receipt}`；Storage 存在性／尺寸／MIME 驗證；重試同 ID／位置可恢復成功結果 |
| PATCH `/api/studio/assets/:assetKey` | Token | 名稱／is_public，不提供檔案位置覆寫 |

受保護請求帶 `X-Studio-Write-Token`。瀏覽器第一次管理操作才詢問通行碼，僅分頁 Session 暫存。固定長度 SHA-256 digest 搭配 timingSafeEqual 比較。每 IP 每分鐘 120 次、JSON 1 MB、草稿最多 500 項、發布最多 100 項；驗證來源、穩定 ID、允許欄位、型別、模板、HTTPS、MIME 與路徑穿越。頁面用 textContent／安全 escaping 顯示資料，不對 DB 文字 eval 或 Function。

草稿／JSON 項目形狀：

```json
{
  "schemaVersion": 1,
  "items": [{
    "kind": "skill", "role_id": "samurai", "key": "sa_cut",
    "data": {"display_name": "一刀兩斷", "short_copy": "簡略文案", "full_copy": "完整文案"}
  }]
}
```

發布 body 只帶穩定 identity：`{"items":[{"kind":"skill","role_id":"samurai","key":"sa_cut"}]}`。允許 kind 為 role／skill／story／binding。JSON 匯入先顯示欄位差異，確認後只存雲端草稿；舊 skillCopyOverrides 必須使用明確的一次性匯入按鈕，不會偷偷覆蓋正式內容。

歷史回復不倒退 version：從 content_revisions 的 published_data 或 previous_data 建立 draft，再呼叫發布 RPC 生成新版本。發布要求 binding 素材 is_public=true；既有 SQL trigger 保護已發布素材的位置。

## 公開讀取、固定版本與 fallback

客戶端先用 Publishable Key 取得 published／is_public 資料並共用快取；不存在的項目使用原程式預設。Render 每分鐘刷新公開資料快取，發布成功立即刷新；讀取失敗保留最後可用快照，首次失敗仍能以 GitHub 內建設定啟動。

建立／加入房間透過獨立 `studio:content` 事件發送內容快照；大型 manifest 不加入 `room:update`。尚在 Lobby 的房間可套用新發布內容，開始冒險後固定故事與素材快照，管理員發布不會造成進行中房間敘事跳變。前端已 pin 的房間資料不會被背景公開查詢覆蓋。

技能用 role_id＋skill_id 取文案。特殊階段有額外 copyKey（如 sage 的 hypothesis／solve、gladiator 的 outside／arena、archer crossbow、druid forms），實際 actionId 不變。contextualCopy 原狀態判斷保留；只替換對應階段的展示文字。模板只替換 `{player}`、`{floor}`、`{boss}`、`{route}`、`{rageMultiplier}`。

## Asset Registry 規則與上傳

實際綁定範例：`role.samurai.avatar`、`sfx.samurai-skill`、`sfx.sage-attack`、`bgm.normal`、`bgm.boss`。SFX 採現有 SFX_ASSETS 的精確 key，不依範例猜測。BOSS key 從實際名稱建立，普通路徑另用 `path.local.<SHA256前20字元>`；角色變身／召喚亦各有綁定。Asset Manager 的使用位置及公開 catalog 可查完整對應。

Registry 優先 published binding＋公開 asset，再 fallback_path／原演出 URL。local 使用既有路徑；storage 只從真實專案 URL、Bucket、path 組合；external 只接受 HTTPS。图片與遊戲背景、原頭像及特效預載共用解析。音訊初始化取得 manifest，基礎與選擇職業分階段預載，保留 Web Audio 快取，載入失敗回本地及原 synth fallback。URL／音量更新不改動演出時間。

上傳路徑為 `images/roles|bosses|effects|backgrounds/` 或 `audio/sfx|bgm/`，每次 UUID 新檔名。Render 檢查 MIME、大小、檔名與 Bucket 後建立 Signed Upload URL；瀏覽器直接 PUT Storage，不經 Render 轉送大型音檔。上傳完成再帶簽章憑證登記，後端確認物件存在及 metadata；失敗顯示錯誤並可重試。支援 PNG/JPEG/WebP/GIF 與 MP3/WAV/OGG/M4A/FLAC，不接受 SVG／HTML 上傳。

game_assets.is_public 控制資料清單公開；Public Bucket 的檔案 URL 本身公開。尚未發布用途時可先登記素材，再選 existing asset 修改 draft binding，最後發布。更換已發布檔案必須新 asset_key＋新路徑。

## 驗收及交付

```sh
npm test
npm run verify:studio-cloud
npm run verify:studio-browser
```

雲端／瀏覽器驗收需要實際 Supabase 設定，沒有設定不會偽裝成功。兩個腳本使用臨時後端 Token，清理自己的上傳／素材與原有草稿；正式發布驗證只發布既有原文，會留下合法版本歷史。瀏覽器腳本使用 Playwright 與 Chrome；可設定 STUDIO_PLAYWRIGHT_PATH、STUDIO_CHROME_PATH 指向本機安裝位置。

`artifacts/studio/cloud-report.json`：實際 public read、anon 不見 draft／不能寫表／不能呼叫發布 RPC、原文草稿與交易發布、歷史還原、失败 batch 全交易回滾、實際 PNG＋MP3 Signed Upload／登記／下載、CORS、防覆寫、anon Storage INSERT 拒絕。

`artifacts/studio/browser-report.json` 與 PNG：實際 Chrome 操作，12 職業／雷達／即時預覽／XSS、JSON 匯出與匯入差異、未發布技能名跨頁預覽、24 個代表場景（包含全部 12 職業普攻及特殊職業）、重播／重設／裝置尺寸、素材分類／搜尋／試聽、實際 UI MP3 上傳及 AudioContext 跨來源解碼、390px 版型。新增編輯器雲端發布／還原及雙客戶端重連／序章 ACK 驗收。完整 fixture 保留以原檔案及測試確認；沒有宣稱逐一人工觀看所有場景。

完整測試結果在 `artifacts/studio/tests.txt`。最後驗收狀態另見 `docs/STUDIO-HANDOFF.md`，包含最新結果及待辦。

### 修改／新增檔案

- 後端修改：server.js、game/Room.js、package.json、package-lock.json。
- 後端新增：studio/env.js、supabase.js、catalog.js、validation.js、content.js、router.js。
- 遊戲／Lab 修改：public/index.html、app.js、lobby.js、style.css、skill-copy.js、sfx-assets.js、presentation-core.js、bgm.js、combat-expansion.js、skill-presentation-stage.js、samurai-presentation.js、presentation-lab.html、presentation-lab.js。
- 新頁面：public/studio-editor.html、public/studio-assets.html。
- 共用與頁面模組：public/studio/content-store.js、asset-registry.js、radar-renderer.js、game-bridge.js、write-client.js、ui.js、import-export.js、editor.js、assets.js、lab-controller.js、studio.css、editor-layout.css、lab-layout.css。
- 工具／測試／文件：scripts/seed-studio.mjs、verify-studio-cloud.mjs、verify-studio-browser.mjs、tests/studio.test.js、docs/STUDIO.md、docs/STUDIO-HANDOFF.md。

本次沒有自行部署 Render 或推送 Git。實際本機 Supabase 已配置，STUDIO_WRITE_TOKEN 尚未永久配置；上線必須在 Render 加入該 Token 並部署目前變更。三頁公開開啟不受此限制。
