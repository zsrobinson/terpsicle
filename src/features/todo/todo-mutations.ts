import {
  MutationObserver,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  TodoFileItem,
  TodoImportFileResult,
  TodoItem,
} from "~/core/schema";
import {
  type ConnectAnswer,
  combineWeeks,
  findWeekItem,
  ownTaskDue,
  ownTaskItem,
  type TaskFields,
  taskFieldsOf,
  withDone,
  withHidden,
  withItem,
  withoutElms,
} from "~/core/todo";
import { track } from "~/lib/analytics";
import { refetchWhenRunSettles } from "~/lib/settle-run";
import { ApiCallError } from "~/server/fns/api";
import {
  cachedFeed,
  cachedWeeks,
  type ElmsSync,
  editWeeks,
  todoClient,
  todoElmsQuery,
  todoKeys,
} from "./todo-queries";

// Changes to Todo's list (docs/V3.md §3.8) as mutations over the week
// queries (./todo-queries): each shows at once in every week that has the
// item, on /todo and Home alike; a failure puts back only what that change
// put up, so a later change stays; and once the last change of a run has
// settled, the weeks on screen are read again. Changes to one item (or one
// course) run one at a time, in order (`scope`), so an older one can't land
// after a newer one. They run outside components: a toast's Undo outlives
// the row that made it.

/**
 * Before a change shows: an answer on its way would land over it. Weeks
 * still loading for the first time carry on; the run's last change asks
 * for every week on screen again anyway.
 */
function holdWeeks(client: QueryClient): void {
  void client.cancelQueries({
    queryKey: todoKeys.weeks,
    predicate: (query) => query.state.data !== undefined,
  });
}

/** Once the last change of a run has settled, the server's weeks. */
function settleWeeks(client: QueryClient): void {
  refetchWhenRunSettles(client, todoKeys.edit, () => {
    void client.invalidateQueries({ queryKey: todoKeys.weeks });
  });
}

/** Whether the weeks on hand have `uid` marked done. */
function doneNow(client: QueryClient, uid: string): boolean {
  return combineWeeks(cachedWeeks(client)).done.has(uid);
}

/** `uid`'s item as the weeks on hand have it. */
function itemNow(client: QueryClient, uid: string): TodoItem | undefined {
  return findWeekItem(
    cachedWeeks(client).map((w) => w.list),
    uid,
  );
}

/** Puts `item` (or nothing) in every week on hand, where it's due. */
function putItem(
  client: QueryClient,
  uid: string,
  item: TodoItem | null,
  done: boolean,
): void {
  editWeeks(client, (list, first) => withItem(list, first, uid, item, done));
}

interface DoneVariables {
  uid: string;
  done: boolean;
}

/**
 * Checking an item off, or back on: shown at once wherever it is, and put
 * back if the server didn't take it, unless a later check has changed it
 * since (that one has its own save).
 */
export function doneMutation(uid: string) {
  return mutationOptions({
    mutationKey: todoKeys.done,
    scope: { id: `todo-item:${uid}` },
    mutationFn: ({ done }: DoneVariables) => todoClient().done({ uid, done }),
    onMutate: ({ done }, { client }) => {
      holdWeeks(client);
      const before = doneNow(client, uid);
      editWeeks(client, (list) => withDone(list, uid, done));
      return { before };
    },
    onError: (_error, { done }, context, { client }) => {
      if (context && doneNow(client, uid) === done)
        editWeeks(client, (list) => withDone(list, uid, context.before));
    },
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

interface HideVariables {
  key: string;
  hidden: boolean;
}

/** Whether the newest week on hand has a course group hidden. */
function hiddenNow(client: QueryClient, key: string): boolean {
  return combineWeeks(cachedWeeks(client)).hidden.has(key);
}

/**
 * Hiding a course group, or showing it again: at once in every week, and
 * back if the server didn't take it (unless it's been changed since).
 */
export function hideMutation(key: string) {
  return mutationOptions({
    mutationKey: todoKeys.hide,
    scope: { id: `todo-course:${key}` },
    mutationFn: ({ hidden }: HideVariables) =>
      todoClient().hideCourse({ key, hidden }),
    onMutate: ({ hidden }, { client }) => {
      holdWeeks(client);
      const before = hiddenNow(client, key);
      editWeeks(client, (list) => withHidden(list, key, hidden));
      return { before };
    },
    onError: (_error, { hidden }, context, { client }) => {
      if (context && hiddenNow(client, key) === hidden)
        editWeeks(client, (list) => withHidden(list, key, context.before));
    },
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

/** The server answered, but didn't save the task. */
class TaskRefused extends Error {
  constructor(readonly status: "too-many" | "out-of-range") {
    super(status);
  }
}

/** What was there before a change to one item: put back on a failure. */
interface ItemBefore {
  item: TodoItem | undefined;
  done: boolean;
}

function itemBefore(client: QueryClient, uid: string): ItemBefore {
  return { item: itemNow(client, uid), done: doneNow(client, uid) };
}

/** Puts an item back as it was, if `shown` (what the change put up) still shows. */
function putBack(
  client: QueryClient,
  uid: string,
  shown: TodoItem | null,
  before: ItemBefore,
): void {
  const now = itemNow(client, uid) ?? null;
  if (now !== shown) return;
  putItem(client, uid, before.item ?? null, before.done);
}

/**
 * Adding or changing one of your own tasks (moving it a day is a change):
 * shown at once on its day, the server's copy in its place once saved. A
 * refusal (too many, a date Todo doesn't keep) or a failure puts the item
 * back as it was.
 */
export function saveTaskMutation(uid: string) {
  return mutationOptions({
    mutationKey: todoKeys.task,
    scope: { id: `todo-item:${uid}` },
    mutationFn: async (fields: TaskFields) => {
      const result = await todoClient().saveTask({ uid, ...fields });
      if (result.status !== "saved") throw new TaskRefused(result.status);
      return result.item;
    },
    onMutate: (fields, { client }) => {
      holdWeeks(client);
      const before = itemBefore(client, uid);
      const shown = ownTaskItem({
        uid,
        title: fields.title.trim(),
        courseCode: fields.courseCode,
        ...ownTaskDue(fields.dueDate, fields.dueTime),
      });
      putItem(client, uid, shown, before.done);
      return { before, shown };
    },
    onSuccess: (saved, _fields, context, { client }) => {
      if (itemNow(client, uid) === context.shown)
        putItem(client, uid, saved, doneNow(client, uid));
    },
    onError: (_error, _fields, context, { client }) => {
      if (context) putBack(client, uid, context.shown, context.before);
    },
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

/**
 * Deleting one of your own tasks: gone at once, with its done mark, and
 * back as it was if the server didn't take it (unless it's been added
 * again since).
 */
export function deleteTaskMutation(uid: string) {
  return mutationOptions({
    mutationKey: todoKeys.task,
    scope: { id: `todo-item:${uid}` },
    mutationFn: () => todoClient().deleteTask({ uid }),
    onMutate: (_variables: undefined, { client }) => {
      holdWeeks(client);
      const before = itemBefore(client, uid);
      putItem(client, uid, null, false);
      return { before };
    },
    onError: (_error, _variables, context, { client }) => {
      if (context) putBack(client, uid, null, context.before);
    },
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

/** Adding a dropped file's items; the weeks are read again once it's in. */
export function importFileMutation() {
  return mutationOptions({
    mutationKey: todoKeys.file,
    mutationFn: (items: TodoFileItem[]) => todoClient().importFile({ items }),
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

/** How Disconnect's Undo window ended. */
export type DisconnectDecision =
  /** Undo: nothing is sent. */
  | "undo"
  /** The toast went, or a new link is being connected: the server hears. */
  | "remove"
  /** The page is closing: the server hears, with `keepalive`. */
  | "closing";

/**
 * Disconnecting ELMS (no confirmation, DESIGN §5): pending from the click,
 * so ELMS and its items are gone everywhere at once (`useDisconnecting`),
 * over whatever a read brings back meanwhile. The server hears once Undo's
 * toast has gone, or as the page closes; Undo sends nothing. Nothing is
 * said if it fails: the weeks are read again, and say whether it's still
 * connected.
 */
export function disconnectMutation() {
  return mutationOptions({
    mutationKey: todoKeys.disconnect,
    mutationFn: async (decided: Promise<DisconnectDecision>) => {
      const decision = await decided;
      if (decision === "undo") return false;
      track("todo_disconnected", {});
      await todoClient().disconnect(
        decision === "closing"
          ? { fetcher: (url, init) => fetch(url, { ...init, keepalive: true }) }
          : undefined,
      );
      return true;
    },
    onSuccess: (sent, _decided, _context, { client }) => {
      if (!sent) return;
      holdWeeks(client);
      editWeeks(client, withoutElms);
      client.setQueryData<ElmsSync>(todoKeys.elms, { feed: null, note: null });
    },
    onSettled: (_data, _error, _variables, _context, { client }) =>
      settleWeeks(client),
  });
}

/** Why our own server didn't answer `todo/connect`, as far as the form can say. */
function connectCallFailure(
  error: unknown,
): "signed-out" | "rate-limited" | "failed" {
  if (!(error instanceof ApiCallError)) return "failed";
  if (error.reason === "unauthorized") return "signed-out";
  if (error.reason === "rate-limited") return "rate-limited";
  return "failed";
}

/**
 * Connecting ELMS, or a new link: ELMS's sync says so at once, and the
 * weeks are read again before it settles, so the form closes on them.
 */
export function connectMutation() {
  return mutationOptions({
    mutationKey: todoKeys.connect,
    mutationFn: (url: string) => todoClient().connect({ url }),
    onSuccess: async (result, _url, _context, { client }) => {
      if (result.status !== "connected") return;
      client.setQueryData<ElmsSync>(todoKeys.elms, {
        feed: result.feed,
        note: null,
      });
      await client.invalidateQueries({ queryKey: todoKeys.weeks });
    },
  });
}

/**
 * Sync now: asks ELMS (when there's a link to ask), and reads the weeks
 * again either way. When ELMS had something new, its own query already
 * has.
 */
export function syncMutation() {
  return mutationOptions({
    mutationKey: todoKeys.sync,
    mutationFn: async (_variables: undefined, { client }) => {
      const feed = cachedFeed(client);
      if (feed && feed.status !== "broken") {
        const sync = await client.fetchQuery({
          ...todoElmsQuery(),
          staleTime: 0,
        });
        if (sync.note === null) return;
      }
      await client.invalidateQueries({ queryKey: todoKeys.weeks });
    },
  });
}

/** Runs a mutation through the page's query client, outside any component. */
function run<TData, TVariables, TContext>(
  client: QueryClient,
  options: ReturnType<
    typeof mutationOptions<TData, Error, TVariables, TContext>
  >,
  variables: TVariables,
): Promise<TData> {
  return new MutationObserver(client, options).mutate(variables);
}

/** Marks an item done or not; false when the server didn't take it. */
export function setTodoDone(
  client: QueryClient,
  uid: string,
  done: boolean,
): Promise<boolean> {
  return run(client, doneMutation(uid), { uid, done }).then(
    () => true,
    () => false,
  );
}

/** Hides a course group or shows it again; false when that didn't save. */
export function hideTodoCourse(
  client: QueryClient,
  key: string,
  hidden: boolean,
): Promise<boolean> {
  return run(client, hideMutation(key), { key, hidden }).then(
    () => true,
    () => false,
  );
}

export type SaveTaskStatus = "saved" | "too-many" | "out-of-range" | "failed";

/** Adds or changes an own task (see `saveTaskMutation`), and says how that went. */
export function saveTodoTask(
  client: QueryClient,
  uid: string,
  fields: TaskFields,
): Promise<SaveTaskStatus> {
  return run(client, saveTaskMutation(uid), fields).then(
    () => "saved" as const,
    (error: unknown) =>
      error instanceof TaskRefused ? error.status : "failed",
  );
}

/** Deletes an own task; false when that failed and it's back. */
export function deleteTodoTask(
  client: QueryClient,
  uid: string,
): Promise<boolean> {
  return run(client, deleteTaskMutation(uid), undefined).then(
    () => true,
    () => false,
  );
}

/** Puts a deleted task back as it was, done mark and all (Undo). */
export async function restoreTodoTask(
  client: QueryClient,
  item: TodoItem,
  done: boolean,
): Promise<boolean> {
  const saved = await saveTodoTask(client, item.uid, taskFieldsOf(item));
  if (saved !== "saved") return false;
  return done ? setTodoDone(client, item.uid, true) : true;
}

/** Adds a dropped file's items; null when that didn't go through. */
export function importTodoFile(
  client: QueryClient,
  items: TodoFileItem[],
): Promise<TodoImportFileResult | null> {
  return run(client, importFileMutation(), items).catch(() => null);
}

/** Sync now (see `syncMutation`). */
export function syncTodoNow(client: QueryClient): Promise<void> {
  return run(client, syncMutation(), undefined).catch(() => undefined);
}

/** A disconnect whose Undo is still open: its decision, and when it's done. */
let waiting: {
  decide: (decision: DisconnectDecision) => void;
  settled: Promise<unknown>;
} | null = null;

/** Shows ELMS disconnected now; the server hears once Undo's time is up. */
export function disconnectElms(client: QueryClient): void {
  if (waiting) return;
  let decide: (decision: DisconnectDecision) => void = () => {};
  const decided = new Promise<DisconnectDecision>((resolve) => {
    decide = resolve;
  });
  const settled = run(client, disconnectMutation(), decided).catch(
    () => undefined,
  );
  waiting = { decide, settled };
}

/** Ends Undo's window: the first word counts. */
function decideDisconnect(decision: DisconnectDecision): Promise<unknown> {
  if (!waiting) return Promise.resolve();
  const { decide, settled } = waiting;
  waiting = null;
  decide(decision);
  return settled;
}

/** Undo: ELMS stays connected, and nothing is sent. */
export function undoDisconnect(): void {
  void decideDisconnect("undo");
}

/** Undo's time is up: delete the link and its deadlines now. */
export function confirmDisconnect(): void {
  void decideDisconnect("remove");
}

/** Sends a waiting disconnect at once (leaving the page). */
export function flushDisconnect(): void {
  void decideDisconnect("closing");
}

/** Connected, or what the form says instead. */
export async function connectElms(
  client: QueryClient,
  url: string,
): Promise<{ status: "connected" } | ConnectAnswer> {
  // A disconnect still waiting on Undo goes first, or it would delete the
  // link being connected now.
  await decideDisconnect("remove");
  try {
    const result = await run(client, connectMutation(), url);
    return result.status === "connected" ? { status: "connected" } : result;
  } catch (error) {
    return { status: connectCallFailure(error) };
  }
}

/** Test hook: no disconnect waiting. */
export function resetTodoMutations(): void {
  waiting = null;
}
