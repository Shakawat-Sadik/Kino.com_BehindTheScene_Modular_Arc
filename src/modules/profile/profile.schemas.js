import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.any().optional(),
  contact: z.any().optional(),
  location: z.any().optional(),
  image: z.any().optional(),
  role: z.any().optional(),
});
