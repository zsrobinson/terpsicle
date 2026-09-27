import { ChevronLeft, Info, X } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ChatItem,
  campusDay,
  chatErrorWords,
  chatMessageRef,
  dayWords,
  listed,
  listState,
  peopleWords,
  type Room,
  RUN_GAP_MS,
  typingIn,
  typingWords,
} from "~/core/chat";
import {
  type ChatMessageId,
  type ChatRoomState,
  ChatRulesSeenStoreSchema,
  type CourseCode,
} from "~/core/schema";
import { api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer } from "./composer";
import type { MessageActions, ReportOutcome } from "./message-row";
import { MessageRow } from "./message-row";
import { ROOM_RULES } from "./room-info";
import { RoomLabel } from "./room-row";
import type { CourseChatSession, SessionSnapshot } from "./session";
import { CHAT_UNDO_MS, showNote, showUndo, useNow } from "./undo";

// A room's conversation, or one thread of it (V2.md §8.6): messages oldest
// to newest with day dividers and a "New" line where what you hadn't read
// starts, who's typing, and the composer. It sticks to the bottom while
// you're there, and marks the room read as you see it.

/** Rules shown once per course, the first time you open its chat. */
const RULES_SEEN_KEY = "terpsicle:chat-rules-seen";

function readRulesSeen(): CourseCode[] {
  try {
    const parsed = ChatRulesSeenStoreSchema.safeParse(
      JSON.parse(localStorage.getItem(RULES_SEEN_KEY) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function rulesSeen(courseCode: CourseCode): boolean {
  return readRulesSeen().includes(courseCode);
}

function markRulesSeen(courseCode: CourseCode): void {
  try {
    localStorage.setItem(
      RULES_SEEN_KEY,
      JSON.stringify([...new Set([...readRulesSeen(), courseCode])]),
    );
  } catch {
    // Storage blocked: the rules show again next time, which is fine.
  }
}

export function RoomView({
  courseCode,
  room,
  thread,
  session,
  snapshot,
  roomState,
  compact,
  onBack,
  onOpenThread,
  onCloseThread,
  onInfo,
  onSeen,
}: {
  courseCode: CourseCode;
  room: Room;
  thread: ChatMessageId | null;
  session: CourseChatSession | null;
  snapshot: SessionSnapshot | null;
  /** The room as the socket's welcome described it; undefined until then, or if you can't read it. */
  roomState: ChatRoomState | undefined;
  /** A phone: the header has a way back. */
  compact: boolean;
  onBack: () => void;
  onOpenThread: (id: ChatMessageId) => void;
  onCloseThread: () => void;
  onInfo: () => void;
  /** You've seen the room's newest message. */
  onSeen: () => void;
}) {
  const now = useNow();
  const conversation = snapshot?.conversation ?? null;
  const status = snapshot?.status ?? "connecting";
  const welcomed = conversation?.you != null;
  const readable = roomState !== undefined;

  useEffect(() => {
    if (!session || !readable) return;
    // A thread opened by link needs its first message, from the room's page.
    session.load(room.id);
    if (thread) session.load(room.id, thread);
  }, [session, readable, room.id, thread]);

  const items = useMemo(
    () => (conversation ? listed(conversation, room.id, thread) : []),
    [conversation, room.id, thread],
  );
  const root = thread ? (conversation?.byId[thread] ?? null) : null;
  const list = conversation ? listState(conversation, room.id, thread) : null;
  const firstUnread = thread
    ? null
    : (conversation?.firstUnread[room.id] ?? null);
  const typists = conversation ? typingIn(conversation, room.id, now) : [];

  const actions = useMessageActions(session, room, onOpenThread);

  const disabledReason = !welcomed
    ? null
    : !readable
      ? null
      : !roomState.writable
        ? "This room is read-only now. You can still read everything in it."
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-hairline border-b px-4 py-2">
        {compact || thread ? (
          <WithTooltip
            label={thread ? "Back to the room" : "Back"}
            shortcut="Esc"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={thread ? "Back to the room" : "Back"}
              className="-ml-2 max-md:size-11"
              onClick={thread ? onCloseThread : onBack}
            >
              <ChevronLeft />
            </Button>
          </WithTooltip>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-base">
            {thread ? "Thread" : <RoomLabel room={room} />}
          </h2>
          <p className="truncate text-muted text-sm">
            {thread ? (
              <RoomLabel room={room} />
            ) : (
              [
                room.kind === "course" && room.code ? null : courseCode,
                room.detail,
                roomState ? peopleWords(roomState.members) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            )}
          </p>
        </div>
        {thread ? (
          compact ? null : (
            <WithTooltip label="Close the thread" shortcut="Esc">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close the thread"
                onClick={onCloseThread}
                className="max-md:size-11"
              >
                <X />
              </Button>
            </WithTooltip>
          )
        ) : (
          <WithTooltip label="Room info: people, mute, leave">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Room info"
              onClick={onInfo}
              className="max-md:size-11"
            >
              <Info />
            </Button>
          </WithTooltip>
        )}
      </header>

      {!welcomed ? (
        <Connecting status={status} />
      ) : !readable ? (
        <p className="px-4 py-4 text-muted text-sm">
          {room.kind === "section"
            ? `This room is for people with ${room.code} in a plan. Add it to one of yours to join.`
            : "This room is for people with one of its sections in a plan. Add one to join."}
        </p>
      ) : (
        <Messages
          key={`${room.id}>${thread ?? ""}`}
          courseCode={courseCode}
          items={items}
          root={root}
          thread={thread}
          loaded={list?.loaded ?? false}
          more={list?.more ?? false}
          firstUnread={firstUnread}
          you={conversation?.you ?? null}
          now={now}
          writable={roomState.writable}
          actions={actions}
          onLoadOlder={() => session?.loadOlder(room.id, thread)}
          onSeen={onSeen}
        />
      )}

      {readable && welcomed ? (
        <>
          <p
            aria-live="polite"
            className="min-h-5 truncate px-4 text-muted text-xs"
          >
            {typingWords(typists.map((t) => t.name))}
          </p>
          <Composer
            key={`${room.id}>${thread ?? ""}`}
            label={thread ? "Reply in the thread" : `Message ${room.label}`}
            placeholder={thread ? "Reply…" : `Message ${room.label}`}
            disabledReason={disabledReason}
            onTyping={() => session?.typing(room.id)}
            onSend={(text) => {
              void session?.send(room.id, text, thread).then((result) => {
                if (!result.ok && result.code === "old-client")
                  showNote(chatErrorWords(result.code));
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function Connecting({ status }: { status: SessionSnapshot["status"] }) {
  if (status === "signed-out")
    return (
      <p className="px-4 py-4 text-muted text-sm">
        You're signed out. Sign in again to see this room.
      </p>
    );
  if (status === "unavailable")
    return (
      <p className="px-4 py-4 text-muted text-sm">
        This course's chat isn't reachable right now. Reload to try again.
      </p>
    );
  if (status === "offline")
    return (
      <p className="px-4 py-4 text-muted text-sm">
        You're offline. The room opens when you're back.
      </p>
    );
  return (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      role="status"
      aria-busy="true"
      aria-label="Opening the room"
    >
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

function Messages({
  courseCode,
  items,
  root,
  thread,
  loaded,
  more,
  firstUnread,
  you,
  now,
  writable,
  actions,
  onLoadOlder,
  onSeen,
}: {
  courseCode: CourseCode;
  items: ChatItem[];
  root: ChatItem | null;
  thread: ChatMessageId | null;
  loaded: boolean;
  more: boolean;
  firstUnread: ChatMessageId | null;
  you: SessionSnapshot["conversation"]["you"];
  now: number;
  writable: boolean;
  actions: MessageActions;
  onLoadOlder: () => void;
  onSeen: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [rules, setRules] = useState(() => !rulesSeen(courseCode));
  const nowIso = new Date(now).toISOString();

  // Stick to the bottom while you're there; keep your place when older ones load.
  const lastId = items.at(-1)?.id;
  const firstId = items[0]?.id;
  const height = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the list's ends change
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else if (height.current && el.scrollHeight > height.current)
      el.scrollTop += el.scrollHeight - height.current;
    height.current = el.scrollHeight;
  }, [lastId, firstId, loaded]);

  // Seen: the room is on screen, you're at the bottom, and the tab is visible.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new last message is seen again
  useEffect(() => {
    if (!loaded) return;
    const seen = () => {
      if (atBottom.current && document.visibilityState === "visible") onSeen();
    };
    seen();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, [loaded, lastId, onSeen]);

  const rows = thread && root ? [root, ...items] : items;

  return (
    <div
      ref={scroller}
      role="log"
      aria-label={thread ? "Thread" : "Messages"}
      aria-busy={!loaded}
      className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-2"
      onScroll={(e) => {
        const el = e.currentTarget;
        const was = atBottom.current;
        atBottom.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        if (atBottom.current && !was) onSeen();
      }}
    >
      {rules && !thread ? (
        <div className="m-4 border border-keyline bg-raised p-3 text-sm shadow-offset">
          <h3 className="mb-1 font-semibold">Before you post</h3>
          <ul className="list-disc pl-4 text-muted">
            {ROOM_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <WithTooltip label="Hide these for this course">
            <Button
              size="sm"
              variant="outline"
              className="mt-2 max-md:h-11"
              onClick={() => {
                markRulesSeen(courseCode);
                setRules(false);
              }}
            >
              Got it
            </Button>
          </WithTooltip>
        </div>
      ) : null}
      {more ? (
        <div className="flex justify-center py-2">
          <WithTooltip label="Show earlier messages">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadOlder}
              className="max-md:h-11"
            >
              Load older messages
            </Button>
          </WithTooltip>
        </div>
      ) : null}
      {!loaded ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted text-sm">
          {thread
            ? "No replies yet."
            : "No messages yet. Say hi to your classmates."}
        </p>
      ) : (
        rows.map((item, i) => {
          const prev = rows[i - 1];
          const newDay =
            !prev || campusDay(prev.createdAt) !== campusDay(item.createdAt);
          const isRoot = thread !== null && i === 0;
          const run =
            !newDay &&
            !isRoot &&
            !(thread && i === 1) &&
            prev?.author.directoryId === item.author.directoryId &&
            Date.parse(item.createdAt) - Date.parse(prev.createdAt) <
              RUN_GAP_MS &&
            item.id !== firstUnread;
          return (
            <Fragment key={item.id}>
              {newDay ? (
                <DayDivider label={dayWords(item.createdAt, nowIso)} />
              ) : null}
              {item.id === firstUnread ? <NewDivider /> : null}
              <MessageRow
                item={item}
                you={you}
                now={now}
                showHeader={!run}
                inThread={thread !== null}
                writable={writable}
                actions={actions}
              />
              {isRoot && items.length > 0 ? (
                <div className="mx-4 my-1 border-hairline border-t" />
              ) : null}
            </Fragment>
          );
        })
      )}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-1 text-muted text-xs">
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      <span className="font-medium">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function NewDivider() {
  return (
    <div className="flex items-center gap-3 px-4 py-1 text-xs">
      <span aria-hidden="true" className="h-px flex-1 bg-fg" />
      <span className="font-semibold">
        New<span className="sr-only"> messages</span>
      </span>
    </div>
  );
}

/** The message menu's actions, bound to the session. */
function useMessageActions(
  session: CourseChatSession | null,
  room: Room,
  onOpenThread: (id: ChatMessageId) => void,
): MessageActions {
  const report = useCallback(
    async (
      item: ChatItem,
      reason: Parameters<MessageActions["report"]>[1],
      note: string | null,
    ): Promise<ReportOutcome> => {
      const ref = chatMessageRef(item.room, item.id);
      if (!ref) return "not-found";
      try {
        const result = await api.reports.create({
          surface: "chat",
          ref,
          reason,
          note,
        });
        return result.status;
      } catch {
        return "failed";
      }
    },
    [],
  );
  return useMemo(
    () => ({
      openThread: (item) => onOpenThread(item.replyTo ?? item.id),
      edit: async (item, text) => {
        if (!session) return false;
        const before = item.text;
        const result = await session.edit(room.id, item.id, text);
        if (!result.ok) {
          showNote(
            chatErrorWords(result.code, result.retryAfter, result.until),
          );
          return false;
        }
        showUndo("Message edited", () => {
          void session.edit(room.id, item.id, before);
        });
        return true;
      },
      remove: (item) => {
        if (!session) return;
        const undo = session.deleteLater(room.id, item.id, CHAT_UNDO_MS);
        showUndo("Message deleted", undo);
      },
      react: (item, reaction, on) => {
        void session?.react(room.id, item.id, reaction, on).then((result) => {
          if (!result.ok)
            showNote(
              chatErrorWords(result.code, result.retryAfter, result.until),
            );
        });
      },
      retry: (item) => {
        if (item.local)
          void session?.retry(
            item.local.req,
            item.room,
            item.text,
            item.replyTo,
          );
      },
      discard: (item) => {
        if (item.local) session?.discard(item.local.req);
      },
      report,
    }),
    [session, room.id, onOpenThread, report],
  );
}
