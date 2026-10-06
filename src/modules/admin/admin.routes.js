import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { adminGuard } from "../../middleware/guards.js";
import { validate } from "../../middleware/validate.js";
import { updateUserStatusSchema, updateUserSchema, updateProductSchema, statusSchema } from "./admin.schemas.js";
import * as c from "./admin.controller.js";

const router = Router();

// Re-applies the original mount-level protection (app.use("/admin", verifyToken, adminGuard)).
router.use(verifyToken, adminGuard);

// users
router.get("/admin/users", c.listUsers);
router.patch("/admin/users/:userId/status", validate(updateUserStatusSchema), c.updateUserStatus);
router.patch("/admin/users/:userId", validate(updateUserSchema), c.updateUser);
router.delete("/admin/users/:userId", c.deleteUser);

// products
router.get("/admin/products", c.listProducts);
router.patch("/admin/products/:productId", validate(updateProductSchema), c.updateProduct);
router.patch("/admin/products/:productId/status", validate(statusSchema), c.updateProductStatus);
router.delete("/admin/products/:productId", c.deleteProduct);

// orders
router.get("/admin/orders", c.listOrders);
router.patch("/admin/orders/:orderId/status", validate(statusSchema), c.updateOrderStatus);

// payments
router.get("/admin/payments", c.listPayments);

// analytics / stats
router.get("/admin/analytics", c.analytics);
router.get("/admin/analytics/summary", c.analyticsSummary);
router.get("/admin/stats/users", c.statsUsers);
router.get("/admin/stats/products", c.statsProducts);
router.get("/admin/stats/orders", c.statsOrders);
router.get("/admin/stats/revenue", c.statsRevenue);
router.get("/admin/stats/revenue-by-month", c.statsRevenueByMonth);

export default router;
