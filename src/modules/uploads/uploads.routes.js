import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import * as c from "./uploads.controller.js";

const router = Router();

router.post("/upload", verifyToken, c.upload);
router.delete("/upload/*publicId", verifyToken, c.remove);

export default router;
