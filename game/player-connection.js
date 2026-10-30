// Room identity adapter: game code sees immutable Player IDs; Socket.IO retains
// its own transport ID. Methods remain bound to the real socket instance.
export function playerSocket(transport) {
  return new Proxy(transport, { get(target, key) {
    if (key === 'id') return target.data.identity.id;
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

export function disconnectPlayer(room, id) {
  const player = room.players[id];
  if (!player) return;
  player.connected = false;
  room.persistence?.trace(room, 'player:disconnect');
  const hadPresentation = room.pendingPresentationAcks?.delete(id);
  room.pendingSelectionAcks?.delete(id);
  const remaining = (room.state === 'IN_BATTLE' ? room.getCombatPlayers() : Object.values(room.players)).filter(p => p.connected);
  if (!remaining.length) {
    if (hadPresentation) room.identityDeferredPresentation = room.state;
    if (!room.isPaused && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(room.state)) {
      room.togglePause(id); room.identityOfflinePause = true;
    }
  } else {
    if (room.state === 'IN_BATTLE' && room.selectionState === 'SELECTING') {
      if (room.isWaitingForSelectionReady && !room.pendingSelectionAcks?.size) room.handleSelectionReady(remaining[0].id, room.battleRound);
      room.checkTurnCompletion();
    }
    if (hadPresentation) {
      if (room.state === 'IN_BATTLE' && !room.pendingPresentationAcks.size) room.finishTurnPresentation();
      else if (room.state === 'BATTLE_VICTORY') room.handleVictoryComplete(remaining[0].id, room.currentVictory?.presentationId);
      else if (room.state === 'CHOOSING_ROUTE') room.finishRoutePresentationIfReady();
      else if (room.state === 'PROLOGUE') room.finishPrologueIfReady();
      else if (room.currentEvent?.type === 'trap') room.finishTrapPresentationIfReady();
      else if (['chest', 'treasure'].includes(room.currentEvent?.type)) room.finishChestPresentationIfReady();
    }
  }
  if (remaining.length && room.state === 'CHOOSING_ROUTE') room.checkRouteVoteCompletion();
  room.broadcastState();
}

export function reconnectPlayer(room, socket, { newConnection = false } = {}) {
  const player = room.players[socket.id];
  if (!player) return false;
  // A fresh browser must finish its own narration while the current barrier is open.
  if ((!player.connected || newConnection) && room.state === 'CHOOSING_ROUTE' && room.isNarrating) {
    room.pendingPresentationAcks.add(socket.id);
  }
  if (player.connected && player.name === socket.data.identity.display_name) {
    room.career?.participate(room, socket.id);
    room.career?.resume(room);
    socket.join(room.code);
    socket.emit('room:update', room.getClientState());
    return true;
  }
  player.connected = true;
  room.persistence?.trace(room, 'player:reconnect');
  player.name = socket.data.identity.display_name;
  socket.join(room.code);
  if (room.state === 'CHOOSING_ROUTE' && room.stageRosterPending && !room.spectators?.waiting) room.finalizeRouteCheckpoint();
  if (room.identityOfflinePause && (room.state !== 'IN_BATTLE' || room.isStageParticipant(socket.id))) {
    room.identityOfflinePause = false;
    if (room.isPaused) room.togglePause(socket.id);
  }
  if (room.identityDeferredPresentation && (room.state !== 'IN_BATTLE' || room.isStageParticipant(socket.id))) {
    const state = room.identityDeferredPresentation; room.identityDeferredPresentation = null;
    if (state === room.state && !room.pendingPresentationAcks?.size) {
      if (state === 'IN_BATTLE') room.finishTurnPresentation();
      else if (state === 'BATTLE_VICTORY') room.handleVictoryComplete(socket.id, room.currentVictory?.presentationId);
      else if (state === 'PROLOGUE') room.finishPrologueIfReady();
      else if (state === 'CHOOSING_ROUTE') room.finishRoutePresentationIfReady();
      else if (room.currentEvent?.type === 'trap') room.finishTrapPresentationIfReady();
      else if (['chest', 'treasure'].includes(room.currentEvent?.type)) room.finishChestPresentationIfReady();
    }
  }
  if (room.state === 'CHOOSING_ROUTE') room.checkRouteVoteCompletion();
  room.career?.participate(room, socket.id);
  room.career?.resume(room);
  room.broadcastState();
  return true;
}
