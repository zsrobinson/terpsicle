import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { PanelBody, PanelNote } from "~/app/panel";
import type { ChatListCourse } from "~/core/chat";
import type { RoomId } from "~/core/schema";
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
import { ROW_LINK, RoomRow, UnreadCount } from "./room-row";
import { showNote } from "./undo";

// The chat list (V2.md §8.6): your courses this term, each under a tinted
// course bar with your rooms (course, professor, section) as rows, and
// unread counts, like the scheduler's Courses tab. "Rooms from Plan A ▾"
// picks which plan's sections are your rooms; the term is in the bar.

/** Your classes this term and their rooms, as the list shows them. */
export function useChatList(): ChatListCourse[] {
  const termId = useChatHome((s) => s.termId);
  const synced = useChatHome((s) => s.synced);
  const unread = useChatHome((s) => s.unread);
  const courses = useChatHome((s) => s.courses);
  const follows = useChatHome((s) => s.follows);
  const mutes = useChatHome((s) => s.mutes);
  return useMemo(
    () => chatListOf({ termId, synced, unread, courses, follows, mutes }),
    [termId, synced, unread, courses, follows, mutes],
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
  const list = useChatList();

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
  return (
    <li className="border-hairline border-b last:border-b-0">
      <GroupHeader
        headingLevel={3}
        className="relative transition-colors hover:bg-hover max-md:h-11"
        title={
          <WithTooltip label={`Every room in ${courseCode}`}>
            <button
              type="button"
              onClick={() => go({ course: courseCode })}
              className={cn(ROW_LINK, "block max-w-full truncate text-left")}
            >
              <span className="ident">{courseCode}</span>
              {course ? (
                <span className="ml-2 font-normal text-muted">
                  {course.title}
                </span>
              ) : null}
            </button>
          </WithTooltip>
        }
        right={
          <>
            <UnreadCount count={entry.unread} />
            <ChevronRight size={14} aria-hidden="true" />
          </>
        }
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

/** "Rooms from Plan A ▾": the plan whose sections are your rooms. */
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
    return <span>Rooms from {chatPlan.name}</span>;
  const pick = (planId: string) =>
    void useChatHome
      .getState()
      .setChatPlan(planId)
      .then((ok) => {
        if (!ok) showNote("We couldn't switch plans.", () => pick(planId));
      });
  return (
    <Select value={chatPlan.id} onValueChange={pick}>
      <WithTooltip label="Pick the plan whose sections are your rooms">
        <SelectTrigger
          size="sm"
          aria-label="Rooms from"
          className="-ml-1.5 border-transparent bg-transparent text-muted hover:text-fg max-md:data-[size=sm]:h-11"
        >
          <SelectValue>Rooms from {chatPlan.name}</SelectValue>
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
