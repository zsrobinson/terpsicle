import type { ReactElement } from "react";
import { addDays } from "~/core/ics/dates";
import type { TodoItem } from "~/core/schema";
import { isElmsUrl, shortDayLabel, taskFieldsOf } from "~/core/todo";
import {
  ActionContextMenu,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuSeparator,
} from "~/ui/action-menu";
import { undoToast } from "~/ui/toast";
import { saveFailedNote, TASK_TOAST_ID } from "./task-form";
import type { CheckedVia, ViewProps } from "./todo-lists";
import { useTodo } from "./todo-store";

// An item's right-click menu (on a phone, a long press opens it as a
// sheet), the kit's ActionContextMenu: what makes sense for that item.
// Every item checks off; an ELMS item opens in ELMS; your own task can be
// changed, moved a day either way, or deleted, each with Undo.

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
    <ActionContextMenu target={children} title={item.title}>
      <ActionMenuItem onSelect={() => props.onToggle(item, via)}>
        {done ? "Mark not done" : "Mark done"}
      </ActionMenuItem>
      {link ? (
        <ActionMenuLinkItem
          href={link}
          render={<a href={link} target="_blank" rel="noopener noreferrer" />}
        >
          Open in ELMS
        </ActionMenuLinkItem>
      ) : null}
      {own ? (
        <>
          <ActionMenuSeparator />
          <ActionMenuItem onSelect={onEdit}>Edit</ActionMenuItem>
          {item.dueDate !== null ? (
            <>
              <ActionMenuItem onSelect={() => move(-1)}>
                Move a day earlier
              </ActionMenuItem>
              <ActionMenuItem onSelect={() => move(1)}>
                Move a day later
              </ActionMenuItem>
            </>
          ) : null}
          <ActionMenuSeparator />
          <ActionMenuItem onSelect={() => props.onDeleteTask(item)}>
            Delete
          </ActionMenuItem>
        </>
      ) : null}
    </ActionContextMenu>
  );
}
