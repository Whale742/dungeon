import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const presentationSource = fs.readFileSync(new URL('../public/onmyoji-presentation.js', import.meta.url), 'utf8');
const labScenesSource = fs.readFileSync(new URL('../public/onmyoji-lab-scenes.js', import.meta.url), 'utf8');

function setupOnmyojiContext() {
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    Math,
    document: {
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            toggle(c, force) {
              if (force === undefined) {
                if (this.classes.has(c)) this.classes.delete(c);
                else this.classes.add(c);
              } else if (force) {
                this.classes.add(c);
              } else {
                this.classes.delete(c);
              }
            },
            contains(c) { return this.classes.has(c); }
          },
          style: {
            setProperty(prop, val) { this[prop] = val; }
          },
          dataset: {},
          children: [],
          appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            return child;
          },
          removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) this.children.splice(idx, 1);
            child.parentElement = null;
            return child;
          },
          remove() {
            if (this.parentElement) {
              this.parentElement.removeChild(this);
            }
          },
          querySelector() { return null; },
          querySelectorAll() { return []; },
          setAttribute(name, val) { this[name] = val; },
          getAttribute(name) { return this[name] || null; }
        };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    }
  });

  vm.runInContext(presentationSource, context);
  vm.runInContext(labScenesSource, context);
  return context;
}

test('Onmyoji asset files exist on disk with valid dimensions', () => {
  const p1 = 'public/assets/Onmyoji-1.png';
  const p2 = 'public/assets/Onmyoji-2.png';
  const avatar = 'public/photo/Onmyoji.webp';
  const css = 'public/onmyoji-presentation.css';

  assert.ok(fs.existsSync(p1), 'Onmyoji-1.png must exist');
  assert.ok(fs.existsSync(p2), 'Onmyoji-2.png must exist');
  assert.ok(fs.existsSync(avatar), 'Onmyoji.webp must exist');
  assert.ok(fs.existsSync(css), 'onmyoji-presentation.css must exist');

  const cssContent = fs.readFileSync(css, 'utf8');
  assert.ok(cssContent.includes('@keyframes talismanStage1Appear'), 'Must contain talismanStage1Appear');
  assert.ok(cssContent.includes('@keyframes talismanStage2Slam'), 'Must contain talismanStage2Slam');
  assert.ok(cssContent.includes('@keyframes talismanStage3ShrinkIntoBoss'), 'Must contain talismanStage3ShrinkIntoBoss');
  assert.ok(cssContent.includes('@keyframes sealStage4Flash'), 'Must contain sealStage4Flash');
  assert.ok(cssContent.includes('@keyframes talismanSpiralGather'), 'Must contain talismanSpiralGather');
  assert.ok(cssContent.includes('@keyframes megaExplosionNova'), 'Must contain megaExplosionNova');
});

test('buildOnmyojiPresentationPlan parses basic attack correctly', () => {
  const context = setupOnmyojiContext();
  const step = {
    sourceRole: 'onmyoji',
    actionId: 'basic',
    finalDamage: 10,
    hpSnapshotBefore: {
      monster: { hp: 500, maxHp: 500, talismans: ['corrode'] },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    },
    hpSnapshot: {
      monster: { hp: 490, maxHp: 500, talismans: ['corrode'] },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    }
  };

  const plan = context.buildOnmyojiPresentationPlan(step);
  assert.equal(plan.action, 'basic');
  assert.equal(plan.finalDamage, 10);
  assert.equal(plan.countBefore, 1);
  assert.equal(plan.countAfter, 1);
});

test('buildOnmyojiPresentationPlan resolves 5-element talismans correctly', () => {
  const context = setupOnmyojiContext();
  const talismanTypes = ['blind', 'seal', 'corrode', 'confuse', 'drain'];
  const expectedNames = {
    blind: '障目符',
    seal: '封勁符',
    corrode: '蝕體符',
    confuse: '惑心符',
    drain: '抽髓符'
  };
  const expectedColors = {
    blind: '#a855f7',
    seal: '#3b82f6',
    corrode: '#22c55e',
    confuse: '#ec4899',
    drain: '#ef4444'
  };

  for (const type of talismanTypes) {
    const step = {
      sourceRole: 'onmyoji',
      actionId: 'onm_talisman',
      rolledTalisman: type,
      finalDamage: type === 'drain' ? 20 : 0,
      hpSnapshotBefore: {
        monster: { hp: 1000, maxHp: 1000, talismans: [] },
        players: [{ id: 'p0', hp: 70, maxHp: 70 }]
      },
      hpSnapshot: {
        monster: { hp: type === 'drain' ? 980 : 1000, maxHp: 1000, talismans: [type] },
        players: [{ id: 'p0', hp: 70, maxHp: 70 }]
      }
    };

    const plan = context.buildOnmyojiPresentationPlan(step);
    assert.equal(plan.action, 'onm_talisman');
    assert.equal(plan.talisman.id, type);
    assert.equal(plan.talisman.name, expectedNames[type]);
    assert.equal(plan.talisman.color, expectedColors[type]);
    assert.equal(plan.countBefore, 0);
    assert.equal(plan.countAfter, 1);
    assert.equal(plan.isRepeat, false);
  }
});

test('buildOnmyojiPresentationPlan identifies repeat talisman trigger', () => {
  const context = setupOnmyojiContext();
  const step = {
    sourceRole: 'onmyoji',
    actionId: 'onm_talisman',
    rolledTalisman: 'drain',
    finalDamage: 40,
    hpSnapshotBefore: {
      monster: { hp: 980, maxHp: 1000, talismans: ['drain'] },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    },
    hpSnapshot: {
      monster: { hp: 940, maxHp: 1000, talismans: ['drain', 'drain'] },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    }
  };

  const plan = context.buildOnmyojiPresentationPlan(step);
  assert.equal(plan.action, 'onm_talisman');
  assert.equal(plan.isRepeat, true, 'Repeat flag must be true when talisman of same type was already attached');
  assert.equal(plan.countBefore, 1);
  assert.equal(plan.countAfter, 2);
  assert.equal(plan.finalDamage, 40);
});

test('buildOnmyojiPresentationPlan handles detonate sequence with 10 max cap', () => {
  const context = setupOnmyojiContext();
  const step = {
    sourceRole: 'onmyoji',
    actionId: 'onm_detonate',
    finalDamage: 40,
    hpSnapshotBefore: {
      monster: {
        hp: 500,
        maxHp: 500,
        talismans: ['blind', 'seal', 'corrode', 'confuse', 'drain', 'blind', 'seal', 'corrode', 'confuse', 'drain', 'drain', 'drain']
      },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    },
    hpSnapshot: {
      monster: { hp: 460, maxHp: 500, talismans: [] },
      players: [{ id: 'p0', hp: 70, maxHp: 70 }]
    }
  };

  const plan = context.buildOnmyojiPresentationPlan(step);
  assert.equal(plan.action, 'onm_detonate');
  assert.equal(plan.countBefore, 10, 'Detonate count must be capped at 10');
  assert.equal(plan.countAfter, 0, 'Detonate consumes all talismans');
  assert.equal(plan.finalDamage, 40);
});

test('All 9 ONMYOJI_LAB_SCENES are valid and executable by plan builder', () => {
  const context = setupOnmyojiContext();
  const scenes = context.ONMYOJI_LAB_SCENES;
  assert.ok(scenes, 'ONMYOJI_LAB_SCENES must exist');

  const expectedSceneIds = [
    'onm_basic',
    'onm_talisman_blind',
    'onm_talisman_seal',
    'onm_talisman_corrode',
    'onm_talisman_confuse',
    'onm_talisman_drain',
    'onm_detonate_empty',
    'onm_detonate_5',
    'onm_detonate_10_max'
  ];

  assert.equal(Object.keys(scenes).length, 9, 'Should have exactly 9 lab scenes');

  for (const sceneId of expectedSceneIds) {
    const scene = scenes[sceneId];
    assert.ok(scene, `Scene ${sceneId} must exist`);
    assert.equal(scene.role, 'onmyoji');
    assert.ok(scene.label, `Scene ${sceneId} must have a label`);
    assert.ok(scene.expected, `Scene ${sceneId} must have expected text`);
    assert.ok(Array.isArray(scene.steps), `Scene ${sceneId} must have steps array`);
    assert.ok(scene.steps.length > 0, `Scene ${sceneId} must have at least one step`);

    for (const step of scene.steps) {
      assert.equal(step.sourceRole, 'onmyoji');
      const plan = context.buildOnmyojiPresentationPlan(step);
      assert.ok(plan.action, `Step in ${sceneId} must produce a valid action`);
      assert.ok(['basic', 'onm_talisman', 'onm_detonate'].includes(plan.action));
      assert.ok(typeof plan.finalDamage === 'number');
    }
  }
});

test('OnmyojiPresentationEngine snapshot sync handles talisman count badges', () => {
  const context = setupOnmyojiContext();
  const Engine = context.OnmyojiPresentationEngine;
  const mockStage = context.document.createElement('div');

  const engine = new Engine(mockStage, { speed: 1, reduced: false });
  assert.ok(engine, 'Engine must instantiate');

  // Sync with 3 talismans
  engine.syncSnapshot({
    monster: {
      hp: 800,
      maxHp: 1000,
      talismans: ['blind', 'seal', 'corrode']
    }
  });

  assert.equal(engine.attachedTalismans.length, 3);
  assert.deepEqual(engine.attachedTalismans.map(t => t.typeId), ['blind', 'seal', 'corrode']);

  // Sync with empty talismans after detonate
  engine.syncSnapshot({
    monster: {
      hp: 750,
      maxHp: 1000,
      talismans: []
    }
  });

  assert.equal(engine.attachedTalismans.length, 0);
  engine.dispose();
  assert.equal(engine.disposed, true);
});
