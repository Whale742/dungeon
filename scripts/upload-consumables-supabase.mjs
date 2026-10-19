import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { assetKeyForPath } from '../studio/catalog.js';

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

console.log('🚀 開始上傳消耗品 WebP 圖檔至 Supabase Storage 與 Assets 資料庫...');

const targets = [
  {
    localFile: 'public/assets/Equipments/補血藥.webp',
    storagePaths: [
      'assets/Equipments/補血藥.webp',
      'assets/Equipments/治療藥.webp'
    ],
    displayName: '補血藥.webp',
    bindingKeys: ['item.consumable.healing_potion', 'item.healing_potion']
  },
  {
    localFile: 'public/assets/Equipments/解毒劑.webp',
    storagePaths: [
      'assets/Equipments/解毒劑.webp',
      'assets/Equipments/解毒藥.webp'
    ],
    displayName: '解毒劑.webp',
    bindingKeys: ['item.consumable.antidote', 'item.antidote']
  },
  {
    localFile: 'public/assets/Equipments/修整帳篷.webp',
    storagePaths: [
      'assets/Equipments/修整帳篷.webp'
    ],
    displayName: '修整帳篷.webp',
    bindingKeys: ['item.consumable.rest_tent', 'item.rest_tent']
  }
];

const uploadedAssets = [];

for (const target of targets) {
  const filePath = path.resolve(target.localFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 本地檔案不存在: ${filePath}`);
    continue;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  const localPath = '/' + target.localFile.replace(/^public\//, '');
  const assetKey = assetKeyForPath(localPath);

  // 1. Upload to Supabase Storage
  for (const sPath of target.storagePaths) {
    console.log(`📤 上傳至 Storage: bucket='game-assets', path='${sPath}'...`);
    // Encode storage path URI components if needed by Supabase
    const { data, error } = await supabase.storage.from('game-assets').upload(sPath, fileBuffer, {
      contentType: 'image/webp',
      upsert: true
    });
    if (error) {
      console.warn(`⚠️ 上傳 ${sPath} 失敗:`, error.message);
    } else {
      console.log(`✅ Storage 上傳成功: ${sPath}`);
    }
  }

  uploadedAssets.push({
    asset_key: assetKey,
    display_name: target.displayName,
    kind: 'image',
    category: 'effects',
    source_type: 'local',
    local_path: localPath,
    storage_bucket: 'game-assets',
    storage_path: target.storagePaths[0],
    external_url: null,
    mime_type: 'image/webp',
    size_bytes: stat.size,
    preload_group: 'effects',
    volume: 1,
    duration_ms: null,
    is_public: true
  });
}

// 2. Also upsert into game_assets and asset_bindings table in Supabase DB if cloud is configured
if (cloud.configured && uploadedAssets.length > 0) {
  try {
    const assetRes = await cloud.upsert('game_assets', uploadedAssets, 'asset_key', false);
    console.log(`✅ DB game_assets 已寫入/更新 ${assetRes.length} 筆`);

    const bindings = [];
    for (const target of targets) {
      const localPath = '/' + target.localFile.replace(/^public\//, '');
      const assetKey = assetKeyForPath(localPath);
      for (const bKey of target.bindingKeys) {
        bindings.push({
          binding_key: bKey,
          asset_key: assetKey,
          fallback_path: localPath,
          preload_group: 'effects',
          volume_override: null
        });
      }
    }
    const bindRes = await cloud.upsert('asset_bindings', bindings, 'binding_key', false);
    console.log(`✅ DB asset_bindings 已寫入/更新 ${bindRes.length} 筆`);
  } catch (err) {
    console.warn(`⚠️ DB upsert 警告:`, err.message);
  }
}

console.log('🎉 消耗品素材同步至 Supabase 完成！');
