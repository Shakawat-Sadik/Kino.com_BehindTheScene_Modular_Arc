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

/**
 * Delete a seller's listings that are not sold: available, pending (awaiting
 * approval) and rejected (taken down). Sold ones stay so order history keeps
 * its product reference; refunds work from order/payment records, not the
 * product. Also drops the deleted ids from every user's wishlist (stored as
 * strings). Returns the number of listings removed.
 */
export async function deleteUnsoldListings(db, sellerEmail) {
  const products = db.collection("products");
  const ids = await products
    .find({ sellerEmail, status: { $ne: "sold" } }, { projection: { _id: 1 } })
    .map((p) => p._id)
    .toArray();
  if (ids.length === 0) return 0;

  const { deletedCount } = await products.deleteMany({ _id: { $in: ids } });
  const idStrings = ids.map((id) => id.toString());
  await db.collection("user").updateMany(
    { wishlist: { $in: idStrings } },
    { $pull: { wishlist: { $in: idStrings } } },
  );
  return deletedCount;
}

/**
 * Delete better-auth's records for a user: `account` (password hash / Google
 * link) and `session` (logged-in sessions). Both point to the user via
 * `userId`, which better-auth's Mongo adapter stores as an ObjectId.
 */
export function deleteAuthRecords(db, userId) {
  const filter = { userId: new ObjectId(userId) };
  return Promise.all([
    db.collection("account").deleteMany(filter),
    db.collection("session").deleteMany(filter),
  ]);
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
