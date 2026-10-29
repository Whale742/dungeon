import { metrics } from './performance.js';
import { randomUUID } from 'node:crypto';
import { CLASSES } from './constants.js';

const fields = text => new Set(text.split(/\s+/));
// Closed projection shared by state and already-published visual events. Unknown
// internal fields are omitted, including nested objects and future additions.
const visible = fields(`id instanceId name originalName role type kind tier avatar battleAvatar desc text title label icon
hp maxHp tempHp temporaryOverheal shieldHp displayHp displayMaxHp alive connected downedForFloor customAvatar
attack atk ATK_base PAtk_gear MAtk_gear DEF bonusAtk bonusDef statuses category turns stacks damage value isNegative isDot
poisonTurns poisonDmg burnTurns burnDmg fractureTurns fractureDmg chillTurns chillDmg corrosionTurns bleedTurns bleedDmg
flawMarks talismans permanentTalismans minions minion minionIndex owner ownerId druidForm druidFormTurns
isStealthed isSurrendered stunnedNextTurn cannotCrit ammo isCrouchedThisRound archerNextDodgeBonus
presentation mechanics resistances physical magic effect ultName isWeakened arena playerId enemyId until enemyForced
sourceId targetId targetEnemyId targetIds sourceName targetName actionId actionName skillId skillName resultId eventId
results visualEvents narratives narrative round presentationId monsterKilled queue duration mode
hpSnapshot hpSnapshotBefore targetBefore targetAfter sourceBefore sourceAfter players enemies monster
outcome finalDamage actualDamage actualHpDamage actualAbsorbed hpDmg tempAbsorbed shieldMod absorbed
isDead dodged stealthed critical isCrit crit blocked miss dodge block heal healing amount shield
sharedFrom minionId sourceRole targetRole status statusId statusName effectId effectType cue animation animationId
before after from to x y col row hexId isVisited isRevealed isScouted isCurrent isSelectable inVision visibleType visibleIcon
opened interactionReady presentationComplete rewardRevealed paragraphs subtitle lines details
hpBefore hpAfter hpSnapshotAfter selected choiceId choices stage stageId dialogue speaker portrait
items item price stock sold soldOut boughtBy readyPlayers isPrepShop shopType eventKey
statDesc slot equipped slotKey quantity rarity color amount text type routeType revealed isBoss isElite isAbyssBoss isEndElite
poison burn fracture chill stun shield_gain heal_group revive self_damage monster_attack player_attack
isReady hasActed isLocked equipCounts equips equipSlots WEAPON ARMOR ACCESSORY CLASS_EXCLUSIVE
phase8Statuses resourceSummary p8Shields p8Effects soul inspiration moon debt form active target damageType attackType
augmentation resistanceBreak reversedOmenRemaining reversedOmenBonus augurResistanceBreak phase index total count
entry idle hurt death attackImage identityBeatMs assetKey image imageUrl url src scale offset flip opacity
summon summonId companion companions cleanup skipInvalidAttack targetIndex isPrimary isSecondary hitIndex hitCount
bonus burst reaction reactions events createdAt timestamp logs allies enemy formation sequence knockback
shieldBefore shieldAfter hpDelta tempHpDelta maxHpDelta originalValue effectiveValue immune resisted missed
multiplier bonusDamage heals buffs debuffs reason statusChanges statusBefore statusAfter isBuff isDebuff
element tag tags tint showValue sourceEnemyId targetPlayerId sourcePlayerId damageSchool isUltimate
nodeId connections iconName description visited revealed scouted selectable isReachable isVisible danger
combatState currentPhase phaseName bossId bossName hasShield broken exposed playerIds enemyIds targets hits
prologue leaderId speed accelerated revision key contentKey portraitKey background backgroundImage tierLabel
routeId routeName story healAmt drop discardedDrop ownerName depositTarget consumables recycleRate sellRatio priceMultiplier shadyBuyMult
restPrice readyToLeave hasBought boughtCount canLeave canOpen canPacify isShady description readyList speedMultiplier
isKnownMimic isKnownShady isAccessible bossAvatar bossPortrait dialogueText selectedChoice
ammoBefore archerTrap augurReactions consumedStacks dmgType enemyCastMembers flaskType gainedStacks gladiatorPresentation
hiddenBeforeAction hiddenEffectNote isCritical isLethal isUlt monsterAvatar monsterName png shieldDamage targetHpAfter targetHpBefore targetMaxHp tempHpDamage
isHiddenThisRound stealthBrokenThisRound arenaBlocked nextTurnStunFlag actualHeal actualShield actualTempHpDamage
stealthStacks followUpsThisRound followUpCap isAdjacent isInVision canSelect voteCount floor storyTitle storyText
fateBlessing sageX sageOperand sagePhase sageDebt sageConfusionChance sageSampling observedTargetId augurCardState
augurIntervenedThisRound augurFateDebts augurEquipment amethyst gilded forbidden rage bloodStacks warriorStacks
gladiatorBloodsong paladinFatalGuard paladinGrace presentationShields arenaActive noReviveThisFloor
gold experience xp reward rewards itemId version rate startedAt updatedAt acceleration actualBloodsongAbsorbed targetRelation
anchor barterUsed buybackPool goldGain groupValue infoUsed isAssassinCaptain isWanderingMerchant minionName singleTargetId singleValue
subType ammoAfter ammoType guard player presentationBeat returning sageMomentumCapture segmentIndex shieldBreak theft
bossRole bossBattleAvatar bossDesc chosenChoice battleFormAvatars message encounterStory`);
export function publicVisual(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(publicVisual);
  return Object.fromEntries(Object.entries(value).filter(([key]) => visible.has(key)).map(([key, v]) => [key, publicVisual(v)]));
}
const stateFields = fields(`code stateVersion leaderId lockedLeaderId lockedLeaderRole leaderSkill leaderSkillUsedThisBattle
state selectionState floor battleRound warriorShieldTurn alcVulnerableTurns alcVulnerableNextTurn isPaused timerRemaining gameOverReason
arena enemyArena arrowTrap arrowTrapTurns abyssFlashRedEye currentTransition currentPrologue narrativeControl isNarrating
currentHex hexMap currentRoutes routeVoteCounts routePresentationId floorRevival battlePresentationId currentVictory victoryInteractionReady
gameBalance routeNarrative floorDifficultyPercent logs`);
export function spectatorState(room, state = room.getClientState()) {
  const projected = Object.fromEntries(Object.entries(state).filter(([key]) => stateFields.has(key)).map(([k, v]) => [k, publicVisual(v)]));
  // Enemy snapshots already use the Room's explicit public formatter; never
  // expose the raw currentMonster object, action contexts, bags or hidden rolls.
  projected.enemies = (room.enemies || []).map(e => publicVisual({ ...room.formatEnemySnapshot(e),
    routeId: e.routeId, encounterStory: e.encounterStory, isWeakened: !!e.isWeakened }));
  projected.currentMonster = projected.enemies.find(e => e.instanceId === room.currentMonster?.instanceId) || projected.enemies[0] || null;
  projected.players = state.players.map(p => {
    const player = publicVisual(p);
    // Target selection belongs to an unsubmitted command, not a published hit.
    delete player.targetEnemyId;
    return player;
  });
  projected.currentEvent = publicVisual(state.currentEvent);
  if (projected.currentEvent?.type === 'chest' && !projected.currentEvent.opened) {
    delete projected.currentEvent.details; delete projected.currentEvent.items; delete projected.currentEvent.drop;
  }
  projected.routeVoteCounts = { ...state.routeVoteCounts };
  projected.routeVotes = {};
  projected.abyssState = state.abyssState ? publicVisual(Object.fromEntries(['bossId', 'bossRole', 'bossName', 'bossAvatar', 'bossBattleAvatar', 'bossDesc', 'stage', 'dialogueText', 'choices', 'chosenChoice'].map(k => [k, state.abyssState[k]]))) : null;
  projected.squadInventory = []; projected.overflowItems = []; projected.gold = state.gold;
  projected.viewer = { spectator: true, count: room.spectators?.members.size || 0, limit: room.spectators?.limit || 0 };
  return projected;
}
export const spectatorReads = new Set(['spectator:leave', 'spectator:apply', 'spectator:cancel', 'spectator:select_role', 'room:resync', 'room:list', 'player:career', 'player:rename', 'adventure:list']);
const publicEvents = new Set(['room:update', 'battle:presentation_queue', 'battle:visual_events', 'prologue:skipped',
  'narrative:accelerated', 'abyss:red_eye_flash', 'event:shop_closed', 'event:shop_player_ready']);
export class Spectators {
  constructor(room, io, limit = 5, { now = Date.now, timeoutMs = 60000, onPromote = () => {} } = {}) {
    this.room = room; this.io = io; this.limit = limit; this.members = new Map();
    this.channel = 'spectators:' + room.code;
    this.requests = new Map(); this.now = now; this.timeoutMs = timeoutMs; this.onPromote = onPromote;
    this.waiting = false; this.committing = false;
  }
  join(socket) {
    if (this.room.isDev || this.room.players[socket.id] || ['GAME_OVER', 'VICTORY'].includes(this.room.state)) return { success: false, message: '正式隊員、已結束或 Dev 房間不能加入觀戰' };
    if (!this.members.has(socket.id) && this.members.size >= this.limit) return { success: false, message: '觀戰名額已滿' };
    this.members.set(socket.id, socket); socket.join(this.channel);
    socket.emit('room:update', spectatorState(this.room));
    this.notify();
    return { success: true, roomCode: this.room.code, spectator: true };
  }
  leave(id) {
    const socket = this.members.get(id); socket?.leave(this.channel); this.members.delete(id);
    if (!this.committing) { this.requests.delete(id); this.maybeCommit(); this.notify(); }
  }
  close() {
    clearTimeout(this.deadlineTimer); this.waiting = false; this.committing = false; this.requests.clear();
    for (const [id, socket] of this.members) { socket.data.spectating = null; socket.emit('spectator:ended'); socket.leave(this.channel); }
    this.members.clear();
  }
  active() {
    const r = this.room;
    return !r.isDev && !!r.adventureId && !['LOBBY', 'GAME_OVER', 'VICTORY'].includes(r.state) && !r.persistence?.hasLostAuthority(r);
  }
  publicStatus() {
    return { waiting: this.waiting, committing: this.committing, deadline: this.deadline || null,
      requests: [...this.requests.values()].map(({ playerId, name, requestId, status, role }) => ({ playerId, name, requestId, status, role })),
      checkpoint: this.room.routePresentationId };
  }
  notify() {
    const state = this.publicStatus();
    this.io.to(this.room.leaderId).emit('spectator:requests', state);
    for (const [id, socket] of this.members) socket.emit('spectator:application', {
      ...state, requests: state.requests.filter(r => r.playerId === id) });
  }
  apply(id) {
    if (!this.active() || !this.members.has(id) || this.room.players[id] || this.committing || this.room.persistence?.blocked(this.room)) return { success: false, message: '目前無法申請加入冒險' };
    if (this.requests.has(id)) return { success: false, message: '已有待處理的申請' };
    if (this.room.memberIds.length + this.requests.size >= 10) return { success: false, message: '正式隊伍或候補名額已滿' };
    const socket = this.members.get(id);
    const request = { playerId: id, name: socket.data.identity.display_name, requestId: randomUUID(), status: 'requested', role: null };
    this.requests.set(id, request); this.notify();
    return { success: true, requestId: request.requestId };
  }
  review(leaderId, { playerId, requestId, approve } = {}) {
    const r = this.requests.get(playerId);
    if (!this.active() || this.room.leaderId !== leaderId || !this.room.players[leaderId]?.connected ||
      !r || r.requestId !== requestId || typeof approve !== 'boolean' || r.status !== 'requested') return { success: false, message: '隊長或申請版本無效' };
    if (approve) r.status = 'approved_pending_checkpoint'; else this.requests.delete(playerId);
    this.notify(); return { success: true };
  }
  cancel(id, requestId) {
    const r = this.requests.get(id);
    if (this.committing || !r || r.requestId !== requestId) return { success: false, message: '申請版本已變更或正在保存' };
    this.requests.delete(id); this.maybeCommit(); this.notify(); return { success: true };
  }
  beginCheckpoint() {
    if (!this.active() || this.waiting || this.committing) return this.waiting || this.committing;
    for (const [id, r] of this.requests) {
      if (r.status !== 'approved_pending_checkpoint') continue;
      if (!this.members.has(id) || this.room.players[id] || this.room.memberIds.length >= 10) { this.requests.delete(id); continue; }
      r.status = 'choosing_role'; r.role = null;
    }
    this.waiting = [...this.requests.values()].some(r => r.status === 'choosing_role');
    if (!this.waiting) return false;
    this.deadline = this.now() + this.timeoutMs;
    this.deadlineTimer = setTimeout(() => this.expire(), this.timeoutMs); this.deadlineTimer.unref();
    this.notify(); return true;
  }
  selectRole(id, { requestId, role, checkpoint } = {}) {
    const r = this.requests.get(id);
    if (!this.active() || !this.waiting || this.committing || !this.members.has(id) || !r || r.requestId !== requestId ||
      r.status !== 'choosing_role' || checkpoint !== this.room.routePresentationId || this.now() >= this.deadline || !CLASSES[role] ||
      Object.values(this.room.players).some(p => p.role === role) || [...this.requests.values()].some(q => q !== r && q.role === role)) return { success: false, message: '職業、申請或檢查點已失效，請重新選擇' };
    r.role = role; r.status = 'ready'; this.maybeCommit(); this.notify(); return { success: true };
  }
  expire() {
    if (!this.waiting || this.committing) return;
    for (const [id, r] of this.requests) if (r.status === 'choosing_role') this.requests.delete(id);
    this.maybeCommit(); this.notify();
  }
  maybeCommit() {
    if (!this.waiting || this.committing || [...this.requests.values()].some(r => r.status === 'choosing_role')) return;
    clearTimeout(this.deadlineTimer); this.committing = true;
    const room = this.room;
    for (const [id, r] of this.requests) {
      if (r.status !== 'ready') continue;
      if (!this.members.has(id) || room.memberIds.length >= 10 || room.players[id] || Object.values(room.players).some(p => p.role === r.role)) { this.requests.delete(id); continue; }
      room.players[id] = room.createPlayer(id, r.name);
      room.initializeRole(room.players[id], r.role); room.memberIds.push(id);
      room.players[id].connected = false;
      r.status = 'saving';
    }
    room.broadcastState();
    room.finalizeRouteCheckpoint();
  }
  checkpointSaved() {
    if (!this.committing) return;
    this.waiting = false; this.committing = false; this.deadline = null;
    for (const [id, r] of this.requests) if (r.status === 'saving') {
      const socket = this.members.get(id);
      this.requests.delete(id); this.members.delete(id);
      if (socket) {
        this.room.players[id].connected = true;
        socket.leave(this.channel); socket.data.spectating = null;
        this.onPromote(socket, this.room); socket.join(this.room.code);
        socket.emit('spectator:promoted');
        this.room.pendingPresentationAcks.add(id);
        if (this.room.identityOfflinePause && !this.room.persistence?.hasLostAuthority(this.room)) {
          this.room.identityOfflinePause = false;
          if (this.room.isPaused) this.room.togglePause(id);
        }
      } else this.room.players[id].connected = false;
      this.room.career?.joined(this.room, id);
    }
    this.notify();
  }
  emit(event, data) {
    if (!this.members.size || !publicEvents.has(event)) return;
    const start = metrics.enabled ? performance.now() : 0;
    const payload = event === 'room:update' ? spectatorState(this.room, data) : publicVisual(data);
    if (event === 'battle:presentation_queue') {
      const state = spectatorState(this.room);
      payload.spectatorState = Object.fromEntries(`code stateVersion state selectionState floor battleRound battlePresentationId
        enemies currentMonster players arena enemyArena isNarrating viewer`.split(/\s+/).map(k => [k, state[k]]));
    }
    this.io.to(this.channel).emit(event, payload);
    if (metrics.enabled) {
      metrics.record('spectator.broadcast.ms', performance.now() - start);
      metrics.record('spectator.bytes', Buffer.byteLength(JSON.stringify(payload) ?? 'null'));
      metrics.record('spectator.recipients', this.members.size);
    }
  }
}
