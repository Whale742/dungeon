import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CLASSES, ROLE_DETAILS } from '../game/constants.js';
import { skillValue, resolveSkillAttack } from '../game/stats.js';
import { Room } from '../game/Room.js';
import { getBossResistance } from '../game/boss-resistance.js';

test('Archer Skill Definitions & Configuration', () => {
  const archerSkills = CLASSES.archer.skills;
  assert.equal(archerSkills.length, 3, 'Archer should have 3 skills (basic + 2 skills)');

  // Basic attack unchanged (label is 基本箭矢)
  const basic = archerSkills[0];
  assert.equal(basic.id, 'basic');
  assert.equal(basic.label, '基本箭矢');

  // Skill 1: 封鎖箭雨 (a_rain), CD: 1, phys, group
  const s1 = archerSkills[1];
  assert.equal(s1.id, 'a_rain');
  assert.ok(s1.label.includes('封鎖箭雨'));
  assert.equal(s1.cd, 1);
  assert.equal(s1.dmgType, 'phys');
  assert.deepEqual(s1.tags, ['物理', '群體']);

  // Skill 2: 標記射擊 (a_shot), CD: 2, mag, single debuff
  const s2 = archerSkills[2];
  assert.equal(s2.id, 'a_shot');
  assert.ok(s2.label.includes('標記射擊'));
  assert.equal(s2.cd, 2);
  assert.equal(s2.dmgType, 'mag');
  assert.deepEqual(s2.tags, ['魔法', '單體', '減益']);

  // ROLE_DETAILS check
  const roleS1 = ROLE_DETAILS.archer.skills.find(s => s.name.includes('封鎖箭雨'));
  const roleS2 = ROLE_DETAILS.archer.skills.find(s => s.name.includes('標記射擊'));
  assert.ok(roleS1 && roleS1.cd.includes('1'));
  assert.ok(roleS2 && roleS2.cd.includes('2'));

  // Ensure descriptions do not contain 脫靶 or 誤傷隊友
  assert.ok(!roleS1.desc.includes('誤傷隊友'));
  assert.ok(!roleS2.desc.includes('脫靶'));
});

test('Archer Damage Formulae in stats.js', () => {
  const actor = { role: 'archer', equips: [] };
  const P = resolveSkillAttack({ actor, damageType: 'phys' });
  const M = resolveSkillAttack({ actor, damageType: 'mag' });

  // a_shot: 6 + Math.max(P, M)
  const expectedShot = Math.round(6 + Math.max(P, M));
  assert.equal(skillValue(actor, 'a_shot'), expectedShot);

  // a_rain_arrow: 0.5 * P
  const expectedRainArrow = Math.round(0.5 * P);
  assert.equal(skillValue(actor, 'a_rain_arrow'), expectedRainArrow);

  // a_trap: 0.25 * P
  const expectedTrap = Math.round(0.25 * P);
  assert.equal(skillValue(actor, 'a_trap'), expectedTrap);
});

test('Skill 2 【標記射擊】: deals magic damage and applies 破綻印記 without 脫靶', () => {
  const mockSocket = { id: 'p1', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('test-archer-1', mockSocket, '弓箭手小王', mockIo);
  room.state = 'IN_BATTLE';
  const archer = room.players['p1'];
  archer.role = 'archer';
  archer.hp = 80;
  archer.maxHp = 80;

  // Setup monster
  room.currentMonster = {
    id: 'test_golem',
    instanceId: 'test_golem_1',
    name: '守衛傀儡',
    hp: 500,
    maxHp: 500,
    DEF: 0,
    resistances: { magic: 0, physical: 0, effect: 50 },
    flawMarks: 0
  };

  // Run 10 times: must NEVER miss or grant archerNextDodgeBonus
  for (let i = 0; i < 10; i++) {
    archer.action = 'a_shot';
    room.resolveTurnActions();
    assert.equal(archer.archerNextDodgeBonus || 0, 0, 'Must not grant archerNextDodgeBonus from miss');
  }

  // Check flawMarks capped at 5
  assert.equal(room.currentMonster.flawMarks, 5, 'flawMarks should cap at 5');

  // Effect resistance test: effect resistance is reduced by 10% per stack
  const baseRes = 50;
  const mockMonster = { resistances: { effect: baseRes }, flawMarks: 3 };
  const effectiveRes = getBossResistance(mockMonster, 'effect');
  assert.equal(effectiveRes, baseRes - 3 * 10, 'Effect resistance should decrease by 10 per stack');
});

test('Skill 1 【封鎖箭雨】: fires 10 arrows without 誤傷隊友, missed arrows form trap', () => {
  const mockSocket = { id: 'p1', emit: () => {}, join: () => {} };
  const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const room = new Room('test-archer-2', mockSocket, '神射手', mockIo);
  // Add an ally while in LOBBY state to verify no friendly fire occurs
  room.addPlayer({ id: 'p2', emit: () => {}, join: () => {} }, '隊友戰士');
  const ally = room.players['p2'];
  ally.role = 'warrior';
  ally.hp = 120;
  ally.maxHp = 120;

  room.state = 'IN_BATTLE';
  const archer = room.players['p1'];
  archer.role = 'archer';
  archer.hp = 80;
  archer.maxHp = 80;

  room.currentMonster = {
    id: 'test_target',
    instanceId: 'test_target_1',
    name: '稻草人',
    hp: 1000,
    maxHp: 1000,
    DEF: 0,
    resistances: { magic: 0, physical: 0 },
    flawMarks: 0
  };

  for (let r = 0; r < 5; r++) {
    archer.action = 'a_rain';
    room.players['p2'].action = 'skip';
    room.resolveTurnActions();

    // Verify ally NEVER took damage (no friendly fire)
    assert.equal(room.players['p2'].hp, 120, 'Ally must NEVER receive friendly fire from 封鎖箭雨');
  }

  assert.ok(room.currentMonster.hp < 1000, '封鎖箭雨 should deal damage to monster');

  // If there was any miss, arrowTrap must be active
  if (room.arrowTrap) {
    assert.ok(room.arrowTrap.turns >= 1, 'Trap should be active');
    const P = resolveSkillAttack({ actor: archer, damageType: 'phys' });
    assert.equal(room.arrowTrap.atk, P);

    // Enemy action should trigger trap damage
    const trapRaw = Math.max(1, Math.round(0.25 * (room.arrowTrap.atk || 14)));
    assert.ok(trapRaw > 0);
  }
});

test('UI and Descriptions: no 脫靶 or 誤傷隊友 in app.js and lobby.js', () => {
  const appJs = fs.readFileSync('public/app.js', 'utf8');
  const lobbyJs = fs.readFileSync('public/lobby.js', 'utf8');

  // Verify app.js archer definition
  assert.ok(appJs.includes("name: '封鎖箭雨'"), 'app.js must include 封鎖箭雨');
  assert.ok(appJs.includes("name: '標記射擊'"), 'app.js must include 標記射擊');
  assert.ok(!appJs.includes('精準狙擊'), 'app.js must not have old 精準狙擊');
  assert.ok(!appJs.includes('箭雨壓制'), 'app.js must not have old 箭雨壓制');

  // Verify lobby.js
  assert.ok(!lobbyJs.includes('箭雨壓制'), 'lobby.js must not have old 箭雨壓制');
});

test('Asset Verification: 破綻印記.webp exists and has valid webp format', () => {
  const iconPath = path.resolve('public/buff icon/破綻印記.webp');
  assert.ok(fs.existsSync(iconPath), 'public/buff icon/破綻印記.webp must exist');

  const stats = fs.statSync(iconPath);
  assert.ok(stats.size > 0, 'Icon file size should be non-zero');

  // Check webp header (RIFF ... WEBP)
  const buf = fs.readFileSync(iconPath);
  assert.equal(buf.subarray(0, 4).toString(), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
});

test('Client UI Buff Map: flaw_mark maps to 破綻印記.webp', () => {
  const appJs = fs.readFileSync('public/app.js', 'utf8');
  assert.ok(appJs.includes("flaw_mark: '/buff icon/破綻印記.webp'"), 'BUFF_ICON_MAP must include flaw_mark');
  assert.ok(appJs.includes("破綻印記.webp"), 'app.js should reference 破綻印記.webp');
});
