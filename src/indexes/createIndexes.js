/**
 * Single source of truth for all MongoDB index definitions.
 *
 * Imported by `scripts/create-indexes.js` (the authoritative path that runs via
 * Render's preDeployCommand) and usable from a local dev path. `createIndex` is
 * idempotent, so applying these repeatedly is safe.
 *
 * ESR note (products): compounds are ordered Equality → Sort → Range to match
 * real catalog queries (filter by status+category, sort by dateUploaded).
 *
 * Data-type note: `products.productId` is NOT indexed here — reviews/payments
 * reference products via a STRING `productId` (never coerced to ObjectId).
 */

/**
 * @typedef {Object} IndexDef
 * @property {string} collection
 * @property {Record<string, 1|-1|'text'>} keys
 * @property {import('mongodb').CreateIndexesOptions} [options]
 * @property {string[]} [dedupeOn]  For unique indexes: equality fields to group by
 *                                   when removing duplicates before the build.
 */

/** @type {IndexDef[]} */
export const indexDefinitions = [
  // ── user ────────────────────────────────────────────────
  { collection: "user", keys: { email: 1 }, options: { unique: true, name: "uniq_email" }, dedupeOn: ["email"] },
  { collection: "user", keys: { role: 1 }, options: { name: "role" } },
  // Supports prefix-anchored name search (admin users). email search uses uniq_email.
  { collection: "user", keys: { name: 1 }, options: { name: "name" } },

  // ── products (ESR compounds) ────────────────────────────
  { collection: "products", keys: { status: 1, category: 1, dateUploaded: -1 }, options: { name: "status_category_date" } },
  { collection: "products", keys: { sellerEmail: 1, _id: -1 }, options: { name: "sellerEmail_id" } },
  { collection: "products", keys: { soldCount: -1 }, options: { name: "soldCount" } },
  // Supports prefix-anchored public /products title search (Phase 4.1).
  { collection: "products", keys: { title: 1 }, options: { name: "title" } },

  // ── orders ──────────────────────────────────────────────
  { collection: "orders", keys: { "buyerInfo.email": 1, _id: -1 }, options: { name: "buyerEmail_id" } },
  { collection: "orders", keys: { sellerEmail: 1, _id: -1 }, options: { name: "sellerEmail_id" } },
  { collection: "orders", keys: { orderStatus: 1 }, options: { name: "orderStatus" } },
  { collection: "orders", keys: { createdAt: 1 }, options: { name: "createdAt" } },
  // Supports prefix-anchored buyer-name search (admin/seller orders). buyerInfo.email uses buyerEmail_id.
  { collection: "orders", keys: { "buyerInfo.name": 1 }, options: { name: "buyerName" } },

  // ── payments ────────────────────────────────────────────
  { collection: "payments", keys: { transactionId: 1 }, options: { unique: true, name: "uniq_transactionId" }, dedupeOn: ["transactionId"] },
  { collection: "payments", keys: { buyerEmail: 1, _id: -1 }, options: { name: "buyerEmail_id" } },
  { collection: "payments", keys: { sellerEmail: 1 }, options: { name: "sellerEmail" } },
  { collection: "payments", keys: { paymentStatus: 1 }, options: { name: "paymentStatus" } },
  { collection: "payments", keys: { createdAt: 1 }, options: { name: "createdAt" } },

  // ── reviews ─────────────────────────────────────────────
  // Unique compound also closes the find-then-insert TOCTOU in POST /reviews.
  { collection: "reviews", keys: { productId: 1, buyerEmail: 1 }, options: { unique: true, name: "uniq_product_buyer" }, dedupeOn: ["productId", "buyerEmail"] },
  { collection: "reviews", keys: { createdAt: -1 }, options: { name: "createdAt" } },

  // ── cloudinary_uploads ──────────────────────────────────
  { collection: "cloudinary_uploads", keys: { hash: 1 }, options: { unique: true, name: "uniq_hash" }, dedupeOn: ["hash"] },
  { collection: "cloudinary_uploads", keys: { public_id: 1 }, options: { name: "public_id" } },
];

/**
 * Find duplicate groups for a unique index's equality fields.
 * Returns groups with >1 document; `ids` are sorted so the FIRST is the keeper.
 */
async function findDuplicates(db, collection, dedupeOn) {
  const groupId = {};
  for (const f of dedupeOn) groupId[f] = `$${f}`;
  return db.collection(collection).aggregate([
    { $group: { _id: groupId, ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
}

/**
 * Apply all index definitions. Handles dedupe-before-unique.
 *
 * @param {import('mongodb').Db} db
 * @param {{ fix?: boolean, log?: (msg: string) => void }} [opts]
 *   fix=false (default): report duplicates and SKIP the affected unique index
 *                        (reported as a failure so the caller can exit non-zero).
 *   fix=true:  remove duplicates (keep the earliest _id) then build the index.
 * @returns {Promise<{ created: string[], skipped: string[], removedDocs: number }>}
 */
export async function createIndexes(db, { fix = false, log = console.log } = {}) {
  const created = [];
  const skipped = [];
  let removedDocs = 0;

  for (const def of indexDefinitions) {
    const label = `${def.collection}.${def.options?.name ?? JSON.stringify(def.keys)}`;

    // Dedupe gate for unique indexes.
    if (def.options?.unique && def.dedupeOn) {
      const dupes = await findDuplicates(db, def.collection, def.dedupeOn);
      if (dupes.length > 0) {
        const total = dupes.reduce((n, g) => n + (g.count - 1), 0);
        log(`  ! ${label}: found ${dupes.length} duplicate group(s) (${total} extra doc(s)).`);
        for (const g of dupes.slice(0, 10)) {
          log(`      key=${JSON.stringify(g._id)} count=${g.count}`);
        }
        if (dupes.length > 10) log(`      … and ${dupes.length - 10} more group(s)`);

        if (!fix) {
          log(`    → skipping ${label}. Re-run with --fix to remove extras (keeps earliest _id).`);
          skipped.push(label);
          continue;
        }

        // fix: delete all but the first (earliest) _id in each group.
        const toDelete = [];
        for (const g of dupes) {
          const sorted = [...g.ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          toDelete.push(...sorted.slice(1));
        }
        if (toDelete.length > 0) {
          const r = await db.collection(def.collection).deleteMany({ _id: { $in: toDelete } });
          removedDocs += r.deletedCount;
          log(`    → removed ${r.deletedCount} duplicate doc(s) from ${def.collection}.`);
        }
      }
    }

    await db.collection(def.collection).createIndex(def.keys, def.options);
    created.push(label);
    log(`  ✓ ${label}`);
  }

  return { created, skipped, removedDocs };
}
