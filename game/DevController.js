import { TIER1_EQUIPMENTS, TIER2_EQUIPMENTS, LOOT_TABLE } from './constants.js';
import { DEV_ENEMIES, DEV_EVENTS, validEncounter } from './DevEncounter.js';
import { DEV_ROLE_POLICY, roleResources, validRoleResource, setRoleResource } from './DevRoleResources.js';
import { registerRoleRandom, randomRoleOptions, reserveRoleRandom, clearRoleRandom, roleRandomSnapshot, restoreRoleRandom } from './DevRoleRandom.js';

const equipment = [...new Map([...TIER1_EQUIPMENTS, ...TIER2_EQUIPMENTS, ...LOOT_TABLE].map(e => [e.id, e])).values()];
const dots = ['poison', 'burn', 'fracture', 'chill'];
const living = (r, id) => typeof id === 'string' && Object.hasOwn(r.players, id) && r.players[id].hp > 0;
const fail = message => ({ success: false, message });
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export class DevController {
  constructor(access) {
    this.access = access;
    this.rooms = new WeakMap();
    this.commands = new Map([
      ['gold.set', { keys: ['value'], validate: p => integer(p.value, 0, 1000000), run: (r, p) => { r.gold = p.value; } }],
      ['gold.add', { keys: ['value'], validate: p => integer(p.value, -1000000, 1000000), run: (r, p) => {
        if (!integer(r.gold + p.value, 0, 1000000)) return fail('金幣結果必須介於 0 至 1000000');
        r.gold += p.value;
      } }]
    ]);
    this.commands.set('player.hp', { keys: ['playerId', 'value'], validate: (p, r) => living(r, p.playerId) && integer(p.value, 1, r.players[p.playerId].maxHp),
      run: (r, p) => { r.players[p.playerId].hp = p.value; } });
    this.commands.set('player.shield', { keys: ['playerId', 'value'], validate: (p, r) => r.state === 'IN_BATTLE' && living(r, p.playerId) && integer(p.value, 1, 10000) && r.players[p.playerId].tempHp + p.value <= 10000,
      run: (r, p) => { r.p8GrantShield(r.players[p.playerId], p.value, 1); } });
    this.commands.set('player.status', { keys: ['playerId', 'status', 'apply'], validate: (p, r) => r.state === 'IN_BATTLE' && living(r, p.playerId) && dots.includes(p.status) && typeof p.apply === 'boolean',
      run: (r, p) => {
        const player = r.players[p.playerId];
        if (p.apply) r.applyDotToAlly(player, p.status);
        else { player[p.status + 'Turns'] = 0; player[p.status + 'Dmg'] = 0; }
      } });
    this.commands.set('item.grant', { keys: ['playerId', 'itemId', 'bag'], validate: (p, r) => living(r, p.playerId) && equipment.some(e => e.id === p.itemId) && ['personal', 'squad'].includes(p.bag),
      run: (r, p) => {
        if (r.squadInventory.length >= 19 || (p.bag === 'personal' && r.players[p.playerId].bag.length >= 4)) return fail('指定背包或發放暫存欄位已滿');
        const deposit = r.addItemPrioritySquad(structuredClone(equipment.find(e => e.id === p.itemId)), p.playerId);
        if (p.bag === 'personal') return r.transferToPersonal(p.playerId, deposit.index);
      } });
    this.commands.set('item.equip', { keys: ['playerId', 'bag', 'index'], validate: (p, r) => living(r, p.playerId) && ['personal', 'squad'].includes(p.bag) && integer(p.index, 0, p.bag === 'personal' ? 3 : 18),
      run: (r, p) => p.bag === 'personal' ? r.equipItemFromBag(p.playerId, p.index) : r.equipItemFromSquad(p.playerId, p.index) });
    this.commands.set('encounter.reserve', { keys: ['type', 'enemyId', 'weakened'], validate: validEncounter,
      run: (r, p) => { r.devEncounter = structuredClone(p); } });
    this.commands.set('encounter.clear', { keys: [], validate: () => true, run: r => { r.devEncounter = null; } });
    this.commands.set('enemy.hp', { keys: ['enemyId', 'value'], validate: (p, r) => r.state === 'IN_BATTLE' &&
      r.getLivingEnemies().some(e => e.instanceId === p.enemyId && integer(p.value, 1, e.maxHp)),
      run: (r, p) => { r.enemies.find(e => e.instanceId === p.enemyId).hp = p.value; } });
    this.commands.set('role.resource', { keys: ['playerId', 'resource', 'value'], validate: (p, r) => validRoleResource(r, p), run: setRoleResource });
    this.commands.set('role.random.reserve', { keys:['playerId','skill','outcome'], validate:p=>[p.playerId,p.skill,p.outcome].every(v=>typeof v==='string'&&v.length<=80), run:reserveRoleRandom });
    this.commands.set('role.random.clear', { keys:['playerId'], validate:(p,r)=>Object.hasOwn(r.players,p.playerId), run:(r,p)=>clearRoleRandom(r,p.playerId) });
  }

  register(room, socket) {
    const record = { revision: 0, busy: false, results: new Map(), audit: [] };
    this.rooms.set(room, record);
    registerRoleRandom(room,()=>this.access.authorized(socket,room),(playerId,result)=>{
      record.audit.push({command:'role.random.consume',playerId,result,success:true,context:this.context(room)});
      if(record.audit.length>100)record.audit.shift();
    });
    const broadcast = room.broadcastState.bind(room);
    room.broadcastState = () => {
      if (record.busy) return; // Commit once, after invariant checks.
      if (room.state === 'LOBBY') room.devEncounter = null;
      if (room.state === 'LOBBY'||!this.access.authorized(socket,room)) clearRoleRandom(room);
      record.revision++;
      broadcast();
      if (this.access.authorized(socket, room)) socket.emit('dev:update', this.inspect(socket, room));
    };
  }

  context(room) {
    return { revision: this.rooms.get(room)?.revision, floor: room.floor, round: room.battleRound,
      state: room.state, presentation: room.battlePresentationId, route: room.routePresentationId };
  }

  lockReason(room) {
    if (room.isPaused || room.isNarrating || room.pendingDrop || room.arena || room.pendingPresentationAcks?.size ||
        room.pendingSelectionAcks?.size || room.isWaitingForSelectionReady) return '暫停、演出或互動 ACK 尚未完成';
    if (room.state === 'CHOOSING_ROUTE' && !Object.keys(room.routeVotes || {}).length) return null;
    if (room.state === 'IN_BATTLE' && room.selectionState === 'SELECTING' &&
        Object.values(room.players).every(p => !p.action && !p.isLocked)) return null;
    return '此階段或已提交的遊戲操作不允許 Dev 修改';
  }

  inspect(socket, room) {
    if (!this.access.authorized(socket, room) || !this.rooms.has(room)) return fail('尚未授權 Dev 操作');
    const record = this.rooms.get(room);
    return { success: true, roomCode: room.code, context: this.context(room),
      locked: record.busy || Boolean(this.lockReason(room)), reason: this.lockReason(room),
      commands: [...this.commands.keys()], equipment: equipment.map(e => ({ id: e.id, name: e.name, role: e.role, slot: e.slot })),
      encounter: room.devEncounter || null, events: DEV_EVENTS,
      roleRandom: roleRandomSnapshot(room),
      enemyTemplates: DEV_ENEMIES.map(e => ({ id: e.id, name: e.name })),
      roles: Object.values(room.players).map(p => ({ playerId: p.id, policy: DEV_ROLE_POLICY[p.role] || '職業狀態唯讀', resources: roleResources(p), random:randomRoleOptions(room,p) })),
      audit: record.audit };
  }

  snapshot(room) {
    return structuredClone({ gold: room.gold, players: room.players, squadInventory: room.squadInventory,
      enemies: room.enemies, logs: room.logs, devEncounter: room.devEncounter, roleRandom:roleRandomSnapshot(room) });
  }

  invariant(room) {
    if (!integer(room.gold, 0, 1000000) || room.squadInventory.length > 19) return false;
    if (!room.enemies.every(e => Number.isFinite(e.hp) && e.hp >= 0 && Number.isFinite(e.maxHp) && e.maxHp > 0 && e.hp <= e.maxHp)) return false;
    return Object.values(room.players).every(p => Number.isFinite(p.hp) && p.hp >= 0 &&
      Number.isFinite(p.maxHp) && p.maxHp > 0 && Number.isFinite(p.tempHp) && p.tempHp >= 0 && p.bag.length <= 4);
  }

  execute(socket, room, request) {
    if (!this.access.authorized(socket, room) || !this.rooms.has(room)) return fail('尚未授權 Dev 操作');
    const record = this.rooms.get(room);
    if (!exact(request, ['id', 'roomCode', 'context', 'command', 'params']) ||
        typeof request.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.id) || request.roomCode !== room.code) return fail('無效的請求或房間');
    const fingerprint = JSON.stringify([request.context, request.command, request.params]);
    const prior = record.results.get(request.id);
    if (prior) return prior.fingerprint === fingerprint ? { ...prior.result, duplicate: true } : fail('請求識別碼已用於不同指令');
    if (record.busy) return fail('房間正在處理 Dev 操作');
    if (record.results.size >= 2048) return fail('此房間的 Dev 操作已達上限，請建立新房間');
    const beforeContext = this.context(room);
    let result;
    let before;
    try {
      if (!exact(request.context, Object.keys(beforeContext)) ||
          Object.keys(beforeContext).some(k => request.context[k] !== beforeContext[k])) throw new Error('房間狀態已更新，請重新操作');
      const command = this.commands.get(request.command);
      if (!command) throw new Error('不支援的 Dev 指令');
      if (!exact(request.params, command.keys) || !command.validate(request.params, room)) throw new Error('指令參數不合法');
      const reason = this.lockReason(room);
      if (reason) throw new Error(reason);
      before = this.snapshot(room);
      record.busy = true;
      const operation = command.run(room, request.params);
      if (operation?.success === false) throw new Error(operation.message);
      if (!this.invariant(room)) throw new Error('修改後狀態不符合遊戲限制');
      result = { success: true };
    } catch (error) {
      if (before) {
        const {roleRandom,...publicBefore}=before;
        Object.assign(room, publicBefore);
        restoreRoleRandom(room,roleRandom);
        room.setEnemies(before.enemies);
      }
      result = fail(error.message || 'Dev 操作失敗');
    } finally {
      record.busy = false;
    }
    const after = before ? this.snapshot(room) : null;
    record.audit.push({ id: request.id, command: request.command, params: request.params,
      at: new Date().toISOString(), context: beforeContext, success: result.success, message: result.message,
      before: before || null, after });
    if (record.audit.length > 100) record.audit.shift();
    record.results.set(request.id, { fingerprint, result });
    if (result.success) room.broadcastState();
    return { ...result, context: this.context(room) };
  }
}
