import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { buyerGuard } from "../../middleware/guards.js";
import * as c from "./buyer.controller.js";

const router = Router();

// Re-applies the original mount-level protection (app.use("/buyer", verifyToken, buyerGuard)).
router.use(verifyToken, buyerGuard);

router.get("/buyer/orders", c.listOrders);
router.patch("/buyer/orders/:id/cancel", c.cancelOrder);
router.get("/buyer/stats", c.stats);

export default router;
