import { parsePagination } from "../../lib/pagination.js";
import { isValidObjectId } from "../../lib/objectId.js";
import { sendError } from "../../lib/respond.js";
import { invalidateAuthUser } from "../../lib/authCache.js";
import { del } from "../../lib/cache.js";
import { PRODUCTS_DEFAULT_KEY } from "../../lib/cacheKeys.js";
import { anchored } from "../../lib/search.js";
import * as service from "./admin.service.js";

// ── users ──────────────────────────────────────────────────
export async function listUsers(req, res) {
  try {
    const { search, role, sort, order, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (search) {
      filter.$or = [
        { name: anchored(search) },
        { email: anchored(search) },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status;

    const sortObj = {};
    if (sort) sortObj[sort] = order === "desc" ? -1 : 1;
    else sortObj.createdAt = -1;

    const { result, total } = await service.listUsers(req.db, { filter, sortObj, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch users", e);
  }
}

export async function updateUserStatus(req, res) {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }
    const target = await service.findUserEmailById(req.db, req.params.userId);
    const result = await service.updateUserStatus(req.db, req.params.userId, status);
    await invalidateAuthUser(target?.email);
    res.status(200).json({ success: true, message: "User status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update user status", e);
  }
}

export async function updateUser(req, res) {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const { name, role, location, contact } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (role !== undefined) update.role = role;
    if (location !== undefined) update.location = location;
    if (contact !== undefined) update.contact = contact;

    const target = await service.findUserEmailById(req.db, req.params.userId);
    const result = await service.updateUser(req.db, req.params.userId, update);
    await invalidateAuthUser(target?.email);
    res.status(200).json({ success: true, message: "User updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update user", e);
  }
}

export async function deleteUser(req, res) {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const target = await service.findUserEmailById(req.db, req.params.userId);
    await service.deleteUser(req.db, req.params.userId);
    await invalidateAuthUser(target?.email);
    res.status(200).json({ success: true, message: "User deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete user", e);
  }
}

// ── products ───────────────────────────────────────────────
export async function listProducts(req, res) {
  try {
    const { search, category, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (search) filter.title = anchored(search);
    if (category) filter.category = category;
    if (status) filter.status = status;

    const { result, total } = await service.listProducts(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch products", e);
  }
}

export async function updateProduct(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const { title, category, condition, price, description } = req.body;
    const update = { updatedAt: new Date() };
    if (title !== undefined) update.title = title;
    if (category !== undefined) update.category = category;
    if (condition !== undefined) update.condition = condition;
    if (price !== undefined) update.price = Number(price);
    if (description !== undefined) update.description = description;

    const result = await service.updateProduct(req.db, req.params.productId, update);
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update product", e);
  }
}

export async function updateProductStatus(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const { status } = req.body;
    const result = await service.updateProductStatus(req.db, req.params.productId, status);
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update product status", e);
  }
}

export async function deleteProduct(req, res) {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await service.deleteProduct(req.db, req.params.productId);
    await del(PRODUCTS_DEFAULT_KEY);
    res.status(200).json({ success: true, message: "Product deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete product", e);
  }
}

// ── orders ─────────────────────────────────────────────────
export async function listOrders(req, res) {
  try {
    const { search, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
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
    sendError(res, 500, "Failed to fetch orders", e);
  }
}

export async function updateOrderStatus(req, res) {
  try {
    if (!isValidObjectId(req.params.orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const { status } = req.body;
    const result = await service.updateOrderStatus(req.db, req.params.orderId, status);
    res.status(200).json({ success: true, message: "Order status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update order status", e);
  }
}

// ── payments ───────────────────────────────────────────────
export async function listPayments(req, res) {
  try {
    const { search, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (status) filter.paymentStatus = status;
    if (search) {
      filter.$or = [
        { buyerEmail: anchored(search) },
        { sellerEmail: anchored(search) },
        { transactionId: anchored(search) },
      ];
    }

    const { result, total } = await service.listPayments(req.db, { filter, skip, limit });
    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch payments", e);
  }
}

// ── analytics / stats ──────────────────────────────────────
export async function analytics(req, res) {
  try {
    const { monthlyOrders, categoryPerformance, userGrowth, revenueByMonth } = await service.getAnalytics(req.db);
    res.status(200).json({
      success: true,
      result: {
        monthlyOrders: monthlyOrders.map((m) => ({ month: m._id, count: m.count })),
        categoryPerformance: categoryPerformance.map((c) => ({ category: c._id, count: c.count })),
        userGrowth: userGrowth.map((u) => ({ role: u._id, count: u.count })),
        revenueByMonth: revenueByMonth.map((r) => ({ month: r._id, revenue: r.revenue })),
      },
    });
  } catch (e) {
    sendError(res, 500, "Failed to load analytics", e);
  }
}

export async function statsUsers(req, res) {
  try {
    const total = await service.countDocs(req.db, "user");
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}

export async function statsProducts(req, res) {
  try {
    const total = await service.countDocs(req.db, "products");
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}

export async function statsOrders(req, res) {
  try {
    const total = await service.countDocs(req.db, "orders");
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}

export async function statsRevenue(req, res) {
  try {
    const totalRevenue = await service.getTotalRevenue(req.db);
    res.status(200).json({ success: true, result: { totalRevenue } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}

export async function statsRevenueByMonth(req, res) {
  try {
    const revenueByMonth = await service.getRevenueByMonth(req.db);
    res.status(200).json({ success: true, result: { revenueByMonth } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
}

export async function analyticsSummary(req, res) {
  try {
    const result = await service.getAnalyticsSummary(req.db);
    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to load analytics summary", e);
  }
}
