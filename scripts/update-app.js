import fs from 'node:fs';

let s = fs.readFileSync('public/app.js', 'utf8');

// 1. variables
if (!s.includes('let chestPresentationController')) {
  s = s.replace(
    /let trapStartedId = null;[\r\n]+/,
    'let trapStartedId = null;\r\nlet chestPresentationController = null;\r\nlet chestDisplay = null;\r\nlet chestStartedId = null;\r\nlet chestRewardCompletedId = null;\r\n'
  );
}

// 2. SFX cases
if (!s.includes("case 'chest_open':")) {
  const sfxCases = `        case 'chest_open': {
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(420, t);
          osc1.frequency.exponentialRampToValueAtTime(180, t + 0.06);
          gain1.gain.setValueAtTime(0.25, t);
          gain1.gain.exponentialRampToValueAtTime(0.005, t + 0.06);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(t);
          osc1.stop(t + 0.06);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(160, t + 0.04);
          osc2.frequency.exponentialRampToValueAtTime(80, t + 0.28);
          gain2.gain.setValueAtTime(0.28, t + 0.04);
          gain2.gain.exponentialRampToValueAtTime(0.005, t + 0.28);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(t + 0.04);
          osc2.stop(t + 0.28);
          break;
        }
        case 'chest_reveal': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(520, t + 0.3);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.005, t + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.35);
          break;
        }
        case 'reward_common': {
          const notes = [659.25, 880];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.1);
            gain.gain.setValueAtTime(0.22, t + idx * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.1 + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t + idx * 0.1);
            osc.stop(t + idx * 0.1 + 0.3);
          });
          break;
        }
        case 'reward_rare': {
          const notes = [587.33, 739.99, 880, 1174.66];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + idx * 0.09);
            gain.gain.setValueAtTime(0.26, t + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.09 + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t + idx * 0.09);
            osc.stop(t + idx * 0.09 + 0.4);
          });
          break;
        }\r\n`;
  s = s.replace("case 'chest_gold':", sfxCases + "        case 'chest_gold':");
}

// 3. Elements
if (!s.includes('chestDiscoverySection:')) {
  const elStr = `  chestDiscoverySection: document.getElementById('chestDiscoverySection'),
  chestDiscoveryStory: document.getElementById('chestDiscoveryStory'),
  chestInteractionArea: document.getElementById('chestInteractionArea'),
  btnOpenChest: document.getElementById('btnOpenChest'),
  chestPresentationOverlay: document.getElementById('chestPresentationOverlay'),
  presentationChestVisual: document.getElementById('presentationChestVisual'),
  presentationRewardContent: document.getElementById('presentationRewardContent'),
  presentationRewardRarity: document.getElementById('presentationRewardRarity'),
  presentationRewardTitle: document.getElementById('presentationRewardTitle'),
  presentationRewardDesc: document.getElementById('presentationRewardDesc'),
  presentationRewardMeta: document.getElementById('presentationRewardMeta'),\r\n`;
  s = s.replace(
    /trapDiscoveryStory: document\.getElementById\('trapDiscoveryStory'\),[\r\n]+/,
    "trapDiscoveryStory: document.getElementById('trapDiscoveryStory'),\r\n" + elStr
  );
}

// 4. room:update state projection
s = s.replace(
  'roomState = projectTrapDisplayState(state);',
  "roomState = typeof projectChestDisplayState === 'function' ? projectChestDisplayState(projectTrapDisplayState(state)) : projectTrapDisplayState(state);"
);

// 5. renderApp controller abort & cleanup
const abortCheck = `  if (chestPresentationController && (roomState.state !== 'EVENT' ||
      roomState.currentEvent?.type !== 'treasure' ||
      roomState.currentEvent.presentationId !== chestPresentationController.presentationId)) {
    chestPresentationController.abort();
  }
  if (roomState.state !== 'EVENT' || roomState.currentEvent?.type !== 'treasure') {
    chestDisplay = null;
    chestStartedId = null;
    chestRewardCompletedId = null;
  }\r\n`;
if (!s.includes('chestPresentationController.abort()')) {
  s = s.replace(
    /trapDisplay = null;\s*trapStartedId = null;\s*\}/,
    `trapDisplay = null;\r\n    trapStartedId = null;\r\n  }\r\n\r\n${abortCheck}`
  );
}

// 6. renderPendingDropModal gating
if (!s.includes('chestRewardCompletedId !== roomState.currentEvent.presentationId')) {
  const modalGate = `  // Phase 4: Gate equip modal until chest presentation and reward reveal have settled\r\n  if (roomState?.state === 'EVENT' && roomState.currentEvent?.type === 'treasure') {\r\n    if (chestRewardCompletedId !== roomState.currentEvent.presentationId) {\r\n      elements.equipDropModal.classList.add('hidden');\r\n      return;\r\n    }\r\n  }\r\n\r\n  if (!dropInfo || !me || dropInfo.ownerId !== myId) {`;
  s = s.replace('if (!dropInfo || !me || dropInfo.ownerId !== myId) {', modalGate);
}

// 7. Remove old playChestPresentation and update renderEvent
const oldChestPres = s.match(/async function playChestPresentation\(ev\)[\s\S]*?\n\}/);
if (oldChestPres) {
  s = s.replace(oldChestPres[0], '// Phase 4 chest presentation is now owned solely by chest.js');
}

const oldRenderEvent = /elements\.eventCardBox\.classList\.toggle\('hidden', ev\.type === 'trap'\);[\s\S]*?void playTrapPresentation\(ev\);[\s\S]*?return;[\s\S]*?\}/;

const newRenderEvent = `const isTrap = ev.type === 'trap';
  const isTreasure = ev.type === 'treasure';

  elements.eventCardBox.classList.toggle('hidden', isTrap || isTreasure);
  elements.trapDiscoverySection.classList.toggle('hidden', !isTrap);
  if (elements.chestDiscoverySection) {
    elements.chestDiscoverySection.classList.toggle('hidden', !isTreasure);
  }

  if (isTrap) {
    if (trapStartedId !== ev.presentationId) {
      trapStartedId = ev.presentationId;
      void playTrapPresentation(ev);
    }
    return;
  }

  if (isTreasure) {
    if (chestStartedId !== ev.presentationId) {
      chestStartedId = ev.presentationId;
      void playChestPresentation(ev);
    }
    return;
  }`;

s = s.replace(oldRenderEvent, newRenderEvent);

fs.writeFileSync('public/app.js', s, 'utf8');
console.log('Successfully updated public/app.js');
