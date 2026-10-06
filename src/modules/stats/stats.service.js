export async function getPublicStats(db) {
  const [totalProducts, totalOrders, sellers, buyers] = await Promise.all([
    // Unfiltered → near-instant estimate instead of an O(n) scan.
    db.collection("products").estimatedDocumentCount(),
    db.collection("orders").estimatedDocumentCount(),
    // Filtered → must be exact.
    db.collection("user").countDocuments({ role: "seller" }),
    db.collection("user").countDocuments({ role: "buyer" }),
  ]);
  return { totalProducts, totalOrders, totalSellers: sellers, totalBuyers: buyers };
}
