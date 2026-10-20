import { Room } from '../game/Room.js';

// Use real server constructors and generated states; never change the running server.
export function createUiFixtures() {
  const room = new Room('UIQA', { id: 'qa', join() {} }, '蒼藍守望', { to: () => ({ emit() {} }) });
  room.addPlayer({ id: 'qa2', join() {} }, '風暴使者');
  room.selectRole('qa', 'warrior');
  room.selectRole('qa2', 'mage');
  const lobby = structuredClone(room.getClientState());
  room.floor = 1;
  room.gold = 9999;
  room.startRouteSelection();
  const route = structuredClone(room.getClientState());
  room.handleShopEvent({ col: 1 });
  room.squadInventory = room.currentEvent.items.slice(0, 4).map(item => ({ ...item }));
  const shop = structuredClone(room.getClientState());
  room.handleTrapEvent({ story: '小隊走入斑駁的長廊，石縫間透出幽微的蒼藍光芒。\n\n腳下忽然傳來機關轉動的聲響，眾人立刻停下腳步。' });
  const event = structuredClone(room.getClientState());
  room.handleBattleEvent();
  room.clearTimer();
  if (room.roundStartTimer) clearTimeout(room.roundStartTimer);
  if (room.selectionReadyTimer) clearTimeout(room.selectionReadyTimer);
  if (room.presentationSafetyTimer) clearTimeout(room.presentationSafetyTimer);
  const battle = structuredClone(room.getClientState());
  return { lobby, route, shop, event, battle };
}
