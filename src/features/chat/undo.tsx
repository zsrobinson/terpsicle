import { useEffect, useState } from "react";
import { noteToast, UNDO_MS, undoToast } from "~/ui/toast";

// Chat's undo (DESIGN §5: undo, never a confirmation dialog): deleting a
// message, editing one, and leaving a course's chat each pop a toast with
// Undo. The scheduler's undo toasts belong to its plan history; these are
// their own, in the same shape.

/** The app's Undo window (a deleted message is sent after it). */
export const CHAT_UNDO_MS = UNDO_MS;

/** One undo toast at a time, as in the scheduler: each change replaces the last. */
const UNDO_TOAST_ID = "chat-undo";

export function showUndo(label: string, onUndo: () => void): void {
  undoToast({ id: UNDO_TOAST_ID, message: label, onUndo });
}

/** A quiet note that something didn't go through (never red). */
export function showNote(label: string): void {
  noteToast(label);
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
