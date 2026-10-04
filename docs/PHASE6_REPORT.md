# Phase 6 完成與驗證報告

2026-10-04（Asia/Taipei）。保留 Phase 1–5.2，Phase 6 完成後停止。

## 已確認設定

- 精準狙擊 MISS：下一次閃避檢定 +20 個百分點，檢定成功或失敗後都消耗。
- 下一層復活：floor(Max HP × 20%)，最低 1 HP。
- 戰後恢復保留現行公式：存活玩家 Max HP +10、ATK +5；恢復 10 + round(新 Max HP × 20%)，上限為新 Max HP。

## 技能／被動 audit

權威規則來源：game/Room.js、game/constants.js；presentation 分類來源：game/combat-schema.js。表內技能說明為目前正式資料；裝備、抗性、增傷仍由伺服器套用。

|職業|被動／基礎|技能|分類|數值／條件|
|---|---|---|---|---|
|戰士|前排坦鋒，擁有全職業最高的基礎生命值（120 HP）與強大減傷防護。|—|STATUS|HP 120|
|戰士|—|普通攻擊 (basic)|OFFENSIVE|揮動武器進行基本物理打擊，對單一目標造成基礎 10 點傷害。|
|戰士|—|堅定斬擊 (w_strike)|OFFENSIVE|揮動巨劍造成物理傷害。80% 機率造成 18 點傷害；20% 機率因揮砍失衡僅造成 5 點傷害，並使下回合自身承受傷害提高 20%。|
|戰士|—|壁壘守護 (w_shield)|DEFENSE|展開厚重盾勢，大幅降低全隊本回合受到的傷害（阻擋 90% 傷害，有 25% 機率盾牌龜裂使冷卻延長 1 回合）；次回合仍提供殘餘 40% 減傷。|
|法師|站樁高爆發與生命汲取，全技能與普攻皆為魔法傷害。|—|STATUS|HP 80|
|法師|—|普通攻擊 (basic)|OFFENSIVE|引導微光魔力造成基礎 10 點魔法傷害。|
|法師|—|奧術爆破 (m_blast)|OFFENSIVE|引爆狂暴魔力轟炸敵方造成 45 點魔法傷害。有 25% 機率發生法力走火導致威力驟降為 10 點傷害，並對自身造成 10 點魔力反噬。|
|法師|—|生命汲取 (m_drain)|OFFENSIVE|對敵方造成 1~40 點劇烈浮動的魔法傷害，並依據最終造成的傷害量吸取 20% 生命回復自身。|
|弓箭手|常駐 40% 閃避率（可完全閃避單體物理打擊與怪物反擊）。|—|STATUS|HP 80|
|弓箭手|—|普通攻擊 (basic)|OFFENSIVE|拉弓射出基礎箭矢造成基礎 10 點物理傷害。|
|弓箭手|—|精準狙擊 (a_shot)|OFFENSIVE|百步穿楊狙擊目標造成 35 點傷害。有 20% 機率發生脫靶導致無法造成傷害（0 傷害），並使下一次閃避檢定成功率提高 20 個百分點（檢定後消耗）。|
|弓箭手|—|箭雨壓制 (a_rain)|AOE_OFFENSIVE|召喚範圍附魔箭雨造成 20 點魔法傷害並削弱敵方 10 點攻擊力。有 20% 機率受地底氣流干擾誤傷隨機一名隊友 10 點傷害。|
|刺客|常駐 50% 暴擊率（暴擊造成 2 倍傷害）；身著輕甲承受傷害額外增加 25%。|—|STATUS|HP 60|
|刺客|—|普通攻擊 (basic)|OFFENSIVE|揮動雙匕進行基礎物理切削造成 10 點傷害。|
|刺客|—|暗影刺殺 (s_stab)|OFFENSIVE|背刺敵方造成 30 點物理傷害。若觸發暴擊則傷害倍增為 60 且立即重置冷卻；未暴擊則需正常進入冷卻 1 回合。|
|刺客|—|煙霧匿蹤 (s_smoke)|STEALTH|隱入暗影完全避開本回合所有攻擊，但現身後的下次攻擊將失去暴擊能力。|
|吟遊詩人|團隊核心輔助，精通全體群療與增傷減傷，全技能皆為魔法傷害。|—|STATUS|HP 70|
|吟遊詩人|—|普通攻擊 (basic)|OFFENSIVE|撥動琴弦引導音波造成基礎 10 點魔法傷害。|
|吟遊詩人|—|治癒頌歌 (b_heal)|HEAL|唱響聖詠為全體隊友回復生命。80% 機率為全體回復 22 點生命，並專注為指定目標額外回復 28 點；20% 機率因走音導致全隊回復量大幅縮減為僅回復 5 點生命。|
|吟遊詩人|—|狂熱協奏 (b_buff)|BUFF|使全隊提升 50% 傷害、25% 減傷並削弱敵方抗性。有 25% 機率因節奏過激導致全隊力竭扣除當前 5 點生命。|
|鍊金術士|神秘調和者，精通強酸腐蝕、劇毒煙霧與命運試劑，全技能與普攻皆為魔法傷害。|—|STATUS|HP 75|
|鍊金術士|—|普通攻擊 (basic)|OFFENSIVE|揮動燒瓶引發衝擊造成基礎 10 點魔法傷害。|
|鍊金術士|—|1 技能 A: 腐蝕強酸瓶 (alc_acid)|OFFENSIVE|投擲高濃度強酸重創目標造成 50 點傷害。強酸濺射會對自身造成 15 點自傷，強酸飛濺腐蝕全隊裝備，全體裝備效果在本回合減半，回合結束還原。|
|鍊金術士|—|1 技能 B: 劇毒煙霧瓶 (alc_poison)|DEBUFF|砸碎毒瓶造成 30 點傷害與輕微自傷 5 點，使敵我雙方皆陷入劇毒，全體後續 2 回合每回合初持續承受 5 點毒素傷害。|
|鍊金術士|—|2 技能: 命運煉成試劑 (alc_fate)|CLEANSE|立即驅散全隊所有負面狀態（中毒/撕裂）。若自身有異常狀態：50% 機率煉金大成功（全員回復 40 點生命 + 2 回合 70% 減傷護盾）/ 50% 機率煉金失敗（全員回復 10 點生命 + 下回合全隊受傷 +20%）；若自身無異常狀態：全員穩定回復 15 點生命。|
|德魯伊|自然之子，擅長形態轉變（狼人/遠古樹精）與自然僕從召喚（小樹精/幼狼）。|—|STATUS|HP 85|
|德魯伊|—|普通攻擊 (basic)|OFFENSIVE|引導自然力量造成基礎 10 點物理傷害。|
|德魯伊|—|1 技能: 形態轉變 (dru_transform)|TRANSFORM|持續 2 回合（結束後才可再次變身）：有一半機率化身狼人（降低 20% 最大生命、造成傷害提升至 40 點、立即造成 40 傷害強化普攻，變身結束恢復最大生命）；有一半機率化身遠古樹精（生命上限 +100、常駐減傷 30%、替全隊吸收 50% 受傷、致命傷免死化為樹木休眠 1 回合）。|
|德魯伊|—|2 技能 A: 召喚小樹精 (dru_summon_treant)|SUMMON|召喚肉盾型樹精僕從（HP = floor(10 + Max HP × 25%)，ATK = floor(有效攻擊 × 10%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。|
|德魯伊|—|2 技能 B: 召喚幼狼 (dru_summon_wolf)|SUMMON|召喚敏捷型幼狼僕從（HP = floor(5 + Max HP × 10%)，ATK = floor(有效攻擊 × 80%)，最低 1），每回合自動攻擊並優先替隊伍承受分散傷害。|

|特殊／裝備技能|分類|保留規則|
|---|---|---|
|戰士狂怒重劈 w_cleave|OFFENSIVE|雙手劍替換技能，基礎 40 物理傷害，CD 2|
|詩人催眠夜曲 b_nocturne|DEBUFF|提琴替換技能，15 魔法傷害，30% 催眠本回合 Boss|
|詩人狂亂殺戮曲 b_frenzy|BUFF|提琴替換技能，20 魔法傷害、隊伍 +70% 傷害、次回合全隊 Max HP 20% 代價|
|詩人甦生之歌 b_revive|REVIVE|指定同層倒下隊友，35% Max HP 復活，雙方下一回合 EXHAUSTED|
|Temporary Overheal|SHIELD|不增加基本 Max HP；先吸收傷害，Boss 回合結束清除|
|狼人|TRANSFORM|有效 Max HP 降低 20%，不含 Temp HP；clamp 現有 HP；退場只恢復 Max HP，不補 HP|
|樹精／古樹|TRANSFORM / DEFENSE|移除每回合自動回血；減傷 30%；+100 HP、50% 分攤、致命傷保留 1 HP 並休眠|
|僕從|SUMMON / MINION_ATTACK / MINION_INTERCEPT|保留動態 HP／ATK、每位德魯伊上限 3；召喚當回合攻擊；承接隊伍分散傷害|
|深淵腐化|STATUS|現有 Room 無產生腐化的 gameplay 規則；只支援既有 corruption 值的鎖定 SVG／stack 顯示，不新增平衡公式|

### 裝備規則對照

|裝備|職業|既有規則|
|---|---|---|
|鋼鐵聖劍|warrior|攻擊傷害 +5|
|荊棘重鎧|warrior|最大生命 +30，但造成的傷害 -5|
|雙手劍|warrior|原本2技能護盾失效，替換為攻擊技能【狂怒重劈】；1技能與2技能基礎傷害分別提升為 25 與 40。不受效果減半影響，不可重複穿戴|
|虛空魔杖|mage|法師攻擊傷害 +15|
|大魔導護符|mage|法師最大生命值 +20|
|嗜血法袍|mage|最大生命 -20，攻擊傷害 +20。1、2技能額外造成目標最大生命 10% 傷害並為全體隊友吸血（上限不超過該次實際加成傷害）|
|破甲獵弓|archer|弓箭手攻擊傷害 +12|
|靈巧披風|archer|弓箭手最大生命值 +20|
|大天使重弓|archer|攻擊傷害 +20，但閃避機率降低 20%|
|染毒刺刃|assassin|基礎傷害 -10，但暴擊率提升 30%|
|暗影皮甲|assassin|閃避機率 +10%，最大生命 -10|
|精靈木豎琴|bard|1技能與2技能的效果數值皆提升 10%|
|祝福絲綢袍|bard|最大生命 +15。每回合初自動為全隊當前生命最低的隊友補血，補血量為詩人最大生命值的 5%|
|精靈木提琴|bard|攻擊傷害 +10。原本1、2技能失效，1技能替換為【催眠夜曲】(15傷害+30%機率使敵方本回合無法行動)；2技能替換為【狂亂殺戮曲】(20傷害，我方全體下回合扣20%最大生命，但全隊傷害提升70%)。不受效果減半影響，不可重複穿戴|
|賢者燒瓶|alchemist|藥劑傷害 +12|
|防護生化袍|alchemist|最大生命 +20|
|精密滴管|alchemist|移除腐蝕強酸瓶與劇毒煙霧瓶的自傷效果（劇毒狀態仍保留），但2技能命運煉成失敗機率改變為 65%|
|荒野守護符|druid|德魯伊最大生命值 +30|
|自然共鳴|druid|每回合初為所有存活僕從回復 3 點生命；小樹精最大生命 +5；幼狼造成傷害 +2|

動態召喚的精確公式：小樹精 HP = floor(10 + 德魯伊 Max HP × 25%)，ATK = max(1, floor(有效攻擊 × 10%))；幼狼 HP = floor(5 + Max HP × 10%)，ATK = max(1, floor(有效攻擊 × 80%))。自然共鳴保留樹精 HP +5／幼狼 ATK +2。有效攻擊沿用既有 getDruidEffectiveAttack。

## Random Outcome 與逐步結果契約

每個 queue action 包含 category、outcome、results、hpSnapshotBefore、hpSnapshot、presentationId（queue 層）與 round。results 包含 targetId、kind、outcome、targetBefore、targetAfter、hpSnapshot，以及實際 finalDamage／actualHeal／absorbed／hpDmg／guard／shieldBreak／minion／sharedFrom。客戶端不擲骰、不推算 gameplay 傷害。

outcome.type 明確包含 normal、miss、dodge、critical、imbalance、shield_crack、misfire、friendly_fire、off_key、overload、alchemy_success、alchemy_failure、transform_wolf、transform_treant、sleep、block；致命庇護使用 outcome.protection。多段彈射在伺服器拆成 segment: aoe／bounce，守恆原始合計傷害與既有減傷／閃避判定。

## 33 項完成回報

|#|項目|結果與驗證|
|---|---|---|
|1|Skill / Passive audit|上方完整技能、被動、裝備對照|
|2|Random Outcome schema|伺服器顯式 outcome + 逐目標前後快照；Lab 使用正式引擎產生資料|
|3|Archer MISS|顯示 MISS、箭矢掠過；沒有 -0、命中閃光、扣 HP；隨後顯示 DODGE ↑|
|4|Dodge config|GAME_BALANCE.archerMissNextDodgeBonus = 0.20；單次檢定後消耗|
|5|Mage Misfire|同一 action：不穩定法術 → 降低後實際命中 → 自傷|
|6|Bard Off-key|失諧音／角色反應在實際各目標治療前；不重新抽結果|
|7|Alchemy branch|先 CLEANSE 快照；成功 40 + 70% DR 2 回合，失敗 10 + 次回合易傷；保留無異常 15 治療|
|8|Werewolf HP|有效 Max HP × 80%、記錄扣除額；退場恢復上限但不自動補血|
|9|Treant Regen|executeRoundStart 移除樹精自動回血；移除勝利後樹精回血成长|
|10|Treant DR|GAME_BALANCE.treantDamageReduction = 0.30；直接與分攤傷害共用|
|11|Treant share|獨立 sharedFrom 結果、root link 提示、實際樹精 HP 變化|
|12|Lethal protection|1 HP、古樹形態、休眠與鎖定；不播放死亡|
|13|AoE architecture|Boss 只進場一次，60ms 目標 ripple，重複目標使用 predecessor 串行|
|14|Multi-target|每個目標獨立 hit／dodge／temp吸收／HP；彈射有逐段結果與 HP|
|15|Heal architecture|置中支援舞台，綠色效果、實際 +HP；群療與專注治療各有結果|
|16|Overheal|Temp HP 延伸、盾色吸收、Break；不修改基本 Max HP|
|17|Shield|Apply 盾色波、Block／Absorb、Break 碎裂；盾裂同 action 顯示|
|18|Buff / Debuff|行動飄字與正式 SVG 狀態、turns、stacks、locked；Buff 先於反噬|
|19|Summon|自然系揭示、動態 HP／ATK；同 action 的召喚後攻擊|
|20|Three minions|獨立三擊、重用目標卡；設定攻擊間距 100ms，最後飄字完整停留|
|21|Intercept|先攔截 cue，再實際僕從 HP 受損；沿用原本隊伍 scatter pool|
|22|Minion death|死亡結果保存 0 HP 僕從；演出完成後套用不含它的最終 slot 快照|
|23|Player death|downedForFloor／downedFloor；本層無操作／普通治療／正面狀態|
|24|Bard revive|同層 35% 復活；雙方下一回合 EXHAUSTED|
|25|Floor revive|合法下一層恢復 20%；Floor Intro 退場後、敘事前播放；wipe 不自動前進|
|26|Required Lock|過濾死亡、斷線、脫力、臣服、古樹；觀看演出 ACK 仍包括連線倒下玩家|
|27|Victory lifecycle|致命命中／死亡完整結束 → silence → VICTORY 750ms + 1500ms → 故事 → Summary → Recovery → Reward → Continue → 500ms fade|
|28|Recovery|沿用使用者確認的現行公式；只對存活玩家；結果飄字與 log 使用實際恢复量|
|29|Reward integration|抽取共用 playRewardReveal；Victory／Chest 使用同一 Phase 4 函式；全員退出 Reward 後才啟用裝備|
|30|Lab coverage|42 個正式引擎 fixture；正式 playExpandedCombatPresentation／playVictoryPresentation／playFloorRevivalPresentation，無 Lab 專用 FX 複製|
|31|Browser multiplayer|兩個真實瀏覽器分頁：選職、锁定、治療、攻擊、Boss反擊、倒下旁觀、致命、同步勝利、裝備、隊長 Continue、下一層|
|32|Console|已回放流程與兩人瀏覽器檢查皆 0 error／warn；中斷清理另有 client tests|
|33|待確認平衡值|無；兩項 20% 與保留恢復公式已明確確認。腐化只有顯示契約，不自行增加 gameplay|

## 驗證與重現

- node --test tests/*.test.js：64 / 64 通過，包含既有 Phase 1–4 回歸。
- 新增 26 項伺服器戰鬥測試與 3 項客戶端 abort／failure 清理測試。
- node --check app.js／combat-expansion.js／victory.js 與 git diff --check 通過。
- tests/generate-combat-lab.js 可重新產生 42 個 wire fixtures。
- tests/phase6-preview.js 是獨立 localhost QA fixture，僅簡化進場與 Boss 初始 HP；正式 server.js 無 QA backdoor。
- 多人完整流程使用 localhost:3006；Lab 使用 localhost:3005/presentation-lab.html。
- 390×844 手機檢查 Boss banner 與兩目標卡，viewport 檢查後已還原。
- 截圖：phase6-victory.png、phase6-mobile.png、phase6-multiplayer.png。

未自動進入下一個 Phase。

## Lab 裁切修正（2026-10-05）

- Lab 的 presentation root 改用舞台的 100% 尺寸，戰鬥畫布不再超出預覽區。
- 正式戰鬥 CSS 以 combat 舞台容器單位計算尺寸、位移與響應式斷點；Lab 與遊戲沿用相同演出。
- 固定 Desktop／Laptop／Tablet／Mobile 預覽保持指定 CSS 尺寸，縮放以完整放入可見區域。
- 修正舊 Lab 戰鬥 fixture 的缺失 Boss 圖片路徑。
- 瀏覽器驗證自適應戰士攻擊、Desktop 1440×900 預覽與 Mobile 390×844 Boss AoE；64／64 測試通過。
- 截圖：phase6-lab-fixed.png、phase6-lab-mobile-fixed.png。
