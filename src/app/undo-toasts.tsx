import { Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "~/state/workspace-store";
import { WithTooltip } from "~/ui/tooltip";
import { redo, undo } from "./actions";
import { modKey } from "./shortcuts";

// Every destructive or structural change pops a message with an Undo button
// (SPEC §3.1), which is how the app avoids confirmation dialogs. One toast at
// a time: each change replaces the last.

const TOAST_ID = "workspace-change";

/**
 * Long enough to read and reach Undo (WCAG 2.2.1), and held open while the
 * pointer is over it (sonner does that) or focus is on its button (done
 * here). ⌘Z still undoes after it's gone.
 */
export const UNDO_TOAST_MS = 10_000;

export function UndoToasts() {
  const notice = useWorkspace((s) => s.notice);
  // Held for one notice: a toast that closes with focus on it fires no blur.
  const [heldFor, setHeldFor] = useState<typeof notice>(null);
  const held = heldFor !== null && heldFor === notice;
  useEffect(() => {
    if (!notice?.toast) return;
    const hold = {
      onFocus: () => setHeldFor(notice),
      onBlur: () => setHeldFor(null),
    };
    const duration = held ? Number.POSITIVE_INFINITY : UNDO_TOAST_MS;
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
        description: undefined,
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

function ToastAction({
  label,
  shortcut,
  icon,
  onClick,
  onFocus,
  onBlur,
}: {
  label: string;
  shortcut: string;
  icon: ReactNode;
  onClick: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
      >
        {icon}
        {label}
      </button>
    </WithTooltip>
  );
}
