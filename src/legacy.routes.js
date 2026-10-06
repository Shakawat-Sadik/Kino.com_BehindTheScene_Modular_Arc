/**
 * TEMPORARY — holds every route not yet migrated to a module.
 *
 * Phase 2 relocated the original index.js route bodies here verbatim (swapping
 * inline helpers for the extracted lib/middleware/config imports — behaviour is
 * byte-for-byte identical). Phase 3 peels these out one module at a time; this
 * file shrinks to nothing and is then deleted.
 */
import { Router } from "express";
import crypto from "crypto";

import { verifyToken } from "./middleware/verifyToken.js";
import { adminGuard, sellerGuard, buyerGuard } from "./middleware/guards.js";
import { parsePagination } from "./lib/pagination.js";
import { isValidObjectId, ObjectId } from "./lib/objectId.js";
import { sendError } from "./lib/respond.js";
import { stripe } from "./config/stripe.js";
import { cloudinary } from "./config/cloudinary.js";

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.get("/", (req, res) => {
  res.json({ message: "Kino.com server has started" });
});

router.get("/stats", async (req, res) => {
  try {
    const [totalProducts, totalOrders, sellers, buyers] = await Promise.all([
      req.db.collection("products").countDocuments(),
      req.db.collection("orders").countDocuments(),
      req.db.collection("user").countDocuments({ role: "seller" }),
      req.db.collection("user").countDocuments({ role: "buyer" }),
    ]);
    res.status(200).json({
      success: true,
      result: { totalProducts, totalOrders, totalSellers: sellers, totalBuyers: buyers },
    });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/sellers/top", async (req, res) => {
  try {
    const limit = Math.min(10, parseInt(req.query.limit, 10) || 3);
    const sellers = await req.db.collection("user")
      .aggregate([
        { $match: { role: "seller" } },
        {
          $lookup: {
            from: "products",
            localField: "email",
            foreignField: "sellerEmail",
            as: "products",
          },
        },
        {
          $project: {
            name: 1,
            email: 1,
            image: 1,
            location: 1,
            productCount: { $size: "$products" },
          },
        },
        { $sort: { productCount: -1 } },
        { $limit: limit },
      ])
      .toArray();
    res.status(200).json({ success: true, result: sellers });
  } catch (e) {
    sendError(res, 500, "Failed to fetch top sellers", e);
  }
});

router.get("/reviews", async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 6);
    const reviews = await req.db.collection("reviews")
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    res.status(200).json({ success: true, result: reviews });
  } catch (e) {
    sendError(res, 500, "Failed to fetch reviews", e);
  }
});

router.get("/reviews/:productId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const reviews = await req.db.collection("reviews")
      .find({ productId: req.params.productId })
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ success: true, result: reviews });
  } catch (e) {
    sendError(res, 500, "Failed to fetch reviews", e);
  }
});

router.post("/reviews", verifyToken, buyerGuard, async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;
    if (!productId || !rating) {
      return res.status(400).json({ success: false, message: "productId and rating are required" });
    }
    if (!isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const reviewsCol = req.db.collection("reviews");
    const existing = await reviewsCol.findOne({ productId, buyerEmail: req.user.email });
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

    const result = await reviewsCol.insertOne(review);
    res.status(201).json({ success: true, message: "Review added", result });
  } catch (e) {
    sendError(res, 500, "Failed to add review", e);
  }
});

// --- PRODUCTS ---
router.get("/products", async (req, res) => {
  try {
    const productsCol = req.db.collection("products");
    const { sort, order, search, category, status, condition } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (search) filter.title = { $regex: search, $options: "i" };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (condition) filter.condition = condition;

    const sortObj = {};
    if (sort) {
      const direction = order === "desc" ? -1 : 1;
      if (sort === "price") sortObj.price = direction;
      if (sort === "dateUploaded") sortObj.dateUploaded = direction;
    }

    const [result, total] = await Promise.all([
      productsCol.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
      productsCol.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      message: "Products loaded successfully",
      result,
      total,
      page,
      limit,
    });
  } catch (e) {
    sendError(res, 500, "Failed to load products", e);
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const result = await req.db.collection("products").findOne({ _id: new ObjectId(req.params.id) });

    if (!result) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, message: "Product info loaded", result });
  } catch (e) {
    sendError(res, 500, "Failed to load product", e);
  }
});

// ==========================================
// ADMIN PROTECTED ROUTES
// ==========================================

router.use("/admin", verifyToken, adminGuard);

// --- USERS ---
router.get("/admin/users", async (req, res) => {
  try {
    const usersCol = req.db.collection("user");
    const { search, role, sort, order, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status;

    const sortObj = {};
    if (sort) sortObj[sort] = order === "desc" ? -1 : 1;
    else sortObj.createdAt = -1;

    const [result, total] = await Promise.all([
      usersCol.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
      usersCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch users", e);
  }
});

router.patch("/admin/users/:userId/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    const result = await req.db.collection("user").updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: { status } },
    );
    res.status(200).json({ success: true, message: "User status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update user status", e);
  }
});

router.patch("/admin/users/:userId", async (req, res) => {
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

    const result = await req.db.collection("user").updateOne(
      { _id: new ObjectId(req.params.userId) },
      { $set: update },
    );
    res.status(200).json({ success: true, message: "User updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update user", e);
  }
});

router.delete("/admin/users/:userId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    await req.db.collection("user").deleteOne({ _id: new ObjectId(req.params.userId) });
    res.status(200).json({ success: true, message: "User deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete user", e);
  }
});

// --- PRODUCTS ---
router.get("/admin/products", async (req, res) => {
  try {
    const productsCol = req.db.collection("products");
    const { search, category, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (search) filter.title = { $regex: search, $options: "i" };
    if (category) filter.category = category;
    if (status) filter.status = status;

    const [result, total] = await Promise.all([
      productsCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      productsCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch products", e);
  }
});

router.patch("/admin/products/:productId", async (req, res) => {
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

    const result = await req.db.collection("products").updateOne(
      { _id: new ObjectId(req.params.productId) },
      { $set: update },
    );
    res.status(200).json({ success: true, message: "Product updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update product", e);
  }
});

router.patch("/admin/products/:productId/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const { status } = req.body;
    const result = await req.db.collection("products").updateOne(
      { _id: new ObjectId(req.params.productId) },
      { $set: { status } },
    );
    res.status(200).json({ success: true, message: "Product status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update product status", e);
  }
});

router.delete("/admin/products/:productId", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await req.db.collection("products").deleteOne({ _id: new ObjectId(req.params.productId) });
    res.status(200).json({ success: true, message: "Product deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete product", e);
  }
});

// --- ORDERS ---
router.get("/admin/orders", async (req, res) => {
  try {
    const ordersCol = req.db.collection("orders");
    const { search, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (status) filter.orderStatus = status;
    if (search) {
      filter.$or = [
        { "buyerInfo.name": { $regex: search, $options: "i" } },
        { "buyerInfo.email": { $regex: search, $options: "i" } },
      ];
    }

    const [result, total] = await Promise.all([
      ordersCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      ordersCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch orders", e);
  }
});

router.patch("/admin/orders/:orderId/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.orderId)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const { status } = req.body;
    const result = await req.db.collection("orders").updateOne(
      { _id: new ObjectId(req.params.orderId) },
      { $set: { orderStatus: status } },
    );
    res.status(200).json({ success: true, message: "Order status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update order status", e);
  }
});

router.get("/admin/payments", async (req, res) => {
  try {
    const paymentsCol = req.db.collection("payments");
    const { search, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = {};
    if (status) filter.paymentStatus = status;
    if (search) {
      filter.$or = [
        { buyerEmail: { $regex: search, $options: "i" } },
        { sellerEmail: { $regex: search, $options: "i" } },
        { transactionId: { $regex: search, $options: "i" } },
      ];
    }

    const [result, total] = await Promise.all([
      paymentsCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      paymentsCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch payments", e);
  }
});

// --- ANALYTICS ---
router.get("/admin/analytics", async (req, res) => {
  try {
    const ordersCol = req.db.collection("orders");
    const productsCol = req.db.collection("products");
    const usersCol = req.db.collection("user");
    const paymentsCol = req.db.collection("payments");

    const [monthlyOrders, categoryPerformance, userGrowth, revenueByMonth] = await Promise.all([
      ordersCol.aggregate([
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      productsCol.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      usersCol.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]).toArray(),
      paymentsCol.aggregate([
        { $match: { paymentStatus: "success" } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, revenue: { $sum: "$amount" } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

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
});

// --- STATS ---
router.get("/admin/stats/users", async (req, res) => {
  try {
    const total = await req.db.collection("user").countDocuments();
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/admin/stats/products", async (req, res) => {
  try {
    const total = await req.db.collection("products").countDocuments();
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/admin/stats/orders", async (req, res) => {
  try {
    const total = await req.db.collection("orders").countDocuments();
    res.status(200).json({ success: true, result: { total } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/admin/stats/revenue", async (req, res) => {
  try {
    const data = await req.db.collection("payments").aggregate([
      { $match: { paymentStatus: "success" } },
      { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
    ]).toArray();
    const totalRevenue = data.length > 0 ? data[0].totalRevenue : 0;
    res.status(200).json({ success: true, result: { totalRevenue } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/admin/stats/revenue-by-month", async (req, res) => {
  try {
    const revenueData = await req.db.collection("payments").aggregate([
      { $match: { paymentStatus: "success" } },
      { $group: { _id: { $month: "$createdAt" }, revenue: { $sum: "$amount" } } },
    ]).toArray();
    res.status(200).json({ success: true, result: { revenueByMonth: revenueData } });
  } catch (e) {
    sendError(res, 500, "Failed to fetch stats", e);
  }
});

router.get("/admin/analytics/summary", async (req, res) => {
  try {
    const [totalOrders, totalProducts, totalUsers, revenueData] = await Promise.all([
      req.db.collection("orders").countDocuments(),
      req.db.collection("products").countDocuments(),
      req.db.collection("user").countDocuments(),
      req.db.collection("payments").aggregate([
        { $match: { paymentStatus: "success" } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
      ]).toArray(),
    ]);

    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    res.status(200).json({
      success: true,
      result: { totalOrders, totalProducts, totalUsers, totalRevenue },
    });
  } catch (e) {
    sendError(res, 500, "Failed to load analytics summary", e);
  }
});

// ==========================================
// SELLER PROTECTED ROUTES
// ==========================================

router.use("/seller", verifyToken, sellerGuard);

router.get("/seller/products", async (req, res) => {
  try {
    const productsCol = req.db.collection("products");
    const { search, category, status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { sellerEmail: req.user.email };
    if (search) filter.title = { $regex: search, $options: "i" };
    if (category) filter.category = category;
    if (status) filter.status = status;

    const [result, total] = await Promise.all([
      productsCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      productsCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller products", e);
  }
});

router.post("/seller/products", async (req, res) => {
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
    const result = await req.db.collection("products").insertOne(product);
    res.status(201).json({ success: true, message: "Product created", result });
  } catch (e) {
    sendError(res, 500, "Failed to create product", e);
  }
});

router.patch("/seller/products/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const filter = { _id: new ObjectId(req.params.id), sellerEmail: req.user.email };
    const { title, category, condition, price, description, images } = req.body;
    const update = { updatedAt: new Date() };
    if (title !== undefined) update.title = title;
    if (category !== undefined) update.category = category;
    if (condition !== undefined) update.condition = condition;
    if (price !== undefined) update.price = Number(price);
    if (description !== undefined) update.description = description;
    if (images !== undefined) update.images = images;
    const result = await req.db.collection("products").updateOne(filter, { $set: update });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found or not yours" });
    }
    res.status(200).json({ success: true, message: "Product updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update product", e);
  }
});

router.delete("/seller/products/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    const filter = { _id: new ObjectId(req.params.id), sellerEmail: req.user.email };
    const result = await req.db.collection("products").deleteOne(filter);
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "Product not found or not yours" });
    }
    res.status(200).json({ success: true, message: "Product deleted", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to delete product", e);
  }
});

router.get("/seller/orders", async (req, res) => {
  try {
    const ordersCol = req.db.collection("orders");
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

    const [result, total] = await Promise.all([
      ordersCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      ordersCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller orders", e);
  }
});

router.patch("/seller/orders/:id/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }
    const filter = { _id: new ObjectId(req.params.id), sellerEmail: req.user.email };
    const result = await req.db.collection("orders").updateOne(
      filter,
      { $set: { orderStatus: status, updatedAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found or not yours" });
    }
    res.status(200).json({ success: true, message: "Order status updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update order status", e);
  }
});

router.get("/seller/stats", async (req, res) => {
  try {
    const [totalProducts, totalOrders, pendingOrders, revenueData] = await Promise.all([
      req.db.collection("products").countDocuments({ sellerEmail: req.user.email }),
      req.db.collection("orders").countDocuments({ sellerEmail: req.user.email }),
      req.db.collection("orders").countDocuments({ sellerEmail: req.user.email, orderStatus: "pending" }),
      req.db.collection("payments").aggregate([
        { $match: { sellerEmail: req.user.email, paymentStatus: "success" } },
        { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
      ]).toArray(),
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    res.status(200).json({
      success: true,
      result: { totalProducts, totalOrders, totalRevenue, pendingOrders },
    });
  } catch (e) {
    sendError(res, 500, "Failed to fetch seller stats", e);
  }
});

router.get("/seller/analytics", async (req, res) => {
  try {
    const [monthlySales, topProducts] = await Promise.all([
      req.db.collection("orders").aggregate([
        { $match: { sellerEmail: req.user.email } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      req.db.collection("products")
        .find({ sellerEmail: req.user.email })
        .sort({ soldCount: -1 })
        .limit(5)
        .toArray(),
    ]);

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
});

// ==========================================
// BUYER PROTECTED ROUTES
// ==========================================

router.use("/buyer", verifyToken, buyerGuard);

router.get("/buyer/orders", async (req, res) => {
  try {
    const ordersCol = req.db.collection("orders");
    const { status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { "buyerInfo.email": req.user.email };
    if (status) filter.orderStatus = status;

    const [result, total] = await Promise.all([
      ordersCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      ordersCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch buyer orders", e);
  }
});

router.patch("/buyer/orders/:id/cancel", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid order ID" });
    }
    const filter = {
      _id: new ObjectId(req.params.id),
      "buyerInfo.email": req.user.email,
      orderStatus: "pending",
    };
    const result = await req.db.collection("orders").updateOne(filter, {
      $set: { orderStatus: "cancelled", updatedAt: new Date() },
    });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found or cannot be cancelled" });
    }
    res.status(200).json({ success: true, message: "Order cancelled", result });
  } catch (e) {
    sendError(res, 500, "Failed to cancel order", e);
  }
});

router.get("/buyer/stats", async (req, res) => {
  try {
    const [totalOrders, user, recentPurchases] = await Promise.all([
      req.db.collection("orders").countDocuments({ "buyerInfo.email": req.user.email }),
      req.db.collection("user").findOne({ email: req.user.email }),
      req.db.collection("orders")
        .find({ "buyerInfo.email": req.user.email, orderStatus: "delivered" })
        .sort({ _id: -1 })
        .limit(5)
        .toArray(),
    ]);

    const wishlistCount = user?.wishlist?.length || 0;

    res.status(200).json({
      success: true,
      result: { totalOrders, wishlistCount, recentPurchases },
    });
  } catch (e) {
    sendError(res, 500, "Failed to fetch buyer stats", e);
  }
});

// ==========================================
// WISHLIST ROUTES
// ==========================================

router.get("/wishlist", verifyToken, async (req, res) => {
  try {
    const user = await req.db.collection("user").findOne({ email: req.user.email });
    const wishlist = user?.wishlist || [];

    if (wishlist.length === 0) {
      return res.status(200).json({ success: true, result: [] });
    }

    const validIds = wishlist.filter((id) => isValidObjectId(id));
    const objectIds = validIds.map((id) => new ObjectId(id));
    const result = await req.db.collection("products").find({ _id: { $in: objectIds } }).toArray();

    res.status(200).json({ success: true, result });
  } catch (e) {
    sendError(res, 500, "Failed to fetch wishlist", e);
  }
});

router.post("/wishlist/:productId", verifyToken, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await req.db.collection("user").updateOne(
      { email: req.user.email },
      { $addToSet: { wishlist: req.params.productId } },
    );
    res.status(200).json({ success: true, message: "Added to wishlist", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to update wishlist", e);
  }
});

router.delete("/wishlist/:productId", verifyToken, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }
    await req.db.collection("user").updateOne(
      { email: req.user.email },
      { $pull: { wishlist: req.params.productId } },
    );
    res.status(200).json({ success: true, message: "Removed from wishlist", result: null });
  } catch (e) {
    sendError(res, 500, "Failed to update wishlist", e);
  }
});

// ==========================================
// PROFILE ROUTES
// ==========================================

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await req.db.collection("user").findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const { password, ...profile } = user;
    res.status(200).json({ success: true, result: profile });
  } catch (e) {
    sendError(res, 500, "Failed to fetch profile", e);
  }
});

router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { name, contact, location, image, role } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (contact !== undefined) update.contact = contact;
    if (location !== undefined) update.location = location;
    if (image !== undefined) update.image = image;
    if (role !== undefined && ["buyer", "seller"].includes(role)) update.role = role;

    const result = await req.db.collection("user").updateOne(
      { email: req.user.email },
      { $set: update },
    );
    res.status(200).json({ success: true, message: "Profile updated", result });
  } catch (e) {
    sendError(res, 500, "Failed to update profile", e);
  }
});

// ==========================================
// PAYMENTS ROUTES
// ==========================================

router.post("/payments/create-intent", verifyToken, buyerGuard, async (req, res) => {
  try {
    const { amount, productId, productTitle } = req.body;

    if (!amount || !productId) {
      return res.status(400).json({ success: false, message: "amount and productId are required" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: "gbp",
      metadata: { productId, productTitle, buyerEmail: req.user.email },
    });

    res.status(200).json({
      success: true,
      result: { clientSecret: paymentIntent.client_secret },
    });
  } catch (e) {
    sendError(res, 500, "Failed to create payment intent", e);
  }
});

router.post("/payments/confirm", verifyToken, buyerGuard, async (req, res) => {
  try {
    const { transactionId, productId, sellerEmail, amount, productTitle } = req.body;

    if (!transactionId || !productId) {
      return res.status(400).json({ success: false, message: "transactionId and productId are required" });
    }

    if (!isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(transactionId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ success: false, message: "Payment not confirmed by Stripe" });
    }

    const buyer = req.dbUser;
    const productsCol = req.db.collection("products");
    const ordersCol = req.db.collection("orders");
    const paymentsCol = req.db.collection("payments");

    const existing = await paymentsCol.findOne({ transactionId });
    if (existing) {
      return res.status(409).json({ success: false, message: "Payment already recorded" });
    }

    const product = await productsCol.findOne({ _id: new ObjectId(productId) });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const now = new Date();

    const resolvedSellerEmail = product.sellerInfo?.email || product.sellerEmail || "";
    const resolvedSellerName  = product.sellerInfo?.name  || product.sellerName  || "";
    const resolvedSellerPhone = product.sellerInfo?.phone || "";

    const order = {
      buyerInfo: { userId: buyer._id.toString(), name: buyer.name, email: buyer.email },
      sellerInfo: { email: resolvedSellerEmail, name: resolvedSellerName, phone: resolvedSellerPhone },
      sellerEmail: resolvedSellerEmail,
      productId,
      productTitle: product.title,
      transactionId,
      totalAmount: amount,
      orderStatus: "pending",
      paymentStatus: "paid",
      createdAt: now,
      updatedAt: now,
    };
    const orderResult = await ordersCol.insertOne(order);

    await paymentsCol.insertOne({
      transactionId,
      orderId: orderResult.insertedId.toString(),
      productId,
      buyerEmail: buyer.email,
      sellerEmail: resolvedSellerEmail,
      amount,
      paymentStatus: "success",
      paymentMethod: "stripe",
      createdAt: now,
    });

    await productsCol.updateOne(
      { _id: new ObjectId(productId) },
      { $set: { status: "sold", updatedAt: now } },
    );

    res.status(201).json({
      success: true,
      message: "Order and payment saved",
      result: { orderId: orderResult.insertedId },
    });
  } catch (e) {
    sendError(res, 500, "Failed to save payment", e);
  }
});

router.get("/payments/my-history", verifyToken, buyerGuard, async (req, res) => {
  try {
    const paymentsCol = req.db.collection("payments");
    const { status } = req.query;
    const { skip, limit } = parsePagination(req.query);

    const filter = { buyerEmail: req.user.email };
    if (status) filter.paymentStatus = status;

    const [result, total] = await Promise.all([
      paymentsCol.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      paymentsCol.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, result, total });
  } catch (e) {
    sendError(res, 500, "Failed to fetch payment history", e);
  }
});

// ==========================================
// UPLOAD ROUTES
// ==========================================

router.post("/upload", verifyToken, async (req, res) => {
  try {
    const mimeType = req.headers["content-type"] || "image/jpeg";
    const folder = req.headers["x-upload-folder"] || "Kino.com";
    const fileName = req.headers["x-upload-filename"] || "upload";

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({ success: false, message: "No file data received" });
    }

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const uploadsCol = req.db.collection("cloudinary_uploads");

    const existing = await uploadsCol.findOne({ hash });
    if (existing) {
      return res.status(200).json({
        success: true,
        result: { url: existing.url, public_id: existing.public_id, isDuplicate: true },
      });
    }

    const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      transformation: [
        { width: 1200, height: 900, crop: "limit" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    });

    try {
      await uploadsCol.insertOne({
        hash,
        fileName,
        fileSize: buffer.length,
        mimeType,
        public_id: result.public_id,
        url: result.secure_url,
        folder: result.folder,
        uploadedBy: req.user.email,
        createdAt: new Date(),
      });
    } catch (e) {
      if (e.code === 11000) {
        const winner = await uploadsCol.findOne({ hash });
        return res.status(200).json({
          success: true,
          result: { url: winner.url, public_id: winner.public_id, isDuplicate: true },
        });
      }
      throw e;
    }

    return res.status(200).json({
      success: true,
      result: { url: result.secure_url, public_id: result.public_id, isDuplicate: false },
    });
  } catch (e) {
    sendError(res, 500, "Upload failed", e);
  }
});

router.delete("/upload/*publicId", verifyToken, async (req, res) => {
  try {
    const publicId = req.params.publicId;
    const uploadsCol = req.db.collection("cloudinary_uploads");

    const record = await uploadsCol.findOne({ public_id: publicId });
    if (!record) {
      return res.status(404).json({ success: false, message: "Image not found" });
    }
    if (record.uploadedBy !== req.user.email) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await cloudinary.uploader.destroy(publicId);
    await uploadsCol.deleteOne({ public_id: publicId });

    return res.status(200).json({ success: true, message: "Image deleted" });
  } catch (e) {
    sendError(res, 500, "Delete failed", e);
  }
});

export default router;
