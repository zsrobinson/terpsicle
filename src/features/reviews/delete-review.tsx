import { toast } from "sonner";
import type { ReviewId } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { useReviews } from "./reviews-store";

// Deleting a review, with Undo instead of a confirmation (DESIGN §5). The
// review disappears at once; the server hears only once the toast has gone
// (V2 §7.4), or as the page closes, so Undo never has to un-delete anything.

/** How long Undo stays up (V2 §7.4: an 8 s toast). Hovering holds it. */
export const DELETE_UNDO_MS = 8_000;

export function deleteWithUndo(id: ReviewId): void {
  const toastId = `review-delete-${id}`;
  let settled = false;
  const commit = (keepalive = false) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("pagehide", onHide);
    void useReviews
      .getState()
      .commitDelete(id, { keepalive })
      .then((ok) => {
        if (!ok && !keepalive)
          toast(
            "Couldn't delete your review. Check your connection and try again.",
          );
      });
  };
  const onHide = () => commit(true);
  const undo = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener("pagehide", onHide);
    useReviews.getState().undoDelete(id);
    toast.dismiss(toastId);
  };

  useReviews.getState().startDelete(id);
  window.addEventListener("pagehide", onHide);
  toast("Review deleted", {
    id: toastId,
    duration: DELETE_UNDO_MS,
    action: (
      <WithTooltip label="Put it back">
        <button
          type="button"
          onClick={undo}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
        >
          Undo
        </button>
      </WithTooltip>
    ),
    onAutoClose: () => commit(),
    onDismiss: () => commit(),
  });
}
