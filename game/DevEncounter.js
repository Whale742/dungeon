import { ENCOUNTERS, ABYSS_BOSSES, SPECIAL_ELITES } from './constants.js';
import { SPECIAL_EVENT_COPY } from './special-event-content.js';

export const DEV_ENEMIES = [
  ...Object.values(SPECIAL_ELITES).map(template => ({ id: template.id, name: template.name, template, tier: 'ELITE' })),
  ...ENCOUNTERS.map((template, i) => ({ id: `elite_${i}`, name: template.name, template, tier: 'ELITE' })),
  ...Object.values(ABYSS_BOSSES).filter(t => t.role !== 'augur').map(template => ({ id: template.id, name: template.name, template, tier: 'ABYSS' }))
];
export const DEV_EVENTS = ['battle', 'elite', 'shop', 'black_market', 'chest', 'mimic_chest', 'ALTAR', 'GAMBLE', 'REFORGE', 'WANDERING_MERCHANT'];

export function validEncounter(p) {
  if (!DEV_EVENTS.includes(p.type) || typeof p.weakened !== 'boolean' || typeof p.enemyId !== 'string') return false;
  if (p.type === 'elite') return DEV_ENEMIES.some(e => e.id === p.enemyId);
  return p.enemyId === '' && !p.weakened;
}

// Only the existing legal route settlement calls this. No event is replaced mid-flow.
export function consumeEncounter(room, route) {
  if (!room.isDev || !room.devEncounter) return null;
  if (room.state !== 'CHOOSING_ROUTE' || room.isNarrating ||
      !room.currentRoutes?.some(r => r.id === route?.id)) throw new Error('Dev encounter requires a legal route settlement');
  const reserved = room.devEncounter;
  if (!validEncounter(reserved)) throw new Error('Invalid server encounter reservation');
  room.devEncounter = null;
  return reserved;
}

export function encounterBattleOptions(room, reservation, col) {
  if (reservation.type === 'battle') return { col, enemies: room.buildEncounterFormation(1) };
  const selected = DEV_ENEMIES.find(e => e.id === reservation.enemyId);
  const encounterStory = selected.id === 'treasure_mimic'
    ? room.studioContent.text('event.chest.mimic', SPECIAL_EVENT_COPY.ambush)
    : selected.id === 'shady_merchant'
      ? room.studioContent.text('event.shop.shady.leave', SPECIAL_EVENT_COPY.merchantLeave) : null;
  return { col, specialElite: { ...selected.template, tier: selected.tier },
    ...(encounterStory ? { encounterStory } : {}),
    ...(selected.tier === 'ABYSS' ? { abyssBoss: selected.template } : {}) };
}
