import { Router } from "express";
import { publicLimiter } from "../../middleware/rateLimit.js";
import * as controller from "./products.controller.js";

const router = Router();

router.get("/products", publicLimiter, controller.list);
router.get("/products/:id", publicLimiter, controller.getById);

export default router;
