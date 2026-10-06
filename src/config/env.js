/**
 * Load + validate environment once, at import time. Fail fast on missing vars
 * so the process never boots half-configured.
 */
import "dotenv/config";

const REQUIRED = [
  "MONGODB_URI",
  "REDIS_URL",
  "CLIENT_URL",
  "STRIPE_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`✗ Missing required environment variable(s): ${missing.join(", ")}`);
  console.error("  See .env.example for the full list.");
  process.exit(1);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  CLIENT_URL: process.env.CLIENT_URL,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  DB_NAME: "kino_main",
};

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
