import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { sellerGuard } from "../../middleware/guards.js";
import { validate } from "../../middleware/validate.js";
import { createProductSchema, updateProductSchema, updateOrderStatusSchema } from "./seller.schemas.js";
import * as c from "./seller.controller.js";

const router = Router();

// Re-applies the original mount-level protection (app.use("/seller", verifyToken, sellerGuard)).
router.use(verifyToken, sellerGuard);

router.get("/seller/products", c.listProducts);
router.post("/seller/products", validate(createProductSchema), c.createProduct);
router.patch("/seller/products/:id", validate(updateProductSchema), c.updateProduct);
router.delete("/seller/products/:id", c.deleteProduct);

router.get("/seller/orders", c.listOrders);
router.patch("/seller/orders/:id/status", validate(updateOrderStatusSchema), c.updateOrderStatus);

router.get("/seller/stats", c.stats);
router.get("/seller/analytics", c.analytics);

export default router;
