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
 * Record the order + payment and take one unit of stock (the product becomes
 * "sold" when its last unit is taken). Returns the new orderId.
 */
export async function recordPurchase(db, { buyer, product, productId, transactionId, amount }) {
  const now = new Date();
  const resolvedSellerEmail = product.sellerInfo?.email || product.sellerEmail || "";
  const resolvedSellerName = product.sellerInfo?.name || product.sellerName || "";
  const resolvedSellerPhone =
    product.sellerInfo?.phone || product.sellerInfo?.contact?.mobile1 || "";

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

  // Take one unit, atomically: the filter only matches while stock remains, and
  // the pipeline marks the listing sold when this purchase takes the last unit.
  // (Inside one $set stage "$quantity" is the pre-update value.) A missing
  // quantity is treated as 1, matching createProduct's default.
  const qty = { $ifNull: ["$quantity", 1] };
  const stock = await db.collection("products").updateOne(
    {
      _id: new ObjectId(productId),
      status: "available",
      $or: [{ quantity: { $gte: 1 } }, { quantity: { $exists: false } }],
    },
    [
      {
        $set: {
          quantity: { $subtract: [qty, 1] },
          status: { $cond: [{ $lte: [qty, 1] }, "sold", "$status"] },
          updatedAt: now,
        },
      },
    ],
  );
  if (stock.matchedCount === 0) {
    // Oversold (two buyers raced for the last unit) or taken down mid-checkout.
    // The buyer has already paid, so the order stands; it needs a refund — see
    // docs/refund-flow-plan.md in the frontend repo.
    console.warn(
      `[payments] product ${productId} had no stock/was unavailable for order ${orderResult.insertedId} (tx ${transactionId}) — refund required`,
    );
  }

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
