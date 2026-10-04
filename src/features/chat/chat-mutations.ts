import {
  MutationObserver,
  mutationOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { mainPlanFor } from "~/core/plans/main-plan";
import type { ChatUnreadRoom, CourseCode, RoomId, TermId } from "~/core/schema";
import { refetchWhenRunSettles } from "~/lib/settle-run";
import { chatClient } from "./chat-client";
import {
  cachedSynced,
  cachedUnread,
  changeFollows,
  chatQueryClient,
  updateUnread,
  useChatHome,
} from "./chat-home";
import { chatUnreadQuery } from "./unread-query";

// Joining, leaving and muting from Chat (V2.md §8.6), as mutations over
// the list (docs/decisions.md, "TanStack Query for server data"): each
// shows at once, comes back down if the server says no, and once the
// last of a run has settled the unread counts are asked for again, since
// joining or leaving changes which rooms the server lists. They run
// outside components: a toast's Undo outlives the menu that left.

const followKey = ["chat", "follow"] as const;
const muteKey = ["chat", "mute"] as const;

/**
 * Before a change shows, an ask for the counts already out is dropped: it
 * would land over the change. Only once the counts are there: the first
 * ask is the list's own.
 */
async function holdUnread(client: QueryClient, termId: TermId): Promise<void> {
  const { queryKey } = chatUnreadQuery(termId);
  if (client.getQueryData(queryKey) !== undefined)
    await client.cancelQueries({ queryKey });
}

/** Once the last change of a run has settled, the server's counts, over whatever came back on the way. */
function settleUnread(
  client: QueryClient,
  termId: TermId,
  mutationKey: readonly string[],
): void {
  refetchWhenRunSettles(client, mutationKey, () => {
    void client.invalidateQueries({
      queryKey: chatUnreadQuery(termId).queryKey,
    });
  });
}

const followsIn = (termId: TermId): readonly CourseCode[] =>
  useChatHome.getState().follows[termId] ?? [];

function inMainPlan(termId: TermId, courseCode: CourseCode): boolean {
  const synced = cachedSynced();
  return (
    mainPlanFor(
      termId,
      synced.plans,
      synced.settings?.body.mainPlans ?? {},
    )?.courses.some((c) => c.courseCode === courseCode) ?? false
  );
}

interface CourseVariables {
  termId: TermId;
  courseCode: CourseCode;
}

/** The server answered, but didn't join. */
class FollowRefused extends Error {
  constructor(readonly status: "too-many" | "other-term") {
    super(status);
  }
}

/**
 * Joining a course's chat: it's in your list at once, and out again if
 * the server says no (too many, or a new term's started).
 */
export function followMutation() {
  return mutationOptions({
    mutationKey: followKey,
    mutationFn: async ({ termId, courseCode }: CourseVariables) => {
      const result = await chatClient().chat.follow({ termId, courseCode });
      if (result.status !== "ok") throw new FollowRefused(result.status);
    },
    onMutate: ({ termId, courseCode }) => {
      const had = followsIn(termId).includes(courseCode);
      if (!had) changeFollows(termId, (codes) => [...codes, courseCode]);
      return { had };
    },
    onError: (_error, { termId, courseCode }, context) => {
      if (context && !context.had)
        changeFollows(termId, (codes) => codes.filter((c) => c !== courseCode));
    },
    onSettled: (_data, _error, { termId }, _context, { client }) =>
      settleUnread(client, termId, followKey),
  });
}

/**
 * Leaving a course's chat: its rooms leave the list at once (unless your
 * main plan has it, which keeps them), and come back if it didn't save.
 */
export function unfollowMutation() {
  return mutationOptions({
    mutationKey: followKey,
    mutationFn: ({ termId, courseCode }: CourseVariables) =>
      chatClient().chat.unfollow({ termId, courseCode }),
    onMutate: async ({ termId, courseCode }, { client }) => {
      await holdUnread(client, termId);
      const had = followsIn(termId).includes(courseCode);
      changeFollows(termId, (codes) => codes.filter((c) => c !== courseCode));
      // The rows would bring its rooms back until the counts are asked again.
      const removed: ChatUnreadRoom[] = inMainPlan(termId, courseCode)
        ? []
        : cachedUnread(termId).filter((r) => r.courseCode === courseCode);
      if (removed.length > 0)
        updateUnread(termId, (rows) =>
          rows.filter((r) => !removed.includes(r)),
        );
      return { had, removed };
    },
    onError: (_error, { termId, courseCode }, context) => {
      if (!context) return;
      if (context.had)
        changeFollows(termId, (codes) =>
          codes.includes(courseCode) ? [...codes] : [...codes, courseCode],
        );
      if (context.removed.length > 0)
        updateUnread(termId, (rows) => [
          ...rows,
          ...context.removed.filter(
            (r) => !rows.some((x) => x.room === r.room),
          ),
        ]);
    },
    onSettled: (_data, _error, { termId }, _context, { client }) =>
      settleUnread(client, termId, followKey),
  });
}

interface MuteVariables extends CourseVariables {
  room: RoomId;
  muted: boolean;
}

/** The room's unread row (if it has one) says it's muted or not. */
function setRowMuted(termId: TermId, room: RoomId, muted: boolean): void {
  updateUnread(termId, (rows) =>
    rows.some((r) => r.room === room && r.muted !== muted)
      ? rows.map((r) => (r.room === room ? { ...r, muted } : r))
      : rows,
  );
}

/**
 * Muting or unmuting a room: the bell shows at once in the list, the
 * room's Options and Home's counts, and goes back if it didn't save. A
 * room with no messages has no unread row yet, so the list keeps the
 * mute here too (`mutes`).
 */
export function muteMutation() {
  return mutationOptions({
    mutationKey: muteKey,
    mutationFn: ({ termId, courseCode, room, muted }: MuteVariables) =>
      chatClient().chat.mute({ termId, courseCode, roomId: room, muted }),
    onMutate: async ({ termId, room, muted }, { client }) => {
      await holdUnread(client, termId);
      const { mutes } = useChatHome.getState();
      const before = {
        mute: mutes[room],
        row: cachedUnread(termId).find((r) => r.room === room)?.muted,
      };
      useChatHome.setState({ mutes: { ...mutes, [room]: muted } });
      setRowMuted(termId, room, muted);
      return before;
    },
    onError: (_error, { termId, room, muted }, before) => {
      if (!before) return;
      // Only what this put up comes down: a later change stays.
      const { mutes } = useChatHome.getState();
      if (mutes[room] === muted)
        useChatHome.setState({
          mutes:
            before.mute === undefined
              ? Object.fromEntries(
                  Object.entries(mutes).filter(([id]) => id !== room),
                )
              : { ...mutes, [room]: before.mute },
        });
      if (before.row !== undefined) setRowMuted(termId, room, before.row);
    },
    onSettled: (_data, _error, { termId }, _context, { client }) =>
      settleUnread(client, termId, muteKey),
  });
}

/** Runs a mutation through the page's query client, outside any component. */
function run<TData, TVariables, TContext>(
  options: ReturnType<
    typeof mutationOptions<TData, Error, TVariables, TContext>
  >,
  variables: TVariables,
): Promise<TData> {
  const client = chatQueryClient();
  if (!client) return Promise.reject(new Error("Chat isn't connected yet"));
  return new MutationObserver(client, options).mutate(variables);
}

export type FollowResult = "ok" | "too-many" | "other-term" | "failed";

/** Joins a course's chat in Chat's term (see `followMutation`). */
export async function followCourse(
  courseCode: CourseCode,
): Promise<FollowResult> {
  const { termId } = useChatHome.getState();
  if (!termId) return "failed";
  try {
    await run(followMutation(), { termId, courseCode });
    return "ok";
  } catch (error) {
    return error instanceof FollowRefused ? error.status : "failed";
  }
}

/** Leaves a course's chat (see `unfollowMutation`); false if it didn't save. */
export async function unfollowCourse(courseCode: CourseCode): Promise<boolean> {
  const { termId } = useChatHome.getState();
  if (!termId) return false;
  return run(unfollowMutation(), { termId, courseCode }).then(
    () => true,
    () => false,
  );
}

/** Mutes or unmutes a room (see `muteMutation`); false if it didn't save. */
export async function muteRoom(
  courseCode: CourseCode,
  room: RoomId,
  muted: boolean,
): Promise<boolean> {
  const { termId } = useChatHome.getState();
  if (!termId) return false;
  return run(muteMutation(), { termId, courseCode, room, muted }).then(
    () => true,
    () => false,
  );
}
