# Phase 7.3 Audio Asset Integration 完成報告

日期：2026-10-06。沿用既有 SFXManager／playSound、Presentation Root、Combat Queue 和各演出 AbortController；本輪沒有更改 Gameplay、伺服器状态、傷害、回合數或下一階段內容。音檔只做實體改名，沒有改寫音檔內容，也沒有搜尋或下載新音效。mute.webp／sound.webp 保持 UI icon。

## 1. 原始素材 Audit

`public/sound/` 共 27 個 MP3。用瀏覽器 decodeAudioData 解碼 PCM，逐檔量測 duration、50ms RMS／峰值、主要能量段落；這是波形審核，沒有宣稱人工耳聽。原始資料完整保存於 `artifacts/audio/original-audit.json`。另外審查 presentation-core、combat、combat-expansion、chest、app、presentation-config 及 battle-phase。

兩組相似檔名不是同一內容長度：magician_attack 8.040s／magician-attack 1.280s；druid_small_wolf 3.600s／druid-small-wolf 0.560s。保留所有素材，短版獨立正規化，沒有覆寫或刪除。

## 2. 實際 Rename Table

| 原名 | 實際新名 |
| --- | --- |
| sword-slash0.mp3 | sword-slash-light.mp3 |
| sword-slash.mp3 | sword-slash-heavy.mp3 |
| magician_attack.mp3 | mage-basic.mp3 |
| magician-attack.mp3 | mage-basic-short.mp3 |
| magician-skill1.mp3 | mage-skill-1.mp3 |
| magician_skill2.mp3 | mage-skill-2.mp3 |
| druid_trans_wolf.mp3 | druid-transform-wolf.mp3 |
| druid_tree_attack.mp3 | druid-transform-treant.mp3 |
| druid_tree_attack2.mp3 | druid-treant-action.mp3 |
| druid_small_wolf.mp3 | druid-wolf-action.mp3 |
| druid-small-wolf.mp3 | druid-wolf-action-short.mp3 |
| chest-revel.mp3 | chest-reveal.mp3 |

其餘原本符合命名的檔案保留。沒有建立 alchemy_skill1 alias 檔。

## 3. 實際 MP3 Duration

下表 duration 為解碼後完整長度。主要段落是 50ms RMS 超過各檔峰值 10% 的粗略範圍，並非每檔都完整播放至该時間；幼狼會選用單次叫聲段落，其他技能依能量與尾音調整 identity hold。

| 正規化檔名 | 完整長度（秒） | 主要段落（秒） |
| --- | ---: | --- |
| alchemy-skill1.mp3 | 3.630 | 0.05–2.00 |
| archer-skill2.mp3 | 2.350 | 0.00–2.30 |
| assassin-pursuit.mp3 | 1.959 | 0.05–0.25 |
| bard-attack.mp3 | 5.094 | 0.00–1.50 |
| bard-skill1.mp3 | 5.130 | 0.15–4.45 |
| bard-skill2.mp3 | 2.710 | 0.15–2.70 |
| boss.mp3 | 8.620 | 0.65–4.15 |
| chest-reveal.mp3 | 3.161 | 0.30–2.10 |
| druid-wolf-action-short.mp3 | 0.560 | 0.00–0.15 |
| druid-wolf-action.mp3 | 3.600 | 0.05–3.20 |
| druid-transform-wolf.mp3 | 4.704 | 0.10–2.90 |
| druid-transform-treant.mp3 | 0.912 | 0.00–0.30 |
| druid-treant-action.mp3 | 0.720 | 0.00–0.30 |
| fight.mp3 | 1.776 | 0.35–0.95 |
| glass.mp3 | 0.528 | 0.00–0.15 |
| healing.mp3 | 2.534 | 0.35–1.50 |
| logo-intro.mp3 | 10.008 | 0.05–5.70 |
| mage-basic-short.mp3 | 1.280 | 0.35–0.90 |
| mage-skill-1.mp3 | 6.452 | 0.40–2.45 |
| mage-basic.mp3 | 8.040 | 0.35–0.90 |
| mage-skill-2.mp3 | 8.098 | 0.35–1.90 |
| parry.mp3 | 1.724 | 0.00–1.00 |
| swoosh.mp3 | 1.056 | 0.10–0.20 |
| sword-slash-heavy.mp3 | 1.584 | 0.10–0.65 |
| sword-slash-light.mp3 | 4.608 | 0.60–0.80 |
| victory.mp3 | 5.016 | 0.10–3.75 |
| warning.mp3 | 5.616 | 2.95–4.55 |

parry.mp3 保留且未映射。archer-skill2.mp3、mage-basic-short.mp3、druid-wolf-action-short.mp3 保留未使用。

## 4. Final SFX Asset Registry

`public/sfx-assets.js` 集中管理 25 個 logical keys、23 個獨立 src、fallback、volume、offset、identityBeatMs 和 maxDuration。舊 logical keys 以 SFX_ALIASES 導向同一 registry；沒有第二套播放器或散落的 new Audio。

| Key | MP3 | Gain | 起點 offset（秒） | Identity hold（ms） |
| --- | --- | ---: | ---: | ---: |
| fight | fight.mp3 | 0.45 | 0.3 | 850 |
| warrior_basic | sword-slash-light.mp3 | 0.65 | 0.55 | 450 |
| warrior_skill1 | sword-slash-heavy.mp3 | 0.5 | 0.05 | 750 |
| mage_basic | mage-basic.mp3 | 0.5 | 0.3 | 850 |
| mage_skill1 | mage-skill-1.mp3 | 0.4 | 0.35 | 1450 |
| mage_skill2 | mage-skill-2.mp3 | 0.5 | 0.3 | 1350 |
| arrow_release | swoosh.mp3 | 0.6 | 0.05 | 300 |
| assassin_pursuit | assassin-pursuit.mp3 | 0.55 | 0 | 350 |
| bard_basic | bard-attack.mp3 | 0.4 | 0 | 1600 |
| bard_skill1 | bard-skill1.mp3 | 0.35 | 0.1 | 4400 |
| bard_skill2 | bard-skill2.mp3 | 0.45 | 0.1 | 2600 |
| bottle_throw | swoosh.mp3 | 0.5 | 0.05 | 300 |
| bottle_impact | glass.mp3 | 0.6 | 0 | 300 |
| alchemy_skill1 | alchemy-skill1.mp3 | 0.4 | 0 | 1600 |
| healing_result | healing.mp3 | 0.55 | 0.3 | 1400 |
| warrior_defense | healing.mp3 | 0.45 | 0.3 | 1400 |
| transform_wolf | druid-transform-wolf.mp3 | 0.4 | 0.05 | 2900 |
| transform_treant | druid-transform-treant.mp3 | 0.7 | 0 | 450 |
| treant_action | druid-treant-action.mp3 | 0.7 | 0 | 400 |
| wolf_action | druid-wolf-action.mp3 | 0.5 | 0.05 | 800 |
| logo_intro | logo-intro.mp3 | 0.4 | 0 | 5800 |
| chest_reveal | chest-reveal.mp3 | 0.65 | 0.25 | 1900 |
| boss_warning | warning.mp3 | 0.55 | 0 | 4700 |
| boss_entrance | boss.mp3 | 0.38 | 0.65 | 3500 |
| victory | victory.mp3 | 0.45 | 0 | 3900 |

## 5. Preload

核心腳本啟動時預抓取並解碼素材；SFXManager 以 src 快取 promise／AudioBuffer。同一路徑的不同用途只抓一次。Combat／Boss 進場前等待 preload，避免畫面先開始才下載。Fetch／decode 有 5 秒 timeout；失敗同樣快取並使用 fallback。

## 6. Synth Fallback

保留原 Web Audio synth。404、decode fail、timeout 或播放例外僅發受控 warning，回退原聲音，不讓演出 Promise 崩潰。沒有素材的 arrow impact、爪擊、status、UI、reload 等沿用 synth。

## 7. Warrior

普攻 light；w_strike／w_cleave／shield slam heavy。物理 impact 降為 28%，避免與正式斬擊爆音。w_shield 用 healing 素材作為獨立 warrior_defense 輔助 identity，搭配較輕 shield cue；這個技能不會因此顯示回血或修改其結果。

## 8. Mage

basic／m_blast／m_drain 分別使用三個 mage 音檔。Drain 保留 damage → drain stream → 真正 heal result；移除提前播放的 heal_wave。

## 9. Archer

basic／a_shot／a_rain release 使用 swoosh。單體命中保留 arrow_impact；MISS 只有 release 與 air pass。a_reload／a_frenzy_reload 明確排除 swoosh，保留機械裝填聲。

## 10. Assassin

普攻 light；s_stab／s_smoke heavy。s_stab 的 X slash 播兩次 heavy，間隔 90ms，第二次 gain 85%。追擊用 assassin-pursuit 的主要 350ms 段落，維持 compact，不等待 1.959s 全檔。

## 11. Bard

basic 使用 bard-attack；b_heal／b_revive／b_nocturne 使用 skill1；b_buff／b_frenzy 使用 skill2。Healing 在結果呈現時疊加，gain 再乘 70%；同一波全體治療共用一次 healing，避免七人重播／七倍停留。Off-key 保留原提示。

## 12. Alchemist

普攻 throw 使用 swoosh，命中瓶子使用 glass。酸瓶使用 alchemy-skill1，不再疊 glass／主 impact。命運煉成的成功／失敗提示保留。失敗若仍有伺服器提供的 kind=heal 少量治療，只在該結果時播放 healing，不在施法起點播放。

## 13. Druid

人型普攻保留原 synth，明確 bypass transform MP3。Werewolf／Treant transform 對齊肖像真正開始轉換；狼人後續即時攻擊為獨立事件，使用原 claw synth，不重播變身。樹精形態普攻使用 treant-action。

## 14. Minion

召喚／攻擊／攔截受傷依物種映射 wolf-action 或 treant-action。幼狼以 summon .05s、attack .50s、hurt 2.35s 起點選不同叫聲；受傷 gain 55%。連擊第二、三隻乘 90%，每隻有自己的播放 instance，不會被共用 key 節流吃掉。

## 15. Fight Panel

正式 full／compact action entry 使用 fight，一個面板一次。施法、攻擊、Boss attack、minion combo、follow-up 都有 entry cue。Status tick、同面板額外命中、secondary heal 不重播 fight。Lab 新增 a73_warrior_action，直接使用正式 renderer：fight → heavy slash → 輕 physical impact。

## 16. Logo Intro

正式序章 title reveal 播 logo-intro，绑定既有開場 owner／AbortController，isPrologueTyping 和 prologueCompleted 防重播。Title 保留到主要 5800ms，沒有等完整 10.008s。桌面／手機模式各連續重繪 12 次仍只有一個 logo cue。

## 17. Chest Reveal

發現寶箱時不播 opening asset；玩家按開箱、anticipation／shake 完成後，在 lid_open 觸發 chest-reveal。舊 chest_open key 相容導向同素材，實際開蓋只用一個 cue；common reward 必要時補 100ms 主聲段落 hold。修正 Lab 的 event 父層被 reset 隱藏造成按鈕不可見。

## 18. Victory

既有 Victory Title 優先使用 victory.mp3，帶同一 signal；Title 保留 3900ms 主樂句，不等 5.016s 全檔，結果、掉落、繼續按鈕流程沿用原架構。

## 19. Warning 0–5s Timeline

集中於 PRESENTATION_CONFIG.bossEncounter：T0 audio＋darken；0–2000ms 黑幕逐漸至約 58%；2000–3000ms 保持黑幕；3000ms strip 進場，copy 延後 110ms；460ms settle＋750ms hold；360ms 交錯退出；180ms 呼吸後 Boss 約 T4750ms 入場。

## 20. 3s Cue Sync

warning 原檔 5.616s，波形主要能量從 2.95s 開始，峰值約 3.35s。使用原檔 offset=0，WARNING 約 3000ms 切入；真人速度瀏覽器時序測試允許 160ms 排程誤差並通過。不是等待檔案 ended 才出 Boss。

## 21. Warning Pixel Font

WARNING strong 改為 Silkscreen／既有 font-stats／monospace，uppercase、硬陰影；不再使用 Cinzel。Lab 使用同一個專案已有的 Silkscreen 字體宣告，沒有新增字體素材。自動檢查 computed font-family 包含 Silkscreen；實際字體可用性仍沿用專案既有 Google Fonts 載入。

## 22. Boss Entrance Audio

Boss art 加入 is-entering 的同一 frame 播 boss_entrance／boss.mp3。去掉額外 rumble／boom synth 堆疊；runtime offset=.65s 對齊主要攻擊起點。WARNING 尾聲 gain duck 至 40%，Boss 保留到主要声段落完成。

## 23. Long Audio Hold

所有 hold 基於 identityBeatMs／主要聲段落，沒有 await audio.ended。法師／酸瓶用 PCM 累積能量審核去除長混響尾段：mage skill1 約 95% 能量在原檔 1.70s 前、98% 在 2.00s 前；skill2 約 98% 在 1.55s 前；酸瓶約 98% 在 1.60s 前。結果面板共用施法 audio scope，主音效跨 cast／result 持續，結果 hold 完成才退出。Bard skill1 的主要樂句確實到約 4.4s，因此保留較長；Transform／Heal／Boss／Logo／Victory 也有獨立 hold。

## 24. Layering／Volume

一個 entry、一個主要 identity、一個結果 cue；錯開在面板、起手、命中／回血時刻。MP3 gain 範圍 .35–.70，重斬／法師 synth impact 僅 28%；Boss 與 warning 有簡單 duck。長尾以 120ms fade 收尾。

## 25. Mute／Master Volume

MP3 和 synth 都通過同一 masterGain。soundEnabled 和 volume setter 即時更新正在播放的聲音；Lab 滑桿與正式靜音切換都走同一 singleton。瀏覽器驗證 master=.25、mute=0。

## 26. Abort Cleanup

每個 asset source／synth voice 有 signal 與清理。Abort 立即 stop／disconnect，移除 listener／active voice；stopAll 的 generation 同時取消尚未完成載入的播放；另有 wall-clock 到期清理，避免未解鎖的 context 留住過期音效。離房、view 切換、pagehide、Lab reset 都清理；沒有讓 WARNING 留在下一頁。

## 27. Lab Coverage

正式 registry 25 個 key 加入 Audio Test 選單；原有各職業、Druid、Minion、Warning、Boss、Chest、Victory 場景呼叫同一正式 renderer。28 個 Combat 場景檢查角色、MISS、reload、heal、form、minion 及 failed alchemy；另外 full heavy／chest／victory／reset 生命週期檢查。MP3 始終 playbackRate=1，Lab 速度只縮放演出時間，雙斬仍保留 90ms 音效間隔。

## 28. Autoplay Verification

沿用 user gesture unlock，支援 pointerdown／keydown；首個實際互動會 resume AudioContext。正式伺服器兩個客戶端（桌面 Chrome、390px 手機 touch emulation）驗證 Logo 可播、context running、只播一次。這不等於已在實體 iPhone Safari 測試。

## 29. 404／Decode Failures／Cache

全部 23 個正式 src 成功載入／解碼。刻意 404 和無效 MP3 都回退 warrior_xing，無 uncaught Promise，產生兩個受控 SFX warning；Chrome 對刻意 404 另有內建資源錯誤訊息，已單獨記錄 expected404。同一 src 使用快取 AudioBuffer，每次 Slash 不重新 fetch。

## 30. Console／Regression

175 項單元測試全部通過。28 個共用 Combat 音效場景、真實時間 WARNING／Boss、Mute／Volume／Abort／fallback；17 個 Status＋8 個 Phase 場景、5 個中止點、桌面／手機／Reduced Motion；七人三回合正式 Queue／ACK／技能／timer 驗證均通過。正常流程 Console errors=[]，故意失敗情境如上節單独列出。

證據：`artifacts/audio/original-audit.json`、`rename.json`、`registry.json`、`browser-report.json`、`lifecycle-report.json`、`unit-tests.txt`；視覺及多人結果在 `artifacts/phase73/report.json`／`multiplayer.json`。

本輪完成後停止，沒有進入下一階段。
