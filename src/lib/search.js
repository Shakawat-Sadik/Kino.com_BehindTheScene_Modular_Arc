/**
 * Prefix-anchored, case-insensitive search (Phase 4.1 — chosen semantics).
 *
 * `^term` lets MongoDB use the leading field of an index instead of a full
 * collection scan. NOTE the behaviour change this intentionally introduces:
 * matching is anchored to the START of the field, so searching "phone" no longer
 * matches "iPhone" (but "iPh" matches "iPhone"). Applied consistently across
 * products / users / orders / payments search.
 */

// Escape regex metacharacters so user input can't inject a pattern.
export function escapeRegex(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build an anchored, case-insensitive regex filter value for a single field.
export function anchored(term) {
  return { $regex: "^" + escapeRegex(term), $options: "i" };
}
