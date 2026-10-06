import { isDev } from "../config/env.js";

// Safe error response — never leaks internals in production.
export const sendError = (res, statusCode, message, error = null) => {
  if (error) console.error(`[${message}]`, error);
  res.status(statusCode).json({
    success: false,
    message: isDev && error ? error.message : message,
  });
};

// Consistent success envelope. Extra fields (total, page, limit…) via `extra`.
export const sendSuccess = (res, statusCode, payload = {}, extra = {}) => {
  res.status(statusCode).json({ success: true, ...payload, ...extra });
};
