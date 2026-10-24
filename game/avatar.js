import { CLASSES } from './constants.js';
import localPaths from '../public/js/shared/local-paths.cjs';

// Preserve official portraits as URLs; emoji choices retain their existing limit.
export function normalizeAvatar(value, snapshot = {}, supabaseUrl = process.env.SUPABASE_URL) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('data:image/')) return trimmed.length <= 350000 ? trimmed : null;
  if (Object.values(CLASSES).some(role => role.avatar === localPaths.canonical(trimmed))) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    if (!supabaseUrl) return null;
    const base = supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/game-assets/';
    const publicPortrait = (snapshot.game_assets || []).some(asset =>
      asset.is_public && asset.source_type === 'storage' && asset.storage_bucket === 'game-assets' &&
      asset.category === 'roles' && typeof asset.storage_path === 'string' && base + asset.storage_path.split('/').map(encodeURIComponent).join('/') === trimmed);
    return publicPortrait ? trimmed : null;
  }
  if (trimmed.startsWith('/')) return null;
  return trimmed.slice(0, 8) || null;
}
