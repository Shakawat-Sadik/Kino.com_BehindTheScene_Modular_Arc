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
});

export const updateProductSchema = z.object({
  title: nonEmptyString.optional(),
  price: numeric.optional(),
  category: z.any().optional(),
  condition: z.any().optional(),
  description: z.any().optional(),
  images: z.any().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: nonEmptyString,
});
