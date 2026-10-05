// Deterministic localhost multiplayer fixture. All handlers remain production handlers.
import { Room } from '../game/Room.js';
import { LOOT_TABLE, equipItemToPlayer } from '../game/constants.js';

Room.prototype.startAdventure = function(socketId) {
  if (socketId !== this.leaderId) return { success: false };
  this.state = 'IN_BATTLE'; this.floor = 1; this.battleRound = 1;
  this.currentMonster = { name: '遠古守衛石像', avatar: '/BOSS/Ancient Guardian Golem.webp', hp: 5000, maxHp: 5000, baseHp: 5000, attack: 5, resistance: null, ultName: '巨岩震擊' };
  for (const p of Object.values(this.players)) {
    p.hp = p.maxHp;
    if (p.role === 'druid') p.minions = [1, 2].map(i => ({ id: 'qa-m'+i, ownerId: p.id, type: 'wolf', name: '幼狼'+i, minionIndex: i, hp: 15, maxHp: 15, atk: 10, alive: true }));
    if (p.role === 'archer') equipItemToPlayer(p, structuredClone(LOOT_TABLE.find(e => e.id === 'a_crossbow')));
  }
  this.executeRoundStart(); return { success: true };
};
const resolve = Room.prototype.resolveTurnActions;
Room.prototype.resolveTurnActions = function() {
  const old = Math.random; Math.random = () => .1;
  try { return resolve.call(this); } finally { Math.random = old; }
};
process.env.PORT = '3011';
await import('../server.js');
