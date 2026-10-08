// Percentages are stored as integers (20 means 20%). Each battle rolls once.
export function rollBonusResistance(floor, random = Math.random) {
  // Roll 0, 5, ... 50. Floor 1 is uniform; deeper floors bias toward high values.
  const exponent = 1 / (1 + Math.max(0, floor - 1) / 10);
  return 5 * Math.min(10, Math.floor(11 * random() ** exponent));
}

export function createBossResistances(monster, floor, random = Math.random) {
  const baseResistances = { ...monster.baseResistances };
  const bonusResistances = {};
  const resistances = {};
  for (const type of ['physical', 'magic', 'effect']) {
    bonusResistances[type] = rollBonusResistance(floor, random);
    resistances[type] = (baseResistances[type] || 0) + bonusResistances[type];
  }
  return { baseResistances, bonusResistances, resistances };
}

export function getBossResistance(monster, type) {
  // Compatibility for older saved monsters and development fixtures.
  const legacy = (type === 'physical' && monster?.resistance === 'phys') ||
    (type === 'magic' && monster?.resistance === 'mag') ? 70 : 0;
  return Math.max(0, Math.min(100, monster?.resistances?.[type] ?? legacy));
}
