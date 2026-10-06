/**
 * Build & export the Express app: middleware → routers → notFound → errorHandler.
 * No process concerns here (listen/connect/shutdown live in index.js).
 */
import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { attachDb } from "./middleware/attachDb.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

import healthRouter from "./modules/health/health.routes.js";
import productsRouter from "./modules/products/products.routes.js";
import reviewsRouter from "./modules/reviews/reviews.routes.js";
import sellersRouter from "./modules/sellers/sellers.routes.js";
import statsRouter from "./modules/stats/stats.routes.js";
import wishlistRouter from "./modules/wishlist/wishlist.routes.js";
import profileRouter from "./modules/profile/profile.routes.js";
import adminRouter from "./modules/admin/admin.routes.js";
import sellerRouter from "./modules/seller/seller.routes.js";
import buyerRouter from "./modules/buyer/buyer.routes.js";
import paymentsRouter from "./modules/payments/payments.routes.js";
import uploadsRouter from "./modules/uploads/uploads.routes.js";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", env.CLIENT_URL].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json());

// Health check mounts before attachDb so it can report mongo:down itself
// instead of being short-circuited by attachDb's 503.
app.use(healthRouter);

app.use(attachDb);

// Liveness ping (kept after attachDb to preserve original behaviour).
app.get("/", (req, res) => {
  res.json({ message: "Kino.com server has started" });
});

// Public
app.use(productsRouter);
app.use(reviewsRouter);
app.use(sellersRouter);
app.use(statsRouter);

// Authenticated (per-route guards)
app.use(wishlistRouter);
app.use(profileRouter);
app.use(paymentsRouter);
app.use(uploadsRouter);

// Role-prefixed (routers self-apply verifyToken + role guard)
app.use(adminRouter);
app.use(sellerRouter);
app.use(buyerRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
