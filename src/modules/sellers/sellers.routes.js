import { Router } from "express";
import * as controller from "./sellers.controller.js";

const router = Router();

router.get("/sellers/top", controller.top);

export default router;
