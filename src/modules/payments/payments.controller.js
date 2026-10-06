import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import * as service from "./payments.service.js";

export async function createIntent(req, res) {
  try {
    const { amount, productId, productTitle } = req.body;
    if (!amount || !productId) {
      return res.status(400).json({ success: false, message: "amount and productId are required" });
    }

    const paymentIntent = await service.createIntent({
      amount,
      productId,
      productTitle,
      buyerEmail: req.user.email,
    });

    res.status(200).json({
      success: true,
      result: { clientSecret: paymentIntent.client_secret },
    });
  } catch (e) {
    sendError(res, 500, "Failed to create payment intent", e);
  }
}

export async function confirm(req, res) {
  try {
    const { transactionId, productId, amount } = req.body;

    if (!transactionId || !productId) {
      return res.status(400).json({ success: false, message: "transactionId and productId are required" });
    }
    if (!isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const paymentIntent = await service.retrieveIntent(transactionId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment not confirmed by Stripe" });
    }

    const existing = await service.findPaymentByTransaction(req.db, transactionId);
    if (existing) {
      return res.status(409).json({ success: false, message: "Payment already recorded" });
    }

    const product = await service.findProductById(req.db, productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const orderId = await service.recordPurchase(req.db, {
      buyer: req.dbUser,
      product,
      productId,
      transactionId,
      amount,
    });

    res.status(201).json({
      success: true,
      message: "Order and payment saved",
      result: { orderId },
    });
  } catch (e) {
    sendError(res, 500, "Failed to save payment", e);
  }
}

export async function history(req, res) {
  try {
    const { status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { buyerEmail: req.user.email };
    if (status) filter.paymentStatus = status;

    const { result, total } = await service.listHistory(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch payment history", e);
  }
}
