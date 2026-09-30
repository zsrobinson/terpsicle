import type { ReactElement } from "react";
import { addDays } from "~/core/ics/dates";
import type { TodoItem } from "~/core/schema";
import { isElmsUrl, shortDayLabel, taskFieldsOf } from "~/core/todo";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/ui/context-menu";
import { undoToast } from "~/ui/toast";
import { saveFailedNote, TASK_TOAST_ID } from "./task-form";
import type { CheckedVia, ViewProps } from "./todo-lists";
import { useTodo } from "./todo-store";

// An item's right-click menu (a long press on a phone), the kit's
// ContextMenu: what makes sense for that item. Every item checks off; an
// ELMS item opens in ELMS; your own task can be changed, moved a day
// either way, or deleted, each with Undo.

export function TaskContextMenu({
  item,
  props,
  via,
  onEdit,
  children,
}: {
  item: TodoItem;
  props: ViewProps;
  via: CheckedVia;
  /** Opens the task's fields: in its details on a desktop, in its row on a phone. */
  onEdit: () => void;
  /** The card or row, which the menu opens from. */
  children: ReactElement<Record<string, unknown>>;
}) {
  const saveTask = useTodo((s) => s.saveTask);
  const done = props.done.has(item.uid);
  const link = item.link !== null && isElmsUrl(item.link) ? item.link : null;
  const own = item.source === "own";

  const save = (fields: ReturnType<typeof taskFieldsOf>) => {
    const send = () =>
      void saveTask(item.uid, fields).then((status) => {
        if (status !== "saved") saveFailedNote(status, send);
      });
    send();
  };
  const move = (by: -1 | 1) => {
    if (item.dueDate === null) return;
    const before = taskFieldsOf(item);
    const dueDate = addDays(item.dueDate, by);
    save({ ...before, dueDate });
    undoToast({
      id: TASK_TOAST_ID,
      message: `Moved ${item.title} to ${shortDayLabel(dueDate)}`,
      tooltip: "Put it back on its day",
      onUndo: () => save(before),
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label={`${item.title}, actions`}>
        <ContextMenuItem onSelect={() => props.onToggle(item, via)}>
          {done ? "Mark not done" : "Mark done"}
        </ContextMenuItem>
        {link ? (
          <ContextMenuItem
            render={<a href={link} target="_blank" rel="noopener noreferrer" />}
          >
            Open in ELMS
          </ContextMenuItem>
        ) : null}
        {own ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onEdit}>Edit</ContextMenuItem>
            {item.dueDate !== null ? (
              <>
                <ContextMenuItem onSelect={() => move(-1)}>
                  Move a day earlier
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => move(1)}>
                  Move a day later
                </ContextMenuItem>
              </>
            ) : null}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => props.onDeleteTask(item)}>
              Delete
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
