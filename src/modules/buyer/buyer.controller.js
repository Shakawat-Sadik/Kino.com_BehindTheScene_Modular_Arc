import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import * as service from "./buyer.service.js";

export async function listOrders(req, res) {
  try {
    const { status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { "buyerInfo.email": req.user.email };
    if (status) filter.orderStatus = status;

    const { result, total } = await service.listOrders(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch buyer orders", e);
  }
}

export async function cancelOrder(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const result = await service.cancelOrder(req.db, req.params.id, req.user.email);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found or cannot be cancelled" });
    }
    res.status(200).json({ success: true, message: "Order cancelled", result });
  } catch (e) {
    sendError(res, 500, "Failed to cancel order", e);
  }
}

export async function stats(req, res) {
  try {
    const result = await service.getStats(req.db, req.user.email);
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch buyer stats", e);
  }
}
