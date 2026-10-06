import { sendError } from "../../lib/respond.js";
import { getOrSet } from "../../lib/cache.js";
import { sellersTopKey } from "../../lib/cacheKeys.js";
import { getTopSellers } from "./sellers.service.js";

const TTL = 600; // 10 min

export async function top(req, res) {
  try {
    const limit = Math.min(10, parseInt(req.query.limit, 10) || 3);
    const sellers = await getOrSet(sellersTopKey(limit), TTL, () => getTopSellers(req.db, limit));
    res.status(200).json({ success: true, result: sellers });
  } catch (e) {
    sendError(res, 500, "Failed to fetch top sellers", e);
  }
}
