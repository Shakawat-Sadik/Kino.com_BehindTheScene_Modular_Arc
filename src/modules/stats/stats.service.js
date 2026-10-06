export async function getPublicStats(db) {
  const [totalProducts, totalOrders, sellers, buyers] = await Promise.all([
    db.collection("products").countDocuments(),
    db.collection("orders").countDocuments(),
    db.collection("user").countDocuments({ role: "seller" }),
    db.collection("user").countDocuments({ role: "buyer" }),
  ]);
  return { totalProducts, totalOrders, totalSellers: sellers, totalBuyers: buyers };
}
