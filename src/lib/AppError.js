/**
 * Typed error for controlled failures. Throw from services/controllers; the
 * central errorHandler maps statusCode + message to the HTTP response.
 */
export class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
