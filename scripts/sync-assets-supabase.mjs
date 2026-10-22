import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv } from '../studio/env.js';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest } from '../studio/supabase.js';
import { LOOT_TABLE } from '../game/constants.js';
import { assetKeyForPath } from '../studio/catalog.js';
import { getStoragePath, getStorageAssetKey } from '../studio/migration.js';

loadEnv();

const env = process.env;
const cloud = new SupabaseRest(env);

if (!cloud.configured) {
  console.error('❌ Supabase 未在 .env 中配置 (缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY)');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const filesToUpload = [
  // 1. D20 骰子圖片
  { localPath: 'assets/d20.webp', displayName: 'd20.webp', category: 'ui' },
  { localPath: 'assets/dice.webp', displayName: 'dice.webp', category: 'ui' },
  { localPath: 'assets/骰子.webp', displayName: '骰子.webp', category: 'ui' },

  // 2. 隨機事件插圖 (賭博、獻祭台、鑄造台、重鑄)
  { localPath: 'assets/賭博.webp', displayName: '賭博.webp', category: 'ui' },
  { localPath: 'assets/獻祭台.webp', displayName: '獻祭台.webp', category: 'ui' },
  { localPath: 'assets/鑄造台.webp', displayName: '鑄造台.webp', category: 'ui' },
  { localPath: 'assets/重鑄.webp', displayName: '重鑄.webp', category: 'ui' },
  { localPath: 'photo/巨熊.webp', displayName: '巨熊.webp', category: 'roles' },
];

// 3. buff icon 目錄下的所有 webp 圖示
const buffIconDir = path.resolve('public/buff icon');
if (fs.existsSync(buffIconDir)) {
  const buffFiles = fs.readdirSync(buffIconDir).filter(f => f.endsWith('.webp'));
  for (const bf of buffFiles) {
    filesToUpload.push({
      localPath: `buff icon/${bf}`,
      displayName: `buff_${bf}`,
      category: 'ui'
    });
  }
}

async function verifyUpload(storagePath, expectedHash) {
  try {
    const url = supabase.storage.from('game-assets').getPublicUrl(storagePath).data.publicUrl;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return hash === expectedHash;
  } catch (err) {
    return false;
  }
}

async function syncRow(table, key, fields, conflict) {
  const query = Object.entries(key).map(([name, value]) => `${name}=eq.${encodeURIComponent(value)}`).join('&');
  const [existing] = await cloud.rows(table, `select=*&${query}`);
  const changed = !existing || Object.entries(fields).some(([name, value]) =>
    JSON.stringify(existing[name]) !== JSON.stringify(value));
  if (!changed) return 'reused';
  const row = { ...key, ...fields, version: (existing?.version || 0) + 1 };
  await cloud.upsert(table, [row], conflict);
  return existing ? 'updated' : 'created';
}

async function syncExclusiveEquipments() {
  const exclusiveDir = path.resolve('public/assets/專屬裝備');
  if (!fs.existsSync(exclusiveDir)) return 0;

  const webpFiles = fs.readdirSync(exclusiveDir).filter(f => f.endsWith('.webp')).sort();
  console.log(`\n🛡️ 開始同步上傳 ${webpFiles.length} 張專屬裝備圖片與綁定至 Supabase...`);

  // 建立 icon 路徑 -> 裝備項目的映射
  const iconToItems = new Map();
  for (const item of LOOT_TABLE) {
    if (item.icon) {
      const list = iconToItems.get(item.icon) || [];
      list.push(item);
      iconToItems.set(item.icon, list);
    }
  }

  let count = 0;
  for (const fileName of webpFiles) {
    const localUrl = `/assets/專屬裝備/${fileName}`;
    const fullPath = path.join(exclusiveDir, fileName);
    const buffer = fs.readFileSync(fullPath);
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const localKey = assetKeyForPath(localUrl);
    const storageKey = getStorageAssetKey(localKey);
    const localAssetObj = {
      asset_key: localKey,
      display_name: fileName,
      kind: 'image',
      category: 'effects',
      source_type: 'local',
      local_path: localUrl,
      storage_bucket: null,
      storage_path: null,
      external_url: null,
      mime_type: 'image/webp',
      size_bytes: buffer.length,
      preload_group: 'effects',
      volume: 1,
      duration_ms: null,
      is_public: true
    };
    const storagePath = getStoragePath(localAssetObj);

    const { error: uploadErr } = await supabase.storage.from('game-assets').upload(storagePath, buffer, {
      contentType: 'image/webp',
      upsert: true
    });
    if (uploadErr) {
      console.error(`❌ 上傳失敗 ${localUrl} (${storagePath}):`, uploadErr.message);
      continue;
    }

    const verified = await verifyUpload(storagePath, contentHash);

    const storageAssetObj = {
      asset_key: storageKey,
      display_name: fileName,
      kind: 'image',
      category: 'effects',
      source_type: 'storage',
      local_path: null,
      storage_bucket: 'game-assets',
      storage_path: storagePath,
      external_url: null,
      mime_type: 'image/webp',
      size_bytes: buffer.length,
      preload_group: 'effects',
      volume: 1,
      duration_ms: null,
      is_public: true
    };

    await syncRow('game_assets', { asset_key: localKey }, localAssetObj, 'asset_key');
    const storageDbStatus = await syncRow('game_assets', { asset_key: storageKey }, storageAssetObj, 'asset_key');

    // 同步 path.local.<hash> 綁定 (draft + published)
    const pathBindingKey = `path.${localKey}`;
    const bindingFields = {
      asset_key: storageKey,
      fallback_path: localUrl,
      preload_group: 'effects',
      volume_override: null
    };
    for (const status of ['draft', 'published']) {
      await syncRow('asset_bindings', { binding_key: pathBindingKey, status }, bindingFields, 'binding_key,status');
    }

    // 同步語義化裝備綁定 equip.<role>.<id>.icon (draft + published)
    const matchedItems = iconToItems.get(localUrl) || [];
    const boundIds = [];
    for (const item of matchedItems) {
      const equipBindingKey = `equip.${item.role}.${item.id}.icon`;
      for (const status of ['draft', 'published']) {
        await syncRow('asset_bindings', { binding_key: equipBindingKey, status }, bindingFields, 'binding_key,status');
      }
      boundIds.push(`${item.role}.${item.id}`);
    }

    console.log(`✅ [${verified ? '已驗證' : '已上傳'}] ${localUrl} -> ${storagePath} (DB: ${storageDbStatus}${boundIds.length ? `, 綁定: ${boundIds.join(', ')}` : ''})`);
    count++;
  }
  return count;
}

async function main() {
  console.log(`🚀 開始同步上傳 ${filesToUpload.length} 個一般素材至 Supabase Storage (game-assets)...`);
  let successCount = 0;

  for (const item of filesToUpload) {
    const fullPath = path.resolve('public', item.localPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️ 本地檔案不存在，略過: ${fullPath}`);
      continue;
    }

    const buffer = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(item.localPath);
    const baseName = path.basename(item.localPath, ext).replace(/[^\w.-]/g, '');
    const cleanStorageName = baseName ? `${baseName}-${hash.slice(0, 8)}${ext}` : `asset-${hash.slice(0, 10)}${ext}`;

    const studioStoragePath = `images/${item.category || 'ui'}/${cleanStorageName}`;

    const { error: err1 } = await supabase.storage.from('game-assets').upload(studioStoragePath, buffer, {
      contentType: 'image/webp',
      upsert: true
    });
    if (err1) {
      console.error(`❌ 上傳失敗 ${studioStoragePath}:`, err1.message);
    }

    const verified = await verifyUpload(studioStoragePath, hash);
    const storageKey = `storage.${hash.slice(0, 20)}`;

    const assetRow = {
      asset_key: storageKey,
      display_name: item.displayName,
      kind: 'image',
      category: item.category,
      source_type: 'storage',
      local_path: null,
      storage_bucket: 'game-assets',
      storage_path: studioStoragePath,
      external_url: null,
      mime_type: 'image/webp',
      size_bytes: buffer.length,
      preload_group: 'ui',
      volume: 1,
      duration_ms: null,
      is_public: true
    };

    const dbStatus = await syncRow('game_assets', { asset_key: storageKey }, assetRow, 'asset_key');
    console.log(`✅ [${verified ? '已驗證' : '已上傳'}] ${item.localPath} -> ${studioStoragePath} (DB: ${dbStatus})`);
    successCount++;
  }

  const exclusiveCount = await syncExclusiveEquipments();
  console.log(`\n🎉 同步完成！共上傳並登記 ${successCount} 個一般素材與 ${exclusiveCount} 張專屬裝備圖片至 Supabase。`);
}

main().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
