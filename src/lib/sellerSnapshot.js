/**
 * Seller fields that are DENORMALIZED into every product document — a snapshot of
 * the seller's `user` record taken at write time (location1, contact.mobile1,
 * sellerName). Centralised here so product creation and profile-update
 * propagation always build the snapshot the same way.
 */

/** Flatten a user `location` (object or string) into the product's `location1` string. */
export function formatSellerLocation(loc) {
  if (!loc) return "";
  if (typeof loc === "object") {
    return [loc.area, loc.district, loc.division, loc.country].filter(Boolean).join(", ");
  }
  return String(loc);
}

/**
 * Build the `$set` for products.updateMany when a seller edits their profile.
 * Only includes fields that actually changed (keys present in `changed`), and
 * uses dot-notation so per-listing overrides (location2, sellerInfo.contact.mobile2)
 * and sellerInfo.userId are left untouched. Returns {} when nothing relevant changed.
 *
 * @param {{ name?: string, location?: unknown, contact?: unknown }} changed
 */
export function sellerSnapshotUpdate(changed) {
  const set = {};
  if (changed.name !== undefined) set.sellerName = changed.name || "";
  if (changed.location !== undefined) set.location1 = formatSellerLocation(changed.location);
  if (changed.contact !== undefined) {
    set["sellerInfo.contact.mobile1"] = changed.contact ? String(changed.contact) : "";
  }
  return set;
}
