// Enemy events use only official battlefield nodes. The fixed overlay contains
// painted choreography, captions and numbers, never a second health model.
function animatePartyPortraitHit(target,animations,speed) {
  const portrait=target?.querySelector('.teammate-avatar-wrap');
  if(!portrait?.animate)return false;
  animations.push(portrait.animate([{transform:'none'},{transform:'translateY(-8px) scale(1.08)',offset:.3},{transform:'none'}],{duration:360/speed}));
  const hp=target.querySelector('.teammate-hp-bg');
  if(hp?.animate)animations.push(hp.animate([{filter:'brightness(1)'},{filter:'brightness(2)',boxShadow:'0 0 10px #dccb91',offset:.3},{filter:'brightness(1)',boxShadow:'none'}],{duration:360/speed}));
  return true;
}
const ENEMY_FX_PROFILES = Object.freeze({
  lava:['#fb923c','heavy','physical_hit',760], shadow:['#a78bfa','claw','claw_slash',520],
  arc:['#67e8f9','arc','magic_impact',620], blood:['#fb7185','drain','magic_impact',660],
  acid:['#a3e635','drop','alchemy_success',600], frost:['#bae6fd','crystal','magic_impact',600],
  devour:['#d9f99d','drain','shield_break',660], wave:['#c4b5fd','wave','bard_off_key',700],
  crystal:['#e9d5ff','crystal','shield_cast',580], fire:['#fbbf24','drop','magic_impact',600],
  elastic:['#86efac','wave','shield_cast',520], claw:['#fda4af','claw','physical_hit',480],
  arrow:['#fcd34d','arrow','physical_hit',440], void:['#818cf8','wave','magic_impact',650],
  heavy:['#cbd5e1','heavy','physical_hit',700], nature:['#4ade80','wave','transform_treant',720],
  curse:['#e879f9','crystal','magic_impact',640], equation:['#7dd3fc','equation','magic_impact',720]
});
function battleFeedbackEntries(result) {
  const entries=[],add=(text,type)=>entries.push({text,type});
  if(result.actualHpDamage>0)add('-'+result.actualHpDamage,'damage');
  if(result.actualAbsorbed>0)add('🛡 -'+result.actualAbsorbed,'shield');
  // Legacy overheal results include shield gain in actualHeal. Separate that
  // existing contract without inventing another HP or damage event.
  const heal=result.kind==='heal'?Math.max(0,(result.actualHeal||0)-(result.actualShield||0)):result.actualHeal||0;
  if(heal>0)add('+'+heal,'heal');
  if(result.actualShield>0)add('🛡 +'+result.actualShield,'shield');
  const outcome=result.outcome?.type;
  if(['miss','dodge'].includes(outcome))add('MISS','outcome');
  else if(['immune','immunity','resisted'].includes(outcome))add('免疫','outcome');
  else if(result.outcome?.parry||['block','blocked','guard'].includes(outcome))add('格擋','outcome');
  if(result.isCrit||result.outcome?.critical||['crit','critical'].includes(outcome))add('暴擊','outcome');
  return entries;
}
function enemyEventFeedback(result) {return battleFeedbackEntries(result).map(e=>e.text).join(' ');}
function getBattleEffectAnchor(id) {
  const anchor=getVisualAnchor(id);if(!anchor)return null;
  const visual=anchor.element.querySelector('.enemy-sprite-wrap,.teammate-avatar-wrap,.companion-portrait')||anchor.element;
  const rect=visual.getBoundingClientRect();return {...anchor,rect,x:rect.left+rect.width/2,y:rect.top+rect.height/2};
}
function positionBattleFeedback(node,id,lane=0,occupied=[]) {
  const anchor=getVisualAnchor(id);if(!anchor){node.hidden=true;return;}
  const r=anchor.element.getBoundingClientRect(),w=Math.max(34,node.offsetWidth||48),h=22;
  const obstacles=[...document.querySelectorAll('.battle-enemy-slot,.teammate-card,.enemy-cd-badge,.enemy-danger-marker,.enemy-threat-marker,.app-header')].map(n=>n.getBoundingClientRect());
  const candidates=[];
  for(let row=0;row<8;row++){
    candidates.push([r.left+r.width/2,r.top-18-(row+lane)*24]);
    candidates.push([r.right+w/2+8,r.top+18+row*24],[r.left-w/2-8,r.top+18+row*24]);
    candidates.push([r.left+r.width/2,r.bottom+18+(row+lane)*24]);
  }
  const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  let best,score=Infinity;
  for(const [x,y] of candidates){
    if(x-w/2<4||x+w/2>innerWidth-4||y-h/2<4||y+h/2>innerHeight-4)continue;
    const box={left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2};
    const cost=[...obstacles,...occupied].reduce((sum,b)=>sum+overlap(box,b),0);
    if(cost<score){best={x,y,box};score=cost;}if(cost===0)break;
  }
  if(!best){const x=Math.min(innerWidth-w/2-4,Math.max(w/2+4,anchor.x)),y=18+lane*24;best={x,y,box:{left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2}};}
  node.style.left=best.x+'px';node.style.top=best.y+'px';node.hidden=false;occupied.push(best.box);
}
const enemyCueQueues=new WeakMap();
function firstEnemyCastCue(step,context) {
  const signal=context.signal||context.controller?.signal;
  if(!signal)return !(step.presentation?.hitIndex>1);
  let cues=enemyCueQueues.get(signal);if(!cues){cues=new Set();enemyCueQueues.set(signal,cues);}
  const key=step.sourceId+':'+step.actionId;if(cues.has(key))return false;cues.add(key);return true;
}
function announceBattleFeedback(text) {
  let live=document.getElementById('battleFeedbackLive');
  if(!live){live=document.createElement('div');live.id='battleFeedbackLive';live.className='battle-feedback-sr';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.appendChild(live);}
  if(live.textContent!==text)live.textContent=text;
}
const ENEMY_STATUS_ICON_MAP = Object.freeze({
  poison:'/assets/icons/status/中毒.webp', alc_poison:'/assets/icons/status/中毒.webp', flask_poison:'/assets/icons/status/中毒.webp',
  burn:'/assets/icons/status/燃燒.webp', fire:'/assets/icons/status/燃燒.webp', ember:'/assets/icons/status/燃燒.webp', flask_burn:'/assets/icons/status/燃燒.webp',
  bleed:'/assets/icons/status/流血.webp', blood_stacks:'/assets/icons/status/流血.webp', blood_stack:'/assets/icons/status/流血.webp',
  fracture:'/assets/icons/status/骨折.webp', flask_fracture:'/assets/icons/status/骨折.webp',
  chill:'/assets/icons/status/寒冷.webp', freeze:'/assets/icons/status/寒冷.webp', frost:'/assets/icons/status/寒冷.webp', flask_chill:'/assets/icons/status/寒冷.webp',
  corrosion:'/assets/icons/status/腐蝕.webp', alc_acid:'/assets/icons/status/腐蝕.webp', alchemy_corrosion:'/assets/icons/status/腐蝕.webp', shield_decay:'/assets/icons/status/腐蝕.webp', acid_defense:'/assets/icons/status/腐蝕.webp',
  corruption:'/assets/icons/status/深淵腐化.png', abyss_corruption:'/assets/icons/status/深淵腐化.png',
  shield:'/assets/icons/status/護盾.webp', temp_hp:'/assets/icons/status/護盾.webp', sage_shield:'/assets/icons/status/護盾.webp', barrier:'/assets/icons/status/護盾.webp',
  guard:'/assets/icons/status/減傷.webp', treant_guard:'/assets/icons/status/減傷.webp', crouch:'/assets/icons/status/減傷.webp', warrior_resolve:'/assets/icons/status/減傷.webp', paladin_grace_target:'/assets/icons/status/減傷.webp', paladin_grace_source:'/assets/icons/status/減傷.webp', kyoutou:'/assets/icons/status/減傷.webp',
  vulnerable:'/assets/icons/status/易傷.webp', alchemy_vulnerable:'/assets/icons/status/易傷.webp', sage_exposed:'/assets/icons/status/易傷.webp', next_vulnerable:'/assets/icons/status/易傷.webp', weakened:'/assets/icons/status/易傷.webp',
  dodge:'/assets/icons/status/閃避加成.webp', dodge_bonus:'/assets/icons/status/閃避加成.webp',
  stealth:'/assets/icons/status/隱身.webp', stealth_stack:'/assets/icons/status/隱身.webp', hidden:'/assets/icons/status/隱身.webp', follow_up:'/assets/icons/status/隱身.webp', void_step:'/assets/icons/status/隱身.webp',
  sleep:'/assets/icons/status/休眠.webp', exhausted:'/assets/icons/status/休眠.webp', downed:'/assets/icons/status/休眠.webp',
  frenzy:'/assets/icons/status/狂熱.webp', frenzy_buff:'/assets/icons/status/狂熱.webp', b_frenzy:'/assets/icons/status/狂熱.webp', triumph:'/assets/icons/status/狂熱.webp', overload:'/assets/icons/status/狂熱.webp', blood_heal:'/assets/icons/status/狂熱.webp', rage:'/assets/icons/status/狂熱.webp', soul:'/assets/icons/status/狂熱.webp',
  galaxy:'/assets/icons/status/星系追擊.webp', astronomy:'/assets/icons/status/星系追擊.webp',
  boundary:'/assets/icons/status/邊界鎖血.webp', crit_lock:'/assets/icons/status/邊界鎖血.webp', surrender:'/assets/icons/status/邊界鎖血.webp', lock:'/assets/icons/status/邊界鎖血.webp',
  fate_blessing:'/assets/icons/status/命運加護.webp', fate_binding:'/assets/icons/status/命運加護.webp', blessing:'/assets/icons/status/命運加護.webp', augur_card:'/assets/icons/status/命運加護.webp',
  fate_debt:'/assets/icons/status/命債.webp', sage_debt:'/assets/icons/status/命債.webp',
  talisman:'/assets/icons/status/符咒.webp', talismans:'/assets/icons/status/符咒.webp', talisman_blind:'/assets/icons/status/符咒.webp', talisman_seal:'/assets/icons/status/符咒.webp', talisman_corrode:'/assets/icons/status/符咒.webp', talisman_confuse:'/assets/icons/status/符咒.webp', talisman_drain:'/assets/icons/status/符咒.webp',
  equation:'/assets/icons/status/方程特性.webp', sage_equation:'/assets/icons/status/方程特性.webp', sage_confusion:'/assets/icons/status/方程特性.webp', abyss_sage:'/assets/icons/status/方程特性.webp',
  flaw_mark:'/assets/icons/status/破綻印記.webp', flaw:'/assets/icons/status/破綻印記.webp',
  bear:'/assets/icons/status/巨熊型態.png', druid_bear:'/assets/icons/status/巨熊型態.png',
  wolf:'/assets/icons/status/狼人型態.png', werewolf:'/assets/icons/status/狼人型態.png', druid_wolf:'/assets/icons/status/狼人型態.png',
  paladin_target_weight:'/assets/icons/status/神聖嘲諷.png', taunt:'/assets/icons/status/神聖嘲諷.png',
  augur_resistance_break:'/assets/icons/status/星芒破障.png', star_break:'/assets/icons/status/星芒破障.png',
  reversed_omen:'/assets/icons/status/凶兆逆位.png', aug_reckon:'/assets/icons/status/凶兆逆位.png',
  paladin_glory_active:'/assets/icons/status/榮耀戰歌-蓄力中.png', pal_glory:'/assets/icons/status/榮耀戰歌-蓄力中.png',
  arena_challenge:'/assets/icons/status/死鬥宣告.png', g_arena:'/assets/icons/status/死鬥宣告.png', duel_arena:'/assets/icons/status/死鬥宣告.png',
  attack_down:'/assets/icons/status/攻擊降低.png', atk_down:'/assets/icons/status/攻擊降低.png', weaken_atk:'/assets/icons/status/攻擊降低.png', sage_square:'/assets/icons/status/攻擊降低.png',
  void_cover:'/assets/icons/status/虛空掩護.png', abyss_watcher:'/assets/icons/status/虛空掩護.png',
  crystal_support:'/assets/icons/status/晶甲共鳴.png', crystal_beetle:'/assets/icons/status/晶甲共鳴.png',
  stun:'/assets/icons/status/暈眩.png', stunned:'/assets/icons/status/暈眩.png', daze:'/assets/icons/status/暈眩.png', seal_zero:'/assets/icons/status/暈眩.png', confuse:'/assets/icons/status/暈眩.png'
});
function resolveStatusIconUrl(status) {
  if (typeof getBuffIconUrl === 'function') return getBuffIconUrl(status);
  if (!status) return null;
  const id = String(status.id || '').toLowerCase(), icon = String(status.icon || '').toLowerCase(), label = String(status.label || ''), val = String(status.value || '');
  if (status.isLeaderPassive || status.isLeaderSkill || id.startsWith('leader_')) return null;
  const toCloud = p => (typeof window !== 'undefined' && window.assetRegistry && typeof window.assetRegistry.resolvePath === 'function') ? window.assetRegistry.resolvePath(p) : p;
  if (ENEMY_STATUS_ICON_MAP[id]) return toCloud(ENEMY_STATUS_ICON_MAP[id]);
  if (id.startsWith('mark_')) return toCloud('/assets/icons/status/破綻印記.webp');
  if (label.includes('巨熊') || val.includes('巨熊')) return toCloud('/assets/icons/status/巨熊型態.png');
  if (label.includes('狼人') || val.includes('狼人')) return toCloud('/assets/icons/status/狼人型態.png');
  if (label.includes('神聖嘲諷') || label.includes('嘲諷')) return toCloud('/assets/icons/status/神聖嘲諷.png');
  if (label.includes('星芒破障') || label.includes('星芒破陣')) return toCloud('/assets/icons/status/星芒破障.png');
  if (label.includes('凶兆逆位')) return toCloud('/assets/icons/status/凶兆逆位.png');
  if (label.includes('榮耀讚歌') || label.includes('榮耀戰歌') || label.includes('蓄力中')) return toCloud('/assets/icons/status/榮耀戰歌-蓄力中.png');
  if (label.includes('死鬥宣告') || label.includes('死鬥') || label.includes('角鬥場')) return toCloud('/assets/icons/status/死鬥宣告.png');
  if (label.includes('攻擊降低') || label.includes('ATK DOWN') || label.includes('攻擊壓制') || label.includes('直接傷害 -25%')) return toCloud('/assets/icons/status/攻擊降低.png');
  if (label.includes('虛空掩護')) return toCloud('/assets/icons/status/虛空掩護.png');
  if (label.includes('晶甲共鳴') || label.includes('晶甲反射')) return toCloud('/assets/icons/status/晶甲共鳴.png');
  if (label.includes('深淵腐化') || label.includes('腐化')) return toCloud('/assets/icons/status/深淵腐化.png');
  if (label.includes('暈眩') || label.includes('眩暈') || label.includes('STUN') || label.includes('行動受阻') || label.includes('惑亂')) return toCloud('/assets/icons/status/暈眩.png');
  if (label.includes('中毒')) return toCloud('/assets/icons/status/中毒.webp');
  if (label.includes('燃燒') || label.includes('灼燒') || label.includes('熱度')) return toCloud('/assets/icons/status/燃燒.webp');
  if (label.includes('流血') || label.includes('血祭')) return toCloud('/assets/icons/status/流血.webp');
  if (label.includes('骨折')) return toCloud('/assets/icons/status/骨折.webp');
  if (label.includes('寒冷') || label.includes('寒霜') || label.includes('冰')) return toCloud('/assets/icons/status/寒冷.webp');
  if (label.includes('腐蝕') || label.includes('強酸') || label.includes('酸液')) return toCloud('/assets/icons/status/腐蝕.webp');
  if (label.includes('護盾') || label.includes('TEMP HP') || label.includes('壁壘')) return toCloud('/assets/icons/status/護盾.webp');
  if (label.includes('減傷') || label.includes('堅守') || label.includes('堅定') || label.includes('恩典') || label.includes('GUARD') || label.includes('DR ') || label.includes('狂刀')) return toCloud('/assets/icons/status/減傷.webp');
  if (label.includes('易傷') || label.includes('VULNERABLE') || label.includes('承傷 +') || label.includes('受傷增加') || label.includes('負傷')) return toCloud('/assets/icons/status/易傷.webp');
  if (label.includes('閃避') || label.includes('DODGE')) return toCloud('/assets/icons/status/閃避加成.webp');
  if (label.includes('隱身') || label.includes('匿蹤') || label.includes('追擊') || label.includes('暗影步')) return toCloud('/assets/icons/status/隱身.webp');
  if (label.includes('休眠') || label.includes('沉睡') || label.includes('虛弱') || label.includes('倒下') || label.includes('EXHAUSTED')) return toCloud('/assets/icons/status/休眠.webp');
  if (label.includes('狂熱') || label.includes('DMG +') || label.includes('凱旋') || label.includes('過載') || label.includes('充能') || label.includes('怒氣') || label.includes('武魂')) return toCloud('/assets/icons/status/狂熱.webp');
  if (label.includes('星系')) return toCloud('/assets/icons/status/星系追擊.webp');
  if (label.includes('鎖血') || label.includes('邊界') || label.includes('臣服') || label.includes('LOCK')) return toCloud('/assets/icons/status/邊界鎖血.webp');
  if (label.includes('命運加護') || label.includes('命運繫結') || label.includes('諭示牌')) return toCloud('/assets/icons/status/命運加護.webp');
  if (label.includes('命債') || label.includes('透支')) return toCloud('/assets/icons/status/命債.webp');
  if (label.includes('符')) return toCloud('/assets/icons/status/符咒.webp');
  if (label.includes('方程') || label.includes('假設') || label.includes('求解') || label.includes('紊亂') || label.includes('演算')) return toCloud('/assets/icons/status/方程特性.webp');
  if (label.includes('破綻') || label.includes('印記') || label.includes('標記') || label.includes('懸賞') || label.includes('瞄準') || label.includes('號令')) return toCloud('/assets/icons/status/破綻印記.webp');
  if (ENEMY_STATUS_ICON_MAP[icon]) return toCloud(ENEMY_STATUS_ICON_MAP[icon]);
  return null;
}
function enemyDisplayStatuses(enemy) {
  const statuses=new Map((enemy.statuses||[]).map(s=>[s.id,{...s}]));
  for(const [id,label,icon] of [['bleed','流血','bleed'],['poison','中毒','poison'],['burn','燃燒','fire'],['fracture','骨折','bone'],['chill','寒冷','snowflake'],['corrosion','腐蝕','flask']]){
    const isDot=id!=='corrosion',dmg=enemy[id+'Dmg'];
    if(enemy[id+'Turns']>0&&!statuses.has(id)){
      statuses.set(id,{id,label,icon,turns:enemy[id+'Turns'],...(isDot?{isDot:true}:{}),...(typeof dmg==='number'&&dmg>0?(isDot?{damage:dmg}:{value:dmg}):{})});
    }else if(statuses.has(id)&&isDot){
      const cur=statuses.get(id);cur.isDot=true;
      if(cur.damage===undefined&&typeof dmg==='number'&&dmg>0)cur.damage=dmg;
    }
  }
  if((enemy.stunnedThisRound||enemy.stunnedNextTurn)&&!statuses.has('stun'))statuses.set('stun',{id:'stun',label:'暈眩',icon:'stun',turns:1});
  if(enemy.augurResistanceBreak>0&&!statuses.has('augur_resistance_break'))statuses.set('augur_resistance_break',{id:'augur_resistance_break',label:'星芒破障',icon:'debuff',turns:enemy.augurResistanceBreak,value:'效果抗性 −15pp'});
  if(enemy.reversedOmenRemaining>0&&!statuses.has('reversed_omen'))statuses.set('reversed_omen',{id:'reversed_omen',label:'凶兆逆位',icon:'debuff',turns:enemy.reversedOmenRemaining,value:'受傷 +'+(enemy.reversedOmenBonus||10)+'%'});
  if(enemy.flawMarks>0&&!statuses.has('flaw_mark'))statuses.set('flaw_mark',{id:'flaw_mark',label:`破綻印記 (${enemy.flawMarks})`,icon:'flaw_mark',stacks:enemy.flawMarks});
  if(enemy.isWeakened&&!statuses.has('weakened'))statuses.set('weakened',{id:'weakened',label:'負傷',icon:'status'});
  if(enemy.talismans?.length&&!statuses.has('talismans')){const names={blind:'障目',seal:'封勁',corrode:'蝕體',confuse:'惑心',drain:'抽髓'};statuses.set('talismans',{id:'talismans',label:'符咒',icon:'status',stacks:enemy.talismans.length,value:enemy.talismans.map(t=>names[t]||t).join('、')});}
  return [...statuses.values()];
}
// Classify actual results, including self costs and form changes, before selecting art.
function enemyEventKind(result,step) {
  if(['miss','dodge','immune','immunity','resisted','blocked'].includes(result.outcome?.type))return 'outcome';
  const before=result.targetBefore||{},after=result.targetAfter||{};
  if(before.mechanics?.form!==after.mechanics?.form&&(before.mechanics?.form||after.mechanics?.form))return 'transform';
  if(['damage','intercept'].includes(result.kind))return result.sourceId&&result.sourceId===result.targetId?'self-cost':'attack';
  if(['heal','shield','cleanse','death'].includes(result.kind))return result.kind;
  if(/標記|瞄準|懸賞/.test(step.actionId))return 'mark';
  if(/充能|熱度|能源/.test(step.actionId))return 'charge';
  return 'status';
}
function enemyStateFeedback(result,step) {
  const kind=enemyEventKind(result,step);
  if(['attack','heal','shield','self-cost','outcome','death'].includes(kind))return [];
  const before=result.targetBefore||{},after=result.targetAfter||{};
  const changed=JSON.stringify(before.statuses||[])!==JSON.stringify(after.statuses||[])||
    JSON.stringify(before.presentation?.resource)!==JSON.stringify(after.presentation?.resource)||kind==='transform';
  return changed?[{text:step.actionId||step.skillName||'狀態更新',type:'status'}]:[];
}
function syncEnemyMechanicVisual(enemy, node) {
  if(!node)return;
  const info=enemy.presentation||{};
  node.dataset.enemyFamily=info.family||'';
  node.dataset.enemyForm=enemy.mechanics?.form||'';
  node.classList.toggle('enemy-mechanic-immune',!!info.immunity && enemy.hp>0);
  node.classList.toggle('enemy-mechanic-open',!!enemy.mechanics?.open && enemy.hp>0);
  node.classList.toggle('enemy-armor-broken',!!enemy.mechanics?.armorBroken && enemy.hp>0);
  node.classList.toggle('enemy-armor-ready',info.mechanicId==='lava_colossus'&&!enemy.mechanics?.armorBroken&&!enemy.mechanics?.firstPhysicalUsed&&enemy.hp>0);
  node.classList.toggle('enemy-crystal-supported',!!enemy.statuses?.some(s=>s.id==='crystal_support')&&enemy.hp>0);
  const resource=info.resource;
  let pips=node.querySelector('.enemy-resource-pips');
  if(resource){
    if(!pips){pips=document.createElement('span');pips.className='enemy-resource-pips';node.querySelector('.enemy-sprite-wrap')?.appendChild(pips);}
    pips.replaceChildren();
    for(let i=0;i<resource.max;i++){
      const pip=document.createElement('i');pip.className=i<resource.value&&enemy.hp>0?'is-lit':'';pips.appendChild(pip);
    }
    pips.setAttribute('aria-label',resource.label+' '+resource.value+'/'+resource.max);
  }else pips?.remove();
  const row=node.querySelector('.enemy-status-row');
  let badge=node.querySelector('.enemy-mechanic-state');
  if(!badge){badge=document.createElement('span');badge.className='enemy-mechanic-state';}
  if(row){row.replaceChildren(badge);}else if(!badge.parentElement)node.appendChild(badge);
  const allStates=enemyDisplayStatuses(enemy).filter(s=>s.id!=='enemy_mechanic'||!resource&&['treasure_mimic','abyss_sage','abyss_druid'].includes(info.mechanicId));
  const hasTalismanSummary=allStates.some(s=>s.id==='talismans');
  const states=hasTalismanSummary?allStates.filter(s=>!String(s.id||'').startsWith('talisman_')):allStates;
  badge.replaceChildren();
  for(const s of enemy.hp>0?states.slice(0,3):[]){
    const icon=document.createElement('span');icon.className='enemy-status-badge teammate-buff-item';icon.setAttribute('aria-hidden','true');
    const dotDmg=typeof s.damage==='number'&&s.damage>0?s.damage:(s.isDot&&typeof s.value==='number'&&s.value>0?s.value:null);
    const nonDotVal=!s.isDot&&s.damage===undefined&&s.value!==undefined&&s.value!==''?String(s.value):'';
    const hasStacks=typeof s.stacks==='number'&&s.stacks>0;
    const titleParts=[
      `${s.label||s.id}${hasStacks?` ×${s.stacks}`:''}`,
      dotDmg!==null?`每回合 ${dotDmg} 傷害`:nonDotVal,
      s.turns>0?`剩餘 ${s.turns} 回合`:''
    ].filter(Boolean);
    if(titleParts.length)icon.title=titleParts.join('｜');
    const count=s.id==='enemy_mechanic'&&typeof s.value==='number'?s.value:(hasStacks?s.stacks:null);
    const isMimicMechanic=s.id==='enemy_mechanic'&&info.mechanicId==='treasure_mimic';
    const isDruidNonFormMechanic=s.id==='enemy_mechanic'&&info.mechanicId==='abyss_druid'&&!['werewolf','bear'].includes(enemy.mechanics?.form);
    if(isMimicMechanic){
      icon.innerHTML=enemy.mechanics?.open?'◇':'▣';
    }else if(isDruidNonFormMechanic){
      icon.innerHTML='↻';
    }else{
      const iconUrl=resolveStatusIconUrl(s);
      icon.innerHTML=iconUrl?`<img src="${iconUrl}" class="teammate-buff-icon enemy-buff-icon" alt="${String(s.label||'status').replace(/"/g,'&quot;')}" loading="lazy">`:(typeof renderStatusIconMarkup==='function'?renderStatusIconMarkup(s,{variant:'enemy'}):getIconSvg(s.icon||'status','ui-icon--sm'));
    }
    if(count!==null){const n=document.createElement('small');n.textContent=String(count);icon.appendChild(n);}badge.appendChild(icon);
  }
  if(enemy.hp>0&&states.length>3){const extra=document.createElement('span');extra.className='enemy-status-badge enemy-status-overflow';extra.textContent='+'+(states.length-3);badge.appendChild(extra);}
  badge.hidden=enemy.hp<=0||!states.length;badge.setAttribute('aria-label',states.length+' 項狀態，開啟敵人資訊查看');
  if((enemy.battleAvatar||enemy.presentation?.mechanicId==='abyss_druid')&&typeof syncBattlePortrait==='function')syncBattlePortrait(node.querySelector('.enemy-sprite-img'),{...enemy,entityType:'monster'});
}
function renderEnemyTelegraphs(enemies) {
  // The authoritative danger/target metadata belongs on existing unit markers.
  // No extra skill-text strip is mounted above the battlefield.
  for(const enemy of enemies||[]){
    const p=enemy.presentation;
    const danger=enemy.hp>0&&p&&(p.ultimateReady||p.targetId||p.immunity||enemy.mechanics?.transformRound);
    const node=getEnemyAnchor(enemy.instanceId)?.element;
    let marker=node?.querySelector('.enemy-danger-marker');
    if(node&&!marker){marker=document.createElement('span');marker.className='enemy-danger-marker';node.appendChild(marker);}
    if(marker){marker.hidden=!danger||!!p?.ultimateReady;marker.textContent=p?.immunity?'◈':enemy.mechanics?.transformRound?'↻':'⌖';marker.setAttribute('aria-label',p?.immunity?'本回合免傷':enemy.mechanics?.transformRound?'下回合變形':'已鎖定目標');}
  }
  for(const card of document.querySelectorAll('.teammate-card[data-player-id]')){
    const marks=(enemies||[]).filter(e=>e.hp>0&&e.presentation?.targetId===card.dataset.playerId);
    let marker=card.querySelector('.enemy-threat-marker');
    if(!marker&&marks.length){marker=document.createElement('span');marker.className='enemy-threat-marker';card.appendChild(marker);}
    if(marker){marker.textContent='⌖'+(marks.length>1?' '+marks.length:'');marker.hidden=!marks.length;marker.setAttribute('aria-label',marks.length+' 名敵人鎖定');marker.title=marks.map(e=>e.name+'：'+e.presentation.targetHint).join('\n');}
  }
}
function syncEnemyArenaVisual(arena) {
  document.getElementById('viewBattle')?.classList.toggle('is-duel-arena',!!arena?.enemyId);
  for(const stage of document.querySelectorAll('.battle-enemies-stage,.lab-battlefield-enemies'))stage.classList.toggle('is-duel-arena',!!arena?.enemyId);
  for(const card of document.querySelectorAll('.teammate-card[data-player-id]'))card.classList.toggle('arena-absent',!!arena&&arena.playerId!==card.dataset.playerId);
  for(const node of document.querySelectorAll('.battle-enemy-slot[data-enemy-id]')){
    const absent=!!arena&&!!arena.enemyId&&arena.enemyId!==node.dataset.enemyId;
    node.classList.toggle('enemy-arena-absent',absent);
    node.setAttribute('aria-disabled',String(absent));
    node.setAttribute('aria-hidden',String(absent));
    node.tabIndex=absent||node.classList.contains('is-dead')?-1:0;
    if(absent&&document.activeElement===node)node.blur();
  }
}
async function playEnemyMechanicPresentation(step, context={}) {
  const signal=context.signal;if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  if(typeof sixEnemyEventMode==='function'&&(step.results||[]).some(r=>sixEnemyEventMode(step,r)))return playSixEnemyCastPresentation(step,context);
  const profile=ENEMY_FX_PROFILES[step.presentation?.family]||ENEMY_FX_PROFILES.heavy,speed=Math.max(.1,context.speed||1);
  const reduced=context.reducedMotion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(typeof enemyPaintedPaths==='function'&&typeof preloadPhase5Art==='function'){
    const paths=[...new Set((step.results||[]).flatMap(r=>enemyPaintedPaths(step,r)||[]))];
    const theftImages=typeof mimicTheftEquipmentUrl==='function'?(step.results||[]).map(r=>mimicTheftEquipmentUrl(r.theft)).filter(Boolean):[];
    await preloadPhase5Art([...paths.map(p=>enemyPaintedAssetUrl(p)),...theftImages,...(typeof phase6IncomingArt==='function'?phase6IncomingArt(step):[])],signal);
  }
  const root=document.createElement('div');root.className='enemy-effect-overlay';root.dataset.action=step.actionId;root.style.setProperty('--enemy-fx-color',profile[0]);root.setAttribute('aria-hidden','true');document.body.appendChild(root);
  const frames=new Set(),animations=[];
  const cleanup=()=>{for(const frame of frames)cancelAnimationFrame(frame);frames.clear();for(const a of animations)a.cancel();root.remove();};
  signal?.addEventListener('abort',cleanup,{once:true});
  const firstCue=firstEnemyCastCue(step,context);
  const sounds=new Set();
  const playCue=(key,options)=>{if(!key||sounds.has(key)||typeof sfxManager==='undefined')return;sounds.add(key);sfxManager.play(key,{signal,...options});};
  if(step.presentation?.isUltimate&&firstCue){const cue=document.createElement('div');cue.className='enemy-effect-caption';cue.textContent=step.skillName||step.actionId;cue.style.animationDuration=900/speed+'ms';root.appendChild(cue);}
  try{
    const presentResult=async result=>{
      let frame=0;
      if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
      if(appliedBattleResults.has(result.resultId||result))return;
      // Establish the actual guard before starting this hit's timeline, so
      // loading / playing its vine never delays the damage past contact.
      if(result.sharedFrom&&typeof playPhase5DruidGuard==='function')await playPhase5DruidGuard(result,context);
      const targetId=resolvePresentationTarget(result,step),owned=document.createElement('div');root.appendChild(owned);
      const custom=(typeof createPhase6Incoming==='function'?createPhase6Incoming(step,result,owned,{reduced,animations,speed}):null)||(typeof createEnemyChoreography==='function'?createEnemyChoreography(step,result,owned,{reduced,animations,speed}):null);
      const duration=custom?.duration||(reduced?400:profile[3]),contact=custom?.contact||.35;
      const numbers=[];let impactTime=Infinity,phase6Reaction=null;
      const start=performance.now();
      const place=()=>{
        custom?.render(Math.min(1,(performance.now()-start)/(duration/speed)));
        phase6Reaction?.render((performance.now()-impactTime)/1000*speed);
        const occupied=[];
        numbers.forEach((n,i)=>{if(performance.now()-impactTime<750/speed)positionBattleFeedback(n,targetId,i,occupied);else n.hidden=true;});
        frames.delete(frame);frame=requestAnimationFrame(place);frames.add(frame);
      };
      place();
      playCue(custom?.windupSfx,{volume:.3});
      await waitForPresentation(duration*contact,signal,speed);
      if(applyAuthoritativeResult(result)){
        if(result.theft&&typeof mimicTheftCaption==='function')announceBattleFeedback(mimicTheftCaption(result.theft));
        impactTime=performance.now();
        if(typeof phase6ResultReaction==='function')phase6Reaction=phase6ResultReaction(result,owned,{reduced,lane:battleFeedbackEntries(result).length,animate:(n,k,ms)=>animations.push(n.animate(k,{duration:ms/speed,fill:'forwards'}))});
        const initialPositions=[];
        for(const entry of [...battleFeedbackEntries(result),...enemyStateFeedback(result,step)]){const n=document.createElement('div');n.className='enemy-effect-value battle-feedback';n.dataset.kind=entry.type;n.textContent=entry.text;n.style.animationDuration=750/speed+'ms';n.hidden=true;owned.appendChild(n);numbers.push(n);positionBattleFeedback(n,targetId,numbers.length-1,initialPositions);}
        const impactSound=custom?.impactSfx||(result.actualHeal>0?'heal':result.actualShield>0?'shield_cast':result.kind==='cleanse'?'cleanse':result.actualDamage>0?profile[2]:null);
        playCue(impactSound,{instance:step.sourceId});
        if(result.outcome?.parry&&result.targetBefore?.role==='samurai'){if(typeof sfxManager!=='undefined')sfxManager.play('samurai_parry',{signal,noHold:true});}
        if(step.presentation&&Object.hasOwn(step.presentation,'arenaAfter'))syncEnemyArenaVisual(step.presentation.arenaAfter);
        const anchor=getEnemyAnchor(targetId);if(anchor)syncEnemyMechanicVisual(result.targetAfter,anchor.element);
        const target=getBattleEffectAnchor(targetId)?.element;
        if(target?.animate&&!reduced&&(result.actualDamage>0||result.kind==='death')&&!(result.kind!=='death'&&animatePartyPortraitHit(target,animations,speed))){
          const image=target.querySelector('.enemy-sprite-img,.teammate-avatar-wrap')||target;
          const keys=result.kind==='death'?[{filter:'brightness(2)',opacity:1},{filter:'grayscale(1)',opacity:.25}]:custom&&step.presentation.mechanicId==='banshee'?[{transform:'translateX(-3px) skewX(2deg)',filter:'saturate(.2)'},{transform:'translateX(3px) skewX(-2deg)',offset:.3},{transform:'none',filter:'none'}]:['claw','shadow'].includes(step.presentation?.family)?[{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'none'}]:[{filter:'brightness(1.5)'},{filter:'brightness(1)'}];
          animations.push(image.animate(keys,{duration:Math.min(480,duration*.5)/speed}));
        }
        if(typeof playPhase5DruidSleep==='function')await playPhase5DruidSleep(result,context);
        if(result.sageMomentumCapture&&target&&typeof playSageMomentumCapture==='function')await playSageMomentumCapture(result,target,context);
      }
      await waitForPresentation(Math.max(duration*(1-contact),numbers.length?750:0),signal,speed);
      cancelAnimationFrame(frame);frames.delete(frame);custom?.remove();owned.remove();
    };
    const results=step.results||[];
    // A single AoE hit has independent targets, never a repeated target/segment.
    const simultaneous=results.length>1&&results.every(r=>r.kind==='damage'&&!r.sharedFrom)&&new Set(results.map(r=>resolvePresentationTarget(r,step))).size===results.length;
    if(simultaneous)await Promise.all(results.map(presentResult));
    else for(const result of results)await presentResult(result);
    if(firstCue){
      const audible=(step.results||[]).filter(r=>battleFeedbackEntries(r).length),targets=new Set(audible.map(r=>resolvePresentationTarget(r,step)));
      if(audible.length)announceBattleFeedback((step.presentation?.isUltimate?step.skillName+' · ':'')+(targets.size>1?targets.size+' 個目標受影響':(audible[0].targetAfter?.name||'目標')+' '+battleFeedbackEntries(audible[0]).slice(0,2).map(e=>e.text).join(' ')));
    }
  }finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}

// One timeline per six-enemy cast, including the original, ordered server
// members. No authority state, RNG, or result ID is synthesized by grouping.
async function playSixEnemyCastPresentation(step,context={}){
  const {signal}=context,speed=Math.max(.1,context.speed||1),reduced=!!(context.reducedMotion||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const members=step.enemyCastMembers||[step],pending=members.flatMap(member=>(member.results||[]).map(result=>({member,result}))).filter(({result:r})=>!appliedBattleResults.has(r.resultId||r));
  if(!pending.length)return;
  const representative=pending.find(({member,result})=>sixEnemyEventMode(member,result)?.mode!=='quiet')||pending[0];
  const recipe=sixEnemyEventMode(representative.member,representative.result);
  let artFailed=false;
  try{if(typeof preloadPhase5Art==='function')await preloadPhase5Art([...new Set(pending.flatMap(({member,result})=>[...(enemyPaintedPaths(member,result)||[]).map(p=>enemyPaintedAssetUrl(p)),...(typeof phase6IncomingArt==='function'?phase6IncomingArt({...member,results:[result]}):[])]))],signal);}
  catch(error){if(error.name==='AbortError'||signal?.aborted)throw error;artFailed=true;console.error('[Enemy official art unavailable]',step.sourceId,error);announceBattleFeedback('敵方正式圖片載入失敗；戰鬥結果仍正常同步');}
  if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
  const root=document.createElement('div');root.className='enemy-effect-overlay';root.dataset.cast=step._sixCastKey||step.sourceId;root.setAttribute('aria-hidden','true');document.body.appendChild(root);
  const animations=[],numbers=[],reactions=[],guards=[];let frame=0,impactTime=Infinity;
  const cleanup=()=>{cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());root.remove();};signal?.addEventListener('abort',cleanup,{once:true});
  try{
    if(artFailed){const cue=document.createElement('div');cue.className='enemy-effect-caption';cue.textContent='正式圖片載入失敗';root.appendChild(cue);}
    else if(recipe.mode==='ultimate'){const cue=document.createElement('div');cue.className='enemy-effect-caption';cue.textContent=step.presentation?.ultimateName||step.skillName||step.actionId;root.appendChild(cue);}
    for(const {result} of pending)if(result.sharedFrom&&typeof playPhase5DruidGuard==='function')await playPhase5DruidGuard(result,context);
    const castStep={...representative.member,enemyCastMembers:members};
    const custom=artFailed?null:createEnemyChoreography(castStep,representative.result,root,{reduced,animations,speed});
    const duration=custom?.duration||300,contact=custom?.contact||.35,start=performance.now();
    if(!artFailed&&typeof createPhase6Incoming==='function')for(const {member,result} of pending){const guard=createPhase6Incoming(member,result,root,{reduced,animations,speed,castOwnsEnemyArt:true});if(guard)guards.push(guard);}
    const place=()=>{const cue=root.querySelector('.enemy-effect-caption'),source=getBattleEffectAnchor(step.sourceId);if(cue&&source){cue.style.left=Math.max(120,Math.min(innerWidth-120,source.x))+'px';cue.style.top=Math.max(90,source.rect.top-45)+'px';}const progress=Math.min(1,(performance.now()-start)*speed/duration);custom?.render(progress);for(const guard of guards)guard.render(progress<contact?progress/contact*guard.contact:guard.contact+(progress-contact)/(1-contact)*(1-guard.contact));const occupied=[];for(const {node,id,lane} of numbers){node.hidden=performance.now()-impactTime>=750/speed;if(!node.hidden)positionBattleFeedback(node,id,lane,occupied);}reactions.forEach(r=>r?.render((performance.now()-impactTime)*speed/1000));frame=requestAnimationFrame(place);};place();
    if(custom?.windupSfx&&typeof sfxManager!=='undefined')sfxManager.play(custom.windupSfx,{signal,volume:.3});
    await waitForPresentation(duration*contact,signal,speed);impactTime=performance.now();
    for(const {member,result} of pending){
      if(signal?.aborted)throw new DOMException('Presentation cancelled','AbortError');
      if(!applyAuthoritativeResult(result))continue;
      const id=resolvePresentationTarget(result,member),entries=battleFeedbackEntries(result),target=getBattleEffectAnchor(id)?.element;
      if(typeof phase6ResultReaction==='function')reactions.push(phase6ResultReaction(result,root,{reduced,lane:entries.length,animate:(n,k,ms)=>animations.push(n.animate(k,{duration:ms/speed,fill:'forwards'}))}));
      entries.forEach((entry,lane)=>{const node=document.createElement('div');node.className='enemy-effect-value battle-feedback';node.dataset.kind=entry.type;node.textContent=entry.text;node.style.animationDuration=750/speed+'ms';root.appendChild(node);numbers.push({node,id,lane});});
      if(member.presentation&&Object.hasOwn(member.presentation,'arenaAfter'))syncEnemyArenaVisual(member.presentation.arenaAfter);
      const enemy=getEnemyAnchor(id);if(enemy)syncEnemyMechanicVisual(result.targetAfter,enemy.element);
      if(target?.animate&&!reduced&&result.actualDamage>0&&!animatePartyPortraitHit(target,animations,speed)){const sprite=target.querySelector('.enemy-sprite-img,.teammate-avatar-wrap')||target;animations.push(sprite.animate([{transform:'translateX(-3px)',filter:'brightness(1.5)'},{transform:'translateX(3px)',offset:.35},{transform:'none',filter:'none'}],{duration:260/speed}));}
      if(result.outcome?.parry&&result.targetBefore?.role==='samurai'&&typeof sfxManager!=='undefined')sfxManager.play('samurai_parry',{signal,noHold:true});
      if(typeof playPhase5DruidSleep==='function')await playPhase5DruidSleep(result,context);
      if(result.sageMomentumCapture&&target&&typeof playSageMomentumCapture==='function')await playSageMomentumCapture(result,target,context);
    }
    if(custom?.impactSfx&&typeof sfxManager!=='undefined')sfxManager.play(custom.impactSfx,{signal,instance:step.sourceId});
    await waitForPresentation(Math.max(duration*(1-contact),numbers.length?750:0),signal,speed);
    announceBattleFeedback((step.skillName||step.actionId)+' · '+new Set(pending.map(({member,result})=>resolvePresentationTarget(result,member))).size+' 個目標同步');
  }finally{signal?.removeEventListener('abort',cleanup);cleanup();}
}
