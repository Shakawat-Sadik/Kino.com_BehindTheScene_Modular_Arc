export async function listReviews(db, limit) {
  return db.collection("reviews").find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function listReviewsByProduct(db, productId) {
  return db.collection("reviews").find({ productId }).sort({ createdAt: -1 }).toArray();
}

export async function findReview(db, productId, buyerEmail) {
  return db.collection("reviews").findOne({ productId, buyerEmail });
}

export async function createReview(db, review) {
  return db.collection("reviews").insertOne(review);
}
