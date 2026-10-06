import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { validate } from "../../middleware/validate.js";
import { updateProfileSchema } from "./profile.schemas.js";
import * as controller from "./profile.controller.js";

const router = Router();

router.get("/profile", verifyToken, controller.get);
router.patch("/profile", verifyToken, validate(updateProfileSchema), controller.update);

export default router;
