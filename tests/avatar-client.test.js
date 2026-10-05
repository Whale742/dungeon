import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const avatarSource = source.slice(source.indexOf('function getPlayerAvatarHtml('), source.indexOf('function getClassDisplayName'));
const core = fs.readFileSync(new URL('../public/presentation-core.js', import.meta.url), 'utf8');
const resolverSource = core.slice(core.indexOf('const DEFAULT_ROLE_AVATARS'), core.indexOf('function getClassDisplayName'));
const hudSource = source.slice(source.indexOf('function updateBattleHudFromSnapshot('), source.indexOf('// 根據戰鬥邏輯產生的快照'));

function setup(customAvatar) {
  let avatar;
  let replacements = 0;
  function parse(html) {
    const tagName = html.startsWith('<img') ? 'IMG' : 'DIV';
    const attrs = Object.fromEntries([...html.matchAll(/(src|class|alt)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    return {
      tagName,
      get className() { return Array.from(classes).join(' '); },
      set className(v) { classes.clear(); (v || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
      classList: {
        add: (...cls) => cls.forEach(c => classes.add(c)),
        remove: (...cls) => cls.forEach(c => classes.delete(c)),
        contains: c => classes.has(c),
        toggle: (c, force) => {
          if (force !== undefined) { force ? classes.add(c) : classes.delete(c); return force; }
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c); return true;
        }
      },
      alt: attrs.alt,
      get src() { return attrs.src || ''; },
      set src(v) { attrs.src = v; },
      innerHTML: tagName === 'DIV' ? (html.match(/>(.*)<\/div>/s)?.[1] || '') : '',
      getAttribute: name => attrs[name] ?? null,
      setAttribute: (name, value) => { attrs[name] = value; },
      replaceWith(next) { avatar = next; replacements++; }
    };
  }
  const status = { innerHTML: '' };
  const card = {
    querySelector(selector) {
      if (selector === '.teammate-avatar-img') return avatar;
      if (selector === '.combat-status-list') return status;
      return null;
    },
    classList: { toggle() {}, add() {}, remove() {} }
  };
  const player = { id: 'd', name: 'Druid', role: 'druid', customAvatar, hp: 85, maxHp: 85 };
  const context = vm.createContext({
    roomState: { players: [player] }, elements: {},
    classesData: { druid: { avatar: '/photo/Druid.webp', name: '德魯伊' } },
    escapeHtml: value => value, renderCombatStatuses: () => '', syncMinionHud() {},
    document: {
      querySelector: selector => selector.includes('data-player-id') ? card : null,
      createElement: () => ({ set innerHTML(html) { this.firstElementChild = parse(html); } })
    }
  });
  vm.runInContext(resolverSource + avatarSource + hudSource, context);
  avatar = parse(vm.runInContext("getPlayerAvatarHtml(roomState.players[0], 'teammate-avatar-img')", context));
  const update = druidForm => {
    context.snapshot = { players: [{ id: 'd', hp: 75, maxHp: 85, druidForm }] };
    vm.runInContext('updateBattleHudFromSnapshot(snapshot)', context);
  };
  return { update, player, avatar: () => avatar, replacements: () => replacements };
}

test('summon and attack HUD snapshots preserve an emoji avatar without reading src', () => {
  const f = setup('🌿');
  f.update(null); f.update(null);
  assert.equal(f.avatar().tagName, 'DIV');
  assert.equal(f.avatar().innerHTML, '🌿');
  assert.equal(f.replacements(), 0);
  assert.equal(f.player.hp, 75);
});

for (const form of ['werewolf', 'treant', 'tree']) test(`${form} replaces emoji with an image and restores emoji on expiry`, () => {
  const f = setup('🌿');
  f.update(form);
  assert.equal(f.avatar().tagName, 'IMG');
  assert.equal(f.avatar().getAttribute('src'), form === 'werewolf' ? '/photo/狼人.webp' : '/photo/遠古樹精.webp');
  f.update(form);
  assert.equal(f.replacements(), 1);
  f.update(null);
  assert.equal(f.avatar().tagName, 'DIV');
  assert.equal(f.avatar().innerHTML, '🌿');
});

for (const custom of [undefined, '/photo/custom.webp', 'https://example.com/avatar.webp']) test(`image avatar ${custom} survives transformation without replacing its node`, () => {
  const f = setup(custom);
  f.update('werewolf'); f.update(null);
  assert.equal(f.avatar().getAttribute('src'), custom || '/photo/Druid.webp');
  assert.equal(f.replacements(), 0);
  assert.equal(f.avatar().className, 'teammate-avatar-img');
});
