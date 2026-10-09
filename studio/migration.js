import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRest, CloudError } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultPublicDir = path.resolve(__dirname, '../public');

export const FOLDER_MAP = {
  roles: 'images/roles/',
  bosses: 'images/bosses/',
  effects: 'images/effects/',
  backgrounds: 'images/backgrounds/',
  sfx: 'audio/sfx/',
  bgm: 'audio/bgm/'
};

export function getStoragePath(asset) {
  const folder = FOLDER_MAP[asset.category] || (asset.kind === 'audio' ? 'audio/other/' : 'images/other/');
  const ext = path.extname(asset.local_path || asset.display_name || '').toLowerCase();
  const rawBase = path.basename(asset.local_path || asset.display_name || '', ext);
  const cleanBase = rawBase.replace(/[^\w.-]/g, '').replace(/^[.-]+|[.-]+$/g, '');
  const hash = (asset.asset_key || '').replace(/^local\./, '') || crypto.createHash('sha256').update(asset.local_path || '').digest('hex').slice(0, 20);
  const fileName = (cleanBase ? `${cleanBase}-${hash.slice(0, 8)}` : `${asset.category || 'asset'}-${hash.slice(0, 12)}`) + ext;
  return folder + fileName;
}

export function getStorageAssetKey(localAssetKey) {
  return 'storage.' + String(localAssetKey || '').replace(/^local\./, '');
}

export async function getMigrationStatus({
  cloud = new SupabaseRest(),
  publicDir = defaultPublicDir
} = {}) {
  const [gameAssets, publishedBindings] = await Promise.all([
    cloud.rows('game_assets'),
    cloud.rows('asset_bindings', 'status=eq.published')
  ]);

  const localAssets = gameAssets.filter(a => a.source_type === 'local');
  const storageAssets = gameAssets.filter(a => a.source_type === 'storage');
  const externalAssets = gameAssets.filter(a => a.source_type === 'external');

  const storageKeySet = new Set(storageAssets.map(a => a.asset_key));
  const unmigratedLocal = localAssets.filter(a => !storageKeySet.has(getStorageAssetKey(a.asset_key)));

  let unmigratedSize = 0;
  let missingFilesCount = 0;
  for (const a of unmigratedLocal) {
    const filePath = path.join(publicDir, a.local_path);
    if (fs.existsSync(filePath)) {
      unmigratedSize += fs.statSync(filePath).size;
    } else {
      missingFilesCount++;
    }
  }

  const boundToStorage = publishedBindings.filter(b => b.asset_key?.startsWith('storage.'));
  const boundToLocal = publishedBindings.filter(b => b.asset_key?.startsWith('local.'));

  return {
    totalGameAssets: gameAssets.length,
    localAssetsCount: localAssets.length,
    storageAssetsCount: storageAssets.length,
    externalAssetsCount: externalAssets.length,
    unmigratedCount: unmigratedLocal.length,
    boundStorageCount: boundToStorage.length,
    boundLocalCount: boundToLocal.length,
    totalBindingsCount: publishedBindings.length,
    estimatedTotalBytes: unmigratedSize,
    missingFilesCount
  };
}

export async function migrateAssets({
  env = process.env,
  cloud = new SupabaseRest(env),
  storageClient = null,
  publicDir = defaultPublicDir,
  assetKeys = null,
  dryRun = false,
  onProgress = null
} = {}) {
  if (!cloud.configured) {
    throw new CloudError('未配置 Supabase 金鑰 (SUPABASE_URL 或 SUPABASE_SECRET_KEY)');
  }

  const storage = storageClient || createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(30000) }) }
  });

  const allAssets = await cloud.rows('game_assets');
  const localAssets = allAssets.filter(a => a.source_type === 'local' && (!assetKeys || assetKeys.includes(a.asset_key)));
  const existingStorageAssets = new Map(allAssets.filter(a => a.source_type === 'storage').map(a => [a.asset_key, a]));

  const results = [];
  const errors = [];
  let processed = 0;

  for (const localAsset of localAssets) {
    processed++;
    const storageKey = getStorageAssetKey(localAsset.asset_key);
    const storagePath = getStoragePath(localAsset);
    const filePath = path.join(publicDir, localAsset.local_path);

    const itemReport = {
      local_asset_key: localAsset.asset_key,
      storage_asset_key: storageKey,
      display_name: localAsset.display_name,
      category: localAsset.category,
      kind: localAsset.kind,
      local_path: localAsset.local_path,
      storage_bucket: 'game-assets',
      storage_path: storagePath,
      public_url: env.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/game-assets/' + storagePath,
      size_bytes: 0,
      sha256: null,
      mime_type: localAsset.mime_type,
      status: 'pending'
    };

    if (!fs.existsSync(filePath)) {
      itemReport.status = 'missing_file';
      itemReport.error = `本地檔案不存在: ${filePath}`;
      errors.push(itemReport);
      results.push(itemReport);
      if (onProgress) onProgress({ current: processed, total: localAssets.length, item: itemReport });
      continue;
    }

    const stat = fs.statSync(filePath);
    itemReport.size_bytes = stat.size;
    const fileBuffer = fs.readFileSync(filePath);
    itemReport.sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (dryRun) {
      itemReport.status = existingStorageAssets.has(storageKey) ? 'already_migrated' : 'dry_run_ready';
      results.push(itemReport);
      if (onProgress) onProgress({ current: processed, total: localAssets.length, item: itemReport });
      continue;
    }

    try {
      // Check if file is already in Supabase Storage with matching size
      const { data: info } = await storage.storage.from('game-assets').info(storagePath).catch(() => ({ data: null }));
      let needsUpload = true;
      if (info && Number(info.size) === stat.size) {
        needsUpload = false;
      }

      if (needsUpload) {
        const { error: uploadError } = await storage.storage.from('game-assets').upload(storagePath, fileBuffer, {
          contentType: localAsset.mime_type || (localAsset.kind === 'audio' ? 'audio/mpeg' : 'image/webp'),
          upsert: true
        });
        if (uploadError) {
          throw new Error(`Storage 上傳失敗: ${uploadError.message}`);
        }
      }

      // Check or register record in game_assets
      const newAssetRecord = {
        asset_key: storageKey,
        display_name: localAsset.display_name,
        kind: localAsset.kind,
        category: localAsset.category,
        source_type: 'storage',
        local_path: null,
        storage_bucket: 'game-assets',
        storage_path: storagePath,
        external_url: null,
        mime_type: localAsset.mime_type,
        size_bytes: stat.size,
        preload_group: localAsset.preload_group || localAsset.category,
        volume: localAsset.volume ?? 1,
        duration_ms: localAsset.duration_ms ?? null,
        is_public: true
      };

      if (existingStorageAssets.has(storageKey)) {
        itemReport.status = 'already_migrated';
      } else {
        await cloud.request('/rest/v1/game_assets', {
          method: 'POST',
          body: newAssetRecord,
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
        });
        existingStorageAssets.set(storageKey, newAssetRecord);
        itemReport.status = needsUpload ? 'uploaded_and_registered' : 'registered_existing_file';
      }

      results.push(itemReport);
    } catch (err) {
      itemReport.status = 'failed';
      itemReport.error = err.message;
      errors.push(itemReport);
      results.push(itemReport);
    }

    if (onProgress) onProgress({ current: processed, total: localAssets.length, item: itemReport });
  }

  return {
    dryRun,
    total: localAssets.length,
    successCount: results.filter(r => !['failed', 'missing_file'].includes(r.status)).length,
    failedCount: errors.length,
    results,
    errors
  };
}

export async function migrateBindings({
  env = process.env,
  cloud = new SupabaseRest(env),
  bindingKeys = null,
  dryRun = false,
  verifyDownloads = true,
  onProgress = null
} = {}) {
  if (!cloud.configured) {
    throw new CloudError('未配置 Supabase 金鑰');
  }

  const [publishedBindings, storageAssets] = await Promise.all([
    cloud.rows('asset_bindings', 'status=eq.published'),
    cloud.rows('game_assets', 'source_type=eq.storage')
  ]);

  const storageAssetMap = new Map(storageAssets.map(a => [a.asset_key, a]));
  const targetBindings = publishedBindings.filter(b => (!bindingKeys || bindingKeys.includes(b.binding_key)));

  const plan = [];
  const errors = [];

  for (const b of targetBindings) {
    const currentKey = b.asset_key;
    const targetKey = getStorageAssetKey(currentKey);
    const storageAsset = storageAssetMap.get(targetKey);

    const diff = {
      binding_key: b.binding_key,
      current_asset_key: currentKey,
      target_asset_key: targetKey,
      fallback_path: b.fallback_path,
      preload_group: b.preload_group,
      volume_override: b.volume_override,
      has_storage_asset: !!storageAsset,
      storage_path: storageAsset?.storage_path || null,
      public_url: storageAsset ? `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/game-assets/${storageAsset.storage_path}` : null,
      status: 'pending'
    };

    if (!storageAsset) {
      diff.status = 'missing_storage_asset';
      diff.error = `找不到對應的 Storage 素材: ${targetKey}；請先執行素材遷移`;
      errors.push(diff);
      plan.push(diff);
      continue;
    }

    if (currentKey === targetKey) {
      diff.status = 'already_pointing_to_storage';
      plan.push(diff);
      continue;
    }

    diff.status = 'ready_to_switch';
    plan.push(diff);
  }

  // Verification step: check if public downloads work
  if (verifyDownloads && !dryRun) {
    const toVerify = plan.filter(p => p.status === 'ready_to_switch');
    let verifyIndex = 0;
    for (const item of toVerify) {
      verifyIndex++;
      let verified = false;
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetch(item.public_url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
          if (!resp.ok) {
            throw new Error(`下載失敗 HTTP ${resp.status}`);
          }
          verified = true;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < 3) await new Promise(r => setTimeout(r, 600));
        }
      }
      if (!verified) {
        item.status = 'download_verification_failed';
        item.error = `公開下載驗證失敗: ${lastError.message}`;
        errors.push(item);
      }
      if (onProgress) onProgress({ phase: 'verify', current: verifyIndex, total: toVerify.length, item });
    }
  }

  if (errors.length > 0) {
    return {
      dryRun,
      success: false,
      totalBindings: targetBindings.length,
      switchCount: 0,
      message: `有 ${errors.length} 項綁定未通過前置檢查，已取消發布`,
      plan,
      errors
    };
  }

  const switchable = plan.filter(p => p.status === 'ready_to_switch');

  if (dryRun) {
    return {
      dryRun: true,
      success: true,
      totalBindings: targetBindings.length,
      switchCount: switchable.length,
      unchangedCount: plan.filter(p => p.status === 'already_pointing_to_storage').length,
      plan,
      errors: []
    };
  }

  if (switchable.length === 0) {
    return {
      dryRun: false,
      success: true,
      totalBindings: targetBindings.length,
      switchCount: 0,
      message: '所有綁定皆已指向 Storage 素材，無需切換',
      plan,
      errors: []
    };
  }

  // Apply drafts and publish using studio_publish_batch in atomic chunks <= 100
  const CHUNK_SIZE = 100;
  const publishedChunks = [];

  for (let i = 0; i < switchable.length; i += CHUNK_SIZE) {
    const chunk = switchable.slice(i, i + CHUNK_SIZE);
    const draftRows = chunk.map(item => ({
      binding_key: item.binding_key,
      status: 'draft',
      asset_key: item.target_asset_key,
      fallback_path: item.fallback_path,
      preload_group: item.preload_group,
      volume_override: item.volume_override
    }));

    // Save drafts first
    await cloud.upsert('asset_bindings', draftRows, 'binding_key,status');

    // Call studio_publish_batch
    const publishItems = chunk.map(item => ({
      kind: 'binding',
      key: item.binding_key
    }));

    try {
      const pubResult = await cloud.request('/rest/v1/rpc/studio_publish_batch', {
        method: 'POST',
        body: { p_items: publishItems }
      });
      publishedChunks.push(pubResult);
    } catch (pubErr) {
      throw new Error(`原子發布批次 ${i / CHUNK_SIZE + 1} 失敗: ${pubErr.message}；請查看日誌`);
    }

    if (onProgress) onProgress({ phase: 'publish', current: Math.min(i + CHUNK_SIZE, switchable.length), total: switchable.length });
  }

  return {
    dryRun: false,
    success: true,
    totalBindings: targetBindings.length,
    switchCount: switchable.length,
    publishedChunks,
    plan,
    errors: []
  };
}
