import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppBar } from "~/components/app-bar";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { Mark } from "~/components/brand/mark";
import { PanelNote } from "~/components/panel";
import { SidebarResizeHandle } from "~/components/workbench/sidebar-resize";
import {
  type ChatListCourse,
  canReadRoom,
  chatListUnread,
  chatPath,
  roomIdFromSlug,
  roomSlug,
  roomsForCourse,
  sectionsInPlans,
  unreadWords,
} from "~/core/chat";
import { feedbackProduct } from "~/core/feedback/path";
import { SCHEDULE_PATH } from "~/core/routing";
import { type CourseCode, parseRoomId, type RoomId } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { useIsMobile } from "~/hooks/use-media-query";
import { useSidebarWidth } from "~/hooks/use-sidebar-width";
import { EmptyState } from "~/ui/empty-state";
import { type BackTo, PageHeader } from "~/ui/page-header";
import { PAGE_WIDTH, ProductPage } from "~/ui/product-page";
import { RowSkeleton } from "~/ui/skeleton";
import {
  connectChatData,
  currentChatList,
  listLive,
  useChatHome,
  useChatReads,
  useChatSynced,
} from "./chat-home";
import { followCourse } from "./chat-mutations";
import { CourseFinder } from "./course-finder";
import { JoinButton } from "./join-button";
import { useLiveList } from "./live-list";
import type { ChatGo, ChatView } from "./nav";
import { RoomList, useChatList } from "./room-list";
import { RoomSkeleton, RoomView } from "./room-view";
import { useCourseChat } from "./session";
import { ChatClosed, SignInMoment } from "./sign-in-moment";
import { ChatTermLabel } from "./term-label";

// Terpsicle Chat (`/chat`, V2.md §8.6), the kit's "full" page: a tool with
// panes under the family bar. Signed out, it's the front door; signed in,
// the list of your classes and their rooms beside the room you're in, with
// the term in the bar. Chat has one term, the one in session (or between
// terms the next to start): no switching, and no joining another term's
// chat (owner, 2026-09-29). The list is the one sidebar and stays put: opening a
// room fills the pane beside it (the owner, 2026-09-28: it mustn't feel like
// a new sidebar). On a phone (SPEC §2) one thing at a time: the room pushes
// in over the list (the router's view transition), which stays mounted
// underneath, so Back pops to it where you left it. A room is a path,
// `/chat/<COURSE>/<room>` (~/core/chat/room-paths). Everything is plain
// text and tokens; there are no sparkles anywhere in Chat.

/** The list's id: the resize handle controls it. */
const CHAT_LIST_ID = "chat-list";

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
        context={app ? <ChatTermLabel /> : null}
      />
      {status === "loading" ? (
        <ProductPage width="full" className="md:flex-row">
          <div className="md:w-sidebar md:shrink-0 md:border-hairline md:border-r">
            <RowSkeleton label="Loading Chat" />
          </div>
        </ProductPage>
      ) : chat === "off" ? (
        <ChatClosed />
      ) : status === "signed-out" ? (
        <SignInMoment returnTo={chatPath(view)} course={view.course} />
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
  // Each "Find a course" focuses the finder (and, on a phone, shows it).
  const [finding, setFinding] = useState(0);
  // Try again on a room whose socket gave up opens a new one.
  const [attempt, setAttempt] = useState(0);

  // Load once: Chat's term is today's, whatever the link says. Published
  // files go through the page's query client, shared with the other products.
  const queryClient = useQueryClient();
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    connectChatData(queryClient);
    void useChatHome.getState().load();
  }, [queryClient]);
  // Your plans as the page opens, and the unread counts every minute while
  // it's on screen (V2 §8.3: one D1 query that wakes no room), which the
  // course sockets keep current in between.
  useChatReads();

  // A link to another term's chat (an older one, or for a term that's over
  // or still to come) opens the list: nothing joins or opens there.
  const otherTerm =
    view.term !== undefined && termId !== null && view.term !== termId;
  // One naming Chat's own term needn't say so: the link drops it.
  const sameTerm = view.term !== undefined && view.term === termId;
  const viewCourse = view.course;
  const viewRoom = view.room;
  const viewThread = view.thread;
  const viewJoin = view.join;
  useEffect(() => {
    if (otherTerm) go({}, { replace: true });
    else if (sameTerm && termId && viewCourse && !viewJoin) {
      const id = roomIdFromSlug(termId, viewCourse, viewRoom ?? "everyone");
      if (id)
        go(
          { room: id, ...(viewThread ? { thread: viewThread } : {}) },
          { replace: true },
        );
    }
  }, [
    otherTerm,
    sameTerm,
    termId,
    viewCourse,
    viewRoom,
    viewThread,
    viewJoin,
    go,
  ]);

  // "Join CMSC351 chat" from the scheduler: follow once signed in, then open its course room.
  const joined = useRef(false);
  useEffect(() => {
    if (!view.join || !view.course || homeStatus !== "ready" || !termId) return;
    if (otherTerm || joined.current) return;
    joined.current = true;
    const course = view.course;
    void (async () => {
      const inList = currentChatList().some((c) => c.courseCode === course);
      if (!inList) await followCourse(course);
      go({ room: `${termId}:${course}` }, { replace: true });
    })();
  }, [view.join, view.course, homeStatus, termId, otherTerm, go]);

  // The room the path names in Chat's term.
  const room =
    view.course && termId && !otherTerm && !view.join
      ? roomIdFromSlug(termId, view.course, view.room ?? "everyone")
      : null;
  const course: CourseCode | null = room
    ? (parseRoomId(room)?.courseCode ?? null)
    : null;

  // Esc walks back out: thread, room, list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=menu], [role=dialog]"))
        return;
      if (room && view.thread) go({ room });
      else if (room) go({});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room, view.thread, go]);

  const list = useChatList();
  // The tab's title counts unread messages.
  const unread = chatListUnread(list);
  useEffect(() => {
    document.title =
      unread > 0 ? `(${unread}) Chat · Terpsicle` : "Chat · Terpsicle";
  }, [unread]);

  const noClasses = homeStatus === "ready" && list.length === 0;
  // Every other course's rows update live too; the open one's socket is the room's.
  useLiveList(termId, list, course);
  // A message in the room on screen is read as it lands.
  useEffect(() => {
    useChatHome.getState().setViewing(room);
    return () => useChatHome.getState().setViewing(null);
  }, [room]);
  const findCourse = () => setFinding((n) => n + 1);

  // No classes yet: on a desktop the list holds the finder and the room's
  // pane says what Chat is; on a phone the list is the only pane, so it
  // says it there, and "Find a course" swaps the finder in.
  const empty = mobile ? (
    finding > 0 ? (
      <CourseFinder go={go} focus={finding} />
    ) : (
      <NoClasses onFind={findCourse} className="px-4 py-4" />
    )
  ) : (
    <>
      <PanelNote className="pb-0">
        Rooms for the classes in your Schedule plans show up here.
      </PanelNote>
      <CourseFinder go={go} focus={finding} />
    </>
  );

  // On a phone the open room covers the list, which stays mounted (hidden)
  // so its scroll and loaded rooms are there when you come back.
  const listHidden = mobile && room !== null;
  const [listWidth, setListWidth] = useSidebarWidth();

  return (
    <ProductPage width="full" className="flex-row">
      {/* The page's one h1: the panes' headers say where you are. */}
      <PageHeader title="Chat" className="sr-only" />
      <nav
        id={CHAT_LIST_ID}
        aria-label="Rooms"
        hidden={listHidden}
        // Its fade back in is for browsers without typed view transitions;
        // elsewhere the pop draws it (src/styles/transitions.css).
        data-vt-fallback={mobile ? "" : undefined}
        className={cn(
          // min-w-0: a long newest message truncates, never widens the list.
          "flex min-h-0 min-w-0 flex-col",
          mobile
            ? "flex-1 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            : "relative w-sidebar shrink-0 border-hairline border-r",
        )}
      >
        <RoomList currentRoom={room} go={go} empty={empty} />
        {/* Resized like Schedule's and Plan's sidebars, to the same width. */}
        {mobile || listWidth === null ? null : (
          <SidebarResizeHandle
            controls={CHAT_LIST_ID}
            width={listWidth}
            onWidth={setListWidth}
          />
        )}
      </nav>
      {room && course && termId ? (
        <CourseRoom
          key={`${course}#${attempt}`}
          termId={termId}
          courseCode={course}
          roomId={room}
          view={view}
          go={go}
          mobile={mobile}
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
              <PickARoom list={list} go={go} />
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
        label: <IntegrationLabel product="schedule" />,
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
        label: `Open ${target.room.label}`,
        hint:
          target.unread > 0 && !target.muted
            ? unreadWords(target.unread)
            : target.room.description,
        onClick: () => go({ room: target.room.id }),
      }}
    />
  );
}

/** A room with its course's socket. */
function CourseRoom({
  termId,
  courseCode,
  roomId,
  view,
  go,
  mobile,
  onReconnect,
}: {
  termId: string;
  courseCode: CourseCode;
  roomId: RoomId;
  view: ChatView;
  go: ChatGo;
  mobile: boolean;
  onReconnect: () => void;
}) {
  const course = useChatHome((s) => s.courses.get(courseCode) ?? null);
  const { plans } = useChatSynced();
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
    undefined,
    // The list's rows for this course's other rooms stay live on this socket.
    listLive,
  );
  const room = tree?.byId.get(roomId) ?? null;

  // Reading a room clears its count in the list too.
  const onSeen = useCallback(() => {
    session?.read(roomId);
    useChatHome.getState().markRead(roomId);
  }, [session, roomId]);

  const openThread = useCallback(
    (id: string) => go({ room: roomId, thread: id }),
    [go, roomId],
  );

  // A phone pushes the room in over the list and pops it back off, with the
  // router's view transitions (src/styles/transitions.css); a desktop fills
  // the pane. Browsers without typed view transitions keep a small slide of
  // its own, which data-vt-fallback turns off everywhere else. The room's
  // composer takes the phone's bottom edge, so the tab bar steps aside while
  // it's open (`data-hides-tab-bar`, styles.css).
  const pane = cn(
    "flex min-w-0 flex-1 flex-col",
    mobile &&
      "animate-in slide-in-from-right-8 fade-in-0 duration-200 motion-reduce:animate-none",
  );
  const fallback = mobile ? "" : undefined;
  const backToList: BackTo = { label: "Your classes", to: "/chat" };

  if (!tree || !room)
    return (
      <section
        data-hides-tab-bar=""
        className={pane}
        data-vt-fallback={fallback}
      >
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

  return (
    <section
      data-hides-tab-bar=""
      className={pane}
      data-vt-fallback={fallback}
      aria-label={room.label}
    >
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
            label: room.label,
            to: "/chat/$course/$room",
            params: { course: courseCode, room: roomSlug(roomId) },
          },
          list: backToList,
        }}
        join={<JoinButton courseCode={courseCode} />}
        onOpenThread={openThread}
        onSeen={onSeen}
        onReconnect={onReconnect}
      />
    </section>
  );
}
