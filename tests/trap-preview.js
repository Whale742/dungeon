// Deterministic browser QA, isolated from the normal server. Run manually with
// node tests/trap-preview.js (localhost:3004). Production never imports this file.
import { Room } from '../game/Room.js';
import { ROUTE_STORIES } from '../game/constants.js';

const start = Room.prototype.startAdventure;
Room.prototype.startAdventure = function (id) {
  if (this.state === 'LOBBY' && !this.players['qa-mage']) {
    for (const role of ['mage', 'archer', 'bard']) {
      const botId = 'qa-' + role;
      this.addPlayer({ id: botId, join() {} }, role);
      this.selectRole(botId, role);
      this.players[botId].connected = false;
    }
  }
  return start.call(this, id);
};
const resolve = Room.prototype.resolveRouteChoice;
Room.prototype.resolveRouteChoice = function (route) {
  if (this.floor !== 1) return resolve.call(this, route);
  this.players['qa-mage'].hp = 5;
  const random = Math.random;
  try {
    Math.random = () => 0; // guarantees the archer dodge in this QA fixture
    this.handleTrapEvent(ROUTE_STORIES.route_trail.trap);
  } finally { Math.random = random; }
};
process.env.PORT = '3004';
await import('../server.js');
