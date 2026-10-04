import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import type { CourseCode, CourseColor, IsoDate, TodoItem } from "~/core/schema";
import { relativeDue, taskFieldsOf } from "~/core/todo";
import { ActionMenu, ActionMenuItem } from "~/ui/action-menu";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { TaskEditor } from "./task-form";
import { TaskContextMenu } from "./task-menu";
import { TodoItemRow } from "./todo-item";

// Items as rows (docs/V3.md §3.9): a phone's days, and No date in the
// sidebar. An own task's row has Edit and Delete.

export interface ItemLook {
  course: CourseCode | null;
  color: CourseColor | null;
}

/** Where an item was checked off, for `todo_item_checked`: a card or a row. */
export type CheckedVia = "list" | "week";

/** What every view of the items takes. */
export interface ViewProps {
  items: readonly TodoItem[];
  done: ReadonlySet<string>;
  today: IsoDate;
  /** The time, ticking each minute, for "Due in 3 hours". */
  now: number;
  look: (item: TodoItem) => ItemLook;
  onToggle: (item: TodoItem, via: CheckedVia) => void;
  /** The courses an own task can be for: on the feed and in your plans. */
  taskCourses: readonly CourseCode[];
  /** Deletes an own task, with Undo. */
  onDeleteTask: (item: TodoItem) => void;
}

/** An own task's ⋯: Edit and Delete. */
export function TaskMenu({
  item,
  onEdit,
  onDelete,
  className,
}: {
  item: TodoItem;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const editing = useRef(false);
  return (
    <ActionMenu
      title={item.title}
      tooltip="Edit or delete this task"
      align="end"
      // Edit's fields take focus, in the row's place: not back to the ⋯.
      finalFocus={() => {
        const sent = editing.current;
        editing.current = false;
        return sent ? false : null;
      }}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${item.title} options`}
          className={className}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      }
    >
      <ActionMenuItem
        onSelect={() => {
          editing.current = true;
          onEdit();
        }}
      >
        Edit
      </ActionMenuItem>
      <ActionMenuItem onSelect={onDelete}>Delete</ActionMenuItem>
    </ActionMenu>
  );
}

/** An own task: its row with Edit and Delete, or its fields while it's changed. */
function OwnTaskRow({
  item,
  done,
  props,
}: {
  item: TodoItem;
  done: boolean;
  props: ViewProps;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <ListRow as="li" className="px-0">
        <TaskEditor
          uid={item.uid}
          initial={taskFieldsOf(item)}
          courses={props.taskCourses}
          today={props.today}
          onClose={() => setEditing(false)}
        />
      </ListRow>
    );
  return (
    <TaskContextMenu
      item={item}
      props={props}
      via="list"
      onEdit={() => setEditing(true)}
    >
      <TodoItemRow
        item={item}
        done={done}
        {...props.look(item)}
        relative={relativeDue(item, props.now, props.today)}
        onToggle={() => props.onToggle(item, "list")}
        menu={
          <TaskMenu
            item={item}
            onEdit={() => setEditing(true)}
            onDelete={() => props.onDeleteTask(item)}
            className="-my-3 md:-my-1.5"
          />
        }
      />
    </TaskContextMenu>
  );
}

export function Rows({
  items,
  done,
  props,
}: {
  items: readonly TodoItem[];
  done: boolean;
  props: ViewProps;
}) {
  return items.map((item) =>
    item.source === "own" ? (
      <OwnTaskRow key={item.uid} item={item} done={done} props={props} />
    ) : (
      <TaskContextMenu
        key={item.uid}
        item={item}
        props={props}
        via="list"
        onEdit={() => {}}
      >
        <TodoItemRow
          item={item}
          done={done}
          {...props.look(item)}
          relative={relativeDue(item, props.now, props.today)}
          onToggle={() => props.onToggle(item, "list")}
        />
      </TaskContextMenu>
    ),
  );
}
