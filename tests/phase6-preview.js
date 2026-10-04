// Dedicated localhost QA server. Production server.js remains unmodified.
import { Room } from '../game/Room.js';
Room.prototype.startAdventure = function(socketId) {
  if (socketId !== this.leaderId) return { success: false };
  this.floor = 1; this.state = 'IN_BATTLE'; this.battleRound = 1;
  this.currentMonster = { name: '遠古守衛石像', avatar: '/BOSS/Ancient Guardian Golem.webp', hp: 9, maxHp: 9,
    baseHp: 85, attack: 8, resistance: null, ultName: '巨岩震擊', poisonTurns: 0, poisonDmg: 0 };
  for (const p of Object.values(this.players)) p.hp = Math.max(1, p.maxHp - 30);
  this.executeRoundStart(); return { success: true };
};
process.env.PORT = '3006';
await import('../server.js');
