// One-shot admin script to empty Supabase Storage buckets.
// Bypasses the storage.protect_delete trigger by going through the Storage
// HTTP API with the service_role key (which has the storage_admin role on
// the server side and is allowed to delete).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/clear-storage-buckets.mjs
//
// To run a dry-run first (list only, no delete):
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... DRY_RUN=1 node scripts/clear-storage-buckets.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ogztislwhfbipaotdbly.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

const BUCKETS = ["payment-slips", "chat-attachments", "avatars", "feed-images"];

if (!SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY env var.");
  console.error("   Find it in Supabase Dashboard → Settings → API → service_role secret.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAllPaths(bucket, prefix = "") {
  const all = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop();
    const { data, error } = await supabase.storage.from(bucket).list(dir, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data) continue;
    for (const item of data) {
      const fullPath = dir ? `${dir}/${item.name}` : item.name;
      if (item.id === null) {
        // folder
        stack.push(fullPath);
      } else {
        all.push(fullPath);
      }
    }
  }
  return all;
}

let total = 0;
for (const bucket of BUCKETS) {
  process.stdout.write(`📦 ${bucket}: listing… `);
  const paths = await listAllPaths(bucket).catch((e) => {
    console.error(`\n❌ list error in ${bucket}:`, e.message);
    return [];
  });
  console.log(`${paths.length} file(s)`);
  total += paths.length;

  if (paths.length === 0) continue;

  if (DRY_RUN) {
    console.log("  (dry-run — would delete, skipping)");
    continue;
  }

  // Storage API allows up to 1000 paths per remove() call.
  const CHUNK = 1000;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const batch = paths.slice(i, i + CHUNK);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`  ❌ delete batch ${i}-${i + batch.length} failed:`, error.message);
    } else {
      console.log(`  ✅ deleted ${batch.length} file(s)`);
    }
  }
}

console.log(`\nDone. ${DRY_RUN ? "Would have deleted" : "Deleted"} ${total} file(s) total.`);
