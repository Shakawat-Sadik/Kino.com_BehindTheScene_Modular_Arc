import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { listReviews, listReviewsByProduct, findReview, createReview } from "./reviews.service.js";

export async function list(req, res) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 6);
    const reviews = await listReviews(req.db, limit);
    res.status(200).json({ success: true, result: reviews });
  } catch (e) {
    sendError(res, 500, "Failed to fetch reviews", e);
  }
}

export async function listByProduct(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const reviews = await listReviewsByProduct(req.db, req.params.productId);
    res.status(200).json({ success: true, result: reviews });
  } catch (e) {
    sendError(res, 500, "Failed to fetch reviews", e);
  }
}

export async function create(req, res) {
  try {
    const { productId, rating, comment } = req.body;
    if (!productId || !rating) {
      return res.status(400).json({ success: false, message: "productId and rating are required" });
    }
    if (!isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const existing = await findReview(req.db, productId, req.user.email);
    if (existing) {
      return res.status(409).json({ success: false, message: "You have already reviewed this product" });
    }

    const review = {
      productId,
      buyerEmail: req.user.email,
      buyerName: req.dbUser?.name || "",
      rating: Math.min(5, Math.max(1, Number(rating))),
      comment: comment || "",
      createdAt: new Date(),
    };

    const result = await createReview(req.db, review);
    res.status(201).json({ success: true, message: "Review added", result });
  } catch (e) {
    sendError(res, 500, "Failed to add review", e);
  }
}
