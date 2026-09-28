import { useEffect, useState } from "react";
import { noteToast, undoToast } from "~/ui/toast";

// Chat's undo (DESIGN §5: undo, never a confirmation dialog): deleting a
// message, editing one, and leaving a course's chat each pop a toast with
// Undo. The scheduler's undo toasts belong to its plan history; these are
// their own, in the same shape.

/** One undo toast at a time, as in the scheduler: each change replaces the last. */
const UNDO_TOAST_ID = "chat-undo";

/** `onDone`: Undo's time is up (a waiting delete is sent then). */
export function showUndo(
  label: string,
  onUndo: () => void,
  onDone?: () => void,
  description?: string,
): void {
  undoToast({ id: UNDO_TOAST_ID, message: label, description, onUndo, onDone });
}

/**
 * A quiet note that something didn't go through (never red), with Try again
 * where trying again can help.
 */
export function showNote(label: string, retry?: () => void): void {
  noteToast(label, retry ? { retry } : {});
}

/** The time, updated every `everyMs`, for day dividers ("Today") and who's typing. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
