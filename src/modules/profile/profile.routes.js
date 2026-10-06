import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import * as controller from "./profile.controller.js";

const router = Router();

router.get("/profile", verifyToken, controller.get);
router.patch("/profile", verifyToken, controller.update);

export default router;
