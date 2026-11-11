#!/usr/bin/env node
/**
 * Clear the Redis caches that sit in front of seller/product data.
 *
 *   node scripts/clear-caches.js
 *
 * Run after bulk DB edits (e.g. seller reassignment) so the API doesn't serve stale data.
 * Deletes: public:products:default, public:stats, public:sellers:top:*, user:auth:*
 * (keys mirror src/lib/cacheKeys.js and src/lib/authCache.js). Rate-limit keys are NOT touched.
 */
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import Redis from "ioredis";

// Load <project root>/.env regardless of the directory the script is run from.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

if (!process.env.REDIS_URL) {
  console.error("✗ REDIS_URL is not set.");
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

async function delPattern(pattern) {
  let cursor = "0";
  let n = 0;
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (batch.length) n += await redis.del(...batch);
  } while (cursor !== "0");
  return n;
}

try {
  const exact = await redis.del("public:products:default", "public:stats");
  const top = await delPattern("public:sellers:top:*");
  const auth = await delPattern("user:auth:*");
  console.log(`✓ cleared: ${exact} exact keys, ${top} sellers-top, ${auth} auth-role`);
  await redis.quit();
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}
