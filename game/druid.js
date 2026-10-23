import { resolveStats } from './stats.js';

export function rollDruidForm(player, random = Math.random) {
  const forms = (player.equips || []).some(e => e.id === 'dru_beast')
    ? ['werewolf', 'treant', 'bear'] : ['werewolf', 'treant'];
  return forms[Math.min(forms.length - 1, Math.floor(random() * forms.length))];
}
export function enterBearForm(player, equipmentMultiplier = 1) {
  restoreBearForm(player);
  const added = Math.max(0, Math.round(2 * resolveStats(player, equipmentMultiplier).DEF));
  player.bearMaxHpAdded = added;
  player.maxHp += added;
  // Same temporary maximum-HP delta convention as p8RefreshEquipment.
  if (player.hp > 0) player.hp = Math.min(player.maxHp, player.hp + added);
  player.druidForm = 'bear';
  player.druidFormTurns = 2;
}
export function restoreBearForm(player) {
  const added = player.bearMaxHpAdded || 0;
  if (!added) return;
  player.bearMaxHpAdded = 0;
  player.maxHp = Math.max(1, player.maxHp - added);
  if (player.hp > 0) player.hp = Math.max(1, Math.min(player.maxHp, player.hp - added));
}
