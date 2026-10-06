import { ObjectId } from "../../lib/objectId.js";

export async function listProducts(db, { filter, skip, limit }) {
  const col = db.collection("products");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function createProduct(db, product) {
  return db.collection("products").insertOne(product);
}

export function updateOwnProduct(db, id, sellerEmail, update) {
  return db.collection("products").updateOne(
    { _id: new ObjectId(id), sellerEmail },
    { $set: update },
  );
}

export function deleteOwnProduct(db, id, sellerEmail) {
  return db.collection("products").deleteOne({ _id: new ObjectId(id), sellerEmail });
}

export async function listOrders(db, { filter, skip, limit }) {
  const col = db.collection("orders");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function updateOwnOrderStatus(db, id, sellerEmail, status) {
  return db.collection("orders").updateOne(
    { _id: new ObjectId(id), sellerEmail },
    { $set: { orderStatus: status, updatedAt: new Date() } },
  );
}

export async function getStats(db, sellerEmail) {
  const [totalProducts, totalOrders, pendingOrders, revenueData] = await Promise.all([
    db.collection("products").countDocuments({ sellerEmail }),
    db.collection("orders").countDocuments({ sellerEmail }),
    db.collection("orders").countDocuments({ sellerEmail, orderStatus: "pending" }),
    db.collection("payments").aggregate([
      { $match: { sellerEmail, paymentStatus: "success" } },
      { $group: { _id: null, totalRevenue: { $sum: "$amount" } } },
    ]).toArray(),
  ]);
  const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
  return { totalProducts, totalOrders, totalRevenue, pendingOrders };
}

export async function getAnalytics(db, sellerEmail) {
  const [monthlySales, topProducts] = await Promise.all([
    db.collection("orders").aggregate([
      { $match: { sellerEmail } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray(),
    db.collection("products").find({ sellerEmail }).sort({ soldCount: -1 }).limit(5).toArray(),
  ]);
  return { monthlySales, topProducts };
}
