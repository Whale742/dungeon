import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import localPaths from '../public/js/shared/local-paths.cjs';
import { catalog, assetKeyForPath } from '../studio/catalog.js';
import { getMigrationStatus } from '../studio/migration.js';
import { normalizeAvatar } from './avatar.js';
import express from 'express';
import { once } from 'node:events';
import { createStudioRouter } from '../studio/router.js';

test('Saved local URLs retain their Studio IDs and resolve to existing canonical files', () => {
  for (const [old, current] of Object.entries(localPaths.aliases)) {
    assert.ok(fs.existsSync(new URL('../public' + current, import.meta.url)), current);
    assert.equal(localPaths.legacy(current), old);
    if (!current.startsWith('/assets/')) continue;
    const originalKey = 'local.' + createHash('sha256').update(old).digest('hex').slice(0, 20);
    assert.equal(assetKeyForPath(current), originalKey);
    const asset = catalog.game_assets.find(a => a.asset_key === originalKey);
    assert.equal(asset?.local_path, current, old);
  }
});

test('Migration status can read pre-reorganization cloud local paths without a data migration', async () => {
  const cloud = { rows: async table => table === 'game_assets' ? [
    { asset_key: 'local.saved', source_type: 'local', local_path: '/photo/Warrior.webp' },
    { asset_key: 'local.audio', source_type: 'local', local_path: '/sound/bgm-normal.mp3' }
  ] : [] };
  const result = await getMigrationStatus({ cloud });
  assert.equal(result.missingFilesCount, 0);
  assert.ok(result.estimatedTotalBytes > 0);
});

test('Official saved avatar choices remain accepted without expanding arbitrary local URL access', () => {
  assert.equal(normalizeAvatar('/photo/Warrior.webp'), '/photo/Warrior.webp');
  assert.equal(normalizeAvatar('/assets/characters/portraits/Warrior.webp'), '/assets/characters/portraits/Warrior.webp');
  assert.equal(normalizeAvatar('/assets/enemies/elites/奇怪的寶箱.webp'), null);
  assert.equal(normalizeAvatar('/photo/not-an-official-portrait.webp'), null);
});

test('Studio accepts existing local registrations with either saved or current path without writing cloud data', async t => {
  const current = catalog.game_assets.find(a => a.local_path === '/assets/characters/portraits/Warrior.webp');
  const saved = { ...current, local_path: '/photo/Warrior.webp' };
  const cloud = { rows: async () => [saved], request: async () => { throw Error('Unexpected cloud write'); } };
  const app = express();
  app.use('/api/studio', createStudioRouter({ env: { STUDIO_WRITE_TOKEN: 'local-test-token' }, cloud }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const asset of [saved, current]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/studio/assets/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Write-Token': 'local-test-token' },
      body: JSON.stringify({ asset })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), saved);
  }
});
