import { type ReactNode, useMemo } from "react";
import { PanelBody, PanelNote } from "~/app/panel";
import type { ChatListCourse } from "~/core/chat";
import { type CourseCode, parseRoomId, type RoomId } from "~/core/schema";
import { InlineError } from "~/ui/inline-error";
import { GroupHeader } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { chatListOf, termPlans, useChatHome, useChatPlan } from "./chat-home";
import type { ChatGo, ChatView } from "./nav";
import { RoomRow, UnreadCount } from "./room-row";
import { showNote } from "./undo";

// The chat list (V2.md §8.6): your courses this term, each under a tinted
// course bar with your rooms (course, professor, section) as rows, and
// unread counts, like the scheduler's Courses tab. "Rooms from Plan A in
// Schedule ▾" picks which plan's sections are your rooms; the term is in
// the bar. It names Schedule because the plan open there may be another.
// It's Chat's one sidebar: opening a room never swaps it for another
// (the owner, 2026-09-28), and it only lists rooms that are yours.

/**
 * Your classes this term and their rooms, as the list shows them, with the
 * course whose room is open last if it isn't one of yours.
 */
export function useChatList(
  viewing: CourseCode | null = null,
): ChatListCourse[] {
  const termId = useChatHome((s) => s.termId);
  const synced = useChatHome((s) => s.synced);
  const unread = useChatHome((s) => s.unread);
  const courses = useChatHome((s) => s.courses);
  const follows = useChatHome((s) => s.follows);
  const mutes = useChatHome((s) => s.mutes);
  return useMemo(
    () =>
      chatListOf({ termId, synced, unread, courses, follows, mutes }, viewing),
    [termId, synced, unread, courses, follows, mutes, viewing],
  );
}

export function RoomList({
  view,
  go,
  empty,
}: {
  view: ChatView;
  go: ChatGo;
  /** What the list shows with no classes yet (the page decides, by width). */
  empty: ReactNode;
}) {
  const status = useChatHome((s) => s.status);
  const viewing = view.room
    ? (parseRoomId(view.room)?.courseCode ?? null)
    : null;
  const list = useChatList(viewing);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader size="panel" title="Your classes" status={<RoomsFrom />} />
      <PanelBody>
        {status === "loading" || status === "idle" ? (
          <RowSkeleton label="Loading your classes" />
        ) : status === "error" ? (
          <InlineError
            className="px-4"
            message="We couldn't load your classes. Check your connection and try again."
            onRetry={() => void useChatHome.getState().load(view.term ?? null)}
            retryTooltip="Load your classes again"
          />
        ) : list.length === 0 ? (
          empty
        ) : (
          <ul aria-label="Your classes">
            {list.map((c) => (
              <CourseGroup
                key={c.courseCode}
                entry={c}
                currentRoom={view.room ?? null}
                go={go}
              />
            ))}
          </ul>
        )}
      </PanelBody>
    </div>
  );
}

function CourseGroup({
  entry,
  currentRoom,
  go,
}: {
  entry: ChatListCourse;
  currentRoom: RoomId | null;
  go: ChatGo;
}) {
  const { courseCode, course, rooms } = entry;
  // Just a heading: its rooms are right under it, so there's nowhere else
  // to go (a course's other rooms aren't yours, so they aren't listed).
  return (
    <li className="border-hairline border-b last:border-b-0">
      <GroupHeader
        headingLevel={3}
        className="max-md:h-11"
        title={
          <span className="block max-w-full truncate">
            <span className="ident">{courseCode}</span>
            {course ? (
              <span className="ml-2 font-normal text-muted">
                {course.title}
              </span>
            ) : null}
          </span>
        }
        right={<UnreadCount count={entry.unread} />}
      />
      {course === null ? (
        <PanelNote>{courseCode} isn't in this term's catalog.</PanelNote>
      ) : (
        <div>
          {rooms.map((r) => (
            <RoomRow
              key={r.room.id}
              room={r.room}
              unread={r.unread}
              muted={r.muted}
              current={r.room.id === currentRoom}
              onOpen={() => go({ course: courseCode, room: r.room.id })}
            />
          ))}
        </div>
      )}
    </li>
  );
}

/** "Rooms from Plan A in Schedule ▾": the plan whose sections are your rooms. */
function RoomsFrom() {
  const termId = useChatHome((s) => s.termId);
  const synced = useChatHome((s) => s.synced);
  const plans = useMemo(
    () => termPlans(synced.plans, termId),
    [synced, termId],
  );
  const chatPlan = useChatPlan();
  if (!termId || !chatPlan) return null;
  if (plans.length < 2 || synced.settings === null)
    return <span>Rooms from {chatPlan.name} in Schedule</span>;
  const pick = (planId: string) =>
    void useChatHome
      .getState()
      .setChatPlan(planId)
      .then((ok) => {
        if (!ok) showNote("We couldn't switch plans.", () => pick(planId));
      });
  return (
    <Select value={chatPlan.id} onValueChange={pick}>
      <WithTooltip label="Your rooms come from one of your Schedule plans. Pick which.">
        <SelectTrigger
          size="sm"
          aria-label="Rooms from"
          className="-ml-1.5 border-transparent bg-transparent text-muted hover:text-fg max-md:data-[size=sm]:h-11"
        >
          <SelectValue>Rooms from {chatPlan.name} in Schedule</SelectValue>
        </SelectTrigger>
      </WithTooltip>
      <SelectContent>
        {plans.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
