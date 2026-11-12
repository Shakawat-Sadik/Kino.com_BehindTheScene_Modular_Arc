import { z } from "zod";
import { numeric, nonEmptyString } from "../../lib/schemaHelpers.js";

export const createProductSchema = z.object({
  title: nonEmptyString,
  price: numeric,
  category: z.any().optional(),
  condition: z.any().optional(),
  description: z.any().optional(),
  images: z.any().optional(),
  location: z.any().optional(),
  quantity: numeric.optional(),
  location2: z.string().optional(),
  mobile2: z.string().optional(),
});

// Stock count: whole number ≥ 0 (0 marks the listing sold).
const stockQuantity = numeric.refine(
  (v) => Number.isInteger(Number(v)) && Number(v) >= 0,
  { message: "must be a whole number of 0 or more" },
);

export const updateProductSchema = z.object({
  title: nonEmptyString.optional(),
  price: numeric.optional(),
  category: z.any().optional(),
  condition: z.any().optional(),
  description: z.any().optional(),
  images: z.any().optional(),
  quantity: stockQuantity.optional(),
  // "" clears the per-listing override.
  location2: z.string().optional(),
  mobile2: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: nonEmptyString,
});
