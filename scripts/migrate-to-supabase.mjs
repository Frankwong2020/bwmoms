// One-time migration: load src/data/*.json into Supabase `items` table.
// Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/migrate-to-supabase.mjs
// or on Windows cmd:
//   set SUPABASE_SERVICE_ROLE_KEY=eyJ... && node scripts/migrate-to-supabase.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DATA_DIR = 'src/data';

// Map JSON filename -> item_type. Only content types that users should be able to edit.
const MAPPING = {
  'play.json': 'play',
  'doctors.json': 'doctor',
  'services.json': 'service',
  'classes.json': 'class',
  'streaming.json': 'streaming',
};

async function main() {
  let total = 0;

  for (const [file, itemType] of Object.entries(MAPPING)) {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) {
      console.warn(`skip: ${full} not found`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
    if (!Array.isArray(data)) {
      console.warn(`skip: ${file} is not an array`);
      continue;
    }

    const rows = data.map((entry, i) => ({
      // Streaming entries don't have stable ids; synthesize one from domain
      id: entry.id || `${itemType}-${(entry.domain || '').replace(/[^a-z0-9]/gi, '-') || i}`,
      item_type: itemType,
      data: entry,           // store full JSON blob
    }));

    // Upsert in batches of 100 to avoid payload size limits
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from('items')
        .upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`Failed batch ${file} [${i}..${i + batch.length}]:`, error.message);
        process.exit(1);
      }
    }
    console.log(`✓ ${file} -> ${itemType}: ${rows.length} rows`);
    total += rows.length;
  }

  console.log(`\nDone. Migrated ${total} items total.`);

  // Verify count from DB
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true });
  console.log(`DB total items: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
