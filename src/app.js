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
import legacyRouter from "./legacy.routes.js";

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

// Everything not yet migrated to a module. Shrinks to nothing across Phase 3.
app.use(legacyRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
