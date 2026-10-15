import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { catalog, assetKeyForPath } from '../studio/catalog.js';

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const cloud = new SupabaseRest();

console.log('🚀 開始上傳 陰陽師(Onmyōji) 頭像至 Supabase Storage 與 文案至 DB...');

// 1. 上傳頭像至 Storage
const localFileMacron = path.resolve('public/photo/Onmyōji.webp');
const localFileNoMacron = path.resolve('public/photo/Onmyoji.webp');
const localFilePath = fs.existsSync(localFileMacron) ? localFileMacron : localFileNoMacron;

if (!fs.existsSync(localFilePath)) {
  console.error('❌ 本地找不到 Onmyōji.webp 檔案:', localFilePath);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(localFilePath);
const stat = fs.statSync(localFilePath);
const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
const localKey = assetKeyForPath('/photo/Onmyōji.webp');
const storageKey = 'storage.' + localKey.replace(/^local\./, '');
const hash8 = localKey.replace(/^local\./, '').slice(0, 8);

// Storage 目標路徑
const storagePaths = [
  `images/roles/Onmyoji-${hash8}.webp`,
  `images/roles/Onmyji-${hash8}.webp`,
  `images/roles/Onmyōji.webp`,
  `images/roles/Onmyoji.webp`
];

for (const storagePath of storagePaths) {
  console.log(`📤 上傳至 Storage: bucket='game-assets', path='${storagePath}'...`);
  const { data, error } = await supabase.storage.from('game-assets').upload(storagePath, fileBuffer, {
    contentType: 'image/webp',
    upsert: true
  });
  if (error) {
    console.warn(`⚠️ 上傳 ${storagePath} 警告:`, error.message);
  } else {
    console.log(`✅ Storage 上傳成功: ${storagePath}`);
  }
}

const primaryStoragePath = `images/roles/Onmyoji-${hash8}.webp`;

// 2. 登記 game_assets (local 與 storage)
const localAsset = {
  asset_key: localKey,
  display_name: 'Onmyōji.webp',
  kind: 'image',
  category: 'roles',
  source_type: 'local',
  local_path: '/photo/Onmyōji.webp',
  storage_bucket: null,
  storage_path: null,
  external_url: null,
  mime_type: 'image/webp',
  size_bytes: stat.size,
  preload_group: 'roles',
  volume: 1,
  duration_ms: null,
  is_public: true
};

const storageAsset = {
  asset_key: storageKey,
  display_name: 'Onmyōji.webp',
  kind: 'image',
  category: 'roles',
  source_type: 'storage',
  local_path: null,
  storage_bucket: 'game-assets',
  storage_path: primaryStoragePath,
  external_url: null,
  mime_type: 'image/webp',
  size_bytes: stat.size,
  preload_group: 'roles',
  volume: 1,
  duration_ms: null,
  is_public: true
};

console.log('📝 登記 game_assets...');
await cloud.upsert('game_assets', [localAsset, storageAsset], 'asset_key');
console.log('✅ game_assets 登記完成');

// 3. 登記 asset_bindings (draft 與 published)
const bindingKey = 'role.onmyoji.avatar';
const bindings = [
  {
    binding_key: bindingKey,
    asset_key: storageKey,
    fallback_path: '/photo/Onmyōji.webp',
    preload_group: 'roles',
    volume_override: null,
    status: 'draft',
    published_at: null,
    version: 1
  },
  {
    binding_key: bindingKey,
    asset_key: storageKey,
    fallback_path: '/photo/Onmyōji.webp',
    preload_group: 'roles',
    volume_override: null,
    status: 'published',
    published_at: new Date().toISOString(),
    version: 1
  }
];

console.log('📝 登記 asset_bindings...');
await cloud.upsert('asset_bindings', bindings, 'binding_key,status');
console.log('✅ asset_bindings 登記完成');

// 4. 登記 role_profiles (draft 與 published)
const roleData = catalog.role_profiles.find(r => r.role_id === 'onmyoji');
if (!roleData) {
  console.error('❌ catalog 中找不到 onmyoji 的 role_profile');
  process.exit(1);
}

const roleProfiles = [
  { ...roleData, status: 'draft', published_at: null, version: 1, updated_at: new Date().toISOString() },
  { ...roleData, status: 'published', version: 1, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }
];

console.log('📝 登記 role_profiles (陰陽師)...');
await cloud.upsert('role_profiles', roleProfiles, 'role_id,status');
console.log('✅ role_profiles 登記完成');

// 5. 登記 skill_copies (draft 與 published)
const onmSkills = catalog.skill_copies.filter(s => s.role_id === 'onmyoji');
const skillCopies = [];
for (const s of onmSkills) {
  skillCopies.push({ ...s, status: 'draft', published_at: null, version: 1, updated_at: new Date().toISOString() });
  skillCopies.push({ ...s, status: 'published', version: 1, published_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}

console.log(`📝 登記 skill_copies (${skillCopies.length} 筆)...`);
await cloud.upsert('skill_copies', skillCopies, 'role_id,skill_id,status');
console.log('✅ skill_copies 登記完成');

// 6. 登記 story_copies (battle stories)
const onmStories = catalog.story_copies.filter(s => s.story_key.includes('onmyoji'));
if (onmStories.length > 0) {
  const storyCopies = [];
  for (const s of onmStories) {
    storyCopies.push({ ...s, status: 'draft', published_at: null, version: 1, updated_at: new Date().toISOString() });
    storyCopies.push({ ...s, status: 'published', version: 1, published_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  console.log(`📝 登記 story_copies (${storyCopies.length} 筆)...`);
  await cloud.upsert('story_copies', storyCopies, 'story_key,status');
  console.log('✅ story_copies 登記完成');
}

console.log('🎉 陰陽師(Onmyōji) 的頭像 (Storage) 與技能文案/職業資料 (DB) 全部成功上傳至 Supabase！');
