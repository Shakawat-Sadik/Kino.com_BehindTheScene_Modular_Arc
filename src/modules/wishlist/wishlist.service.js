import { isValidObjectId, ObjectId } from "../../lib/objectId.js";

export async function getWishlistProducts(db, email) {
  const user = await db.collection("user").findOne({ email });
  const wishlist = user?.wishlist || [];
  if (wishlist.length === 0) return [];

  const objectIds = wishlist.filter((id) => isValidObjectId(id)).map((id) => new ObjectId(id));
  return db.collection("products").find({ _id: { $in: objectIds } }).toArray();
}

export async function addToWishlist(db, email, productId) {
  return db.collection("user").updateOne({ email }, { $addToSet: { wishlist: productId } });
}

export async function removeFromWishlist(db, email, productId) {
  return db.collection("user").updateOne({ email }, { $pull: { wishlist: productId } });
}
