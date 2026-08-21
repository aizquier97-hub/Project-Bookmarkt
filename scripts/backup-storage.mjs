#!/usr/bin/env node
/**
 * Storage-object backup for the Bookmarkt `book-images` bucket.
 *
 * Database backups (Supabase PITR / pg_dump) only preserve Storage *metadata*
 * rows; the image objects themselves live in the Storage service. This script
 * downloads every object in the private bucket to a timestamped local folder
 * so an object-level restore is possible (roadmap §11, Stage 2 operations).
 *
 * Usage (never commit the service-role key; pass it via environment):
 *   set SUPABASE_URL=https://<project-ref>.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=<service role key from the dashboard>
 *   node scripts/backup-storage.mjs [output-dir]
 *
 * Restore: upload the saved files back to the same bucket paths with
 * `supabase storage cp` or the dashboard; `book_images.image_url` rows store
 * those same paths, so restoring objects at their original paths reconnects
 * every row without a database change.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BUCKET = 'book-images';
const PAGE_SIZE = 100;

const baseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!baseUrl || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
};

async function listAllObjects() {
  const paths = [];
  const queue = [''];
  while (queue.length) {
    const prefix = queue.shift();
    let offset = 0;
    for (;;) {
      const res = await fetch(`${baseUrl}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix,
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      });
      if (!res.ok) {
        throw new Error(`List failed for prefix "${prefix}": HTTP ${res.status}`);
      }
      const items = await res.json();
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          queue.push(fullPath); // folder placeholder — recurse
        } else {
          paths.push(fullPath);
        }
      }
      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return paths;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = process.argv[2] ?? join('backups', `storage-${stamp}`);
  const paths = await listAllObjects();
  console.log(`Found ${paths.length} objects in ${BUCKET}.`);

  let done = 0;
  const failures = [];
  for (const path of paths) {
    try {
      const res = await fetch(
        `${baseUrl}/storage/v1/object/authenticated/${BUCKET}/${path}`,
        { headers },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const target = join(outDir, BUCKET, ...path.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${paths.length}`);
    } catch (err) {
      failures.push({ path, error: String(err) });
    }
  }

  const manifest = {
    bucket: BUCKET,
    projectUrl: baseUrl,
    exportedAt: new Date().toISOString(),
    objectCount: paths.length,
    downloaded: done,
    failures,
    paths,
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Backed up ${done}/${paths.length} objects to ${outDir}.`);
  if (failures.length) {
    console.error(`${failures.length} objects failed — see manifest.json.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
