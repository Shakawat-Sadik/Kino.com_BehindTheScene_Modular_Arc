import { sendError } from "../lib/respond.js";
import { getAuthUser } from "../lib/authCache.js";

/**
 * Role guards. Resolve the user by req.user.email (Redis auth-role cache, falling
 * back to Mongo) and attach req.dbUser. Role/status mutations invalidate the
 * cache (see lib/authCache.invalidateAuthUser) so changes propagate instantly.
 */
const makeGuard = (allowedRoles, forbiddenMessage) => async (req, res, next) => {
  try {
    if (!req.user?.email) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const user = await getAuthUser(req.db, req.user.email);
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
