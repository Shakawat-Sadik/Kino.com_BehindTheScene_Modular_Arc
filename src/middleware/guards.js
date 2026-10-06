import { sendError } from "../lib/respond.js";

/**
 * Role guards. Look up the user by req.user.email and attach req.dbUser.
 *
 * NOTE: still a direct Mongo lookup per request — Phase 3.5/4.4 swaps this for a
 * shared Redis auth-role cache (user:auth:${email}) with explicit invalidation.
 */
const makeGuard = (allowedRoles, forbiddenMessage) => async (req, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const user = await req.db.collection("user").findOne({ email: req.user.email });
    if (!user || !allowedRoles.includes(user.role?.toLowerCase())) {
      return res.status(403).json({ success: false, message: forbiddenMessage });
    }
    req.dbUser = user;
    next();
  } catch (error) {
    sendError(res, 500, "Authorization check failed", error);
  }
};

export const adminGuard = makeGuard(["admin"], "Forbidden: Admins only");
export const sellerGuard = makeGuard(["seller", "admin"], "Forbidden: Sellers and Admins only");
export const buyerGuard = makeGuard(["buyer", "admin"], "Forbidden: Buyers and Admins only");
