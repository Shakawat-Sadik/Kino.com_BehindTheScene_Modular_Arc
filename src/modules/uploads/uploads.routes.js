import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import * as c from "./uploads.controller.js";

const router = Router();

router.post("/upload", uploadLimiter, verifyToken, c.upload);
router.delete("/upload/*publicId", uploadLimiter, verifyToken, c.remove);

export default router;
