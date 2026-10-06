import { ObjectId } from "../../lib/objectId.js";

export async function listProducts(db, { filter, sortObj, skip, limit }) {
  const col = db.collection("products");
  const [result, total] = await Promise.all([
    col.find(filter).sort(sortObj).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  return { result, total };
}

export async function getProductById(db, id) {
  return db.collection("products").findOne({ _id: new ObjectId(id) });
}
