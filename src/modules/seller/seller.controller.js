import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { del } from "../../lib/cache.js";
import { PRODUCTS_DEFAULT_KEY } from "../../lib/cacheKeys.js";
import { anchored } from "../../lib/search.js";
import { formatSellerLocation } from "../../lib/sellerSnapshot.js";
import * as service from "./seller.service.js";

/** Status after a seller sets the stock count; only available <-> sold ever flips. */
function stockStatus(currentStatus, quantity) {
  if (quantity === 0 && currentStatus === "available") return "sold";
  if (quantity > 0 && currentStatus === "sold") return "available";
  return currentStatus;
}

export async function listProducts(req, res) {
  try {
    const { search, category, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { sellerEmail: req.user.email };
    if (search) filter.title = anchored(search);
    if (category) filter.category = category;
    if (status) filter.status = status;

    const { result, total } = await service.listProducts(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller products", e);
  }
}

export async function createProduct(req, res) {
  try {
    const {
      title, category, condition, price, description, images,
      quantity, location2, mobile2,
    } = req.body;

    // location1 + mobile1 come from the seller's user record; the form only
    // supplies the optional per-listing overrides (location2, mobile2).
    const location1 = formatSellerLocation(req.dbUser?.location);

    const contact = {
      mobile1: req.dbUser?.contact ? String(req.dbUser.contact) : "",
    };
    if (mobile2) contact.mobile2 = String(mobile2);

    const now = new Date();
    const product = {
      title,
      category,
      condition,
      price: Number(price),
      quantity: Number(quantity) || 1,
      location1,
      ...(location2 ? { location2: String(location2) } : {}),
      images,
      description,
      // sellerEmail/sellerName are retained as the ownership key used across
      // seller queries, orders, and payments — not part of the public shape.
      sellerEmail: req.user.email,
      sellerName: req.dbUser?.name || "",
      sellerInfo: {
        // Stored as a string (like buyerInfo.userId in orders) so it stays
        // consistent whether dbUser came from the Redis cache (JSON string _id)
        // or straight from Mongo (ObjectId) — otherwise a later $lookup against
        // user._id would silently miss.
        userId: req.dbUser?._id?.toString() || "",
        contact,
      },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const result = await service.createProduct(req.db, product);
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(201).json({ success: true, message: "Product created", result });
  } catch (e) {
    sendError(res, 500, "Failed to create product", e);
  }
}

export async function updateProduct(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const {
      title, category, condition, price, description, images,
      quantity, location2, mobile2,
    } = req.body;
    const update = { updatedAt: new Date() };
    const unset = {};
    if (title !== undefined) update.title = title;
    if (category !== undefined) update.category = category;
    if (condition !== undefined) update.condition = condition;
    if (price !== undefined) update.price = Number(price);
    if (description !== undefined) update.description = description;
    if (images !== undefined) update.images = images;

    // Per-listing overrides: a blank value removes the override so the
    // profile-derived location1 / contact.mobile1 apply again.
    if (location2 !== undefined) {
      const value = String(location2).trim();
      if (value) update.location2 = value;
      else unset.location2 = "";
    }
    if (mobile2 !== undefined) {
      const value = String(mobile2).trim();
      if (value) update["sellerInfo.contact.mobile2"] = value;
      else unset["sellerInfo.contact.mobile2"] = "";
    }

    // Stock drives availability: 0 sells the listing out, restocking a sold-out
    // listing re-lists it. Moderation states (pending / rejected) are untouched.
    let status;
    if (quantity !== undefined) {
      const current = await service.findOwnProductStatus(req.db, req.params.id, req.user.email);
      if (!current) {
        return res.status(404).json({ success: false, message: "Product not found or not yours" });
      }
      update.quantity = Number(quantity);
      status = stockStatus(current.status, update.quantity);
      if (status !== current.status) update.status = status;
    }

    const result = await service.updateOwnProduct(req.db, req.params.id, req.user.email, update, unset);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found or not yours" });
    }
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product updated", result: { ...result, status } });
  } catch (e) {
    sendError(res, 500, "Failed to update product", e);
  }
}

export async function deleteProduct(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const result = await service.deleteOwnProduct(req.db, req.params.id, req.user.email);
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found or not yours" });
    }
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete product", e);
  }
}

export async function listOrders(req, res) {
  try {
    const { search, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { sellerEmail: req.user.email };
    if (status) filter.orderStatus = status;
    if (search) {
      filter.$or = [
        { "buyerInfo.name": anchored(search) },
        { "buyerInfo.email": anchored(search) },
      ];
    }

    const { result, total } = await service.listOrders(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller orders", e);
  }
}

export async function updateOrderStatus(req, res) {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }
    const result = await service.updateOwnOrderStatus(req.db, req.params.id, req.user.email, status);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found or not yours" });
    }
    res.status(200).json({ success: true, message: "Order status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update order status", e);
  }
}

export async function stats(req, res) {
  try {
    const result = await service.getStats(req.db, req.user.email);
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller stats", e);
  }
}

export async function analytics(req, res) {
  try {
    const { monthlySales, topProducts } = await service.getAnalytics(req.db, req.user.email);
    res.status(200).json({
      success: true,
      result: {
        monthlySales: monthlySales.map((m) => ({ month: m._id, count: m.count })),
        topProducts,
      },
    });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller analytics", e);
  }
}
