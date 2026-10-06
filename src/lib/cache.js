/**
 * Redis read-through cache helper.
 *
 *   getOrSet(key, ttl, fn)  — return cached JSON or compute via fn(), store, return.
 *   del(key) / delByPattern(pattern) — explicit invalidation.
 *
 * Fail-open: if Redis is down, fall back to calling fn() so reads still work.
 */
import { redis } from "../config/redis.js";

export async function getOrSet(key, ttlSeconds, fn) {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit);
  } catch (e) {
    console.error(`[cache] get failed for ${key}:`, e.message);
    return fn(); // fail open
  }

  const value = await fn();
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (e) {
    console.error(`[cache] set failed for ${key}:`, e.message);
  }
  return value;
}

export async function del(...keys) {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (e) {
    console.error(`[cache] del failed for ${keys.join(",")}:`, e.message);
  }
}

/**
 * Delete keys matching a glob pattern using SCAN (non-blocking, unlike KEYS).
 * Use sparingly — prefer precise del() keys where possible.
 */
export async function delByPattern(pattern) {
  try {
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (batch.length > 0) await redis.del(...batch);
    } while (cursor !== "0");
  } catch (e) {
    console.error(`[cache] delByPattern failed for ${pattern}:`, e.message);
  }
}
