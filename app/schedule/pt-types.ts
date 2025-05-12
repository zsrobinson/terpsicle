import { z } from "zod";

export const professorSchema = z.object({
  name: z.string(),
  slug: z.string(),
  type: z.literal("professor"),
  courses: z.array(z.string()),
  average_rating: z.number(),
});

export type Professor = z.infer<typeof professorSchema>;
