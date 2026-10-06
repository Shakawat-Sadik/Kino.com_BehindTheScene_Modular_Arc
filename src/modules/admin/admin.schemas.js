import { z } from "zod";
import { numeric, nonEmptyString } from "../../lib/schemaHelpers.js";

export const updateUserStatusSchema = z.object({
  status: nonEmptyString,
});

export const updateUserSchema = z.object({
  name: z.any().optional(),
  role: z.any().optional(),
  location: z.any().optional(),
  contact: z.any().optional(),
});

export const updateProductSchema = z.object({
  title: nonEmptyString.optional(),
  price: numeric.optional(),
  category: z.any().optional(),
  condition: z.any().optional(),
  description: z.any().optional(),
});

// Status PATCH endpoints now require a status (hardening — originals didn't check).
export const statusSchema = z.object({
  status: nonEmptyString,
});
