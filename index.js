/**
 * Entry point for the long-lived Render process.
 * Boot order: validate env → connect Mongo → connect Redis → listen.
 * Graceful shutdown on SIGTERM/SIGINT with a hard-timeout fallback.
 */
import { env } from "./src/config/env.js"; // validates env at import (fail fast)
import { connectToDB, closeDB } from "./src/config/db.js";
import { connectRedis, closeRedis } from "./src/config/redis.js";
import app from "./src/app.js";

let server;

async function start() {
  await connectToDB();
  console.log("✓ MongoDB connected");

  await connectRedis();
  console.log("✓ Redis connected");

  server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`✓ Server listening on 0.0.0.0:${env.PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully…`);

  // Hard fallback: force-exit if cleanup hangs.
  const hardTimeout = setTimeout(() => {
    console.error("✗ Graceful shutdown timed out — forcing exit.");
    process.exit(1);
  }, 10000);
  hardTimeout.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDB();
    await closeRedis();
    console.log("✓ Clean shutdown complete.");
    process.exit(0);
  } catch (e) {
    console.error("✗ Error during shutdown:", e);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Last-resort net so an unhandled rejection can't silently wedge the process.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

start().catch((e) => {
  console.error("✗ Failed to start server:", e);
  process.exit(1);
});

export default app;
