#!/usr/bin/env node
/**
 * Smoke test — run against a live server before/after each migration phase.
 *
 *   BASE_URL=http://localhost:5000 node scripts/smoke-test.mjs
 *   BASE_URL=http://localhost:5000 node scripts/smoke-test.mjs --snapshot before
 *
 * Hits the key public endpoints + asserts protected routes reject unauthenticated
 * requests. With --snapshot <label> it writes normalized JSON to
 * scripts/.smoke/<label>.json so you can `diff` before vs after a refactor phase
 * (refactor phases must be behaviour-preserving).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const snapshotIdx = process.argv.indexOf("--snapshot");
const snapshotLabel = snapshotIdx !== -1 ? process.argv[snapshotIdx + 1] : null;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Public reads that must return 2xx and whose body shape should be stable.
const PUBLIC_CHECKS = [
  { name: "root", method: "GET", path: "/", expect: [200] },
  { name: "healthz", method: "GET", path: "/healthz", expect: [200] },
  { name: "products", method: "GET", path: "/products?limit=5", expect: [200] },
  { name: "product-missing", method: "GET", path: "/products/000000000000000000000000", expect: [404] },
  { name: "product-badid", method: "GET", path: "/products/not-an-id", expect: [400] },
  { name: "stats", method: "GET", path: "/stats", expect: [200] },
  { name: "sellers-top", method: "GET", path: "/sellers/top", expect: [200] },
  { name: "reviews", method: "GET", path: "/reviews?limit=3", expect: [200] },
];

// Protected routes must reject an unauthenticated caller (401/403), never 200.
const AUTH_CHECKS = [
  { name: "admin-users", method: "GET", path: "/admin/users", expect: [401, 403] },
  { name: "seller-products", method: "GET", path: "/seller/products", expect: [401, 403] },
  { name: "buyer-orders", method: "GET", path: "/buyer/orders", expect: [401, 403] },
  { name: "profile", method: "GET", path: "/profile", expect: [401, 403] },
  { name: "payments-history", method: "GET", path: "/payments/my-history", expect: [401, 403] },
];

// Drop volatile fields so before/after snapshots compare cleanly.
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (["_id", "createdAt", "updatedAt", "dateUploaded", "total", "clientSecret"].includes(k)) {
        out[k] = "<volatile>";
      } else {
        out[k] = normalize(v);
      }
    }
    return out;
  }
  return value;
}

async function run(check) {
  const url = `${BASE_URL}${check.path}`;
  try {
    const res = await fetch(url, { method: check.method });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    const ok = check.expect.includes(res.status);
    return { ...check, status: res.status, ok, body };
  } catch (e) {
    return { ...check, status: 0, ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\n▶ Smoke test against ${BASE_URL}\n`);
  const results = [];
  let failures = 0;

  for (const check of [...PUBLIC_CHECKS, ...AUTH_CHECKS]) {
    const r = await run(check);
    results.push(r);
    const mark = r.ok ? "✓" : "✗";
    if (!r.ok) failures++;
    const detail = r.error ? ` (${r.error})` : "";
    console.log(`  ${mark} ${check.method} ${check.path} → ${r.status} [expect ${check.expect.join("/")}]${detail}`);
  }

  if (snapshotLabel) {
    const dir = resolve(__dirname, ".smoke");
    await mkdir(dir, { recursive: true });
    const snap = {};
    for (const r of results) snap[r.name] = { status: r.status, body: normalize(r.body) };
    const file = resolve(dir, `${snapshotLabel}.json`);
    await writeFile(file, JSON.stringify(snap, null, 2));
    console.log(`\n  snapshot written → ${file}`);
  }

  console.log(`\n${failures === 0 ? "✓ all checks passed" : `✗ ${failures} check(s) failed`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
