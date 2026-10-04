// Deterministic browser QA for Phase 4 Chest Presentation.
import { Room } from '../game/Room.js';
import { ROUTE_STORIES } from '../game/constants.js';

const resolve = Room.prototype.resolveRouteChoice;
Room.prototype.resolveRouteChoice = function (route) {
  if (this.floor !== 1) return resolve.call(this, route);
  const random = Math.random;
  try {
    Math.random = () => 0.5;
    this.handleTreasureEvent(ROUTE_STORIES.route_trail.treasure);
  } finally {
    Math.random = random;
  }
};
process.env.PORT = '3005';
await import('../server.js');
