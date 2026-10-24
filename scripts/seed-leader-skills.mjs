import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { catalog } from '../studio/catalog.js';

loadEnv();
const cloud = new SupabaseRest();
const defaults = catalog.skill_copies.filter(row => catalog.skillMeta[row.role_id + ':' + row.skill_id]?.leader);
const existing = await cloud.rows('skill_copies', 'status=eq.published&skill_id=like.leader_*');
const missing = defaults.filter(row => !existing.some(saved => saved.role_id === row.role_id && saved.skill_id === row.skill_id));
console.log(JSON.stringify({ total: defaults.length, existing: defaults.length - missing.length, missing: missing.map(row => row.skill_id) }));
if (!process.argv.includes('--dry-run') && missing.length) {
  // Insert only missing published rows; preserve all existing edits and drafts.
  await cloud.upsert('skill_copies', missing.map(row => ({ ...row, status: 'published', version: 1, published_at: new Date().toISOString() })), 'role_id,skill_id,status', true);
}
if (!process.argv.includes('--dry-run')) {
  const saved = await cloud.rows('skill_copies', 'status=eq.published&skill_id=like.leader_*', true);
  if (!defaults.every(row => saved.some(value => value.role_id === row.role_id && value.skill_id === row.skill_id))) throw new Error('Public verification failed');
  console.log('Verified public Supabase leader skill copies: ' + defaults.length);
}
