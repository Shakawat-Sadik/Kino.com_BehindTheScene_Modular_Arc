import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { buyerGuard } from "../../middleware/guards.js";
import * as c from "./payments.controller.js";

const router = Router();

router.post("/payments/create-intent", verifyToken, buyerGuard, c.createIntent);
router.post("/payments/confirm", verifyToken, buyerGuard, c.confirm);
router.get("/payments/my-history", verifyToken, buyerGuard, c.history);

export default router;
