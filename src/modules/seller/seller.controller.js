import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { del } from "../../lib/cache.js";
import { PRODUCTS_DEFAULT_KEY } from "../../lib/cacheKeys.js";
import * as service from "./seller.service.js";

export async function listProducts(req, res) {
  try {
    const { search, category, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { sellerEmail: req.user.email };
    if (search) filter.title = { $regex: search, $options: "i" };
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
    const { title, category, condition, price, description, images, location } = req.body;
    const product = {
      title, category, condition, price: Number(price), description, images, location,
      sellerEmail: req.user.email,
      sellerName: req.dbUser?.name || "",
      sellerInfo: {
        email: req.user.email,
        name: req.dbUser?.name || "",
        phone: req.dbUser?.contact ? String(req.dbUser.contact) : "",
      },
      status: "pending",
      dateUploaded: new Date(),
      createdAt: new Date(),
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
    const { title, category, condition, price, description, images } = req.body;
    const update = { updatedAt: new Date() };
    if (title !== undefined) update.title = title;
    if (category !== undefined) update.category = category;
    if (condition !== undefined) update.condition = condition;
    if (price !== undefined) update.price = Number(price);
    if (description !== undefined) update.description = description;
    if (images !== undefined) update.images = images;

    const result = await service.updateOwnProduct(req.db, req.params.id, req.user.email, update);
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found or not yours" });
    }
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product updated", result });
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
        { "buyerInfo.name": { $regex: search, $options: "i" } },
        { "buyerInfo.email": { $regex: search, $options: "i" } },
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
