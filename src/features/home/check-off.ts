import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { TodoItem } from "~/core/schema";
import { setTodoDone } from "~/features/todo/todo-mutations";
import { track } from "~/lib/analytics";
import { noteToast, undoToast } from "~/ui/toast";

// Checking a deadline off from Home (docs/V3.md §1.5), as on /todo: at
// once, with Undo, and a quiet "That didn't save" with Try again when the
// server doesn't take it. `todo_item_checked` says it happened here.

/** One toast for checks, as on /todo: each check's Undo replaces the last. */
const DONE_TOAST_ID = "home-todo-done";

/** Toggles an item's done mark, with Undo; `done` is what Home shows now. */
export function useCheckOff(
  done: ReadonlySet<string>,
): (item: TodoItem) => void {
  const client = useQueryClient();
  return useCallback(
    (item: TodoItem) => {
      const next = !done.has(item.uid);
      track("todo_item_checked", { done: next, via: "home" });
      const mark = (value: boolean) => {
        const save = () =>
          void setTodoDone(client, item.uid, value).then((ok) => {
            if (!ok)
              noteToast("That didn't save", {
                id: DONE_TOAST_ID,
                description: "Check your connection and try again.",
                retry: save,
              });
          });
        save();
      };
      mark(next);
      undoToast({
        id: DONE_TOAST_ID,
        message: `Marked ${item.title} ${next ? "done" : "not done"}`,
        tooltip: next ? "Put it back on the list" : "Mark it done again",
        onUndo: () => mark(!next),
      });
    },
    [done, client],
  );
}
