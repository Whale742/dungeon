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

## Phase 1

Changed: `server.js`, `public/app.js`, `game/DevAccess.js`, adjacent tests,
`server.test.js`, test discovery in `package.json`.
`/dev` serves the same index; server-owned candidate rooms are solo and excluded
from public lists, all joins are rejected. Grants use private WeakMaps and exact
socket/room identity; disconnect/leave/create revokes access. The route flag grants
no mutation rights. Token is accepted only by a dedicated socket event after start,
hashed before timing-safe comparison, never placed in public state or persistent
client storage. Five authorization attempts per connection per minute.

Enable with `DEV_TOOLS_ENABLED=true` and `DEV_ACCESS_TOKEN` of at least 16 characters
in the server environment. Both are required; disabled `/dev` returns 404.
Never put the token in a URL. Production rooms cannot obtain a Dev grant.

Validation: 7 unit/engine tests and 2 real HTTP/Socket.IO integration tests passed.
Integration uses temporary in-memory sockets, ephemeral ports and child processes;
cloud credentials are blanked, no Supabase access or writes. Covered identical HTML,
public list exclusion, rejected joins, pre-start/wrong-token/production authorization,
reconnected socket without membership and disabled-mode normal adventure start.
Limitations: mutations/panel arrive in later phases; browser animation QA pending.

## Phase 2

Changed: `game/DevController.js`, adjacent tests, socket handlers in `server.js`,
integration tests. Commands are explicit schemas (`gold.set`, `gold.add` initially).
Exact room and full server context/revision must match. Each Dev room has one
synchronous transaction lock: JavaScript run-to-completion prevents normal game
callbacks interleaving; nested broadcasts are withheld until invariant validation.
Failed mutations restore the captured fields before any broadcast. No timers,
ACK sets or game phase are modified by commands. Dedup retains up to 2048 request
IDs for the room lifetime, then rejects new IDs rather than forgetting old ones.
Reused IDs with changed payloads are rejected. Dev audit (100 entries with before/
after snapshots) is private and separate from `Room.logs`; no token is recorded.

Validation: 12 tests passed including duplicate/stale/foreign/unauthorized requests,
invalid schemas, all unsafe phases, vote conflicts, transaction lock, invariant
rollback, audit separation and live socket rejection. Original 4 regressions pass.
Limits: logs are memory-only; room lifetime cap requires a new room after 2048
requests. Authorization guessing is limited per connection, not a global IP quota.

## Phase 3

Changed: `public/dev-tools.js`, `public/dev-tools.css`, one lazy import in
`public/app.js`, DevController and adjacent tests. Same game HTML and engine.
Right drawer appears only after start; password input clears immediately on submit
and close. No token URL/query/storage. Six sections expose authoritative overview,
gold set/add, catalog grant, original bag/squad equip, bounded living HP, tracked
one-turn shield addition, four existing DOT apply/clear operations, read-only
cooldowns/resources and private audit. All mutations require safe route or battle
selection windows; DOT/shield controls additionally require battle. Drawer keyboard
events do not reach game shortcuts. Restart revokes the grant.

Validation: 14 automated tests passed, including equipment swap (no repeated stats),
full-bag refusal, HP bounds, tracked shield and DOT settlement into next round.
Browser QA passed: original recruit/create/class/start/prep/route screens, Dev hidden
before start, in-memory authorization, locked prologue controls, route-time gold
update, catalog grant and original equip from squad. Drawer screenshot inspected.
Limits: only the four legacy DOTs can be cleared; complex effects/resources remain
read-only. Personal grants require one free squad transit slot. Event/Boss controls
are next phase. Full role/Boss animation matrix remains outstanding.

Phase 3 follow-up: failed transactions restore enemy identity through `setEnemies`,
so the primary enemy remains the same object as its entry in the restored formation.
Added regression assertion; all 14 tests passed again.
