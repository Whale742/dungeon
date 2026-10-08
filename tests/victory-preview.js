import {Room} from '../game/Room.js';
Room.prototype.startAdventure=function(id){
 if(id!==this.leaderId)return {success:false};
 this.floor=1;this.battleRound=1;this.state='IN_BATTLE';
 this.currentMonster={name:'Victory regression',avatar:'/BOSS/Ancient Guardian Golem.webp',hp:0,maxHp:100,attack:5,ultName:'TEST'};
 const random=Math.random;Math.random=()=>.9;
 try{this.handleMonsterVictory();}finally{Math.random=random;}
 return {success:true};
};
process.env.PORT='3019';await import('../server.js');
