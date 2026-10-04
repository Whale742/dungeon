# Phase 6.1 完成報告

## 原有機制與實作決定

Phase 6 刺客基礎 HP 60；s_stab 基礎 30、暴擊 2 倍、暴擊重置 CD。基本攻擊實際未 roll 暴擊；煙霧技能以 isStealthed 免疫 Boss 反擊並設定下一次無暴擊。染毒刺刃每把基礎傷害 -10、暴擊率 +30% 且原本逐把疊加；暗影皮甲最大 HP -10、閃避 +10%。自然共鳴原本回合初治療所有存活僕從 3 HP／把，另有召喚數值加成。

新實作保留原始 50% 暴擊率與承傷 ×1.25；普攻也正式支援暴擊。完整匿蹤跨戰鬥保存，partial crit progress 在勝利時歸零。新冒險重置才清除全部狀態。

傷害順序：技能基礎（Skill 2 先乘匿蹤線性係數）→ 永久 ATK 與裝備 bonusAtk（強酸效果係數）→ 暴擊 ×2（可暴擊技能）→ 詩人增傷 → floor → 敵方抗性與最低 1 傷害 → HP clamp／實際結果。暗影皮甲的 +10 接入既有 bonusAtk，在暴擊前計算，因此無裝備暗影刺殺 35／70，單件皮甲 45／90；染毒刺刃原有負攻擊值保留。追擊固定 50% 暴擊，不讀刺刃暴擊加成。

## 32 項核對

|#|項目|結果|
|---|---|---|
|1|Assassin audit|上節記錄舊機制，沒有舊追擊系統|
|2|Base HP|game/constants.js CLASSES／ROLE_DETAILS、public/app.js fallback detail、Lab mock 均為 50；Room 初始化使用 CLASSES|
|3|Base Crit|保留 50%；普攻、Skill 1 使用同一伺服器 helper|
|4|Light armor|保留承傷 ×1.25|
|5|State schema|stealthStacks、critTowardStealth、isHiddenThisRound、stealthBrokenThisRound、followUpsThisRound、derived followUpCap；快照與 client state 同步|
|6|Critical accumulator|每有效暴擊 +1 progress，整除 2 加 stack，餘數 carry；普攻、Skill 1、追擊皆計入|
|7|Round Start|reset counter／broken → 減 1 層 → 決定 Hidden → DoT／狀態 → 演出 ACK → 選擇就緒 ACK → timer|
|8|Damage immunity|Boss／AoE／bounce、毒／流血、友傷、狂熱反噬皆免傷；既有腐化沒有傷害 emitter，不新增腐化 gameplay|
|9|Hidden vs Stack|Stack 保留，Hidden 是本回合防禦狀態；死亡不 decay、不 hidden|
|10|Active break|主動攻擊 resolution 開始先 break；普通主動攻擊不扣 stack|
|11|Same round re-hide|暴擊獲得 stack 不更新 Hidden；broken flag 直到下個 Round Start|
|12|Follow-up trigger|每次其他玩家正式行動結束後一次機率檢定，獨立 queue step 緊接 ally result|
|13|Probability|50%；死亡、斷線、脫力、未 Hidden、達 cap 不 roll|
|14|Follow-up Crit|固定 50%，伺服器決定；會累積匿蹤，保持 Hidden|
|15|Damage formula|使用者已確認基礎 10，暴擊 2 倍，再套裝備／Buff／抗性；集中 game/assassin.js|
|16|Recursion|Follow-up helper 只從正式玩家行動呼叫；minion、follow-up 都無觸發入口|
|17|Cap|Base 2，按當前穿戴染毒刺刃數量計算，最高 4；新 stack 不提高 cap|
|18|Blade duplicate|暴擊 +30% 只一次；0／1／2／3 把 cap 2／2／3／4，第四把以上仍 4；原 -10 ATK／把保留；裝備 log 顯示 cap 前後|
|19|Skill 1|基礎 35／暴擊 70，原 CD 1／暴擊 CD 0；逐玩家保存暴擊決定|
|20|Skill 2 formula|30 × (1 + 0.5 × consumedStacks)，0–5 層為 30／45／60／75／90／105|
|21|Skill 2 Crit|ASSASSIN_BALANCE.skill2CanCrit = null，明確 TODO；目前不 roll 暴擊，UI 已揭露待定|
|22|Consumption|resolution 消耗全部 stack；Production entrance 先顯示吸收與 HUD N→0，0 層直接普通版本|
|23|Trap|無條件 assassin_trap_evade，0 damage，正式 Trap 演出 evasive swish／殘影、不播 hit|
|24|Shadow Leather|移除 dodge bonus 與 Boss 分支；bonusAtk +10／bonusHp -10，普攻、Skill 1／2、追擊統一適用|
|25|Natural Resonance|移除 Round Start 僕從治療、log 與 description；保留小樹精 HP +5／幼狼 ATK +2|
|26|HUD|正式 SVG 匿蹤 ×N、隱身、追擊 x/cap；不持續顯示 crit progress；Hidden 肖像暗化陰影|
|27|Presentation|Compact shadow follow-up 約 725ms（正常速度，致命另等完整死亡）；每擊斬擊／命中音／方向 knock／數字／HP；CRITICAL 金色、stack whisper、decay soft fade、active shadow emerge、stack suction|
|28|Lab|65 個 production fixtures；新增 23 個 Phase 6.1 場景；正式 Room 產生數值，正式 production dispatcher 播放|
|29|Tests|新增 36 個 Assassin gameplay tests；含 carry、caps、正常／暴擊、recursion、damage immunity、timers、revive、lethal ACK、装备、共鳴；保留 Phase 6 回歸|
|30|Multiplayer|兩個真實瀏覽器分頁 localhost:3006 房號 NLJZ5；選職、隱身回合初、skip＋隊友攻擊→追擊、Boss MISS、active stab→正常受傷、下一回合 decay／DoT MISS；多 ally cap 另有正式引擎測試與 Lab|
|31|Console|已回放新演出無 uncaught errors；多人瀏覽器另外核對|
|32|Balance ambiguity|追擊基礎 10 已確認；Skill 2 暴擊資格仍保留明確 null TODO，其餘指定數值已實作|

## Lab 場景

暗影刺殺 Normal／Critical、Crit #1／#2 stack gain、Hidden active emerge、Skill 2 0–4 stacks、Normal／Critical follow-up、0／1／2／3 刺刃 cap、Round Start hidden enter／exit／Poison MISS、Boss single／4-player AoE、Shadow Armor、Trap party、Natural Resonance summon bonuses。更新原本煙霧場景以對應新技能。

QA 伺服器 tests/phase61-preview.js 獨立於 production server，僅設定可重現的初始場景與隨機序列；正式 server 無 QA backdoor。

完成後停在 Phase 6.1。

## 最終驗證

- node --test tests/*.test.js：100／100 通過，新增刺客 36 項。
- 語法檢查與 git diff --check 通過。
- Lab 所有 Phase 6.1 新增場景已完成正式回放；多人兩分頁 error／warn 均為 0。
- phase61-assassin.png：3 層消耗後正式暗影爆襲，75 點傷害，Boss HP 500→425。
- phase61-multiplayer.png：雙人實際狀態同步截圖。
- 原有 Phase 6 共用演出與等待全員 ACK 的 timer gating 保留。
