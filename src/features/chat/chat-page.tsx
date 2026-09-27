import { cn } from "cn";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useIsMobile } from "~/app/use-media-query";
import {
  canReadRoom,
  chatListUnread,
  roomsForCourse,
  sectionsInPlans,
} from "~/core/chat";
import {
  type CourseCode,
  chatHref,
  parseRoomId,
  type RoomId,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { SiteHeader } from "~/features/site/site-page";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { chatListOf, useChatHome } from "./chat-home";
import { CourseSpace } from "./course-space";
import type { ChatGo, ChatView } from "./nav";
import { RoomInfo } from "./room-info";
import { RoomList } from "./room-list";
import { RoomView } from "./room-view";
import { useCourseChat } from "./session";
import { ChatClosed, SignInMoment } from "./sign-in-moment";

// Terpsicle Chat (`/chat`, V2.md §8.6). Signed out, it's the front door;
// signed in, the list of your classes and their rooms beside the room
// you're in. On a phone (SPEC §2) one thing at a time: the list, a course's
// rooms, or a room, with room info in a bottom drawer. Everything is plain
// text and tokens; there are no sparkles anywhere in Chat.

/** How often the list's unread counts refresh while /chat is open. */
const UNREAD_EVERY_MS = 60_000;

export function ChatPage({ view, go }: { view: ChatView; go: ChatGo }) {
  const status = useAccount((s) => s.status);
  const chat = useAccount((s) => s.flags.chat);
  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <SiteHeader />
      {status === "loading" ? (
        <div className="flex flex-col gap-3 px-4 py-6" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      ) : chat === "off" ? (
        <ChatClosed />
      ) : status === "signed-out" ? (
        <SignInMoment returnTo={chatHref(view)} />
      ) : (
        <ChatApp view={view} go={go} />
      )}
    </div>
  );
}

function ChatApp({ view, go }: { view: ChatView; go: ChatGo }) {
  const mobile = useIsMobile();
  const termId = useChatHome((s) => s.termId);
  const homeStatus = useChatHome((s) => s.status);
  const [infoOpen, setInfoOpen] = useState(false);

  // Load once, for the term in the link (or the usual pick).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = view.term ?? "";
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    void useChatHome.getState().load(view.term ?? null);
  }, [view.term]);

  // Counts stay fresh without waking any room (V2 §8.3: one D1 query).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        void useChatHome.getState().refreshUnread();
    };
    const timer = setInterval(refresh, UNREAD_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // "Join CMSC351 chat" from the scheduler: follow once signed in, then open its course room.
  const joined = useRef(false);
  useEffect(() => {
    if (!view.join || !view.course || homeStatus !== "ready" || !termId) return;
    if (joined.current) return;
    joined.current = true;
    const course = view.course;
    void (async () => {
      const home = useChatHome.getState();
      const inList = chatListOf(home).some((c) => c.courseCode === course);
      if (!inList) await home.follow(course);
      go(
        { term: termId, course, room: `${termId}:${course}` },
        { replace: true },
      );
    })();
  }, [view.join, view.course, homeStatus, termId, go]);

  const room =
    view.room && termId && parseRoomId(view.room)?.termId === termId
      ? view.room
      : null;
  const course: CourseCode | null = room
    ? (parseRoomId(room)?.courseCode ?? null)
    : (view.course ?? null);

  // Esc walks back out: room info, thread, room, course, list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=menu], [role=dialog]"))
        return;
      if (infoOpen) setInfoOpen(false);
      else if (view.thread) go({ ...view, thread: undefined });
      else if (view.room) go({ term: view.term, course: course ?? undefined });
      else if (view.course) go({ term: view.term });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, go, course, infoOpen]);

  // The tab's title counts unread messages.
  const unread = useChatHome((s) => chatListUnread(chatListOf(s)));
  useEffect(() => {
    document.title =
      unread > 0 ? `(${unread}) Chat · Terpsicle` : "Chat · Terpsicle";
  }, [unread]);

  const goScoped: ChatGo = useCallback(
    (next, options) => go({ term: view.term, ...next }, options),
    [go, view.term],
  );

  const showList = !mobile || !room;
  const sidebar =
    course && (!room || !mobile) ? (
      <CourseSpace courseCode={course} view={view} go={goScoped} />
    ) : (
      <RoomList view={view} go={goScoped} />
    );

  return (
    <div className="flex min-h-0 flex-1">
      {showList ? (
        <nav
          aria-label="Rooms"
          className={cn(
            "flex min-h-0 flex-col",
            mobile ? "flex-1" : "w-80 shrink-0 border-hairline border-r",
          )}
        >
          {sidebar}
        </nav>
      ) : null}
      {room && course && termId ? (
        <CourseRoom
          key={course}
          termId={termId}
          courseCode={course}
          roomId={room}
          view={view}
          go={goScoped}
          mobile={mobile}
          infoOpen={infoOpen}
          setInfoOpen={setInfoOpen}
        />
      ) : mobile ? null : (
        <main className="flex flex-1 items-center justify-center px-6 text-center text-muted text-sm">
          {homeStatus === "ready" ? "Pick a room to start talking." : null}
        </main>
      )}
    </div>
  );
}

/** A room with its course's socket; room info beside it (desktop) or in a drawer (phone). */
function CourseRoom({
  termId,
  courseCode,
  roomId,
  view,
  go,
  mobile,
  infoOpen,
  setInfoOpen,
}: {
  termId: string;
  courseCode: CourseCode;
  roomId: RoomId;
  view: ChatView;
  go: ChatGo;
  mobile: boolean;
  infoOpen: boolean;
  setInfoOpen: (open: boolean) => void;
}) {
  const course = useChatHome((s) => s.courses.get(courseCode) ?? null);
  const plans = useChatHome((s) => s.synced.plans);
  useEffect(() => {
    if (!course) void useChatHome.getState().ensureCourse(courseCode);
  }, [course, courseCode]);
  const tree = course ? roomsForCourse(termId, course) : null;
  // Every room of the course you can read: one socket follows them all.
  const readable = useMemo(() => {
    if (!tree) return [];
    const mine = sectionsInPlans(termId, courseCode, plans);
    return tree.rooms
      .filter((r) => canReadRoom(tree, r.id, mine))
      .map((r) => r.id);
  }, [tree, termId, courseCode, plans]);
  const { session, snapshot } = useCourseChat(
    termId,
    courseCode,
    readable.length ? readable : [tree?.course.id ?? `${termId}:${courseCode}`],
  );
  const room = tree?.byId.get(roomId) ?? null;

  // Reading a room clears its count in the list too.
  const onSeen = useCallback(() => {
    session?.read(roomId);
    useChatHome.getState().markRead(roomId);
  }, [session, roomId]);

  const openThread = useCallback(
    (id: string) => go({ course: courseCode, room: roomId, thread: id }),
    [go, courseCode, roomId],
  );

  if (!tree || !room)
    return (
      <main className="flex flex-1 flex-col">
        {course === null ? (
          <div className="flex flex-col gap-3 px-4 py-6" aria-busy="true">
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <p className="px-4 py-6 text-muted text-sm">
            That room isn't in {courseCode} anymore.
          </p>
        )}
      </main>
    );

  const roomState = snapshot?.conversation.rooms[roomId];
  const info = (
    <RoomInfo
      termId={termId}
      courseCode={courseCode}
      room={room}
      members={roomState?.members ?? null}
    />
  );

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col" aria-label={room.label}>
        <RoomView
          courseCode={courseCode}
          room={room}
          thread={view.thread ?? null}
          session={session}
          snapshot={snapshot}
          roomState={roomState}
          compact={mobile}
          onBack={() => go({ course: courseCode })}
          onOpenThread={openThread}
          onCloseThread={() => go({ course: courseCode, room: roomId })}
          onInfo={() => setInfoOpen(!infoOpen)}
          onSeen={onSeen}
        />
      </main>
      {infoOpen && !mobile ? (
        <aside
          aria-label="Room info"
          className="scroll-thin w-72 shrink-0 overflow-y-auto border-hairline border-l"
        >
          <div className="flex h-12 items-center justify-between border-hairline border-b px-4">
            <h2 className="font-semibold text-base">Room info</h2>
            <WithTooltip label="Close room info" shortcut="Esc">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close room info"
                onClick={() => setInfoOpen(false)}
              >
                <X />
              </Button>
            </WithTooltip>
          </div>
          {info}
        </aside>
      ) : null}
      {mobile ? (
        <Drawer.Root open={infoOpen} onOpenChange={setInfoOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-fg/20" />
            <Drawer.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col border-keyline border-t bg-bg shadow-drawer outline-none"
            >
              <div
                className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline-strong"
                aria-hidden="true"
              />
              <div className="flex items-center justify-between px-4 pt-2">
                <Drawer.Title className="font-semibold text-base">
                  Room info
                </Drawer.Title>
                <WithTooltip label="Close room info">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close room info"
                    className="size-11"
                    onClick={() => setInfoOpen(false)}
                  >
                    <X />
                  </Button>
                </WithTooltip>
              </div>
              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
                {info}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      ) : null}
    </>
  );
}
