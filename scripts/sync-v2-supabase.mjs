import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadEnv } from '../studio/env.js';
import { SupabaseRest } from '../studio/supabase.js';
import { catalog } from '../studio/catalog.js';

loadEnv();
const cloud = new SupabaseRest();

if (!cloud.configured) {
  console.error('SUPABASE_URL or SUPABASE_SECRET_KEY is not configured.');
  process.exit(1);
}

const specPath = path.resolve('docs/Dungeon_Abyss_v2.md');
const specBytes = fs.readFileSync(specPath);
const specSha256 = createHash('sha256').update(specBytes).digest('hex');

console.log(`Local spec: ${specPath} (${specBytes.length} bytes, sha256=${specSha256})`);

// 1. Fetch existing rows & backup before writing
const existingRoles = await cloud.rows('role_profiles');
const existingSkills = await cloud.rows('skill_copies');

const backupDir = path.resolve('C:/Users/orgal/.gemini/antigravity/brain/e49555ae-4105-4aaf-92b0-79f961f42f1e/scratch');
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'supabase-pre-v2-backup.json');
fs.writeFileSync(backupPath, JSON.stringify({
  backedUpAt: new Date().toISOString(),
  role_profiles_count: existingRoles.length,
  skill_copies_count: existingSkills.length,
  role_profiles: existingRoles,
  skill_copies: existingSkills
}, null, 2), 'utf8');
console.log(`Backed up ${existingRoles.length} role_profiles and ${existingSkills.length} skill_copies to ${backupPath}`);

// 2. Upsert role_profiles (published, and update draft if any exists for the same role_id)
const now = new Date().toISOString();
const publishedRoles = catalog.role_profiles.map(roleRow => ({
  ...roleRow,
  status: 'published',
  published_at: now
}));
const draftRoles = catalog.role_profiles
  .filter(roleRow => existingRoles.some(r => r.role_id === roleRow.role_id && r.status === 'draft'))
  .map(roleRow => ({
    ...roleRow,
    status: 'draft',
    published_at: null
  }));

const upsertedPubRoles = await cloud.upsert('role_profiles', publishedRoles, 'role_id,status', false);
const upsertedDraftRoles = draftRoles.length ? await cloud.upsert('role_profiles', draftRoles, 'role_id,status', false) : [];
console.log(`Upserted ${upsertedPubRoles.length} published + ${upsertedDraftRoles.length} draft role_profiles rows.`);

// 3. Upsert skill_copies (published, and update draft if any exists for the same role_id + skill_id)
const publishedSkills = catalog.skill_copies.map(skillRow => ({
  ...skillRow,
  status: 'published',
  published_at: now
}));
const draftSkills = catalog.skill_copies
  .filter(skillRow => existingSkills.some(s => s.role_id === skillRow.role_id && s.skill_id === skillRow.skill_id && s.status === 'draft'))
  .map(skillRow => ({
    ...skillRow,
    status: 'draft',
    published_at: null
  }));

let upsertedPubSkillsCount = 0;
for (let i = 0; i < publishedSkills.length; i += 100) {
  const chunk = publishedSkills.slice(i, i + 100);
  const res = await cloud.upsert('skill_copies', chunk, 'role_id,skill_id,status', false);
  upsertedPubSkillsCount += res.length;
}
let upsertedDraftSkillsCount = 0;
for (let i = 0; i < draftSkills.length; i += 100) {
  const chunk = draftSkills.slice(i, i + 100);
  const res = await cloud.upsert('skill_copies', chunk, 'role_id,skill_id,status', false);
  upsertedDraftSkillsCount += res.length;
}
console.log(`Upserted ${upsertedPubSkillsCount} published + ${upsertedDraftSkillsCount} draft skill_copies rows.`);

// Also sync updated equipment story_copies (e.g. onm_kariginu)
const equipStories = catalog.story_copies
  .filter(s => s.category === 'equipment')
  .map(s => ({ ...s, status: 'published', published_at: now }));
if (equipStories.length) {
  await cloud.upsert('story_copies', equipStories, 'story_key,status', false);
  console.log(`Upserted ${equipStories.length} published equipment story_copies rows.`);
}

// 4. Inspect Supabase Storage buckets & upload spec markdown
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const secretKey = process.env.SUPABASE_SECRET_KEY;
const authHeaders = {
  apikey: secretKey,
  ...(secretKey.startsWith('eyJ') ? { Authorization: 'Bearer ' + secretKey } : {})
};

const bucketsRes = await fetch(`${baseUrl}/storage/v1/bucket`, { headers: authHeaders });
const buckets = await bucketsRes.json();
console.log('Available Storage buckets:', Array.isArray(buckets) ? buckets.map(b => b.id || b.name) : buckets);

let targetBucket = 'specs';
if (Array.isArray(buckets) && buckets.length > 0) {
  const existingSpecs = buckets.find(b => (b.id || b.name) === 'specs');
  if (existingSpecs) {
    targetBucket = 'specs';
  } else {
    // Try creating 'specs' bucket first; if not allowed or fails, use the first available bucket
    const createRes = await fetch(`${baseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'specs', name: 'specs', public: true })
    });
    if (createRes.ok) {
      targetBucket = 'specs';
      console.log('Created Storage bucket: specs');
    } else {
      targetBucket = buckets[0].id || buckets[0].name;
      console.log(`Using existing Storage bucket: ${targetBucket}`);
    }
  }
} else {
  const createRes = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'specs', name: 'specs', public: true })
  });
  if (createRes.ok) console.log('Created Storage bucket: specs');
}

// Use ASCII-safe object key in Storage plus UTF-8 metadata, or encode path segments
const storageObjectPaths = [
  'specs/Dungeon_Abyss_v2_Agent_Spec.md',
  'docs/Dungeon_Abyss_v2.md'
];

const uploadedObjects = [];
for (const bucketName of ['specs', 'game-assets']) {
  for (const objectPath of storageObjectPaths) {
    const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
    const uploadRes = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'text/markdown; charset=utf-8',
        'x-upsert': 'true'
      },
      body: specBytes
    });
    const uploadJson = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok) {
      console.error(`Failed to upload ${objectPath} to bucket ${bucketName}:`, uploadRes.status, uploadJson);
    } else {
      // Read back from storage to verify byte-for-byte SHA-256
      const downloadRes = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucketName)}/${encodedPath}`, {
        headers: authHeaders
      });
      const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
      const downloadedSha256 = createHash('sha256').update(downloadedBuf).digest('hex');
      uploadedObjects.push({
        bucket: bucketName,
        path: objectPath,
        size: downloadedBuf.length,
        sha256: downloadedSha256,
        verified: downloadedSha256 === specSha256
      });
      console.log(`Uploaded & verified Storage object: bucket=${bucketName}, path=${objectPath}, bytes=${downloadedBuf.length}, sha256=${downloadedSha256}, match=${downloadedSha256 === specSha256}`);
    }
  }
}

// 5. Read-back verification from Supabase DB tables
const verifyRoles = await cloud.rows('role_profiles', 'status=eq.published');
const verifySkills = await cloud.rows('skill_copies', 'status=eq.published');

const findSkill = (role, skill) => verifySkills.find(s => s.role_id === role && s.skill_id === skill);

const checks = {
  rolesCount: verifyRoles.length,
  skillsCount: verifySkills.length,
  bardHealNoAtk: !findSkill('bard', 'b_heal')?.full_copy.includes('× A魔') && findSkill('bard', 'b_heal')?.full_copy.includes('round(1 + 30% × H)'),
  bardBuffPure50: findSkill('bard', 'b_buff')?.full_copy.includes('50%') && !findSkill('bard', 'b_buff')?.full_copy.includes('減傷 25%'),
  alchemistNoShield: !findSkill('alchemist', 'alc_fate')?.full_copy.includes('70% 減傷護盾') && findSkill('alchemist', 'alc_fate')?.full_copy.includes('round(20 + 200% × A魔)'),
  onmyoji60Drop: findSkill('onmyoji', 'passive')?.full_copy.includes('60%') && !findSkill('onmyoji', 'passive')?.full_copy.includes('70%') && findSkill('onmyoji', 'onm_talisman')?.full_copy.includes('60%') && !findSkill('onmyoji', 'onm_talisman')?.full_copy.includes('70%'),
  assassinOneCritOneStack: findSkill('assassin', 'passive')?.full_copy.includes('50% 暴擊機率') && findSkill('assassin', 'passive')?.full_copy.includes('每一次有效暴擊立即獲得 1 層【匿蹤】'),
  druidTreantFixed1Atk: findSkill('druid', 'dru_summon_treant')?.full_copy.includes('永久固定 1 ATK') && findSkill('druid', 'dru_summon_wolf')?.full_copy.includes('max(1, floor(80% × A物))'),
  druidNoMinionWord: !verifySkills.filter(s => s.role_id === 'druid').some(s => s.full_copy.includes('僕從') || s.short_copy.includes('僕從')) && !verifyRoles.find(r => r.role_id === 'druid')?.passive_full.includes('僕從'),
  storageVerified: uploadedObjects.length > 0 && uploadedObjects.every(o => o.verified)
};

console.log('Verification results:', JSON.stringify(checks, null, 2));
if (Object.values(checks).some(v => v === false)) {
  console.error('One or more Supabase read-back verification checks failed!');
  process.exit(1);
}
