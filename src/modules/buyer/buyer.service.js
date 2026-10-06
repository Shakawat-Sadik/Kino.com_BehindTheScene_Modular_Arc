import { ObjectId } from "../../lib/objectId.js";

export async function listOrders(db, { filter, skip, limit }) {
  const col = db.collection("orders");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export function cancelOrder(db, id, buyerEmail) {
  return db.collection("orders").updateOne(
    { _id: new ObjectId(id), "buyerInfo.email": buyerEmail, orderStatus: "pending" },
    { $set: { orderStatus: "cancelled", updatedAt: new Date() } },
  );
}

export async function getStats(db, buyerEmail) {
  const [totalOrders, user, recentPurchases] = await Promise.all([
    db.collection("orders").countDocuments({ "buyerInfo.email": buyerEmail }),
    db.collection("user").findOne({ email: buyerEmail }),
    db.collection("orders")
      .find({ "buyerInfo.email": buyerEmail, orderStatus: "delivered" })
      .sort({ _id: -1 })
      .limit(5)
      .toArray(),
  ]);
  const wishlistCount = user?.wishlist?.length || 0;
  return { totalOrders, wishlistCount, recentPurchases };
}
