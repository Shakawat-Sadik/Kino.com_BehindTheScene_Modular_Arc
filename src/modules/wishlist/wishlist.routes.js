import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import * as controller from "./wishlist.controller.js";

const router = Router();

router.get("/wishlist", verifyToken, controller.get);
router.post("/wishlist/:productId", verifyToken, controller.add);
router.delete("/wishlist/:productId", verifyToken, controller.remove);

export default router;
