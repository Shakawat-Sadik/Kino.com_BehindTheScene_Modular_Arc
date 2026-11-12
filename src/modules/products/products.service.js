import { ObjectId } from "../../lib/objectId.js";

export async function listProducts(db, { filter, sortObj, skip, limit }) {
  const col = db.collection("products");
  const [result, total] = await Promise.all([
    col.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

/**
 * One product plus `seller: { image }` joined live from the seller's `user` doc
 * (the product stores only `sellerInfo.userId` as a string, so it is converted
 * for the join; a missing/invalid id just yields an empty image).
 */
export async function getProductById(db, id) {
  return db.collection("products").aggregate([
    { $match: { _id: new ObjectId(id) } },
    {
      $lookup: {
        from: "user",
        let: {
          sellerId: {
            $convert: { input: "$sellerInfo.userId", to: "objectId", onError: null, onNull: null },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$sellerId"] } } },
          { $project: { _id: 0, image: 1 } },
        ],
        as: "sellerUser",
      },
    },
    {
      $addFields: {
        seller: { image: { $ifNull: [{ $arrayElemAt: ["$sellerUser.image", 0] }, ""] } },
      },
    },
    { $project: { sellerUser: 0 } },
  ]).next();
}
