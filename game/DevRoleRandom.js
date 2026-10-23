import { getPlayerSkills } from './constants.js';
import { skillValue } from './stats.js';
import { sageConfusionChance, sageGrowth } from './phase8.js';

// Deliberately named decision points, never a replacement for Math.random.
// Private, per-Room state cannot enter room:update or player snapshots.
const rooms = new WeakMap();
const has = (p, id) => (p.equips || []).some(e => e.id === id);
const choices = rows => rows.map(([value, label]) => ({ value, label }));
const binary = choices([['success','判定成功'],['failure','判定失敗']]);
const negative = label => choices([['normal','正常'],['negative',label]]);
const entry = (role, key, actionId, label, category, outcomes, extra = {}) => ({ role, key, actionId, label, category, outcomes, ...extra });
const abnormal = (r,p) => Object.values(p.enemyEffects||{}).some(e=>e.until>=r.battleRound) ||
  (r.roundModifiers?.acidFlaskCount||0)>0 || (r.roundModifiers?.equipmentEffectMultiplier??1)<1 ||
  ['alcAcidStack','poisonTurns','burnTurns','fractureTurns','chillTurns','corrosionTurns','bleedTurns','stunnedNextTurn','nextTurnStunFlag','isSurrendered','cannotCrit'].some(k=>p[k]);
const guaranteed = (r,p) => r.battleCount===1 && r.battleRound===1 && !p.hasDealtFirstBattleCrit && !p.cannotCrit;
const catalog = [
  entry('druid','dru_transform','dru_transform','形態轉變','技能', (r,p)=>choices([['werewolf','狼人'],['treant','遠古樹精'],...(has(p,'dru_beast')?[['bear','巨熊']]:[])]),{hint:'巨熊需裝備野獸招喚；仍須正常施放形態轉變。'}),
  entry('warrior','w_strike','w_strike','堅定斬擊','技能',negative('揮砍失衡')),
  entry('warrior','w_shield','w_shield','壁壘守護','技能',negative('護盾龜裂')),
  entry('mage','m_blast','m_blast','奧術爆破','技能',negative('法力走火')),
  entry('mage','m_drain','m_drain','生命汲取擲骰','技能',(r,p)=>Array.from({length:skillValue(p,'m_drain_max',{equipmentMultiplier:r.statMultiplier(p)})},(_,i)=>({value:String(i+1),label:String(i+1)}))),
  entry('bard','b_heal','b_heal','治癒頌歌','技能',negative('走音')),
  entry('bard','b_nocturne','b_nocturne','催眠夜曲','裝備技能',binary,{hint:'僅指定催眠機率判定；仍受敵方免疫與效果抗性限制。'}),
  entry('alchemist','alc_flask','alc_flask','不穩定試劑瓶：種類','技能',choices([['poison','劇毒'],['burn','燃燒'],['fracture','碎裂'],['chill','寒冷']])),
  entry('alchemist','alc_team','alc_flask','不穩定試劑瓶：全隊同染','技能',binary),
  entry('alchemist','alc_fate','alc_fate','命運煉成試劑','技能',binary,{available:abnormal,hint:'僅施術者有正式負面條件時可指定；穩定煉成不消耗預約。'}),
  entry('archer','a_rain','a_rain','封鎖箭雨：各箭判定','技能',(r)=>choices([['hit','各箭命中'],...((r.getLivingEnemies?.()||[]).every(e=>(e.flawMarks||0)<5)?[['miss','各箭未命中／形成陷阱']]:[])]),{hint:'命中率已達 100% 時不可指定未命中；仍只攻擊實際存活敵人。'}),
  ...['a_reload','a_frenzy_reload'].map(id=>entry('archer',id,id,id==='a_reload'?'戰術上膛：首枚弩箭':'極速狂熱裝填：首枚弩箭','裝備技能',choices([['pierce','穿甲'],['elemental','元素'],['burst','爆裂']]))),
  ...['basic','s_stab','follow_up_crit'].map(id=>entry('assassin',id,id==='follow_up_crit'?null:id,id==='basic'?'普攻暴擊':id==='s_stab'?'暗影刺殺暴擊':'追擊暴擊',id==='follow_up_crit'?'被動':'技能',(r,p)=>guaranteed(r,p)?[]:p.cannotCrit?[]:binary,{hint:'正式保證暴擊或禁止暴擊時不可覆蓋。'})),
  entry('assassin','follow_up',null,'匿蹤追擊觸發','被動',binary,{hint:'仍需隱身、隊友行動及未達追擊上限；單人無隊友時等待觸發。'}),
  entry('samurai','sa_cut','sa_cut','拔刀斬：武魂爆發','技能',binary,{available:(r,p)=>(p.soul||0)>0,hint:'需要武魂大於 0。'}),
  entry('samurai','sa_parry',null,'居合架式：狂刀','被動',binary,{hint:'下一次正式敵方直擊檢查；不繞過本回合已判定限制。'}),
  entry('stargazer','sg_observe','sg_observe','天體觀測','技能',(r,p)=>choices([['star','星座'],['planet','星球'],['galaxy','星系'],['blackhole','黑洞'],['boundary','宇宙邊界']].filter(([id])=>id!=='star'||!has(p,'sg_eye')))),
  entry('stargazer','sg_clock','sg_clock','星軌干涉','技能',(r,p)=>choices([['accelerate','軌道微調'],['reset','超新星重啟'],['overload','過載躍遷'],['nothing','星軌虛耗']].filter(([id])=>id!=='nothing'||!has(p,'sg_watch')))),
  entry('dreamweaver','dw_confuse','basic','恍惚編織：混淆判定','技能',binary,{hint:'仍受敵方效果免疫與抗性限制。'}),
  entry('dreamweaver','dw_type','basic','恍惚編織：混淆種類','技能',choices([['mirror','鏡像夢境'],['dissociate','解離痛楚'],['nightmare_weak','萎靡夢魘'],['frenzy_backfire','狂亂夢遊']]),{hint:'只在混淆判定及效果抗性通過後抽取；未通過不消耗。'}),
  entry('dreamweaver','dw_butterfly','dw_butterfly','夢蝶迷思','技能',choices([['dream_heal','美夢化生'],['nightmare','夢魘成真']]),{available:r=>r.getEffectiveLeaderRole()!=='dreamweaver',hint:'織夢術士隊長的夢蝶結果固定，無隨機分支；仍受效果免疫限制。'}),
  entry('dreamweaver','dw_false_dream','dw_false_dream','偽造殘夢','技能',choices([['shallow','淺層清夢'],['deep','深淵墜夢'],['lone','孤影殘夢'],['horde','百鬼夜行']]),{hint:'通過正式效果免疫與抗性檢查後才抽取。'}),
  entry('sage','sage_operand',null,'演算週期：初始運算元','回合開始',choices(Array.from({length:30},(_,i)=>[String(i+1),String(i+1)])),{hint:'只在新週期開始抽取 1–30，不覆寫當前運算元。'}),
  entry('sage','sage_equation',null,'方程結算','回合結算',(r,p)=>{
    const confusion=sageConfusionChance(Math.max(0,p.sageX??30));
    const lens=(p.equips||[]).filter(e=>e.id==='sge_lens').length;
    const success=Math.min((sageGrowth[p.sageLastAction]||sageGrowth.basic).success+(lens ? .10+(lens-1)*.05 : 0)*(r.roundModifiers?.equipmentEffectMultiplier??1),1-confusion);
    return choices([...(confusion>0?[['CONFUSION','思緒紊亂']]:[]),...(success>0?[['SUCCESS','推演成功']]:[]),...(1-confusion-success>1e-9?[['NOTHING','無額外結果']]:[])]);
  },{hint:'依當前 X、上次技能與裝備，僅接受機率大於零的結果。'}),
  entry('onmyoji','onm_talisman','onm_talisman','五鬼攝魂符：種類','技能',choices([['blind','障目符'],['seal','封勁符'],['corrode','蝕體符'],['confuse','惑心符'],['drain','抽髓符']])),
  entry('onmyoji','onm_brush_type','basic','硃砂引靈筆：符咒種類','裝備被動',choices([['blind','障目符'],['seal','封勁符'],['corrode','蝕體符'],['confuse','惑心符'],['drain','抽髓符']]),{available:(r,p)=>has(p,'onm_brush'),hint:'需要硃砂引靈筆；僅在正式附符成功且未達上限時消耗，不覆蓋觸發機率。'}),
  entry('paladin','pal_glory_echo',null,'榮耀迴響：護盾判定','回合開始',negative('護盾減半')),
  entry('paladin','pal_grace_end',null,'恩典結束：護盾判定','回合開始',binary)
];

export function randomRoleOptions(room, player) {
  if (!player) return [];
  const skills=getPlayerSkills(player);
  return catalog.filter(c=>c.role===player.role&&(!c.actionId||skills.some(s=>s.id===c.actionId))).map(c=>({
    key:c.key,label:c.label,category:c.category,hint:c.hint||'下一次真正到達此判定點時使用一次。',
    outcomes:(!c.available||c.available(room,player))?(typeof c.outcomes==='function'?c.outcomes(room,player):c.outcomes):[]
  }));
}
export function registerRoleRandom(room, authorized, onConsume) { rooms.set(room,{authorized,onConsume,pending:{},last:{}}); }
export function clearRoleRandom(room, playerId) {
  const s=rooms.get(room);if(!s)return;
  if(playerId){delete s.pending[playerId];return;}s.pending={};s.last={};
}
export function roleRandomSnapshot(room) { const s=rooms.get(room);return s?structuredClone({pending:s.pending,last:s.last}):null; }
export function restoreRoleRandom(room, snapshot) { const s=rooms.get(room);if(s&&snapshot){s.pending=structuredClone(snapshot.pending);s.last=structuredClone(snapshot.last);} }
export function reserveRoleRandom(room, params) {
  const s=rooms.get(room),p=room.players[params.playerId];
  if(!s||!s.authorized())return {success:false,message:'尚未授權單人 Dev 操作'};
  if(!p||p.hp<=0)return {success:false,message:'請選擇房間內存活的玩家'};
  const option=randomRoleOptions(room,p).find(o=>o.key===params.skill);
  if(!option?.outcomes.some(o=>o.value===params.outcome))return {success:false,message:params.outcome==='bear'?'無法指定巨熊：尚未裝備野獸招喚，或非德魯伊形態轉變':'此職業、技能、裝備或當前條件不允許指定此結果'};
  s.pending[p.id]={role:p.role,skill:option.key,outcome:params.outcome,label:option.label,outcomeLabel:option.outcomes.find(o=>o.value===params.outcome).label};
}
export function resolveRoleRandom(room, player, key, fallback) {
  const s=rooms.get(room);
  if(!s)return fallback();
  if(!s.authorized()||room.state==='LOBBY'){clearRoleRandom(room);return fallback();}
  const pending=s.pending[player.id];
  if(!pending||pending.role!==player.role||pending.skill!==key||player.hp<=0)return fallback();
  const option=randomRoleOptions(room,player).find(o=>o.key===key);
  if(!option?.outcomes.some(o=>o.value===pending.outcome))return fallback();
  delete s.pending[player.id];
  s.last[player.id]={...pending,round:room.battleRound,at:new Date().toISOString()};
  s.onConsume?.(player.id,s.last[player.id]);
  return pending.outcome;
}
