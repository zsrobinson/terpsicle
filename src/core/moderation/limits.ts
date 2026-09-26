import type { ModerationKind } from "~/core/schema";

/**
 * Characters allowed, after trimming. Reviews need enough to say something
 * about the teaching (planetterp-fallback §6.4); chat is a sentence or a
 * pasted paragraph. The composer should enforce these before submitting.
 */
export const LENGTH_LIMITS: Readonly<
  Record<ModerationKind, { min: number; max: number }>
> = {
  review: { min: 40, max: 2_000 },
  chat: { min: 1, max: 2_000 },
};
