import { AppError } from "../lib/AppError.js";
import { isDev } from "../config/env.js";

/**
 * Central error handler (last app.use). Express 5 forwards rejected promises
 * from async handlers here automatically — no asyncHandler wrapper needed.
 * AppError carries an intended statusCode; anything else is a 500 that never
 * leaks internals in production.
 */
// eslint-disable-next-line no-unused-vars -- Express requires the 4-arg signature
export const errorHandler = (err, req, res, next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  if (statusCode >= 500) {
    console.error(`[errorHandler] ${req.method} ${req.originalUrl}:`, err);
  }

  const message =
    err instanceof AppError
      ? err.message
      : isDev
        ? err.message
        : "Internal server error";

  res.status(statusCode).json({ success: false, message });
};
