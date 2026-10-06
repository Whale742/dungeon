// Deterministic server fixture; production Room lifecycle, damage and queue ACK owners.
import {Room} from '../game/Room.js';
Room.prototype.startAdventure=function(socketId) {
  if(socketId!==this.leaderId)return {success:false};
  this.state='IN_BATTLE';this.floor=1;this.battleRound=1;this.battleCount=1;
  this.currentMonster={name:'遠古守衛石像',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:5000,maxHp:5000,baseHp:5000,attack:5,resistance:null,ultName:'巨岩震擊',poisonTurns:0,poisonDmg:0};
  this.p8ResetBattle();this.executeRoundStart();return {success:true};
};
const resolve=Room.prototype.resolveTurnActions;
Room.prototype.resolveTurnActions=function(){const old=Math.random;Math.random=()=>.1;try{return resolve.call(this);}finally{Math.random=old;}};
process.env.PORT='3013';await import('../server.js');
