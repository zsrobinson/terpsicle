import { z } from "zod";

// Feedback's small enums and its id, apart from ./feedback so a route's
// search params (`/admin/feedback`) can check them without loading every
// feedback schema with each page (scripts/check-bundle.ts).

export const FeedbackKindSchema = z.enum(["bug", "idea", "review"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const FeedbackProductSchema = z.enum([
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
  "site",
  "settings",
  "admin",
]);
export type FeedbackProduct = z.infer<typeof FeedbackProductSchema>;

export const FeedbackStatusSchema = z.enum([
  "new",
  "planned",
  "fixed",
  "wont-fix",
  "spam",
]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

/** 16 random bytes, base64url without padding. */
export const FeedbackIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/, "Expected a 22-char id");
export type FeedbackId = z.infer<typeof FeedbackIdSchema>;
