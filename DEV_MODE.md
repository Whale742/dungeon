# Developer mode implementation record

Baseline: `03056bc477732f910164569927af78d5dc30f849` (`main`). Branch: `codex/dev-mode`.
Phase 6 is separate work and excluded.

## Phase 0

Authoritative state is `Room`: players/memberIds/leaderId, state/selectionState,
floor/currentHex/hexMap, enemies, battleRound, currentEvent/currentTransition,
currentVictory/pendingDrop, gold/squadInventory and player bags/equipment.
`server.js` maps sockets to rooms; clients receive `getClientState()` via `room:update`.
Never accept room objects or arbitrary property paths from clients.

Existing operation boundaries:

- `startAdventure` → PROLOGUE ACK → preparation shop → `startRouteSelection`.
- Route narrative ACK unlocks voting; the vote completion callback waits 500 ms.
  `tallyRouteVotes` → `resolveRouteChoice` → TRANSITION (2 s `setTimer`) → event/battle.
- `handleBattleEvent`/`buildEncounterFormation`/`createEnemyInstance` own enemy creation
  and leader/phase8 initialization. `executeRoundStart` may skip an empty presentation.
- `publishCombatQueue` enters RESOLVING; presentation ID + round ACK gate
  `finishTurnPresentation`, victory or next round. Selection has a separate readiness ACK.
  `checkTurnCompletion` has a 300 ms deferred resolution callback.
- Victory rewards are committed before BATTLE_VICTORY; victory ACK gates continuation.
  Chest/trap/equipment presentations have their own IDs/ACK barriers. Deferred equipment
  continuation and abyss dialogue callbacks also exist; do not cancel or bypass them.
- `setTimer`/`clearTimer`/`togglePause` own turn/transition deadlines and saved callback.
  `pendingPresentationAcks`, `pendingSelectionAcks`, `isWaitingForSelectionReady`,
  narration and selectionState are independent locks; phase alone is insufficient.
- `equipItemFromBag`/`equipItemFromSquad` and unequip operations own slot validation,
  apply/remove stats, `syncPlayerEquips` and `p8RefreshEquipment`. Dev must reuse them.

Initial Dev mutation policy: route selection after narration ACK and before any vote;
combat SELECTING after readiness ACK and before any action/lock; no pause, arena,
pending reward, presentation ACK or active deferred flow. Other phases are read only.
Encounter reservation is consumed only by the next legal route settlement.

Validation: `node --test game/*.test.js`, `node --check server.js`,
`node --check public/app.js`. Baseline 4 tests passed: solo/prologue/prep/route,
combat/stale ACK/next round, victory/reward/exploration, chest/equipment swap/removal.
No engine or balance files changed. `npm test` script repaired to discover adjacent
tests; host npm executable is broken, so commands use Node directly.
Limitation: these are authoritative engine regressions, not browser animation QA.
