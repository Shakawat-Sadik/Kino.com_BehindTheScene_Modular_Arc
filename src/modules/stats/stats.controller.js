import { sendError } from "../../lib/respond.js";
import { getPublicStats } from "./stats.service.js";

export async function publicStats(req, res) {
  try {
    const result = await getPublicStats(req.db);
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}
