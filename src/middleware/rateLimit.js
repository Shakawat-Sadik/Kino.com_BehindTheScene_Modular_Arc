/**
 * Rate limiters backed by a shared Upstash Redis store (rate-limit-redis) so
 * counters are consistent across Render replicas and survive within a deploy.
 */
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis.js";

const makeLimiter = ({ windowMs, max, prefix }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Fail open: if the Redis store errors, allow the request rather than 500.
    passOnStoreError: true,
    message: { success: false, message: "Too many requests, please try again later." },
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    }),
  });

// Public reads — generous.
export const publicLimiter = makeLimiter({ windowMs: 60_000, max: 120, prefix: "rl:public:" });

// Uploads — expensive (Cloudinary + memory). Tighter.
export const uploadLimiter = makeLimiter({ windowMs: 60_000, max: 20, prefix: "rl:upload:" });

// Payments — sensitive. Tight.
export const paymentsLimiter = makeLimiter({ windowMs: 60_000, max: 30, prefix: "rl:pay:" });
