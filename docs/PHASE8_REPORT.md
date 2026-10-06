# Phase 8 完成報告

驗證日期：2026-10-06。五個新職業與既有職業調整已整合至原本的 Room、傷害／護盾、冷卻、演出佇列及音效管理器。隨機結果和戰鬥數值由伺服器決定。

1. **Modified files**

   遊戲：`game/Room.js`、`game/constants.js`、`game/combat-schema.js`，新增 `game/phase8-config.js`、`game/phase8.js`。

   客戶端：`public/app.js`、`index.html`、`combat.js`、`combat-expansion.js`、`presentation-core.js`、`portrait-status-fx.js`、`sfx-assets.js`；新增 `battle-log.js`、`phase8.css` 及五張職業圖片。

   Lab：`public/presentation-lab.html`、`presentation-lab.js`、`lab-combat-scenes.js`、`tests/generate-combat-lab.js`、新增 `tests/phase8-lab-fixtures.js`。

   驗證：新增 `tests/phase8.test.js`、`tests/phase8-preview.js`、`scripts/verify-phase8.mjs`、`scripts/verify-phase8-multiplayer.mjs`；更新既有 `tests/combat.test.js`、`crossbow.test.js`、`audio-routing.test.js` 與 `scripts/verify-audio.mjs`。臨時整合腳本已移除。

2. **Battle Log old/new architecture**

   原本浮動紀錄面板與完整紀錄重畫改為共享的 latest-five renderer，依紀錄 ID 保留既有節點。伺服器保留完整歷史；畫面只取最後五筆，舊到新由上往下排列。寬畫面預設顯示，窄畫面從左側抽出。面板移至 body，避免父層動畫變形影響 fixed 定位。

3. **Responsive breakpoint**

   分界為 **1280px**。紀錄寬 264px，主區預留側邊空間；1440px 與 1280px 實測紀錄和主戰鬥區不重疊。1024px、390px 使用左側抽屜，不縮窄主戰鬥區，箭頭可正常開關。

4. **Log opacity implementation**

   五筆透明度為 20%、40%、60%、80%、100%；不足五筆從最新 100% 向前遞減。只有新增節點使用 240ms 淡入、向上 6px 動畫；重畫不重播。每筆最多兩行，title 保留全文。紀錄與演出容器使用 overflow hidden／scrollbar-width none。

5. **Audio polish changes**

   箭雨增加五波、約兩秒的實際箭矢演出，誤射延後且有箭雨尾波。酸瓶依序投擲破空、飛行、玻璃命中，再隔 80ms 播放化學聲。吟遊詩人走音只對當次音源做 detune，後續正常音源不受影響。Boss、勝利、寶箱 profile gain 分別由 .38／.45／.65 降為 .27／.32／.46。

6. **Warrior patch**

   實際 HP 受傷事件各增加 1 攻擊，上限 15，戰鬥結束清除；全護盾吸收、零傷害不增加。猛擊提供自身 60% 減傷三回合；回合末以該回合減傷後實際 HP＋護盾傷害統一反擊一次。防禦技能改為每位存活隊友獲得戰士最大生命 40% 的護盾，沿用 tempHp 傷害流程。

7. **Mage patch**

   吸取傷害改為 1–50，吸血按實際造成傷害的 20% 四捨五入。兩個技能 CD 均為 2。實傷以 Boss 剩餘生命限制，避免過量傷害產生額外吸血。

8. **Alchemist patch**

   酸瓶對 Boss 40、對每名存活隊友 20，隊友傷害使用既有護盾與減傷處理，不觸發閃避／武士敵方直接攻擊招架。裝備腐蝕 50% 保留。滴定管不再免除酸瓶隊伍波及；毒瓶自傷 5 的免疫保留。

9. **Druid patch**

   樹精不再增加最大生命 100，變身改給自身最大生命 85% 護盾。保留 30% 減傷、50% 分攤與古樹庇護，沒有新增再生。形態持續時間在 Boss 階段後扣除。召喚演出與僕從攻擊維持獨立事件，依序播放。

10. **New class photo mapping**

    `dreamweaver` → `/photo/Dreamweaver.webp`；`stargazer` → `/photo/Stargazer.webp`；`gladiator` → `/photo/Gladiator.webp`；`samurai` → `/photo/武士.webp`；`sage` → `/photo/智者.webp`。角色選擇、HUD、詳情與演出使用相同映射。

11. **Dreamweaver implementation**

    75 HP、10 魔法普攻。混亂判定及四種等機率結果由伺服器決定：交換抗性、承傷增加、暫降当前／最大生命、Boss 加傷。夢蝶可指定隊友或 Boss，每個傷害事件獨立判定等額治療或真傷；織機處理惡夢後治療。虛構歷史只覆寫本輪戰鬥計算，不改實際樓層或獎勵。狀態結束恢復最大生命並保留剩餘比例。

12. **Stargazer implementation**

    70 HP、10 魔法普攻。實作恆星、行星、銀河、黑洞、邊界，以及冷卻縮短、歸零、超負荷、無效四種時計結果。暈眩在當輪生效；銀河按合法命中加傷，燕返四擊分別生效。三件望遠鏡零件需同時裝備，啟動四種各 25% 的強化觀測；邊界具有鎖血與強化後的一次致命抵擋。

13. **Gladiator implementation**

    85 HP、10 物理普攻。實際 HP 受傷的怒氣每回合最多一次，獻祭另給怒氣；獻祭生命成本忽略護盾與減傷。競技場宣告下一回合進入，僅本人和 Boss 行動，其他隊友、僕從攔截／攻擊及刺客追擊排除。雙方忽略減傷與抗性。本人 current/max HP 依 .6 ×（隊伍人數＋1）縮放，退出按比例恢復。場內獻祭與宣告替換為攻擊／同歸於盡，同層禁止吟遊詩人復活，下層可正常復活。

14. **Samurai implementation**

    80 HP、10 物理普攻，劍魂上限 8。每輪首次敵方直接攻擊判定，成功後本輪後續直接攻击招架，失敗不再重抽；DoT、隊友誤傷、酸瓶波及與自傷排除。一刀兩斷依施放前劍魂處理招架率／倍傷。燕返消耗四魂、一次行動四次獨立命中並忽略物抗；回合末統一反擊。村雨完整覆蓋羽織的 HP、額外魂與固定反擊效果。

15. **Sage implementation**

    70 HP、10 物理普攻，開戰 X=10，兩輪假設／求解循環。Operand 隨機整數 1–30；方程使用 round(abs(Operand × eta(X)))，作為獨立物理事件，避免套用智者普通攻擊增益。偶數護盾、奇數穿透／下輪承傷、質數真傷／CD 歸零、平方數下輪 Boss 直接攻擊減傷可同時成立。三個行動依各自規則修改 Operand、判定成功／混亂／無效，X 使用 Math.round。

16. **New equipment implementation**

    共 17 項：織夢術士三項、觀星者六項、角鬥士三項、武士三項、智者兩項，接入原本掉落、職業限制、裝備、卸裝與 unique 流程。織機、朧月、透鏡、計算尺可按規則疊加；天眼看目前裝備。腐蝕沿用 equipmentEffectMultiplier，處理攻擊／生命及倍率加成；短劍獻血加成免疫，胸甲生命受腐蝕但受療被動免疫。唯一與套裝啟用條件沿用既有裝備規則。

17. **New Status types**

    加入夢境混亂／夢蝶／虛構歷史、銀河／邊界／超負荷、怒氣／獻血／競技場、劍魂／鏡頭、方程階段／暴露／平方數防護、戰士堅定及方程護盾。使用回合到期資訊、原本 snapshot 與 portrait-status-fx 控制器；護盾貢獻記錄仍由同一傷害流程消耗。

18. **New Presentation profiles**

    五職業共用原本 cast → reveal → result 生命週期。織夢使用夢紋、觀星使用星軌／黑洞、角鬥士使用血色竞技場、武士使用冷色斬線、智者使用金色方程。支援施法階段不先顯示 Boss 結果；燕返逐擊顯示。方程依 Operand、eta、數值、伤害、性質依序揭示。回合末致命反擊／方程會排入死亡事件，等待演出 ACK 後才轉勝利。

19. **New Audio profiles**

    五職業 profile 接入既有 logical keys、音檔資產與 presentation audio scope，不另建音效播放器。沿用既有 MP3，未新增下載素材。音效與命中、支援結果、護盾、治療及死亡事件同步。

20. **Sage compact UI**

    所有職業共用 40px 資源／被動摘要元件。智者顯示 X、Operand、Phase 與一句提示；不將整段方程被動塞進技能區。手機截圖確認摘要與四個行動按鈕正常排列。

21. **Role Detail long-text solution**

    共用職業詳情模態框與折疊區塊，包含完整被動、技能、冷卻、裝備說明；不为每個職業另寫特殊長文布局。十二職業詳情開關均經瀏覽器驗證。

22. **Presentation Lab coverage**

    生產 Room 生成的 Lab 共 137 場景，新增 41 個 Phase 8 場景，包含五職業分支及 1／3／5／6 筆紀錄。職業選單新增五職業。瀏覽器實際播放 41 個新場景＋9 個既有場景，共 50 個；另外擷取五職業代表演出。

23. **Unit test results**

    `node --test tests/*.test.js`：**230／230 通過，0 失敗、0 跳過**。Phase 8 檔案有 55 個測試，覆蓋機率分支、護盾／實傷、冷卻、裝備、競技場排除、四擊、方程性質疊加、重啟與回合末死亡等。結果：`artifacts/phase8-unit-report.txt`。`git diff --check` 通過。

24. **Browser viewport tests**

    Chrome 自動驗證 1440、1280、1024、390px：無水平溢出，寬畫面兩區不重疊，窄畫面抽屜可開關，五筆透明度正確，摘要高度固定。另驗證紀錄節點重用及十二職業詳情。結果：`artifacts/phase8/browser-report.json`。截圖檢查後修正舊內距造成的第二行裁切，四種寬度再驗通過，新增五笔完整容納的檢查；結果：`artifacts/phase8/layout-report.json`。截圖位於同資料夾。

25. **Multiplayer regression**

    使用真實 Socket 連線、battle:lock、演出佇列和 ACK，五個新職業一組跑四回合，七個既有職業一組跑三回合；保留現有十人上限，沒有為測試修改玩家限制。驗證所有客戶端 HP／Boss HP 一致、ACK 完成、競技場其他四人鎖定、燕返四擊及方程事件。智者使用 390px 畫面。QA 入口僅固定戰鬥資料和隨機種子，實際處理使用原本 Room 與伺服器事件。結果：`artifacts/phase8/multiplayer-report.json`。

26. **Console errors**

    本輪 50 場景／四寬度驗證和兩組多人驗證均未捕捉到 pageerror 或 console.error。角色狀態解析具有非字串保護，避免 undefined.endsWith 中斷 PresentationQueue。

27. **Ambiguity / values requiring human confirmation**

    你已確認：競技場生命倍率僅套用角鬥士本人；超負荷技能基礎傷害 +5 持續一回合。其他落實方式：X 和方程採 Math.round；護盾整數採向下取整；朧月和計算尺加成採加算；「未破」方程盾採完全未被消耗，餘盾到期後轉入下一次抽取循環的基數。沒有待確認的阻塞項目。

Phase 8 範圍完成；未新增第六個職業、新 Boss、新樓層事件或額外玩法系統。
