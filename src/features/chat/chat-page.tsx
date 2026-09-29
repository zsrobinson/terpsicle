import { useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { CalendarDays, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppBar } from "~/components/app-bar";
import { Mark } from "~/components/brand/mark";
import { PanelNote } from "~/components/panel";
import {
  type ChatListCourse,
  canReadRoom,
  chatListUnread,
  type Room,
  roomsForCourse,
  sectionsInPlans,
  unreadWords,
} from "~/core/chat";
import { feedbackProduct } from "~/core/feedback/path";
import { SCHEDULE_PATH } from "~/core/routing";
import {
  type CourseCode,
  chatHref,
  courseRoomId,
  parseRoomId,
  type RoomId,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { useIsMobile } from "~/hooks/use-media-query";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import { type BackTo, PageHeader } from "~/ui/page-header";
import { PAGE_WIDTH, ProductPage } from "~/ui/product-page";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { chatListOf, useChatHome } from "./chat-home";
import { CourseFinder } from "./course-finder";
import { JoinButton } from "./join-button";
import type { ChatGo, ChatView } from "./nav";
import { RoomInfo } from "./room-info";
import { RoomList, useChatList } from "./room-list";
import { RoomSkeleton, RoomView } from "./room-view";
import { useCourseChat } from "./session";
import { ChatClosed, SignInMoment } from "./sign-in-moment";
import { ChatTermMenu } from "./term-menu";

// Terpsicle Chat (`/chat`, V2.md §8.6), the kit's "full" page: a tool with
// panes under the family bar. Signed out, it's the front door; signed in,
// the list of your classes and their rooms beside the room you're in, with
// the term in the bar. The list is the one sidebar and stays put: opening a
// room fills the pane beside it (the owner, 2026-09-28: it mustn't feel like
// a new sidebar). On a phone (SPEC §2) one thing at a time: the room slides
// in over the list, which stays mounted underneath, so Back finds it where
// you left it; room info is a bottom drawer. Everything is plain text and
// tokens; there are no sparkles anywhere in Chat.

/** How often the list's unread counts refresh while /chat is open. */
const UNREAD_EVERY_MS = 60_000;

export function ChatPage({ view, go }: { view: ChatView; go: ChatGo }) {
  const status = useAccount((s) => s.status);
  const chat = useAccount((s) => s.flags.chat);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const app = status === "signed-in" && chat !== "off";
  const fitted = app || status === "loading";
  return (
    <div
      // The app fits the screen, like the workbench: its page never scrolls
      // or rubber-bands, only its panes do (styles.css).
      data-app-shell={fitted ? "" : undefined}
      className={cn(
        "flex flex-col bg-bg text-fg",
        // The app's panes scroll inside; the front door scrolls as a page.
        fitted ? "h-dvh" : "min-h-dvh",
      )}
    >
      <AppBar
        current="chat"
        feedback={feedbackProduct(path)}
        pathname={path}
        context={app ? <ChatTermMenu /> : null}
      />
      {status === "loading" ? (
        <ProductPage width="full" className="md:flex-row">
          <div className="md:w-80 md:shrink-0 md:border-hairline md:border-r">
            <RowSkeleton label="Loading Chat" />
          </div>
        </ProductPage>
      ) : chat === "off" ? (
        <ChatClosed />
      ) : status === "signed-out" ? (
        <SignInMoment returnTo={chatHref(view)} course={view.course} />
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
  // Each "Find a course" focuses the finder (and, on a phone, shows it).
  const [finding, setFinding] = useState(0);
  // Try again on a room whose socket gave up opens a new one.
  const [attempt, setAttempt] = useState(0);

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
    : null;

  // A course on its own (an older link) opens its course room: every room
  // of yours is already in the list, so there's no course page between.
  useEffect(() => {
    if (view.room || !view.course || view.join || !termId) return;
    go(
      {
        term: view.term,
        course: view.course,
        room: courseRoomId(termId, view.course),
      },
      { replace: true },
    );
  }, [view, termId, go]);

  // Esc walks back out: room info, thread, room, list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=menu], [role=dialog]"))
        return;
      if (infoOpen) setInfoOpen(false);
      else if (view.thread) go({ ...view, thread: undefined });
      else if (view.room) go({ term: view.term });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, go, infoOpen]);

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

  const list = useChatList();
  const noClasses = homeStatus === "ready" && list.length === 0;
  const findCourse = () => setFinding((n) => n + 1);

  // No classes yet: on a desktop the list holds the finder and the room's
  // pane says what Chat is; on a phone the list is the only pane, so it
  // says it there, and "Find a course" swaps the finder in.
  const empty = mobile ? (
    finding > 0 ? (
      <CourseFinder go={goScoped} focus={finding} />
    ) : (
      <NoClasses onFind={findCourse} className="px-4 py-4" />
    )
  ) : (
    <>
      <PanelNote className="pb-0">
        Rooms for the classes in your Schedule plans show up here.
      </PanelNote>
      <CourseFinder go={goScoped} focus={finding} />
    </>
  );

  // On a phone the open room covers the list, which stays mounted (hidden)
  // so its scroll and loaded rooms are there when you come back.
  const listHidden = mobile && room !== null;

  return (
    <ProductPage width="full" className="flex-row">
      {/* The page's one h1: the panes' headers say where you are. */}
      <PageHeader title="Chat" className="sr-only" />
      <nav
        aria-label="Rooms"
        hidden={listHidden}
        className={cn(
          "flex min-h-0 flex-col",
          mobile
            ? "flex-1 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            : "w-80 shrink-0 border-hairline border-r",
        )}
      >
        <RoomList view={view} go={goScoped} empty={empty} />
      </nav>
      {room && course && termId ? (
        <CourseRoom
          key={`${course}#${attempt}`}
          termId={termId}
          courseCode={course}
          roomId={room}
          view={view}
          go={goScoped}
          mobile={mobile}
          infoOpen={infoOpen}
          setInfoOpen={setInfoOpen}
          onReconnect={() => setAttempt((n) => n + 1)}
        />
      ) : mobile ? null : (
        // A first visit sits at the top of its pane, in a note's column,
        // like Schedule's and Plan's (the kit's EmptyState, `start`). The
        // pane is there from the start, so nothing beside the list moves.
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn("mx-auto w-full px-4 pt-4", PAGE_WIDTH.note)}>
            {homeStatus !== "ready" ? null : noClasses ? (
              <NoClasses onFind={findCourse} />
            ) : (
              <PickARoom list={list} go={goScoped} />
            )}
          </div>
        </div>
      )}
    </ProductPage>
  );
}

/**
 * Chat's first visit, with no classes in a synced plan yet: two equal ways
 * in, like Schedule's and Plan's (docs/COHESION.md §1.6).
 */
function NoClasses({
  onFind,
  className,
}: {
  onFind: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      equal
      className={className}
      mark={<Mark id="chat" size={40} />}
      title="No classes here yet"
      line="Find any course to open its chat, or add classes to a plan in Schedule and their rooms show up here."
      primary={{
        label: "Find a course",
        icon: <Search aria-hidden="true" />,
        hint: "Search every course this term",
        onClick: onFind,
      }}
      secondary={{
        label: "View schedule",
        icon: <CalendarDays aria-hidden="true" />,
        hint: "Add classes to a plan",
        to: SCHEDULE_PATH,
      }}
    />
  );
}

/**
 * The room's pane before you've picked one: what the rooms are, and one way
 * in. That's the room with the most unread, or else the first course's.
 */
function PickARoom({
  list,
  go,
}: {
  list: readonly ChatListCourse[];
  go: ChatGo;
}) {
  const termId = useChatHome((s) => s.termId);
  if (!termId) return null;
  const rooms = list.flatMap((c) =>
    c.rooms.map((r) => ({ ...r, courseCode: c.courseCode })),
  );
  const target =
    [...rooms]
      .filter((r) => !r.muted && r.unread > 0)
      .sort((a, b) => b.unread - a.unread)[0] ?? rooms[0];
  if (!target) return null;
  return (
    <EmptyState
      mark={<Mark id="chat" size={40} />}
      title="Pick a room to start talking"
      line="Each of your classes has a room for the course, one for your professor's sections and one for your section."
      primary={{
        label: `Open ${roomName(target.courseCode, target.room)}`,
        hint:
          target.unread > 0 && !target.muted
            ? unreadWords(target.unread)
            : target.room.description,
        onClick: () => go({ course: target.courseCode, room: target.room.id }),
      }}
    />
  );
}

/** "CMSC351", "CMSC351 0101", "CMSC351 Brandt's sections". */
function roomName(courseCode: CourseCode, room: Room): string {
  if (room.kind === "course") return courseCode;
  return `${courseCode} ${room.code ?? room.words}`;
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
  onReconnect,
}: {
  termId: string;
  courseCode: CourseCode;
  roomId: RoomId;
  view: ChatView;
  go: ChatGo;
  mobile: boolean;
  infoOpen: boolean;
  setInfoOpen: (open: boolean) => void;
  onReconnect: () => void;
}) {
  const course = useChatHome((s) => s.courses.get(courseCode) ?? null);
  const plans = useChatHome((s) => s.synced.plans);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (course) return;
    let live = true;
    void useChatHome
      .getState()
      .ensureCourse(courseCode)
      .then((found) => {
        if (live && !found) setMissing(true);
      });
    return () => {
      live = false;
    };
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

  // A phone pushes the room in over the list; a desktop fills the pane.
  const pane = cn(
    "flex min-w-0 flex-1 flex-col",
    mobile &&
      "animate-in slide-in-from-right-8 fade-in-0 duration-200 motion-reduce:animate-none",
  );
  const backToList: BackTo = {
    label: "Your classes",
    to: "/chat",
    search: { term: view.term },
  };

  if (!tree || !room)
    return (
      <section className={pane}>
        {course === null && !missing ? (
          // The room's own shape, so nothing moves when it arrives.
          <RoomSkeleton back={mobile ? backToList : undefined} />
        ) : (
          <>
            <PageHeader
              size="panel"
              back={mobile ? backToList : undefined}
              title={<span className="ident">{courseCode}</span>}
            />
            <PanelNote>
              {course === null
                ? `${courseCode} isn't in this term's catalog, so it has no chat this term.`
                : `That room isn't in ${courseCode} anymore.`}
            </PanelNote>
          </>
        )}
      </section>
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
  const closeInfo = (
    <WithTooltip label="Close room info" shortcut={mobile ? undefined : "Esc"}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close room info"
        onClick={() => setInfoOpen(false)}
      >
        <X />
      </Button>
    </WithTooltip>
  );

  return (
    <>
      <section className={pane} aria-label={room.label}>
        <RoomView
          courseCode={courseCode}
          room={room}
          thread={view.thread ?? null}
          session={session}
          snapshot={snapshot}
          roomState={roomState}
          compact={mobile}
          back={{
            room: {
              label: roomName(courseCode, room),
              to: "/chat",
              search: { term: view.term, course: courseCode, room: roomId },
            },
            list: backToList,
          }}
          join={<JoinButton courseCode={courseCode} />}
          onOpenThread={openThread}
          onInfo={() => setInfoOpen(!infoOpen)}
          onSeen={onSeen}
          onReconnect={onReconnect}
        />
      </section>
      {infoOpen && !mobile ? (
        <aside
          aria-label="Room info"
          className="scroll-thin w-72 shrink-0 overflow-y-auto border-hairline border-l"
        >
          <PageHeader size="panel" title="Room info" actions={closeInfo} />
          {info}
        </aside>
      ) : null}
      {mobile ? (
        <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
          <PageHeader
            size="panel"
            title={
              <SheetTitle asChild>
                <span>Room info</span>
              </SheetTitle>
            }
            actions={closeInfo}
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {info}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
