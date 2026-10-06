export async function getTopSellers(db, limit) {
  return db.collection("user").aggregate([
    { $match: { role: "seller" } },
    {
      $lookup: {
        from: "products",
        localField: "email",
        foreignField: "sellerEmail",
        as: "products",
      },
    },
    {
      $project: {
        name: 1,
        email: 1,
        image: 1,
        location: 1,
        productCount: { $size: "$products" },
      },
    },
    { $sort: { productCount: -1 } },
    { $limit: limit },
  ]).toArray();
}
