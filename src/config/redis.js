/**
 * ioredis client (Upstash) over RESP/TCP+TLS — a long-lived Render process keeps
 * a warm socket (~1-2ms/command), unlike the HTTP client which pays a handshake
 * per command. Reconnects on transient drops; surfaces errors without crashing.
 */
import Redis from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true, // connect explicitly during boot so failures are visible
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("error", (e) => {
  console.error("[redis] error:", e.message);
});

redis.on("reconnecting", () => {
  console.warn("[redis] reconnecting…");
});

export const connectRedis = () => redis.connect();
export const closeRedis = () => redis.quit();
