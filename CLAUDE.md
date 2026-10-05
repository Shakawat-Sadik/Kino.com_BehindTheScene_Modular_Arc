# CLAUDE.md — Kino.com Server (Render + Upstash Redis base)

Backend for the Kino.com marketplace. Express 5 (ESM) + MongoDB (native driver) + Stripe + Cloudinary + JWT (jose/JWKS).

> **This is the Render base of operations.** It was forked (all files except `.git`) from the original Vercel serverless backend, which stays intact as a fallback. This copy is deployed on **Render** as a **long-lived Node web service** and integrates **Upstash Redis** as a shared store for the auth-role cache, rate limiting, and hot-query caching. Because the runtime model is now a persistent process (not ephemeral serverless functions), several serverless-era caveats from the old doc are **relaxed or removed** — they are called out explicitly below.

Today the entire app lives in a single `index.js` (~1300 lines). This document records the known **performance issues** and defines the **migration to a modular architecture** that fixes them. Follow the phases in order — each phase is independently shippable and leaves the app working.

---

## Guiding principles

- **Defensive by default.** Validate every input at the boundary, never trust `req.body`/`req.params`/`req.query`. Fail closed (deny) in auth. Never leak error internals in production (already done via `sendError`).
- **Organised over clever.** One responsibility per file. Routes wire HTTP; controllers handle req/res; services hold business logic + DB access. No DB calls in route files.
- **Lean on the platform & framework.** Express 5 already forwards rejected promises from async handlers to the error middleware — do **not** reintroduce an `asyncHandler` wrapper. Render manages the process lifecycle (health checks, SIGTERM) — implement graceful shutdown rather than fighting it.
- **Shared state lives in Redis, not process memory.** On a long-lived (and potentially multi-replica) Render service, per-process in-memory caches drift between instances. Cache cross-cutting state (auth roles, rate-limit counters, hot queries) in Upstash Redis with explicit invalidation.
- **No behaviour changes during refactor.** A module migration phase must be byte-for-byte equivalent in API responses. Perf fixes are called out explicitly and shipped as their own commits.
- **Indexes before optimisation.** The single biggest win is DB indexes; do that first, it needs no refactor.
- **Ship incrementally.** Migrate one module at a time behind the same routes. Keep `index.js` working until a module is fully moved, then delete the old block.

---

## Performance findings (current `index.js`)

Ordered by impact. Line numbers refer to the current single-file version. **Priorities have been re-scored for the Render + Redis base** — the right-hand column explains any change from the original Vercel-era scoring.

| # | Severity (Render+Redis) | Issue | Where | Change from Vercel scoring |
|---|----------|-------|-------|----|
| 1 | **Critical** | **No database indexes exist anywhere.** Every filtered/sorted query is a full collection scan. | entire file (no `createIndex` calls) | unchanged — platform-independent |
| 1a | **Low / Resolved** | Every authenticated request runs `user.findOne({ email })`. | guards `143,159,175`; `983,1036,958` | was **Critical**. Resolved by the `user.email` index **plus** a shared Upstash Redis session cache (Phase 4.4) that is now safe on a long-lived server. |
| 2 | **High** | Unanchored, case-insensitive `$regex` search can't use an index → full scan on every search, including the public `/products`. | `316, 378–380, 462, 539–541, 582–585, 730, 818` | unchanged — a Redis cache in front of `/products` helps repeat reads but does not fix the underlying scan on cache miss / varied terms |
| 3 | **Low** | `countDocuments()` with **no filter** does an O(n) scan where `estimatedDocumentCount()` is near-instant. | `/stats 197–202`; `/admin/stats/* 644,653,662,699` | was **Medium**. `/stats` + `/admin/stats` are now Redis-cached (5–10 min TTL), so the underlying call runs rarely — still swap to `estimatedDocumentCount()` for the uncached path. |
| 4 | **Low** | `/sellers/top` `$lookup` joins all products into all sellers, computes `$size`, then limits — processes every seller before trimming. Public route. | `213–244` | was **Medium**. The expensive aggregation now sits behind a Redis cache (10 min TTL); still worth the denormalised `productCount` fix for the cache-miss path. |
| 5 | **Low** | Offset pagination (`.skip(skip)`) is O(skip); deep pages degrade. | all list endpoints via `parsePagination` | unchanged |
| 6 | **Low** | `/upload` buffers the whole file in memory then base64-encodes (~33% larger) before sending to Cloudinary. Memory pressure under concurrency. | `1204–1223` | unchanged — a long-lived process accumulates more sustained memory pressure, so streaming matters, but the request-contract change means this is **deferred** (Phase 4.5) |
| 7 | **Low** | Paired `countDocuments(filter)` on every list doubles query work; cheap only once indexed. | all list endpoints | unchanged |

**Bottom line:** #1 (indexes, esp. `user.email`) still dominates. With Redis absorbing the hot-read and auth-lookup load, #1a/#3/#4 drop in priority; #2 (regex search) becomes the main remaining DB hotspot and is a **product decision** (Phase 4.1).

---

## Target modular architecture

```
src/
  config/
    env.js            # load + validate required env vars once, fail fast on boot
    db.js             # cached Mongo connection + long-lived pool (see Phase 2.2)
    redis.js          # ioredis client (Upstash) with reconnect management  ← NEW
    cloudinary.js     # cloudinary.config(...)
    stripe.js         # Stripe client
    jwks.js           # createRemoteJWKSet
  lib/
    AppError.js       # typed error (statusCode, message) for controlled failures
    cache.js          # Redis cache helper: getOrSet(key, ttl, fn) + delByPattern  ← NEW
    pagination.js     # parsePagination
    objectId.js       # isValidObjectId + toObjectId helpers
    respond.js        # sendError + sendSuccess helpers
  middleware/
    attachDb.js       # req.db = await connectToDB()
    verifyToken.js    # jose verify → req.user
    guards.js         # adminGuard / sellerGuard / buyerGuard (role from Redis-cached lookup)
    errorHandler.js   # central error handler (last app.use)
    notFound.js       # 404 handler
  modules/
    products/   { products.routes.js, products.controller.js, products.service.js }
    users/      (admin user management)
    orders/
    payments/
    reviews/
    wishlist/
    profile/
    sellers/    (public top sellers + stats)
    stats/      (public /stats + admin analytics)
    uploads/
    health/     { health.routes.js }   # GET /healthz → pings Mongo + Redis  ← NEW
  indexes/
    createIndexes.js  # idempotent createIndex() definitions (single source of truth)
  app.js              # build & export the Express app (middleware + mount routers)
index.js              # entry point: connect Mongo+Redis → app.listen → graceful shutdown
render.yaml           # Render service spec (build/start/preDeploy/health)  ← NEW
```

> **Removed vs the Vercel doc:** `lib/asyncHandler.js` is intentionally **gone**. Express 5 forwards rejected promises from `async` route handlers to the error middleware automatically; a higher-order wrapper is an Express 4 atavism. Write controllers as plain `async (req, res, next)` functions and let `middleware/errorHandler.js` plus a process-level `process.on('unhandledRejection')` net catch everything.

**Layer contract**
- `*.routes.js` — defines paths, attaches guards/middleware, delegates to controller. No logic.
- `*.controller.js` — reads/validates req, calls service, shapes the HTTP response. No raw driver calls.
- `*.service.js` — all MongoDB access and business rules. Pure(ish), testable, takes `db` + params. May use `lib/cache.js` for read-through caching.

---

## Execution plan (phased, in order)

### Phase 0 — Safety net & tooling
**Category: project setup**
0.1 Add `.env.example` documenting every required var: `MONGODB_URI`, `CLIENT_URL`, `STRIPE_SECRET_KEY`, `CLOUDINARY_*`, `PORT`, `NODE_ENV`, and **`REDIS_URL`** (Upstash connection string, `rediss://...`). Do **not** commit real `.env`.
0.2 Add a minimal smoke-test script (hit `/`, `/healthz`, `/products`, `/stats`) to compare responses before/after each migration phase.
0.3 Create the empty `src/` tree above so later phases only add files.
0.4 **Add `render.yaml`** (Render service spec):
```yaml
services:
  - type: web
    name: kino-server
    env: node
    buildCommand: pnpm install
    preDeployCommand: node scripts/create-indexes.js
    startCommand: pnpm start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false
      - key: REDIS_URL
        sync: false
      # STRIPE_SECRET_KEY, CLOUDINARY_*, CLIENT_URL → set in Render dashboard (sync: false)
```
Render injects `PORT` automatically; the app must bind `0.0.0.0:$PORT`.

### Phase 1 — Database indexes (highest impact, zero refactor) ⚡
**Category: performance — indexing**
Do this first; it needs no refactor.

> ⚠️ **Index creation is a deploy step, not an `app.listen` side-effect.** Keep index creation out of the request/boot hot path by running it as a standalone script. On Render, wire it to the **`preDeployCommand`** (`node scripts/create-indexes.js`) so it runs once per deploy, before traffic shifts to the new instance. (On the old Vercel base this could not hang off `app.listen` because serverless never calls `listen` in prod; on Render `app.listen` *does* run, but index creation still belongs in `preDeployCommand` to avoid blocking boot and to run exactly once rather than per-instance.)

1.1 Create `scripts/create-indexes.js` — a standalone Node script that connects, creates the indexes, logs results, and exits. Re-runnable because `createIndex` is idempotent. Definitions:
- `user`: `{ email: 1 }` **unique**; `{ role: 1 }`
- `products`: **compound ESR indexes matching real catalog queries**, not scattered single-field indexes. The catalog filters by status + category and sorts by date, so build Equality → Sort → Range compounds:
  - `{ status: 1, category: 1, dateUploaded: -1 }`  (primary catalog browse/filter+sort)
  - `{ sellerEmail: 1, _id: -1 }`  (seller's own products)
  - `{ soldCount: -1 }`  (best-sellers)
  - Add further compounds only when a query's shape demands them; avoid relying on index intersection of many single-field indexes.
- `orders`: `{ "buyerInfo.email": 1, _id: -1 }`; `{ sellerEmail: 1, _id: -1 }`; `{ orderStatus: 1 }`; `{ createdAt: 1 }`
- `payments`: `{ transactionId: 1 }` **unique**; `{ buyerEmail: 1, _id: -1 }`; `{ sellerEmail: 1 }`; `{ paymentStatus: 1 }`; `{ createdAt: 1 }`
- `reviews`: `{ productId: 1, buyerEmail: 1 }` **unique** (also closes the TOCTOU race in the current "find-then-insert" review check); `{ createdAt: -1 }`
- `cloudinary_uploads`: `{ hash: 1 }` **unique**; `{ public_id: 1 }`
1.2 **Dedupe before unique indexes or `createIndex` throws.** `dropDups` was removed in MongoDB 3.0, so a unique build on dirty data fails with `E11000 (duplicate key error)`. The current find-then-insert logic for reviews/payments can have produced duplicates. Before creating the **unique** indexes (`user.email`, `payments.transactionId`, `reviews {productId,buyerEmail}`, `cloudinary_uploads.hash`), run an aggregation to find + remove dupes, or build with a temporary non-unique index and reconcile first.
1.3 **Note on data types:** `productId` is stored as a **string**, not `ObjectId` (`index.js:293`). Index it as-is; don't "fix" it to an ObjectId index or lookups will silently miss (BSON treats `string` and `ObjectId` as distinct types — no implicit coercion).
1.4 Keep the modular `src/indexes/createIndexes.js` as the shared definitions module that both the script and (optionally) a local dev path import — single source of truth. The **script run via `preDeployCommand`** is the authoritative way indexes reach prod.

### Phase 2 — Core scaffolding (no behaviour change)
**Category: architecture — foundation**
2.1 `config/env.js` — read + validate env once; throw on missing required vars (fail fast). Includes `REDIS_URL` and `PORT`.
2.2 `config/db.js` — move the cached-connection logic, and configure a **long-lived connection pool** for the persistent process:
```js
maxPoolSize: 20,
minPoolSize: 5,
maxIdleTimeMS: 60000,
serverSelectionTimeoutMS: 5000,
```
(This replaces the serverless framing where each ephemeral instance held its own tiny pool. One warm pool is reused across all requests.)
2.3 `config/{cloudinary,stripe,jwks}.js` — move those initialisers.
2.4 **`config/redis.js`** — initialise an **`ioredis`** client from `REDIS_URL` with reconnect management. Use `ioredis` (RESP/TCP) rather than `@upstash/redis` (HTTP): a long-lived Render process keeps a warm TLS/TCP socket (~1–2 ms/command), whereas the HTTP client pays a handshake per command and is only worthwhile on edge/serverless runtimes.
2.5 `lib/*` — move `parsePagination`, `isValidObjectId`, `sendError`; add `AppError`, `sendSuccess`, and **`lib/cache.js`** (a `getOrSet(key, ttlSeconds, fn)` read-through helper + `delByPattern`/`del` invalidation). **Do not add `asyncHandler`.**
2.6 `middleware/*` — move `attachDb`, `verifyToken`, the three guards; add `errorHandler` + `notFound`.
2.7 `app.js` — assemble: cors → json (with a body size limit, see 5.3) → attachDb → routers (incl. `/healthz`) → notFound → errorHandler.
2.8 **`index.js` becomes the thin entry point for a long-lived process:**
- Remove the `if (process.env.NODE_ENV !== "production")` gate around `app.listen` — on Render the process **must** bind `0.0.0.0:$PORT` in production or the deploy fails its health check and times out.
- Boot order: validate env → connect Mongo → connect Redis → `app.listen(PORT)`.
- Implement **graceful shutdown** on `SIGTERM` / `SIGINT`: `server.close()` (stop accepting new connections) → `client.close()` (Mongo) → `redis.quit()` → `process.exit(0)`, with a hard timeout fallback.
**Checkpoint:** run Phase 0 smoke test; responses must be identical (plus `/healthz` returns 200).

### Phase 3 — Migrate modules (one at a time, no behaviour change)
**Category: architecture — route migration**
Migrate in this order (low-risk/public first, payments last). After each module: move its block out of `index.js`, mount its router in `app.js`, run the smoke test, commit.

> ⚠️ **Move guards with the routes.** Protection is currently applied at the mount level — `app.use("/admin", verifyToken, adminGuard)`, and the same for `/seller` (`721`) and `/buyer` (`910`). When a module's router is mounted in `app.js`, it **must** re-apply that exact mount-level middleware. A router mounted without it silently exposes those endpoints unauthenticated. Verify each protected route still 401/403s after migration as part of the smoke test.
3.1 `products` (public `/products`, `/products/:id`)
3.2 `reviews`
3.3 `sellers` (`/sellers/top`) and `stats` (`/stats`)
3.4 `wishlist`, `profile`
3.5 `users` + `products` + `orders` + `payments` + `analytics` under `/admin`
3.6 `seller` module (`/seller/*`)
3.7 `buyer` module (`/buyer/*`)
3.8 `payments` (`/payments/*`) and `uploads` (`/upload`) — most sensitive, do last with extra care.
3.9 `health` module (`/healthz`) — tiny, can land any time in this phase; it pings Mongo + Redis and returns 200/503 for Render's health check.
3.10 Delete the now-empty route blocks from `index.js`.

### Phase 3.5 — Distributed caching layer (Redis) 🆕
**Category: performance — caching**
Introduced by the Render + Upstash base. Do this once modules exist so services can use `lib/cache.js` cleanly.
3.5.1 Wire `lib/cache.js` (`getOrSet` read-through + invalidation) on top of `config/redis.js`.
3.5.2 **Auth-role cache** (closes the §4.4 privilege-escalation hole — see Phase 4.4): the guards read `user:auth:${email}` from Redis before hitting Mongo.
3.5.3 **Hot public reads:**
- `/stats` and `/sellers/top`: cache the computed result with a 5–10 min TTL (≈95% load reduction on the heavy aggregations / `$lookup`).
- `/products`: cache the default first page; invalidate on product create/update/delete.
3.5.4 **Rate-limit store:** back `express-rate-limit` with `rate-limit-redis` so limits are consistent across any Render replicas (see Phase 5.4).

### Phase 4 — Query performance fixes (now that modules exist)
**Category: performance — query optimisation**
4.1 **Regex search (#2) — PRODUCT decision, NOT YET DECIDED.** All real fixes *change search behaviour*, so this stays open pending product sign-off. Options and trade-offs:
- **Prefix-anchored** `^term` (index-usable): fastest, but stops matching substrings in the middle of a field (searching "phone" no longer finds "iPhone").
- **Text index + `$text`**: matches whole/stemmed words only, no partial-substring match; MongoDB allows **only one text index per collection**.
- **Atlas Search**: the only option that preserves current substring behaviour *and* performance, but requires the external Atlas Search service.
- A Redis cache in front of `/products` (Phase 3.5.3) mitigates repeat identical searches but does **not** fix the underlying scan for varied terms / cache misses.
**Decision pending.** Whichever is chosen, apply consistently across `products`, `users`, `orders`, `payments` services, add the matching index to the Phase 1 script, and document the chosen semantics here (this intentionally breaks "no behaviour change").
4.2 **Unfiltered counts (#3):** swap `countDocuments()` → `estimatedDocumentCount()` in `/stats` and all `/admin/stats/*` (on the uncached path). Keep `countDocuments(filter)` only where a filter is present.
4.3 **`/sellers/top` (#4):** primary mitigation is the Redis cache (Phase 3.5.3). For the cache-miss path, maintain a denormalised `productCount` on seller docs (increment on product create/delete), or `$limit` as early as possible in the pipeline.
4.4 **Guard lookups (#1a) — now resolved via shared Redis cache.** With the `user.email` index in place the lookup is already cheap; the Upstash Redis cache makes it near-free **and safe on this base**:
- Cache `user:auth:${email}` → `{ role, _id }` with a 15–30 min TTL using cache-aside.
- On **any** user role/status mutation (`/admin/users` promote/demote/ban), call `redis.del(\`user:auth:${email}\`)` so the change propagates **instantly and consistently to every instance**.
- This is the key capability the Vercel base lacked: in-memory per-instance caches could not invalidate across warm serverless instances (a demoted admin kept admin until TTL — a privilege-escalation window). A **shared** store removes that hazard, so the old "do not cache roles" warning no longer applies.
4.5 **Upload (#6) — DEFERRED.** Switching to Cloudinary `upload_stream` is worthwhile (avoids the full-buffer base64 copy; keep the sha256 dedupe), **but it is a request-contract change**: the current `/upload` accepts a base64 string inside the JSON body via `express.json()`, whereas streaming requires `multipart/form-data` (e.g. `busboy`/`multer` memory stream) plus a **route-scoped** body limit (a small global limit would block images). Because it changes the client contract and is not needed to stand up the Render + Redis base, it is logged as a **deferred follow-up** — do not implement without product sign-off.

### Phase 5 — Defensive hardening
**Category: security & robustness**
5.1 Introduce a validation layer (zod or hand-rolled schemas) in each controller; reject malformed bodies with 400 before touching the DB. Replaces ad-hoc `if (!x)` checks.
5.2 Central `errorHandler` so no route can crash the process on an unhandled rejection; rely on Express 5's native async-error forwarding + a `process.on('unhandledRejection')` net. Remove repetitive try/catch where the error middleware covers it. **(No `asyncHandler` wrapper — Express 5 does this natively.)**
5.3 Set an `express.json({ limit: "…" })` cap and a dedicated raw-body size limit on `/upload` to prevent memory-exhaustion DoS (especially relevant for a long-lived process that accumulates pressure).
5.4 Add `express-rate-limit` to public and auth-sensitive routes (`/products`, `/upload`, `/payments/*`), backed by **`rate-limit-redis`** (shared Upstash store) so counters are consistent across replicas and survive within a deploy.
5.5 Confirm all list endpoints clamp `limit` (already done in `parsePagination`, max 100) and that `skip` is bounded.

### Phase 6 — Cleanup & docs
**Category: finalisation**
6.1 Reduce `index.js` to the entry point only (connect → listen → graceful shutdown). **Delete the trailing Vercel cold-start / serverless-race explanatory comment block** — it no longer applies to a long-lived Render process.
6.2 Update this file's "current state" and add a short module map / README, including the Render + Redis topology.
6.3 Re-run the full smoke test and confirm index usage with `.explain("executionStats")` on the hot queries (`user.findOne({email})`, `/products` search, `/seller/products`). Confirm `/healthz` reports Mongo + Redis healthy.

---

## Quick reference — commands

```bash
pnpm install
pnpm dev     # nodemon index.js   (needs MONGODB_URI + REDIS_URL in .env)
pnpm start   # node index.js      (Render startCommand; binds 0.0.0.0:$PORT)

node scripts/create-indexes.js   # idempotent index migration (Render preDeployCommand)
```

**Runtime note (Render + Upstash):** the app is a **long-lived process**. `config/db.js` keeps a single warm Mongo pool reused across all requests — do **not** reintroduce per-request `client.connect()`. `config/redis.js` keeps a persistent `ioredis` connection. On deploy, Render runs `preDeployCommand` (index migration) then `startCommand`, shifts traffic only after `/healthz` returns 200, and sends `SIGTERM` on shutdown — handle it with graceful shutdown (close HTTP server, then Mongo, then Redis).
