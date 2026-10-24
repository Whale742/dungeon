import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv } from './env.js';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest } from '../studio/supabase.js';

loadEnv();

const env = process.env;
const cloud = new SupabaseRest(env);

if (!cloud.configured) {
  console.error('Supabase not configured in .env');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function syncRow(table, key, fields, conflict) {
  const query = Object.entries(key).map(([name, value]) => `${name}=eq.${encodeURIComponent(value)}`).join('&');
  const [existing] = await cloud.rows(table, `select=*&${query}`);
  const changed = !existing || Object.entries(fields).some(([name, value]) =>
    JSON.stringify(existing[name]) !== JSON.stringify(value));
  if (!changed) return 'reused';
  const row = { ...key, ...fields, version: (existing?.version || 0) + 1 };
  if (key.status === 'published') row.published_at = new Date().toISOString();
  if (key.status === 'draft') row.published_at = null;
  await cloud.upsert(table, [row], conflict);
  return existing ? 'updated' : 'created';
}

async function verifyPublicImage(storagePath, buffer, mimeType) {
  const url = supabase.storage.from('game-assets').getPublicUrl(storagePath).data.publicUrl;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.headers.get('content-type')?.includes(mimeType)) return false;
  const downloaded = Buffer.from(await response.arrayBuffer());
  return crypto.createHash('sha256').update(downloaded).digest('hex') ===
    crypto.createHash('sha256').update(buffer).digest('hex');
}

async function syncContent(kind, table, key, fields, conflict, publishKey) {
  console.log(`${table} draft ${await syncRow(table, { ...key, status: 'draft' }, fields, conflict)} for ${publishKey}`);
  const query = Object.entries(key).map(([name, value]) => `${name}=eq.${encodeURIComponent(value)}`).join('&');
  const [published] = await cloud.rows(table, `select=*&${query}&status=eq.published`);
  if (published && Object.entries(fields).every(([name, value]) => JSON.stringify(published[name]) === JSON.stringify(value))) {
    console.log(`${table} published reused for ${publishKey}`);
    return;
  }
  await cloud.request('/rest/v1/rpc/studio_publish_one', {
    method: 'POST', body: { p_kind: kind, p_key: publishKey, p_role_id: kind === 'skill' ? key.role_id : null }
  });
  console.log(`${table} published ${published ? 'updated' : 'created'} for ${publishKey}`);
}

async function main() {
  console.log('Connecting to Supabase...');

  // 1. Files to upload
  const filesToUpload = [
    {
      localPath: 'assets/characters/portraits/Augur.webp',
      category: 'roles',
      kind: 'image',
      mimeType: 'image/webp',
      bindingKey: 'role.augur.avatar',
      displayName: 'Augur.webp',
      preloadGroup: 'roles'
    },
    {
      localPath: 'assets/combat-fx/augur/augur1.png',
      category: 'effects',
      kind: 'image',
      mimeType: 'image/png',
      bindingKey: 'skill.augur.aug_bind.hand',
      displayName: 'augur1.png',
      preloadGroup: 'effects'
    },
    {
      localPath: 'assets/combat-fx/augur/augur2.png',
      category: 'effects',
      kind: 'image',
      mimeType: 'image/png',
      bindingKey: 'skill.augur.aug_reckon.hand',
      displayName: 'augur2.png',
      preloadGroup: 'effects'
    }
  ];

  for (const f of filesToUpload) {
    const fullPath = path.resolve('public', f.localPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File missing: ${fullPath}`);
    }
    const buffer = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(f.localPath);
    const baseName = path.basename(f.localPath, ext).replace(/[^\w.-]/g, '');
    const storagePath = `${f.category === 'roles' ? 'images/roles/' : 'images/effects/'}${baseName}-${hash.slice(0, 8)}${ext}`;
    const storageKey = `storage.${hash.slice(0, 20)}`;

    if (!await verifyPublicImage(storagePath, buffer, f.mimeType)) {
      const { error: uploadErr } = await supabase.storage.from('game-assets').upload(storagePath, buffer, {
        contentType: f.mimeType, upsert: true
      });
      if (uploadErr) throw new Error(`Failed to upload ${f.localPath}: ${uploadErr.message}`);
      if (!await verifyPublicImage(storagePath, buffer, f.mimeType)) {
        throw new Error(`Public download verification failed: ${storagePath}`);
      }
      console.log(`Uploaded and verified ${f.localPath}`);
    } else {
      console.log(`Reused and verified ${f.localPath}`);
    }

    // Upsert into game_assets
    const assetRow = {
      asset_key: storageKey,
      display_name: f.displayName,
      kind: f.kind,
      category: f.category,
      source_type: 'storage',
      local_path: null,
      storage_bucket: 'game-assets',
      storage_path: storagePath,
      external_url: null,
      mime_type: f.mimeType,
      size_bytes: buffer.length,
      preload_group: f.preloadGroup,
      volume: 1,
      duration_ms: null,
      is_public: true
    };
    console.log(`game_assets ${await syncRow('game_assets', { asset_key: storageKey }, assetRow, 'asset_key')} for ${storageKey}`);

    // Upsert into asset_bindings (both draft and published)
    const bindingDraft = {
      binding_key: f.bindingKey,
      status: 'draft',
      asset_key: storageKey,
      fallback_path: '/' + f.localPath.replace(/\\/g, '/'),
      preload_group: f.preloadGroup,
      volume_override: null
    };
    for (const status of ['draft', 'published']) {
      const { binding_key, status: _status, ...fields } = bindingDraft;
      console.log(`asset_bindings ${status} ${await syncRow('asset_bindings', { binding_key, status }, fields, 'binding_key,status')} for ${f.bindingKey}`);
    }
  }

  // 2. Read dungeon-studio-content.json and upsert into role_profiles, skill_copies, story_copies
  const content = JSON.parse(fs.readFileSync('dungeon-studio-content.json', 'utf8'));
  for (const item of content.items) {
    if (!((item.kind === 'role' && item.key === 'augur') ||
      (item.kind === 'skill' && item.role_id === 'augur' && ['passive', 'basic', 'aug_bind', 'aug_reckon'].includes(item.key)) ||
      (item.kind === 'story' && ['basic', 'aug_bind', 'aug_reckon'].some(skill => item.key === `battle.player.augur.${skill}.default`)))) continue;
    if (item.kind === 'role') {
      await syncContent('role', 'role_profiles', { role_id: item.key }, item.data, 'role_id,status', item.key);
    } else if (item.kind === 'skill') {
      await syncContent('skill', 'skill_copies', { role_id: item.role_id, skill_id: item.key }, item.data, 'role_id,skill_id,status', item.key);
    } else if (item.kind === 'story') {
      await syncContent('story', 'story_copies', { story_key: item.key }, item.data, 'story_key,status', item.key);
    }
  }

  console.log('All Augur assets, bindings, and studio content successfully synced to Supabase!');
}

main().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
