import { toast } from "sonner";
import type { ReviewId } from "~/core/schema";
import { noteToast, undoToast } from "~/ui/toast";
import { useReviews } from "./reviews-store";

// Deleting a review, with Undo instead of a confirmation (DESIGN §5). The
// review disappears at once; the server hears only once the toast has gone
// (V2 §7.4), or as the page closes, so Undo never has to un-delete anything.

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
          noteToast(
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
  undoToast({
    id: toastId,
    message: "Review deleted",
    tooltip: "Put it back",
    onUndo: undo,
    onDone: () => commit(),
  });
}
