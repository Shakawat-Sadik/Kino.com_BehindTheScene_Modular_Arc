import { z } from "zod";
import { numeric, nonEmptyString } from "../../lib/schemaHelpers.js";

export const createIntentSchema = z.object({
  amount: numeric,
  productId: nonEmptyString,
  productTitle: z.any().optional(),
});

// Mirrors the original required-field check (transactionId + productId); amount
// stays optional to preserve behaviour.
export const confirmSchema = z.object({
  transactionId: nonEmptyString,
  productId: nonEmptyString,
  amount: numeric.optional(),
  sellerEmail: z.any().optional(),
  productTitle: z.any().optional(),
});
