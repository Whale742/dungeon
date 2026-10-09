import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { migrateAssets, getMigrationStatus } from '../studio/migration.js';

loadEnv();

const args = process.argv.slice(2);
const apply = args.includes('--apply') || process.argv.includes('--apply') || process.env.npm_config_apply === 'true';
const dryRun = !apply;

const cloud = new SupabaseRest();
if (!cloud.configured) {
  console.error('❌ 錯誤：未配置 SUPABASE_URL 或 SUPABASE_SECRET_KEY。請檢查 .env。');
  process.exit(1);
}

console.log('====================================================');
console.log(`📦 Dungeon Abyss Studio — 素材 Storage 批次遷移工具`);
console.log(`模式: ${dryRun ? '🔍 [DRY-RUN 預覽模式] (不寫入 Storage/DB)' : '🚀 [APPLY 執行實際上傳]'}`);
console.log('====================================================');

const statusBefore = await getMigrationStatus({ cloud });
console.log(`📊 目前狀態:
  - 本地素材總數: ${statusBefore.localAssetsCount}
  - 已上傳 Storage: ${statusBefore.storageAssetsCount}
  - 待遷移本地素材: ${statusBefore.unmigratedCount}
  - 目前綁定至 Storage: ${statusBefore.boundStorageCount}
  - 目前綁定至 Local: ${statusBefore.boundLocalCount}
  - 預估待遷移大小: ${(statusBefore.estimatedTotalBytes / (1024 * 1024)).toFixed(2)} MB
`);

if (statusBefore.unmigratedCount === 0 && statusBefore.storageAssetsCount > 0) {
  console.log('✨ 所有本地素材均已遷移至 Supabase Storage！');
}

console.log(`開始處理 ${statusBefore.localAssetsCount} 項素材...`);

const result = await migrateAssets({
  cloud,
  dryRun,
  onProgress: ({ current, total, item }) => {
    const icon = item.status === 'already_migrated' ? '⏭️ ' : item.status === 'failed' || item.status === 'missing_file' ? '❌' : '✅';
    console.log(` [${String(current).padStart(2)}/${total}] ${icon} ${item.local_path} -> ${item.storage_path} (${(item.size_bytes / 1024).toFixed(1)} KB) [${item.status}]`);
  }
});

// Save mapping file to artifacts/studio/asset-migration-map.json
const artifactsDir = path.resolve('artifacts/studio');
fs.mkdirSync(artifactsDir, { recursive: true });
const mapPath = path.join(artifactsDir, 'asset-migration-map.json');

const mapData = {
  migratedAt: new Date().toISOString(),
  dryRun,
  total: result.total,
  successCount: result.successCount,
  failedCount: result.failedCount,
  items: result.results.map(r => ({
    local_asset_key: r.local_asset_key,
    storage_asset_key: r.storage_asset_key,
    local_path: r.local_path,
    storage_path: r.storage_path,
    public_url: r.public_url,
    category: r.category,
    kind: r.kind,
    size_bytes: r.size_bytes,
    sha256: r.sha256,
    status: r.status,
    error: r.error || null
  }))
};

fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2), 'utf8');
console.log(`\n📄 映射清單已保存至: ${mapPath}`);

console.log('====================================================');
console.log(`遷移摘要:
  - 總數: ${result.total}
  - 成功/就緒: ${result.successCount}
  - 失敗: ${result.failedCount}`);
if (dryRun) {
  console.log(`\n💡 若確認無誤，請執行實際遷移:
  npm run migrate:studio-assets -- --apply`);
} else {
  console.log(`\n🎉 素材上傳與登記完成！接下來請執行綁定遷移:
  npm run migrate:studio-bindings -- --dry-run`);
}
console.log('====================================================');

if (result.failedCount > 0) {
  process.exitCode = 1;
}
