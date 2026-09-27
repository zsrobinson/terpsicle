import {
  FEEDBACK_DELETE_UNDO_MS,
  FEEDBACK_UNDO_MS,
  type FeedbackImageType,
} from "../schema/feedback";
import { IMAGE_EXTENSIONS } from "./image";

// How long feedback is kept (docs/FEEDBACK.md, "Retention"), as the cutoffs
// the daily job compares against, and where its images live in R2.

const DAY_MS = 86_400_000;

export const FEEDBACK_RETENTION = {
  /** Every item is deleted a year after it was sent. */
  rowDays: 365,
  /** Screenshots go 180 days after sending … */
  shotDays: 180,
  /** … or 30 days after the item was closed, whichever is sooner. */
  closedShotDays: 30,
} as const;

export interface RetentionCutoffs {
  /** Items created before this are deleted, with their images. */
  rowsCreatedBefore: string;
  /** Images of items created before this are deleted. */
  shotsCreatedBefore: string;
  /** Images of items closed before this are deleted. */
  shotsClosedBefore: string;
  /** Undo tokens of items created before this are cleared. */
  undoCreatedBefore: string;
  /** Items an admin deleted before this are gone for good. */
  deletedBefore: string;
}

export function retentionCutoffs(now: Date): RetentionCutoffs {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  return {
    rowsCreatedBefore: ago(FEEDBACK_RETENTION.rowDays * DAY_MS),
    shotsCreatedBefore: ago(FEEDBACK_RETENTION.shotDays * DAY_MS),
    shotsClosedBefore: ago(FEEDBACK_RETENTION.closedShotDays * DAY_MS),
    undoCreatedBefore: ago(FEEDBACK_UNDO_MS),
    deletedBefore: ago(FEEDBACK_DELETE_UNDO_MS),
  };
}

/**
 * An item's image in USER_CONTENT: `feedback/<yyyy-mm>/<id>.<ext>`, and
 * `<id>-element.<ext>` for a pinned note's cropped element.
 */
export function feedbackImageKey(
  id: string,
  createdAt: Date,
  type: FeedbackImageType,
  which: "screenshot" | "element",
): string {
  const month = createdAt.toISOString().slice(0, 7);
  const suffix = which === "element" ? "-element" : "";
  return `feedback/${month}/${id}${suffix}.${IMAGE_EXTENSIONS[type]}`;
}

/** Whether `key` is a feedback image key (what the shot route will serve). */
export function isFeedbackImageKey(key: string): boolean {
  return /^feedback\/\d{4}-\d{2}\/[A-Za-z0-9_-]{22}(-element)?\.(webp|png|jpg)$/.test(
    key,
  );
}
