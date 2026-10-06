import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { buyerGuard } from "../../middleware/guards.js";
import * as controller from "./reviews.controller.js";

const router = Router();

router.get("/reviews", controller.list);
router.get("/reviews/:productId", controller.listByProduct);
router.post("/reviews", verifyToken, buyerGuard, controller.create);

export default router;
