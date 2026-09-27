import { Info, X } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelNote } from "~/app/panel";
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
  type ChatAuthor,
  type ChatMessageId,
  type ChatRoomState,
  ChatRulesSeenStoreSchema,
  type CourseCode,
} from "~/core/schema";
import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { InlineError } from "~/ui/inline-error";
import { type BackTo, PageHeader } from "~/ui/page-header";
import { RowSkeleton } from "~/ui/skeleton";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { Composer } from "./composer";
import type { MessageActions, ReportOutcome } from "./message-row";
import { MessageRow } from "./message-row";
import { ROOM_RULES } from "./room-info";
import { RoomLabel } from "./room-row";
import type { CourseChatSession, SessionSnapshot } from "./session";
import { showNote, showUndo, useNow } from "./undo";

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

/** Who can be @-mentioned here: the room's members (at most 200), you aside. */
async function roomMembers(
  room: Room,
  you: string | undefined,
): Promise<ChatAuthor[]> {
  const result = await chatApi.members({
    termId: room.termId,
    courseCode: room.courseCode,
    roomId: room.id,
  });
  // Thrown, so the next "@" asks again.
  if (result.status !== "ok") throw new Error(result.status);
  return result.members.filter((m) => m.directoryId !== you);
}

export function RoomView({
  courseCode,
  room,
  thread,
  session,
  snapshot,
  roomState,
  compact,
  back,
  onOpenThread,
  onCloseThread,
  onInfo,
  onSeen,
  onReconnect,
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
  /** Back from a thread to its room, and (on a phone) from the room to its course. */
  back: { room: BackTo; course: BackTo };
  onOpenThread: (id: ChatMessageId) => void;
  onCloseThread: () => void;
  onInfo: () => void;
  /** You've seen the room's newest message. */
  onSeen: () => void;
  /** Opens the course's socket again, after it gave up. */
  onReconnect: () => void;
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
      <PageHeader
        size="panel"
        back={thread ? back.room : compact ? back.course : undefined}
        title={thread ? "Thread" : <RoomLabel room={room} />}
        status={
          thread ? (
            <RoomLabel room={room} />
          ) : (
            [
              room.kind === "course" && room.code ? null : courseCode,
              room.detail,
              roomState ? peopleWords(roomState.members) : null,
            ]
              .filter(Boolean)
              .join(" · ")
          )
        }
        actions={
          thread ? (
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
          )
        }
      />

      {!welcomed ? (
        <Connecting status={status} onReconnect={onReconnect} />
      ) : !readable ? (
        <PanelNote>
          {room.kind === "section"
            ? `This room is for people with ${room.code} in a plan. Add it to one of yours to join.`
            : "This room is for people with one of its sections in a plan. Add one to join."}
        </PanelNote>
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
            loadMembers={() =>
              roomMembers(room, conversation?.you?.directoryId)
            }
            onSend={(text) => {
              void session?.send(room.id, text, thread).then((result) => {
                if (!result.ok && result.code === "old-client")
                  noteToast(chatErrorWords(result.code), { reload: true });
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function Connecting({
  status,
  onReconnect,
}: {
  status: SessionSnapshot["status"];
  onReconnect: () => void;
}) {
  if (status === "signed-out")
    return (
      <InlineError
        className="px-4"
        message="You're signed out. Sign in again to see this room."
      />
    );
  if (status === "outdated")
    return (
      <InlineError
        className="px-4"
        message={chatErrorWords("old-client")}
        reload
      />
    );
  if (status === "unavailable")
    return (
      <InlineError
        className="px-4"
        message="This course's chat isn't reachable right now."
        onRetry={onReconnect}
        retryTooltip="Connect to this course's chat again"
      />
    );
  if (status === "offline")
    return (
      <PanelNote>You're offline. The room opens when you're back.</PanelNote>
    );
  return <RowSkeleton label="Opening the room" />;
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
        <Card className="m-4 text-sm">
          <h3 className="font-semibold">Before you post</h3>
          <ul className="list-disc pl-4 text-muted">
            {ROOM_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <WithTooltip label="Hide these for this course">
            <Button
              size="sm"
              variant="outline"
              className="self-start max-md:h-11"
              onClick={() => {
                markRulesSeen(courseCode);
                setRules(false);
              }}
            >
              Got it
            </Button>
          </WithTooltip>
        </Card>
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
        <RowSkeleton rows={2} label="Loading messages" />
      ) : rows.length === 0 ? (
        <PanelNote className="py-6 text-center">
          <p>
            {thread
              ? "No replies yet."
              : "No messages yet. Say hi to your classmates."}
          </p>
        </PanelNote>
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
        const { undo, send } = session.deleteLater(room.id, item.id);
        showUndo("Message deleted", undo, send);
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
