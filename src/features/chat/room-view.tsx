import { Info } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { PanelNote } from "~/components/panel";
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
import { chatRulesSeen, withChatRulesSeen } from "~/core/prefs";
import {
  type ChatAuthor,
  type ChatMessageId,
  type ChatRoomState,
  ChatRulesSeenStoreSchema,
  type CourseCode,
} from "~/core/schema";
import { askForPush } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import {
  saveSyncedPrefs,
  useAccountPrefsSettled,
  useSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { type BackTo, PageHeader } from "~/ui/page-header";
import { Skeleton } from "~/ui/skeleton";
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
// you're there, and marks the room read as you see it. It keeps one shape
// from the first frame (the owner, 2026-09-28: opening a room mustn't
// jump): the header, the messages' pane and the composer are there while
// the room connects, with message-shaped bars at the bottom where the
// latest messages will land.

/**
 * Where this browser kept the courses whose rules it had seen, before they
 * followed the account (QA1 C7): moved into the synced prefs once.
 */
const LEGACY_RULES_SEEN_KEY = "terpsicle:chat-rules-seen";

function adoptLegacyRulesSeen(): void {
  let codes: CourseCode[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_RULES_SEEN_KEY);
    if (raw === null) return;
    const parsed = ChatRulesSeenStoreSchema.safeParse(JSON.parse(raw));
    if (parsed.success) codes = parsed.data;
    localStorage.removeItem(LEGACY_RULES_SEEN_KEY);
  } catch {
    // Storage blocked, or a list that doesn't read: nothing to move.
    return;
  }
  if (codes.length > 0)
    void saveSyncedPrefs((prefs) => withChatRulesSeen(prefs, codes));
}

/**
 * Rules shown once per course, the first time you open its chat on any
 * device: "seen" is a synced pref (~/features/prefs), so it follows the
 * account. Null until the account's prefs have been read, so a new device
 * doesn't flash rules you've already closed elsewhere.
 */
function useRulesSeen(courseCode: CourseCode): {
  seen: boolean | null;
  markSeen: () => void;
} {
  useEffect(adoptLegacyRulesSeen, []);
  const prefs = useSyncedPrefs();
  const settled = useAccountPrefsSettled();
  return {
    seen: prefs === null || !settled ? null : chatRulesSeen(prefs, courseCode),
    markSeen: () =>
      void saveSyncedPrefs((p) => withChatRulesSeen(p, [courseCode])),
  };
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
  join,
  onOpenThread,
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
  /** Back from a thread to its room, and (on a phone) from the room to the list. */
  back: { room: BackTo; list: BackTo };
  /** Join, for a course you opened but haven't joined (it renders nothing otherwise). */
  join?: ReactNode;
  onOpenThread: (id: ChatMessageId) => void;
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

  // Opening one of your rooms: the install prompt's `chat-joined` moment
  // (V2 §3.4), whose own rules keep it to once a session and rarer.
  useEffect(() => {
    if (!welcomed || !readable) return;
    void import("~/features/pwa/install-store").then(
      (m) => m.requestInstallPrompt("chat-joined"),
      () => {},
    );
  }, [welcomed, readable]);

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
  const rulesSeen = useRulesSeen(courseCode);

  const disabledReason = !welcomed
    ? null
    : !readable
      ? null
      : !roomState.writable
        ? "This room is read-only now. You can still read everything in it."
        : null;
  // While the room connects, the composer is already there: a send waits in
  // the session and goes once the room's open.
  const connecting =
    !welcomed && (status === "connecting" || status === "open");

  // One line under the room's name, the same height before and after the
  // room says how many people are in it.
  const facts = [
    room.kind === "course" && room.code ? null : courseCode,
    room.detail,
    roomState ? peopleWords(roomState.members) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        size="panel"
        back={thread ? back.room : compact ? back.list : undefined}
        title={thread ? "Thread" : <RoomLabel room={room} />}
        status={
          thread ? (
            <RoomLabel room={room} />
          ) : facts ? (
            facts
          ) : (
            <Skeleton className="my-0.5 h-3 w-20" />
          )
        }
        actions={
          // A thread's one way out is Back (and Esc), as in every drill-in.
          thread ? null : (
            <>
              {join}
              <WithTooltip label="Room info: people, mute, leave">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Room info"
                  onClick={onInfo}
                >
                  <Info />
                </Button>
              </WithTooltip>
            </>
          )
        }
      />

      {!welcomed ? (
        connecting ? (
          <MessagesSkeleton />
        ) : (
          <Connecting status={status} onReconnect={onReconnect} />
        )
      ) : !readable ? (
        // Only by an old link: your rooms come from your plans.
        <PanelNote>
          This room isn't one of yours. Your rooms come from the sections in
          your Schedule plans.
        </PanelNote>
      ) : (
        <Messages
          key={`${room.id}>${thread ?? ""}`}
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

      {(readable && welcomed) || connecting ? (
        <>
          <p
            aria-live="polite"
            className="min-h-5 truncate px-4 text-muted text-xs"
          >
            {typingWords(typists.map((t) => t.name))}
          </p>
          {rulesSeen.seen === false && !thread && !disabledReason ? (
            <PostingHere onClose={rulesSeen.markSeen} />
          ) : null}
          <PushAskCard moment="chat-post" className="mx-4 mb-2" />
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
                // You've posted here: the note has done its job, like "Got it".
                if (result.ok && rulesSeen.seen === false) rulesSeen.markSeen();
                // You've posted: the moment an answer is worth hearing
                // about (V2 §6.7). It asks once, however many you send.
                if (result.ok) void askForPush("chat-post");
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * "Posting here", the first time you open a course's chat: two plain lines
 * over the composer, where you'd post. "Got it" or a first post closes it on
 * every device (a synced pref).
 */
function PostingHere({ onClose }: { onClose: () => void }) {
  return (
    <section
      aria-label="Posting here"
      className="mx-4 mb-2 flex items-start gap-3 border border-hairline bg-panel px-3 py-2 text-sm"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">Posting here</h3>
        <ul className="text-muted">
          {ROOM_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>
      <WithTooltip label="Hide this for this course">
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={onClose}
        >
          Got it
        </Button>
      </WithTooltip>
    </section>
  );
}

/**
 * Messages on their way: bars in their shape (a monogram, a name, a line or
 * two), sitting at the bottom where the latest ones land.
 */
function MessagesSkeleton() {
  const rows = [0.55, 0.8, 0.4, 0.68];
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden pb-2"
    >
      {rows.map((width, i) => (
        <div
          // Bars never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          aria-hidden="true"
          className="flex gap-3 px-4 pt-2 pb-1"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3" style={{ width: `${width * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A room before its course's rooms are known: the room's own frame (the
 * header, the messages' pane and the composer's place), so nothing moves
 * when it opens.
 */
export function RoomSkeleton({ back }: { back?: BackTo }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        size="panel"
        back={back}
        title={<Skeleton className="my-0.5 h-4 w-40" />}
        status={<Skeleton className="my-0.5 h-3 w-24" />}
      />
      <MessagesSkeleton />
      <div className="min-h-5" />
      <div
        aria-hidden="true"
        className="border-hairline border-t px-4 pt-2 pb-3"
      >
        <Skeleton className="h-8 w-full max-md:h-11" />
        <div className="mt-1 min-h-4 max-md:min-h-11" />
      </div>
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
  return <MessagesSkeleton />;
}

function Messages({
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
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
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

  // Anything that changes size under you (the pane, a note over the
  // composer, a reaction, a thread line, the phone's keyboard) keeps the
  // latest message in view while you're at the bottom.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const stick = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      height.current = el.scrollHeight;
    });
    stick.observe(el);
    stick.observe(inner);
    return () => stick.disconnect();
  }, []);

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
      <div ref={content} className="flex min-h-full flex-col justify-end">
        {more ? (
          <div className="flex justify-center py-2">
            <WithTooltip label="Show earlier messages">
              <Button variant="ghost" size="sm" onClick={onLoadOlder}>
                Load older messages
              </Button>
            </WithTooltip>
          </div>
        ) : null}
        {!loaded ? (
          <MessagesSkeleton />
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
        if (!item.local || !session) return;
        const { undo, send } = session.discardLater(item.local.req);
        showUndo("Message discarded", undo, send);
      },
      report,
    }),
    [session, room.id, onOpenThread, report],
  );
}
