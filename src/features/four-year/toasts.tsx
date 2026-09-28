import { Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { modKey } from "~/lib/shortcuts";
import { NOTE_MS, ToastAction, UNDO_MS } from "~/ui/toast";
import { useFourYear } from "./store";

// Every change says what it did, with Undo (SPEC §3.1): Plan's way of never
// asking "Are you sure?". One toast at a time; each change replaces the last.

const TOAST_ID = "four-year-change";

/** The app's Undo window; ⌘Z still works after. */
export const PLAN_TOAST_MS = UNDO_MS;

/** A quiet line in the same place, for something that didn't change anything. */
export function showPlanNote(label: string): void {
  toast(label, {
    id: TOAST_ID,
    duration: NOTE_MS,
    description: undefined,
    action: undefined,
  });
}

export function PlanToasts() {
  const notice = useFourYear((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const { undo, redo } = useFourYear.getState();
    if (notice.kind === "undo")
      toast("Undone", {
        id: TOAST_ID,
        duration: PLAN_TOAST_MS,
        description: notice.label,
        action: (
          <ToastAction
            label="Redo"
            shortcut={modKey("Z", { shift: true })}
            icon={<Redo2 size={13} aria-hidden="true" />}
            onClick={redo}
          />
        ),
      });
    else
      toast(notice.label, {
        id: TOAST_ID,
        duration: PLAN_TOAST_MS,
        description: undefined,
        action: (
          <ToastAction
            label="Undo"
            shortcut={modKey("Z")}
            icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={undo}
          />
        ),
      });
  }, [notice]);
  return null;
}
