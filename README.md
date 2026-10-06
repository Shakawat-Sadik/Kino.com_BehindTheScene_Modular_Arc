# Kino.com Server (Render + Upstash Redis)

Backend for the Kino.com marketplace. **Express 5 (ESM)** + **MongoDB** (native driver) + **Stripe** + **Cloudinary** + **JWT** (jose/JWKS), deployed as a **long-lived Node web service on Render** with **Upstash Redis** as a shared store.

Migrated from a single ~1300-line `index.js` to the modular architecture below (see `CLAUDE.md` for the full phased plan and rationale).

## Runtime topology

- **Long-lived process** on Render. One warm Mongo connection pool (`maxPoolSize 20`) is reused across all requests — never per-request `connect()`.
- **Persistent `ioredis`** connection to Upstash (RESP/TCP+TLS). Redis backs:
  - **auth-role cache** (`user:auth:${email}`) read by the guards, invalidated on role/status mutations;
  - **hot-read cache** for `/stats` (5 min), `/sellers/top` (10 min), and the default `/products` page (invalidated on product mutations);
  - **rate limiting** (shared across replicas via `rate-limit-redis`).
- **Deploy flow:** Render runs `preDeployCommand` (index migration) → `startCommand` → shifts traffic once `/healthz` returns 200 → sends `SIGTERM` on shutdown (handled by graceful shutdown: stop HTTP → close Mongo → quit Redis).
- Binds `0.0.0.0:$PORT` (Render injects `PORT`).

## Project layout

```
index.js                     entry: validate env → Mongo → Redis → listen → graceful shutdown
src/
  app.js                     build Express app: middleware → routers → notFound → errorHandler
  config/   env db redis cloudinary stripe jwks
  lib/      AppError cache cacheKeys authCache objectId pagination respond search schemaHelpers
  middleware/ attachDb verifyToken guards validate rateLimit errorHandler notFound
  modules/  <name>/<name>.{routes,controller,service}.js (+ .schemas.js where validated)
            products reviews sellers stats wishlist profile
            admin seller buyer payments uploads health
  indexes/  createIndexes.js  (index definitions — single source of truth)
scripts/
  create-indexes.js          idempotent index migration (Render preDeployCommand)
  smoke-test.mjs             pre/post-phase endpoint checks
render.yaml                  Render service spec
.env.example                 required env vars
```

**Layer contract:** `*.routes.js` wires paths + guards/validation (no logic) → `*.controller.js` reads/validates req & shapes the response (no raw driver calls) → `*.service.js` holds all Mongo access + business rules.

> **Module layout note:** modules are organised by **route prefix** (`admin`, `seller`, `buyer`) rather than by resource (`users`/`orders`), because protection is applied per-prefix — each prefixed router self-applies `verifyToken` + its role guard, so the mount-level protection travels with the routes.

## Search semantics (Phase 4.1)

Product/user/order/payment search is **prefix-anchored** (`^term`, case-insensitive) so queries use an index instead of a full scan. **This means matching is anchored to the start of the field** — searching `phone` does **not** match `iPhone` (but `iPh` does). User input is regex-escaped (`lib/search.js`).

## Commands

```bash
pnpm install
pnpm dev     # nodemon index.js   (needs MONGODB_URI + REDIS_URL + the rest of .env)
pnpm start   # node index.js      (Render startCommand; binds 0.0.0.0:$PORT)

node scripts/create-indexes.js          # idempotent index migration (report mode)
node scripts/create-indexes.js --fix    # remove duplicate docs, then build unique indexes

BASE_URL=http://localhost:5000 node scripts/smoke-test.mjs            # verify endpoints
BASE_URL=http://localhost:5000 node scripts/smoke-test.mjs --snapshot before
```

## Environment

See `.env.example`. Required: `MONGODB_URI`, `REDIS_URL`, `CLIENT_URL`, `STRIPE_SECRET_KEY`, `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`. Optional: `PORT` (default 5000), `NODE_ENV`. The app fails fast on boot if any required var is missing.

> `.env` is gitignored and not tracked. Keep real secrets out of the repo; set them in the Render dashboard (`sync: false`).

## Health

`GET /healthz` pings Mongo + Redis and returns `200` (both up) or `503` with `{ mongo, redis }` status — used by Render's health check.

## Deferred follow-ups

- **Upload streaming** (Cloudinary `upload_stream`, Phase 4.5): avoids the base64 full-buffer copy but is a request-contract change (JSON → multipart). Not implemented.
