/**
 * Shared auth-role cache (Upstash Redis). Guards read user:auth:${email} before
 * hitting Mongo; any role/status mutation must call invalidateAuthUser(email) so
 * the change propagates instantly and consistently to every Render instance.
 *
 * Cache-aside, fail-open (Redis down → fall back to Mongo). Password is never
 * cached. Negative lookups (user not found) are NOT cached so a newly-created
 * user is recognised immediately.
 */
import { redis } from "../config/redis.js";

const TTL_SECONDS = 900; // 15 min
const key = (email) => `user:auth:${email}`;

export async function getAuthUser(db, email) {
  try {
    const hit = await redis.get(key(email));
    if (hit !== null) return JSON.parse(hit);
  } catch (e) {
    console.error(`[authCache] get failed for ${email}:`, e.message);
    return db.collection("user").findOne({ email }, { projection: { password: 0 } });
  }

  const user = await db.collection("user").findOne({ email }, { projection: { password: 0 } });
  if (user) {
    try {
      await redis.set(key(email), JSON.stringify(user), "EX", TTL_SECONDS);
    } catch (e) {
      console.error(`[authCache] set failed for ${email}:`, e.message);
    }
  }
  return user;
}

export async function invalidateAuthUser(email) {
  if (!email) return;
  try {
    await redis.del(key(email));
  } catch (e) {
    console.error(`[authCache] invalidate failed for ${email}:`, e.message);
  }
}
