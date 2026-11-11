export async function getProfile(db, email) {
  return db.collection("user").findOne({ email });
}

export async function updateProfile(db, email, update) {
  return db.collection("user").updateOne({ email }, { $set: update });
}

/**
 * Propagate changed seller fields into that seller's product snapshots. Keyed by
 * the indexed `sellerEmail`, so it touches only this seller's own listings.
 */
export async function updateSellerProductSnapshots(db, email, set) {
  return db.collection("products").updateMany({ sellerEmail: email }, { $set: set });
}
