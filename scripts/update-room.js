import fs from 'fs';

let code = fs.readFileSync('game/Room.js', 'utf8');
const normalize = s => s.replace(/\r\n/g, '\n');
code = normalize(code);

// 1. Remove the premature return when monster.hp <= 0 and wrap monster counter attack in else
const targetKillBlock = normalize(
`    // 5. 判定怪物擊殺與勝負判定
    if (monster.hp <= 0) {
      narratives.push({
        type: 'kill',
        name: monster.name,
        text: \`💀 **\${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！\`
      });
      const narrationDuration = Math.max(5, narratives.length * 2.2 + 1.2);
      log.forEach(l => this.addLog(l.text, l.type));
      this.io.to(this.code).emit('battle:visual_events', {
        events: visualEvents,
        narratives: narratives,
        round: this.battleRound,
        monsterKilled: true,
        duration: narrationDuration
      });
      this.broadcastState();

      this.setTimer(Math.ceil(narrationDuration), () => {
        const livingPlayers = Object.values(this.players).filter(p => p.hp > 0);
        if (livingPlayers.length === 0) {
          log.push({ text: \`⚠️ **敵我雙方同時血量歸零！優先結算我方血量，判定為挑戰失敗！**\`, type: 'damage' });
          this.handleGameOver();
          return;
        }
        this.handleMonsterVictory(monster, log, visualEvents, true);
      });
      return;
    }

    // 6. 怪物反擊結算`
);

const replaceKillBlock = normalize(
`    // 5. 判定怪物擊殺與勝負判定
    if (monster.hp <= 0) {
      narratives.push({
        type: 'kill',
        name: monster.name,
        text: \`💀 **\${monster.name}** 發出最後一聲悲鳴，龐大的身軀轟然倒下！冒險小隊取得勝利！\`
      });
      // Phase 5.1: 怪物已死亡，嚴禁提前 return 或跳過 presentation_queue！
      // 致命一擊與擊殺演出必須由客戶端依序播放完畢並發送 ACK，再由 finishTurnPresentation() 統一過渡至勝利階段。
    } else {
    // 6. 怪物反擊結算 (僅在怪物存活時結算)`
);

if (!code.includes(targetKillBlock)) {
  console.error('targetKillBlock not found');
  process.exit(1);
}
code = code.replace(targetKillBlock, replaceKillBlock);

// Also need to close the else block for monster counter-attack right before overheal cleanup:
const targetOverheal = normalize(
`    // Boss 攻擊完成並處理所有結算後，清除 Temporary Overheal
    const anyOverhealCleared = this.clearTemporaryOverheal();`
);

const replaceOverheal = normalize(
`    } // 結束怪物存活時的反擊結算 (else 區塊)

    // Boss 攻擊完成並處理所有結算後，清除 Temporary Overheal
    const anyOverhealCleared = this.clearTemporaryOverheal();`
);

if (!code.includes(targetOverheal)) {
  console.error('targetOverheal not found');
  process.exit(1);
}
code = code.replace(targetOverheal, replaceOverheal);

// 2. Enhance boss_action push
const targetBossPush = normalize(
`      presentationQueue.push({
        type: 'boss_action',
        monsterName: monster.name,
        monsterAvatar: monster.avatar,
        isUlt: isUltTurn,
        ultName: monster.ultName,
        narrative: isUltTurn ? monsterTemplate.ult : monsterTemplate.normal,
        detail: log[log.length - 1]?.text || '',
        hits: monsterHits,
        visualEvents: [{
          type: 'monster_attack',
          isUlt: isUltTurn,
          ultName: monster.ultName,
          shieldMod: shieldDamageMod,
          hits: monsterHits
        }],
        hpSnapshot: this.getHpSnapshot()
      });`
);

const replaceBossPush = normalize(
`      const firstHit = monsterHits[0] || {};
      const primaryTargetId = firstHit.targetId;
      const primaryTarget = primaryTargetId ? this.players[primaryTargetId] : null;

      presentationQueue.push({
        type: 'boss_action',
        monsterName: monster.name,
        monsterAvatar: monster.avatar,
        isUlt: isUltTurn,
        ultName: monster.ultName,
        skillName: isUltTurn ? monster.ultName : '猛烈反擊',
        narrative: isUltTurn ? monsterTemplate.ult : monsterTemplate.normal,
        detail: log[log.length - 1]?.text || '',
        hits: monsterHits,
        targetId: primaryTargetId,
        targetName: primaryTarget ? primaryTarget.name : '冒險者',
        targetRole: primaryTarget ? primaryTarget.role : 'warrior',
        finalDamage: firstHit.value || 0,
        damageDealt: firstHit.value || 0,
        tempHpDamage: firstHit.tempAbsorbed || 0,
        hpDamage: firstHit.hpDmg || firstHit.value || 0,
        isLethal: firstHit.isDead || false,
        targetHpBefore: firstHit.hpBefore !== undefined ? firstHit.hpBefore : (primaryTarget ? primaryTarget.hp : 0),
        targetHpAfter: firstHit.hpAfter !== undefined ? firstHit.hpAfter : (primaryTarget ? primaryTarget.hp : 0),
        targetMaxHp: firstHit.maxHp !== undefined ? firstHit.maxHp : (primaryTarget ? primaryTarget.maxHp : 100),
        actorHpBefore: monster.hp,
        actorHpAfter: monster.hp,
        actorMaxHp: monster.maxHp,
        visualEvents: [{
          type: 'monster_attack',
          isUlt: isUltTurn,
          ultName: monster.ultName,
          shieldMod: shieldDamageMod,
          hits: monsterHits
        }],
        hpSnapshot: this.getHpSnapshot()
      });`
);

if (!code.includes(targetBossPush)) {
  console.error('targetBossPush not found');
  process.exit(1);
}
code = code.replace(targetBossPush, replaceBossPush);

fs.writeFileSync('game/Room.js', code.replace(/\n/g, '\r\n'), 'utf8');
console.log('Room.js successfully updated!');
