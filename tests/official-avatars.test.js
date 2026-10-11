import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAvatar } from '../game/avatar.js';
import { Room } from '../game/Room.js';
import { contentCache } from '../studio/content.js';

const base='https://portraits.supabase.co';
const path='images/roles/samurai.webp';
const url=base+'/storage/v1/object/public/game-assets/'+path;
const asset={asset_key:'samurai',is_public:true,source_type:'storage',storage_bucket:'game-assets',storage_path:path,category:'roles'};
test('Official portrait URLs stay intact, including local Paladin and emoji choices',()=>{
  const snapshot={game_assets:[asset]};
  assert.equal(normalizeAvatar(url,snapshot,base),url);
  assert.equal(normalizeAvatar('/photo/Paladin.webp',snapshot,base),'/photo/Paladin.webp');
  assert.equal(normalizeAvatar('⚔️',snapshot,base),'⚔️');
  assert.equal(normalizeAvatar('https://unknown.example/portrait.webp',snapshot,base),null);
  assert.equal(normalizeAvatar(url,{game_assets:[{...asset,is_public:false}]},base),null);
  assert.equal(normalizeAvatar('data:image/webp;base64,'+'a'.repeat(350000)),null);
});
test('Joining and updating a room preserve the full published portrait URL',()=>{
  const previous=contentCache.data,previousUrl=process.env.SUPABASE_URL;
  contentCache.data={game_assets:[asset]};process.env.SUPABASE_URL=base;
  let room;
  try {
    room=new Room('AVATAR',{id:'leader',emit(){},join(){}},'Leader',{to:()=>({emit(){}})},url);
    assert.equal(room.players.leader.customAvatar,url);
    room.addPlayer({id:'member',emit(){},join(){}},'Member',url);
    assert.equal(room.getClientState().players.find(p=>p.id==='member').customAvatar,url);
    room.updateAvatar('member','/photo/Paladin.webp');
    assert.equal(room.updateAvatar('member',url).customAvatar,url);
  }finally{room?.clearTimer();contentCache.data=previous;if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;}
});
