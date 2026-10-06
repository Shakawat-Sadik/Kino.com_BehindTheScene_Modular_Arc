import { ObjectId } from "../../lib/objectId.js";
import { stripe } from "../../config/stripe.js";

export function createIntent({ amount, productId, productTitle, buyerEmail }) {
  return stripe.paymentIntents.create({
    amount: Math.round(amount),
    currency: "gbp",
    metadata: { productId, productTitle, buyerEmail },
  });
}

export function retrieveIntent(transactionId) {
  return stripe.paymentIntents.retrieve(transactionId);
}

export function findPaymentByTransaction(db, transactionId) {
  return db.collection("payments").findOne({ transactionId });
}

export function findProductById(db, productId) {
  return db.collection("products").findOne({ _id: new ObjectId(productId) });
}

/**
 * Record the order + payment and mark the product sold. Returns the new orderId.
 */
export async function recordPurchase(db, { buyer, product, productId, transactionId, amount }) {
  const now = new Date();
  const resolvedSellerEmail = product.sellerInfo?.email || product.sellerEmail || "";
  const resolvedSellerName = product.sellerInfo?.name || product.sellerName || "";
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
  const orderResult = await db.collection("orders").insertOne(order);

  await db.collection("payments").insertOne({
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

  await db.collection("products").updateOne(
    { _id: new ObjectId(productId) },
    { $set: { status: "sold", updatedAt: now } },
  );

  return orderResult.insertedId;
}

export async function listHistory(db, { filter, skip, limit }) {
  const col = db.collection("payments");
  const [result, total] = await Promise.all([
    col.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}
