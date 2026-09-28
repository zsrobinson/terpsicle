import type { MarketingProduct } from "../products";

// The story's stages: 0 is the plain week in the hero, then one per
// product in color order. Each piece on the screen lands at its stage.

export type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export const LAST_STAGE: Stage = 5;

/** The stage each piece lands at: Problems is Schedule's step. */
export const STAGE_OF = {
  problems: 1,
  reviews: 2,
  chat: 3,
  plan: 4,
  todo: 5,
} as const satisfies Record<string, Stage>;

/** Step n's product. */
export const STEP_PRODUCT: Record<Exclude<Stage, 0>, MarketingProduct> = {
  1: "schedule",
  2: "reviews",
  3: "chat",
  4: "plan",
  5: "todo",
};

/** A number read from the page (a data attribute) as a stage, or null. */
export function toStage(value: unknown): Stage | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= LAST_STAGE ? (n as Stage) : null;
}
