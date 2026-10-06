import { z } from "zod";
import { numeric, nonEmptyString } from "../../lib/schemaHelpers.js";

export const createReviewSchema = z.object({
  productId: nonEmptyString,
  rating: numeric,
  comment: z.any().optional(),
});
