import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Optional isolated PostgreSQL runner; never connects to Supabase or reads .env.
test('isolated PostgreSQL migration: atomic admission, overwrite, terminal deletion, duplicate finish and stale writes',
  { skip: !process.env.DUNGEON_PGLITE_PATH }, async () => {
    const { PGlite } = await import(pathToFileURL(process.env.DUNGEON_PGLITE_PATH).href);
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE public.game_players(id uuid PRIMARY KEY, display_name text);`);
      for (const file of ['20261028103957_adventure_checkpoints.sql', '20261028121923_adventure_directory.sql']) {
        await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
      }
      const call = async (action, payload) => (await db.query('SELECT public.game_adventure($1,$2::jsonb) AS r', [action, JSON.stringify(payload)])).rows[0].r;
      const [leader, joiner] = [randomUUID(), randomUUID()];
      await db.query('INSERT INTO public.game_players VALUES ($1,$2),($3,$4)', [leader, 'Leader', joiner, 'Joiner']);
      // Reproduce the currently deployed legacy RPC: a valid lease still fails
      // its first admission save because members are checked but never inserted.
      const legacyId = randomUUID(), legacyOwner = randomUUID();
      const legacy = { id: legacyId, owner: legacyOwner, generation: 1, version: 0, leaderId: leader,
        members: [leader], key: randomUUID(), snapshot: { adventureId: legacyId, schemaVersion: 1,
          checkpointState: 'CHOOSING_ROUTE', data: { floor: 1, memberIds: [leader], players: { [leader]: {} } } } };
      assert.equal((await call('save', legacy)).save_version, 1);
      const admission = { ...legacy, version: 1, key: randomUUID(), members: [leader, joiner],
        snapshot: { ...legacy.snapshot, data: { floor: 2, memberIds: [leader, joiner], players: { [leader]: {}, [joiner]: {} } } } };
      assert.equal((await call('save', admission)).error, 'CONFLICT');
      const authority = (await db.query('SELECT lease_owner,lease_generation,save_version,lease_until>clock_timestamp() AS valid FROM public.game_adventures WHERE id=$1', [legacyId])).rows[0];
      assert.deepEqual(authority, { lease_owner: legacyOwner, lease_generation: 1, save_version: 1, valid: true });
      await db.exec(readFileSync(new URL('../supabase/migrations/20261029092830_adventure_lifecycle_join.sql', import.meta.url), 'utf8'));
      assert.equal((await call('save', admission)).save_version, 2);
      for (const status of ['completed', 'failed', 'abandoned']) {
        const id = randomUUID(), owner = randomUUID();
        let x = { id, owner, generation: 1, version: 0, leaderId: leader, members: [leader], key: randomUUID(),
          snapshot: { adventureId: id, schemaVersion: 1, checkpointState: 'CHOOSING_ROUTE', data: { floor: 1, memberIds: [leader], players: { [leader]: { role: 'warrior' } } } } };
        const first = await call('save', x); assert.equal(first.save_version, 1);
        x = { ...x, version: 1, key: randomUUID(), members: [leader, joiner], snapshot: structuredClone(x.snapshot) };
        x.snapshot.data.floor = 2; x.snapshot.data.memberIds.push(joiner); x.snapshot.data.players[joiner] = { role: 'mage' };
        const next = await call('save', x); assert.equal(next.save_version, 2); assert.equal(next.members.length, 2);
        assert.equal((await call('save', x)).save_version, 2);
        const loaded = await call('load', { id, playerId: joiner }); assert.equal(loaded.checkpoint.data.players[joiner].role, 'mage');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM public.game_adventures WHERE id=$1', [id])).rows[0].n, 1);
        await db.query("UPDATE public.game_adventures SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
        assert.equal((await call('finish', { ...x, version: 2, status })).error, 'CONFLICT');
        const claimed = await call('claim', { id, playerId: leader, owner: randomUUID() });
        const ending = { ...x, owner: claimed.lease_owner, generation: claimed.lease_generation, version: 2, status };
        assert.equal((await call('finish', { ...ending, version: 1 })).error, 'CONFLICT');
        const terminal = await call('finish', ending); assert.equal(terminal.status, status);
        assert.equal((await call('finish', ending)).status, status);
        assert.equal((await call('save', x)).error, 'ENDED');
        assert.equal((await call('load', { id, playerId: joiner })).error, 'ENDED');
        const stored = (await db.query('SELECT checkpoint,checkpoint_key,checkpoint_floor,save_version FROM public.game_adventures WHERE id=$1', [id])).rows[0];
        assert.deepEqual(stored, { checkpoint: null, checkpoint_key: null, checkpoint_floor: null, save_version: 2 });
        assert.equal((await db.query('SELECT count(*)::int AS n FROM public.game_adventure_members WHERE adventure_id=$1', [id])).rows[0].n, 0);
      }
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.game_players')).rows[0].n, 2);
      const id = randomUUID(), owner = randomUUID();
      const late = { id, owner, generation: 1, version: 0, leaderId: leader, members: [leader] };
      // Ending before the first checkpoint creates only a terminal tombstone.
      await call('finish', { ...late, status: 'failed' });
      assert.equal((await call('finish', { ...late, status: 'failed' })).status, 'failed');
    } finally { await db.close(); }
  });
