# 戰鬥修正交接（2026-10-25）
使用者要求：將 Lab 與這批 11 項修正提交 main；額度低於 10% 時停止並交接。

## 提交與目前狀態
- 分支：main。Lab 重構已提交 ffcb6e5。
- 本批機制／介面修正已實作，完整測試 319/319 通過（最近一次包含最後的背包圖層修正）。提交結果以 git log 為準。
- 尚未完成全部瀏覽器／手機驗收，不可宣稱整批已全面驗收完成。沒有 push。
- 不需再逐項詢問使用者，恢復額度後接續下列驗證。

## 已實作
1. applyDamageToPlayer 依傷害來源區分：敵人直接攻擊及其轉移可以消耗護盾／暫存生命；DOT、友傷、智者紊亂等不消耗。角鬥士獻祭與卜者命債原本直接扣 HP，已新增帶盾回歸確認仍扣生命。
2. 受擊觸發的戰士成長／角鬥士怒氣計入實際吸收量；更新戰士 v2 文案與 role-config 角鬥士被動。仍宜檢查角鬥士 v2-copy 是否覆蓋該說明。
3. temporaryOverheal 獨立追蹤，tempHp 仍為相容總池；snapshot／getState 額外提供 shieldHp 與 temporaryOverheal。直接傷害先消耗盾，後暫存生命；回合及戰鬥重置清除暫存生命。
4. 奇怪寶箱記錄夥伴攔截的主人，完全攔截也偷主人的裝備／小隊金幣。全盾命中與夥伴攔截偷裝備測試通過。
5. battle-renderers.js 共用分層血條：淺藍盾外框、綠色暫存生命外框、命債為當前 HP 尾段暗紅閃爍；統一以 maxHp 縮放。套用主角、隊友、敵人、盟友選單及隊伍總覽。
6. BattleHud 在選技時於德魯伊頭像上方顯示夥伴圖像、血條與 HP。新增可切換隊伍狀態總覽；演出開始自動關閉。
7. 群體敵方技能顯示多個 SVG target，奧術爆破主目標較大、其餘較小；紅色白光暈、循環閃爍與選中縮小淡入，不顯示 TARGET 文字。Lab previewAction 同步此選擇。
8. 多人藥水修復三個問題：openTargetModal 未宣告 me；兩個背包入口使用作用域外 isNarrating；非戰鬥藥水目標選單被背包蓋住。改為取 getMyPlayer、共用 canUseBattleItem 閘門、切換目標前先收起背包。
9. BattleHud 字幕移除括號注釋。a_trap 轉成 STATUS_TICK，走 playBattlefieldTick，不建立弓箭手佇列頭像或長字幕。
10. 煉金瓶落點取存活敵人編隊中心下方，濺射同落點；落地增加 bottle_impact（既有 glass.mp3），原命中音保留。

## 驗證與仍需完成
- 指令：node --test --test-reporter=spec game/*.test.js server.test.js studio/combat-lab.test.js
- 319 項全過；新增 10 項核心回歸及擴充既有瓶子／陷阱測試。git diff --check 曾通過，最後仍可再檢查。
- 已看實際截圖：正式雙人戰鬥隊伍總覽、盟友血條選單、德魯伊小樹精 9/31 位於頭像上方；Lab 法師三目標主大副小。
- 實際復現舊 isNarrating 錯誤，修正後重載重建雙人房；非戰鬥藥水可產生自己＋隊友兩個有效血條目標。發現背包圖層遮擋後，已加入自動收起修正與測試。
- 最後的瀏覽器頁仍載入「自動收起背包」修正前版本；手動關閉背包後確認正確選單畫面，選自己成功消耗藥水。**需重載新的頁面後再確認自動切換，及 IN_BATTLE 背包入口完整流程。**
- 仍需實際手機截圖檢查新總覽／夥伴列；看護盾、暫存生命與命債色層的實際演出、回合消失；瓶子編隊落點／glass 音效及陷阱快速結算可再抽樣。不要只依測試宣告視覺完成。
- 完成後更新 PROJECT_INDEX 與本交接，確認 main 提交及乾淨狀態，再交付。

## 瀏覽器與服務
- cua_repl 持續變數：labBrowser（browser 2），labTab（tab 1），combatTab（tab 3），allyTab（tab 4）。已 markHandoff 保留兩個遊戲分頁。
- Lab：法師、三個一般敵人、奧術爆破。遊戲雙人房 D5Z6N，德魯伊「用藥回歸」＋法師「用藥隊友」，目前 FLOOR 02 黑鐵重鑄工坊，剛消耗唯一治療藥。
- 原房 CHXN8 已因重載離開。既有 error log 會跨 reload 留存 19:27:13 的舊 isNarrating 堆疊，不代表修正後又發生。
- 目前本機 server session 3673，PORT 3210。它啟動於部分最後 backend／copy 修改之前，下一輪正式機制 QA 請重啟自己的服務以確保最新。
- 改到的檔案以 git status 為準；新樣式 public/css/combat/battle-vitals.css，沒有改 Dev／Edit／Assets UI、沒有雲端遷移或推送。

## 有效截圖（儲存庫外）
C:/Users/orgal/.codex/visualizations/2026/10/24/01a16e78-6774-7452-8e69-0cd915bacf7c/
- combat-repairs-companion.png：正式選技，小樹精 9/31。
- combat-repairs-targets.png：Lab 法師群體標記。
- combat-repairs-potion.png：手動收起舊背包之後的雙人視覺血條選單，不是自動收起程式已實測的證據。

