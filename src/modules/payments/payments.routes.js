import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { buyerGuard } from "../../middleware/guards.js";
import { validate } from "../../middleware/validate.js";
import { paymentsLimiter } from "../../middleware/rateLimit.js";
import { createIntentSchema, confirmSchema } from "./payments.schemas.js";
import * as c from "./payments.controller.js";

const router = Router();

router.use("/payments", paymentsLimiter);

router.post("/payments/create-intent", verifyToken, buyerGuard, validate(createIntentSchema), c.createIntent);
router.post("/payments/confirm", verifyToken, buyerGuard, validate(confirmSchema), c.confirm);
router.get("/payments/my-history", verifyToken, buyerGuard, c.history);

export default router;
