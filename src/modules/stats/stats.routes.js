import { Router } from "express";
import * as controller from "./stats.controller.js";

const router = Router();

router.get("/stats", controller.publicStats);

export default router;
