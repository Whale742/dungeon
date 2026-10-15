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

async function main() {
  console.log('Connecting to Supabase...');

  // 1. Files to upload
  const filesToUpload = [
    {
      localPath: 'photo/Augur.webp',
      category: 'roles',
      kind: 'image',
      mimeType: 'image/webp',
      bindingKey: 'role.augur.avatar',
      displayName: 'Augur.webp',
      preloadGroup: 'roles'
    },
    {
      localPath: 'assets/augur1.png',
      category: 'effects',
      kind: 'image',
      mimeType: 'image/png',
      bindingKey: 'skill.augur.aug_bind.hand',
      displayName: 'augur1.png',
      preloadGroup: 'effects'
    },
    {
      localPath: 'assets/augur2.png',
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

    console.log(`Uploading ${f.localPath} to ${storagePath}...`);
    const { error: uploadErr } = await supabase.storage
      .from('game-assets')
      .upload(storagePath, buffer, {
        contentType: f.mimeType,
        upsert: true
      });

    if (uploadErr) {
      throw new Error(`Failed to upload ${f.localPath}: ${uploadErr.message}`);
    } else {
      console.log(`Successfully uploaded ${f.localPath}`);
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
      is_public: true,
      version: 1
    };

    const resAsset = await cloud.upsert('game_assets', [assetRow], 'asset_key');
    console.log(`game_assets row updated for ${storageKey}`);

    // Upsert into asset_bindings (both draft and published)
    const bindingDraft = {
      binding_key: f.bindingKey,
      status: 'draft',
      asset_key: storageKey,
      fallback_path: '/' + f.localPath.replace(/\\/g, '/'),
      preload_group: f.preloadGroup,
      volume_override: null,
      version: 1,
      published_at: null
    };
    const bindingPublished = {
      ...bindingDraft,
      status: 'published',
      published_at: new Date().toISOString()
    };

    await cloud.upsert('asset_bindings', [bindingDraft, bindingPublished], 'binding_key,status');
    console.log(`asset_bindings updated for ${f.bindingKey}`);
  }

  // 2. Read dungeon-studio-content.json and upsert into role_profiles, skill_copies, story_copies
  const content = JSON.parse(fs.readFileSync('dungeon-studio-content.json', 'utf8'));
  for (const item of content.items) {
    if (item.kind === 'role') {
      const rowDraft = {
        role_id: item.key,
        status: 'draft',
        published_at: null,
        ...item.data
      };
      const rowPublished = {
        ...rowDraft,
        status: 'published',
        published_at: new Date().toISOString()
      };
      await cloud.upsert('role_profiles', [rowDraft, rowPublished], 'role_id,status');
      console.log(`role_profiles updated for ${item.key}`);
    } else if (item.kind === 'skill') {
      const rowDraft = {
        role_id: item.role_id,
        skill_id: item.key,
        status: 'draft',
        published_at: null,
        ...item.data
      };
      const rowPublished = {
        ...rowDraft,
        status: 'published',
        published_at: new Date().toISOString()
      };
      await cloud.upsert('skill_copies', [rowDraft, rowPublished], 'role_id,skill_id,status');
      console.log(`skill_copies updated for ${item.role_id}:${item.key}`);
    } else if (item.kind === 'story') {
      const rowDraft = {
        story_key: item.key,
        status: 'draft',
        published_at: null,
        ...item.data
      };
      const rowPublished = {
        ...rowDraft,
        status: 'published',
        published_at: new Date().toISOString()
      };
      await cloud.upsert('story_copies', [rowDraft, rowPublished], 'story_key,status');
      console.log(`story_copies updated for ${item.key}`);
    }
  }

  console.log('All Augur assets, bindings, and studio content successfully synced to Supabase!');
}

main().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
