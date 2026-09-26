import { Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { WithTooltip } from "~/ui/tooltip";

// Chat's undo (DESIGN §5: undo, never a confirmation dialog): deleting a
// message, editing one, and leaving a course's chat each pop a toast with
// Undo. The scheduler's undo toasts belong to its plan history; these are
// their own, in the same shape.

/** Long enough to read and reach Undo (WCAG 2.2.1), like the scheduler's. */
export const CHAT_UNDO_MS = 10_000;

/** One undo toast at a time, as in the scheduler: each change replaces the last. */
const UNDO_TOAST_ID = "chat-undo";

export function showUndo(label: string, onUndo: () => void): void {
  const id = UNDO_TOAST_ID;
  toast(label, {
    id,
    duration: CHAT_UNDO_MS,
    action: (
      <WithTooltip label="Undo">
        <button
          type="button"
          onClick={() => {
            onUndo();
            toast.dismiss(id);
          }}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
        >
          <Undo2 size={13} aria-hidden="true" />
          Undo
        </button>
      </WithTooltip>
    ),
  });
}

/** A quiet note that something didn't go through (never red). */
export function showNote(label: string): void {
  toast(label);
}

/** The time, updated every `everyMs`, for "Today" and "2 min ago". */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
