// Isolated deterministic browser QA server; no changes to production handlers.
import { Room } from '../game/Room.js';
Room.prototype.startAdventure = function(socketId) {
 if(socketId!==this.leaderId)return {success:false};
 this.state='IN_BATTLE';this.floor=1;this.battleRound=1;
 this.currentMonster={name:'遠古守衛石像',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:350,maxHp:350,baseHp:85,attack:8,resistance:null,ultName:'巨岩震擊'};
 for(const p of Object.values(this.players)){p.hp=p.maxHp;if(p.role==='assassin')p.stealthStacks=4;}
 this.executeRoundStart();return {success:true};
};
const resolve=Room.prototype.resolveTurnActions;
Room.prototype.resolveTurnActions=function(){const old=Math.random;Math.random=()=>.1;try{return resolve.call(this);}finally{Math.random=old;}};
process.env.PORT='3006';await import('../server.js');
