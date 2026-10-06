import { sendError } from "../../lib/respond.js";
import { getOrSet } from "../../lib/cache.js";
import { STATS_KEY } from "../../lib/cacheKeys.js";
import { getPublicStats } from "./stats.service.js";

const TTL = 300; // 5 min

export async function publicStats(req, res) {
  try {
    const result = await getOrSet(STATS_KEY, TTL, () => getPublicStats(req.db));
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}
