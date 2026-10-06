import { Router } from "express";
import * as controller from "./products.controller.js";

const router = Router();

router.get("/products", controller.list);
router.get("/products/:id", controller.getById);

export default router;
