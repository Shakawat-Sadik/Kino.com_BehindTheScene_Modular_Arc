import { sendError } from "../../lib/respond.js";
import { getTopSellers } from "./sellers.service.js";

export async function top(req, res) {
  try {
    const limit = Math.min(10, parseInt(req.query.limit, 10) || 3);
    const sellers = await getTopSellers(req.db, limit);
    res.status(200).json({ success: true, result: sellers });
  } catch (e) {
    sendError(res, 500, "Failed to fetch top sellers", e);
  }
}
