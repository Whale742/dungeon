import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { migrateBindings, getMigrationStatus } from '../studio/migration.js';

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
console.log(`🔗 Dungeon Abyss Studio — 素材綁定遷移工具`);
console.log(`模式: ${dryRun ? '🔍 [DRY-RUN 預覽模式] (不變更正式發布綁定)' : '🚀 [APPLY 執行原子發布綁定切換]'}`);
console.log('====================================================');

const statusBefore = await getMigrationStatus({ cloud });
console.log(`📊 目前狀態:
  - 總綁定數: ${statusBefore.totalBindingsCount}
  - 綁定至 Storage: ${statusBefore.boundStorageCount}
  - 綁定至 Local: ${statusBefore.boundLocalCount}
  - 已遷移 Storage 素材數: ${statusBefore.storageAssetsCount}
`);

if (statusBefore.storageAssetsCount === 0) {
  console.error('⚠️  警告：目前尚未有任何 Storage 素材紀錄！請先執行: npm run migrate:studio-assets -- --apply');
  process.exit(1);
}

console.log(`正在檢驗新素材可下載性、圖片音檔有效性與比對新舊綁定...`);

const result = await migrateBindings({
  cloud,
  dryRun,
  verifyDownloads: true,
  onProgress: ({ phase, current, total, item }) => {
    if (phase === 'verify') {
      const icon = item.error ? '❌' : '🌐';
      console.log(` [檢驗 ${String(current).padStart(2)}/${total}] ${icon} ${item.binding_key} -> ${item.public_url}`);
    } else if (phase === 'publish') {
      console.log(` [發布進度] 已原子發布 ${current}/${total} 筆綁定...`);
    }
  }
});

const artifactsDir = path.resolve('artifacts/studio');
fs.mkdirSync(artifactsDir, { recursive: true });
const reportPath = path.join(artifactsDir, 'binding-migration-report.json');

const reportData = {
  executedAt: new Date().toISOString(),
  dryRun,
  success: result.success,
  totalBindings: result.totalBindings,
  switchCount: result.switchCount,
  errors: result.errors,
  plan: result.plan
};

fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');
console.log(`\n📄 綁定遷移報告已保存至: ${reportPath}`);

console.log('====================================================');
console.log(`綁定切換摘要:
  - 總綁定數: ${result.totalBindings}
  - 預計切換至 Storage: ${result.switchCount}
  - 既有/未變更: ${(result.totalBindings || 0) - (result.switchCount || 0)}
  - 錯誤數: ${result.errors?.length || 0}`);

if (result.errors?.length > 0) {
  console.error('\n❌ 發生以下錯誤:');
  for (const err of result.errors) {
    console.error(`  - ${err.binding_key}: ${err.error}`);
  }
  process.exit(1);
}

if (dryRun) {
  console.log(`\n💡 預覽正常，若確認切換請執行:
  npm run migrate:studio-bindings -- --apply`);
} else {
  console.log(`\n🎉 正式綁定已全數原子切換至 Supabase Storage！
所有用途綁定皆已保留原本的 fallback_path。`);
}
console.log('====================================================');
