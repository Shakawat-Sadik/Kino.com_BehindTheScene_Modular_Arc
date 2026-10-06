import { ObjectId } from "../../lib/objectId.js";

// ── users ──────────────────────────────────────────────────
export async function listUsers(db, { filter, sortObj, skip, limit }) {
  const col = db.collection("user");
  const [result, total] = await Promise.all([
    col.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function findUserEmailById(db, userId) {
  return db.collection("user").findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } });
}

export function updateUserStatus(db, userId, status) {
  return db.collection("user").updateOne({ _id: new ObjectId(userId) }, { $set: { status } });
}

export function updateUser(db, userId, update) {
  return db.collection("user").updateOne({ _id: new ObjectId(userId) }, { $set: update });
}

export function deleteUser(db, userId) {
  return db.collection("user").deleteOne({ _id: new ObjectId(userId) });
}

// ── products ───────────────────────────────────────────────
export async function listProducts(db, { filter, skip, limit }) {
  const col = db.collection("products");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function updateProduct(db, productId, update) {
  return db.collection("products").updateOne({ _id: new ObjectId(productId) }, { $set: update });
}

export function updateProductStatus(db, productId, status) {
  return db.collection("products").updateOne({ _id: new ObjectId(productId) }, { $set: { status } });
}

export function deleteProduct(db, productId) {
  return db.collection("products").deleteOne({ _id: new ObjectId(productId) });
}

// ── orders ─────────────────────────────────────────────────
export async function listOrders(db, { filter, skip, limit }) {
  const col = db.collection("orders");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function updateOrderStatus(db, orderId, status) {
  return db.collection("orders").updateOne({ _id: new ObjectId(orderId) }, { $set: { orderStatus: status } });
}

// ── payments ───────────────────────────────────────────────
export async function listPayments(db, { filter, skip, limit }) {
  const col = db.collection("payments");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

// ── analytics / stats ──────────────────────────────────────
export async function getAnalytics(db) {
  const [monthlyOrders, categoryPerformance, userGrowth, revenueByMonth] = await Promise.all([
    db.collection("orders").aggregate([
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection("products").aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    db.collection("user").aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]).toArray(),
    db.collection("payments").aggregate([
      { $match: { paymentStatus: "success" } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, revenue: { $sum: "$amount" } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
  ]);
  return { monthlyOrders, categoryPerformance, userGrowth, revenueByMonth };
}

// Unfiltered totals → near-instant estimate instead of an O(n) scan.
export function countDocs(db, collection) {
  return db.collection(collection).estimatedDocumentCount();
}

export async function getTotalRevenue(db) {
  const data = await db.collection("payments").aggregate([
    { $match: { paymentStatus: "success" } },
    { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
  ]).toArray();
  return data.length > 0 ? data[0].totalRevenue : 0;
}

export function getRevenueByMonth(db) {
  return db.collection("payments").aggregate([
    { $match: { paymentStatus: "success" } },
    { $group: { _id: { $month: "$createdAt" }, revenue: { $sum: "$amount" } } },
  ]).toArray();
}

export async function getAnalyticsSummary(db) {
  const [totalOrders, totalProducts, totalUsers, totalRevenue] = await Promise.all([
    db.collection("orders").estimatedDocumentCount(),
    db.collection("products").estimatedDocumentCount(),
    db.collection("user").estimatedDocumentCount(),
    getTotalRevenue(db),
  ]);
  return { totalOrders, totalProducts, totalUsers, totalRevenue };
}
