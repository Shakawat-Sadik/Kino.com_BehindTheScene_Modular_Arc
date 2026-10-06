import { z } from "zod";

/**
 * Accepts a number OR a numeric string (the frontend sends both), matching what
 * the controllers' Number(x) coercion already accepts. Rejects "", null, and
 * non-numeric strings. Used for price/amount/rating so validation doesn't reject
 * currently-valid inputs.
 */
export const numeric = z.union([z.number(), z.string()]).refine(
  (v) => v !== "" && Number.isFinite(Number(v)),
  { message: "must be a number" },
);

export const nonEmptyString = z.string().min(1);
