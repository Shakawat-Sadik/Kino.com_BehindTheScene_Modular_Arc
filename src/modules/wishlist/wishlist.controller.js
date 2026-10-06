import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { getWishlistProducts, addToWishlist, removeFromWishlist } from "./wishlist.service.js";

export async function get(req, res) {
  try {
    const result = await getWishlistProducts(req.db, req.user.email);
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch wishlist", e);
  }
}

export async function add(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await addToWishlist(req.db, req.user.email, req.params.productId);
    res.status(200).json({ success: true, message: "Added to wishlist", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to update wishlist", e);
  }
}

export async function remove(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await removeFromWishlist(req.db, req.user.email, req.params.productId);
    res.status(200).json({ success: true, message: "Removed from wishlist", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to update wishlist", e);
  }
}
