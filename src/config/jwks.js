import { createRemoteJWKSet } from "jose";
import { env } from "./env.js";

// Verifies tokens minted by the Next.js frontend's JWKS endpoint.
export const JWKS = createRemoteJWKSet(new URL(`${env.CLIENT_URL}/api/auth/jwks`));
