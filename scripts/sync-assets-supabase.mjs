import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv } from '../studio/env.js';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest } from '../studio/supabase.js';

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

async function main() {
  console.log(`🚀 開始同步上傳 ${filesToUpload.length} 個素材至 Supabase Storage (game-assets)...`);
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
    
    // 儲存路徑 1：標準 studio 帶 hash 路徑
    const studioStoragePath = `images/ui/${cleanStorageName}`;
    // 儲存路徑 2：直觀路徑 (保留原始路徑結構)
    const directStoragePath = item.localPath;

    // 上傳至 studio 雜湊路徑
    const { error: err1 } = await supabase.storage.from('game-assets').upload(studioStoragePath, buffer, {
      contentType: 'image/webp',
      upsert: true
    });
    if (err1) {
      console.error(`❌ 上傳失敗 ${studioStoragePath}:`, err1.message);
    }

    // 上傳至直觀路徑
    const { error: err2 } = await supabase.storage.from('game-assets').upload(directStoragePath, buffer, {
      contentType: 'image/webp',
      upsert: true
    });
    if (err2) {
      console.warn(`⚠️ 直觀路徑上傳警告 ${directStoragePath}:`, err2.message);
    }

    // 驗證
    const verified = await verifyUpload(studioStoragePath, hash);
    const storageKey = `storage.${hash.slice(0, 20)}`;

    // 登記至 game_assets 資料表
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

  console.log(`\n🎉 同步完成！共上傳並登記 ${successCount} 個素材至 Supabase。`);
}

main().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
