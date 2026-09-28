import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "~/state/workspace-store";
import { ToastAction, UNDO_MS } from "~/ui/toast";
import { redo, undo } from "./actions";
import { modKey } from "./shortcuts";

// Every destructive or structural change pops a message with an Undo button
// (SPEC §3.1), which is how the app avoids confirmation dialogs. One toast at
// a time: each change replaces the last.

const TOAST_ID = "workspace-change";

export function UndoToasts() {
  const notice = useWorkspace((s) => s.notice);
  // Held for one notice: a toast that closes with focus on it fires no blur.
  const [heldFor, setHeldFor] = useState<typeof notice>(null);
  const held = heldFor !== null && heldFor === notice;
  // Leaving the scheduler (View four-year plan, a product link) takes its toast along:
  // Undo on another page would change plans nobody's saving.
  useEffect(() => () => void toast.dismiss(TOAST_ID), []);
  useEffect(() => {
    if (!notice?.toast) return;
    const hold = {
      onFocus: () => setHeldFor(notice),
      onBlur: () => setHeldFor(null),
    };
    const duration = held ? Number.POSITIVE_INFINITY : UNDO_MS;
    if (notice.kind === "undo") {
      toast("Undone", {
        id: TOAST_ID,
        duration,
        description: notice.label,
        action: (
          <ToastAction
            label="Redo"
            shortcut={modKey("Z", { shift: true })}
            icon={<Redo2 size={13} aria-hidden="true" />}
            onClick={() => {
              redo();
            }}
            {...hold}
          />
        ),
      });
    } else {
      toast(notice.label, {
        id: TOAST_ID,
        duration,
        description: notice.description,
        action: (
          <ToastAction
            label="Undo"
            shortcut={modKey("Z")}
            icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={() => {
              undo("toast");
            }}
            {...hold}
          />
        ),
      });
    }
  }, [notice, held]);
  return null;
}
