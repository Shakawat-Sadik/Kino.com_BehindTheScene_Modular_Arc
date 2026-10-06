import { Router } from "express";
import { client } from "../../config/db.js";
import { redis } from "../../config/redis.js";

const router = Router();

// Render health check. 200 only when both Mongo and Redis respond.
router.get("/healthz", async (req, res) => {
  const health = { mongo: "down", redis: "down" };

  try {
    await client.db("kino_main").command({ ping: 1 });
    health.mongo = "up";
  } catch { /* stays down */ }

  try {
    const pong = await redis.ping();
    if (pong === "PONG") health.redis = "up";
  } catch { /* stays down */ }

  const ok = health.mongo === "up" && health.redis === "up";
  res.status(ok ? 200 : 503).json({ success: ok, result: health });
});

export default router;
