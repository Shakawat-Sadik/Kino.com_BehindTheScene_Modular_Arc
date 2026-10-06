#!/usr/bin/env node
/**
 * Standalone, idempotent index migration.
 *
 *   node scripts/create-indexes.js          # create indexes; skip (don't delete) dupes
 *   node scripts/create-indexes.js --fix     # remove duplicate docs, then build unique indexes
 *
 * Runs via Render's preDeployCommand before traffic shifts to the new instance.
 * Connects, applies src/indexes/createIndexes.js, logs results, exits 0/1.
 *
 * Exit 1 if any unique index was skipped because of duplicates (so a dirty-data
 * deploy fails closed and an operator can review before re-running with --fix).
 */

import "dotenv/config";
import { MongoClient, ServerApiVersion } from "mongodb";
import { createIndexes } from "../src/indexes/createIndexes.js";

const uri = process.env.MONGODB_URI;
const fix = process.argv.includes("--fix") || process.env.CREATE_INDEXES_FIX === "1";

if (!uri) {
  console.error("✗ MONGODB_URI is not set.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

async function main() {
  console.log(`\n▶ Creating indexes (mode: ${fix ? "fix" : "report"})\n`);
  await client.connect();
  const db = client.db("kino_main");

  const { created, skipped, removedDocs } = await createIndexes(db, { fix });

  console.log(`\n  created/ensured: ${created.length} index(es)`);
  if (removedDocs > 0) console.log(`  removed: ${removedDocs} duplicate doc(s)`);
  if (skipped.length > 0) {
    console.log(`  skipped (duplicates present): ${skipped.join(", ")}`);
    console.log(`\n✗ Some unique indexes were skipped. Re-run with --fix after reviewing.\n`);
    return 1;
  }
  console.log(`\n✓ Index migration complete.\n`);
  return 0;
}

main()
  .then((code) => client.close().then(() => process.exit(code)))
  .catch(async (e) => {
    console.error("✗ Index migration failed:", e.message);
    await client.close().catch(() => {});
    process.exit(1);
  });
