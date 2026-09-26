// Reviews' side of a moderation decision made later: the owner approving,
// removing or undoing, or a retry that finally got an answer
// (MODERATION_HANDLERS, docs/MODERATION.md §6). Idempotent: undo calls it
// again, and a retry that failed partway runs it again.
import { mainReason } from "~/core/reviews";
import type { HandlerContext } from "../moderation/handlers";
import { openReports } from "../moderation/store";
import {
  getReview,
  publish,
  reject,
  setPendingEdit,
  setWaiting,
} from "./store";

export async function applyReviewDecision(
  reviewId: string,
  decision: "publish" | "hold" | "remove",
  { db, now, reasons }: HandlerContext,
): Promise<void> {
  const review = await getReview(db, reviewId);
  // Deleted by its author since: there's nothing left to decide.
  if (!review || review.status === "deleted") return;
  const edit = review.pending_edit;

  switch (decision) {
    case "publish":
      // Publishes a held, hidden or removed review, with its waiting edit;
      // or applies the waiting edit of a published one. Already up: no-op.
      if (review.status !== "published" || edit?.state === "waiting")
        await publish(db, review, now);
      return;

    case "remove": {
      if (review.status === "rejected") return;
      const reason = mainReason(reasons, "remove");
      // A published review with an edit waiting: the edit is what was
      // checked, so only the edit goes, unless readers' reports are waiting
      // too, in which case the owner has judged the review as a whole.
      if (
        review.status === "published" &&
        edit?.state === "waiting" &&
        (await openReports(db, "review", reviewId)).length === 0
      ) {
        await setPendingEdit(
          db,
          reviewId,
          { ...edit, state: "rejected", reason },
          now,
        );
        return;
      }
      await reject(db, reviewId, reason, now);
      return;
    }

    case "hold":
      // Undo: back to waiting for a person, as before the decision.
      if (review.status === "published" && edit?.state === "rejected") {
        await setPendingEdit(
          db,
          reviewId,
          { ...edit, state: "waiting", reason: null },
          now,
        );
        return;
      }
      if (review.status === "held" || review.status === "hidden") return;
      // A reported review goes back to hidden; one that never reached
      // readers, or was only held by the checks, to held.
      await setWaiting(
        db,
        reviewId,
        review.report_count > 0 ? "hidden" : "held",
        null,
        now,
      );
      return;
  }
}
