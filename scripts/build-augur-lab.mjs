import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Room} from '../game/Room.js';
import {CLASSES,LOOT_TABLE,equipItemToPlayer} from '../game/constants.js';

export function withAugurRandom(value,run) {
  const previous=Math.random;let index=0;
  Math.random=()=>Array.isArray(value)?value[index++] ?? .9:value;
  try {return run();} finally {Math.random=previous;}
}
export function makeAugurFixture(roles=['augur','warrior']) {
  const messages=[],socket=id=>({id,join(){}});
  const room=new Room('AUGUR-LAB',socket('p0'),'卜者',{to:()=>({emit:(event,data)=>messages.push({event,data})})});
  roles.slice(1).forEach((role,i)=>room.addPlayer(socket(`p${i+1}`),CLASSES[role].name));
  roles.forEach((role,i)=>{room.selectRole(`p${i}`,role);room.players[`p${i}`].action='skip';});
  Object.assign(room,{state:'IN_BATTLE',selectionState:'SELECTING',floor:1,battleRound:1,battleCount:2});
  room.currentMonster={name:'遠古守衛石像',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:500,maxHp:500,baseHp:100,attack:10,atk:10,ultName:'地裂重擊',resistances:{physical:0,magic:0,effect:40}};
  Object.assign(room.players.p0,{observedTargetId:roles.length>1?'p1':'p0',augurFateDebts:[],augurCardState:'empty',augurIntervenedThisRound:false});
  return {room,queue:()=>messages.findLast(m=>m.event==='battle:presentation_queue')?.data.queue || [],
    resolve(random=.9){try {withAugurRandom(random,()=>room.resolveTurnActions());return this.queue();}finally {room.clearTimer();}},
    roundStart(random=.9){try {withAugurRandom(random,()=>room.executeRoundStart());return this.queue();}finally {room.clearTimer();}}};
}
export function seedAugurDebt(room,amount) {
  const debts=[];let createdRound=1;
  while(amount>0) {const part=Math.min(20,amount);debts.push({amount:part,createdRound,dueRound:createdRound+(room.players.p0.equips.some(e=>e.id==='aug_forbidden_tome')?1:2)});amount-=part;createdRound++;}
  room.battleRound=Math.max(1,createdRound-1);room.players.p0.augurFateDebts=debts;
}
export function equipAugurFixture(player,id) {equipItemToPlayer(player,structuredClone(LOOT_TABLE.find(item=>item.id===id)));}

export function buildAugurLabScenes() {
  const scenes={};
  const add=(id,label,expected,fixture,steps)=>{
    scenes[id]={label,role:'augur',expected,steps:structuredClone(steps)};fixture.room.clearTimer();
  };
  const ownAction=(fixture)=>fixture.resolve().filter(step=>step.type==='player_action' && step.sourceId==='p0');
  {
    const f=makeAugurFixture();withAugurRandom(.9,()=>f.room.p8ResetBattle());
    add('augur_observe','開場觀測｜單手揮動、球內映像','敵我頭像保持可見；手指在球上方；球內出現戰士。',f,f.roundStart().filter(s=>s.actionId==='aug_observe'));
  }
  for(const [id,debt,amethyst] of [['augur_basic',20,0],['augur_basic_empty',0,0],['augur_amethyst',20,1],['augur_amethyst_stack',20,2]]) {
    const f=makeAugurFixture();for(let i=0;i<amethyst;i++)equipAugurFixture(f.room.players.p0,'aug_amethyst');
    seedAugurDebt(f.room,debt);f.room.players.p0.action='basic';
    const repaid=Math.min(debt,8+(amethyst?4+(amethyst-1)*2:0));
    add(id,`水晶折光｜命債 ${debt} → ${debt-repaid}${amethyst?`、紫晶球 ×${amethyst}`:''}`,`清償 ${repaid}；${repaid?'帳本與球內封印同步減少':'不顯示假清償數字'}；Boss 出現星芒破障。`,f,ownAction(f));
  }
  {
    const f=makeAugurFixture(['augur','warrior','sage']);
    Object.assign(f.room.players.p0,{action:'aug_bind',targetPlayerId:'p2'});
    add('augur_bind','命運繫結｜戰士 → 智者','手揮動途中，水晶球內改為智者；圖片使用正式中文檔名。',f,ownAction(f));
  }
  {
    const f=makeAugurFixture(['augur']);Object.assign(f.room.players.p0,{action:'aug_bind',targetPlayerId:'p0'});
    add('augur_bind_solo','命運繫結｜獨自存活','無其他存活隊友時，球內觀測自己。',f,ownAction(f));
  }
  {
    const f=makeAugurFixture(['augur','mage','warrior']);f.room.players.p1.hp=0;f.room.battleRound=2;
    add('augur_reobserve','目標陣亡｜下一回合重新觀測','重新觀測存活戰士；不保留已陣亡法師的映像。',f,f.roundStart().filter(s=>s.actionId==='aug_observe'));
  }
  for(const debt of [0,10,20,60]) {
    const f=makeAugurFixture();seedAugurDebt(f.room,debt);
    Object.assign(f.room.players.p0,{action:'aug_reckon',hp:40});f.room.players.p1.hp=50;
    const repaid=Math.min(25,debt);
    add(debt===20?'augur_reckon':`augur_reckon_${debt}`,`命運清算｜命債 ${debt} → ${debt-repaid}`,`單張雙手圖在球下方，由底部升起；球上浮後出現虹彩白光、白屏、Boss 凶兆牌；${repaid>=15?'兩人各回復 10 HP':'清償不足 15，不回血'}。`,f,ownAction(f));
  }
  for(const [id,role,action,random,expected] of [
    ['augur_reverse','warrior','w_strike',.1,'成功攔截 20% 失衡；逆位翻牌，增加 20 命債。'],
    ['augur_negative_remains','mage','m_blast',.01,'仍落在剩餘 5% 走火區間；不翻牌、不產生命債。'],
    ['augur_negative_safe','mage','m_blast',.9,'原本即成功；維持空象，不產生命債。'],
    ['augur_upright','assassin','basic',.6,'暴擊率 50% → 65%，成功；正位翻牌。'],
    ['augur_upright_fail','assassin','basic',.95,'暴擊率 50% → 65%，仍失敗；照樣翻正位並消耗干涉額度。'],
    ['augur_alchemist_reverse','alchemist','basic',.25,'腐蝕普攻先攔截全隊腐蝕；只翻逆位，不再翻正位。'],
    ['augur_alchemist_upright','alchemist','basic',.8,'腐蝕率 70% → 85%；正位成功。'],
    ['augur_dream_upright','dreamweaver','basic',.6,'混淆總機率 50% → 65%；維持內部四種結果分配。']
  ]) {
    const f=makeAugurFixture(['augur',role]);f.room.players.p1.action=action;
    add(id,expected.split('；')[0],expected,f,f.resolve(random).filter(s=>s.sourceId==='p1' && s.type==='player_action'));
  }
  for(const [id,equip] of [['augur_gilded','aug_gilded_box'],['augur_tome_gain','aug_forbidden_tome']]) {
    const f=makeAugurFixture();equipAugurFixture(f.room.players.p0,equip);f.room.players.p1.action='w_strike';
    add(id,equip==='aug_gilded_box'?'鎏金牌盒｜命債只增加 15':'禁忌聖契｜獲得命債轉真傷',equip==='aug_gilded_box'?'逆位增加 15 命債；金框牌；卜者最大 HP 85。':'逆位增加 20 命債，另有獨立 10 真傷；到期改為 R2；最大 HP 60。',f,f.resolve(.1).filter(s=>s.sourceId==='p1' && s.type==='player_action'));
  }
  {
    const f=makeAugurFixture();seedAugurDebt(f.room,55);f.room.players.p1.action='w_strike';
    add('augur_debt_cap','命債上限｜55 → 60','成功攔截 20 個百分點，但命債實際只增加 5；球內封印與帳本不得超過 60。',f,f.resolve(.1).filter(s=>s.sourceId==='p1' && s.type==='player_action'));
  }
  {
    const f=makeAugurFixture();equipAugurFixture(f.room.players.p0,'aug_forbidden_tome');seedAugurDebt(f.room,25);Object.assign(f.room.players.p0,{hp:30,action:'aug_reckon'});f.room.players.p1.hp=50;
    add('augur_tome_repay','禁忌聖契｜清償、真傷與 18% 凶兆','15 魔傷、清償 25、兩人回血；聖契真傷獨立顯示；Boss 凶兆受傷 +18%。',f,ownAction(f));
  }
  {
    const f=makeAugurFixture(['augur','bard']);seedAugurDebt(f.room,35);f.room.players.p0.hp=30;Object.assign(f.room.players.p1,{action:'b_heal',targetPlayerId:'p0'});
    add('augur_debt_heal','接受治療｜先還命債、剩餘回血','命債 35 全清後才回復本體生命；治療抵債不觸發聖契。',f,f.resolve().filter(s=>s.sourceId==='p1' && s.type==='player_action'));
  }
  for(const lethal of [false,true]) {
    const f=makeAugurFixture();seedAugurDebt(f.room,20);Object.assign(f.room.players.p0,{hp:lethal?10:70,tempHp:50});f.room.battleRound=3;
    const queue=[];f.room.p8EndRound(queue,[],n=>({dmg:n}));
    add(lethal?'augur_expiry_lethal':'augur_expiry',lethal?'命債到期｜穿透護盾致死':'命債到期｜護盾保持 50',lethal?'HP 10 → 0，護盾仍為 50；頭像顯示陣亡。':'HP 70 → 50，護盾仍為 50；帳本清空。',f,queue);
  }
  return scenes;
}

export function augurLabSource() {
  const scenes=buildAugurLabScenes(),counts=new Map(),references=new Map(),definitions=[];
  // Reuse repeated snapshots instead of downloading the same party/HP data
  // hundreds of times. Playback still structured-clones the complete real steps.
  const count=value=>{if(!value || typeof value!=='object')return;const key=JSON.stringify(value);counts.set(key,(counts.get(key)||0)+1);Object.values(value).forEach(count);};
  count(scenes);
  const encode=value=>{
    if(!value || typeof value!=='object')return JSON.stringify(value) ?? 'null';
    const key=JSON.stringify(value),reuse=key.length>=120 && counts.get(key)>1;
    if(reuse && references.has(key))return `s[${references.get(key)}]`;
    const body=Array.isArray(value)?'['+value.map(encode).join(',')+']':'{'+Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>JSON.stringify(k)+':'+encode(v)).join(',')+'}';
    if(!reuse)return body;
    const index=definitions.length;definitions.push(body);references.set(key,index);return `s[${index}]`;
  };
  const body=encode(scenes);
  return '// Generated from real Room settlements. Regenerate: npm run build:augur-lab\nconst AUGUR_LAB_SCENES = (()=>{const s=[];\n'+definitions.map((value,i)=>`s[${i}]=${value};`).join('\n')+'\nreturn Object.freeze('+body+');})();\nif(typeof window!=="undefined")window.AUGUR_LAB_SCENES=AUGUR_LAB_SCENES;\n';
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  fs.writeFileSync(new URL('../public/augur-lab-scenes.js',import.meta.url),augurLabSource());
  console.log('Augur lab scenes generated from Room settlements.');
}
