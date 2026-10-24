# Dungeon Abyss 專案索引

## 主要入口

| 位置 | 用途 |
| --- | --- |
| `server.js` | Express、Socket.IO、遊戲房間與正式路由 |
| `game/Room.js` | 權威遊戲狀態、回合、事件、裝備與戰鬥結算 |
| `game/constants.js` | 職業、敵人、裝備與遊戲常數 |
| `studio/router.js` | `/lab`、`/edit`、`/asset` 與 Studio API |
| `studio/catalog.js` | 本地文案、素材、綁定及 Lab 場景目錄 |
| `studio/content.js` | Supabase 發布內容快取與房間快照 |
| `studio/migration.js` | 素材遷移規劃與 Storage 同步 |
| `DEV_MODE.md` | 既有開發模式實作與驗證紀錄，保留原位置 |

## 設計資料

- `specs/equipment/`：通用裝備規格（含提案數值）、專屬裝備設計參考。
- `specs/enemies/深淵.md`：深淵敵人設計參考。
- `specs/prototypes/`：卜者、陰陽師、武士、智者演出的原始設計展示與來源紀錄。

規格與 Prototype 保留原稿，可能包含尚未採用或已調整的設計；目前權威數值與行為以 `game/` 的實作為準。
