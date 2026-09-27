import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { PanelBody, PanelHeader, PanelNote } from "~/app/panel";
import type { ChatListCourse } from "~/core/chat";
import type { RoomId } from "~/core/schema";
import { Button } from "~/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { chatListOf, termPlans, useChatHome, useChatPlan } from "./chat-home";
import { CourseFinder } from "./course-finder";
import type { ChatGo, ChatView } from "./nav";
import { RoomRow, UnreadCount } from "./room-row";
import { showNote } from "./undo";

// The chat list (V2.md §8.6): your courses this term, each with your rooms
// (course, professor, section) and unread counts, grouped by course like the
// scheduler's Courses tab. "Rooms from Plan A ▾" picks which plan's sections
// are your rooms.

export function RoomList({ view, go }: { view: ChatView; go: ChatGo }) {
  const status = useChatHome((s) => s.status);
  const termId = useChatHome((s) => s.termId);
  const synced = useChatHome((s) => s.synced);
  const unread = useChatHome((s) => s.unread);
  const courses = useChatHome((s) => s.courses);
  const follows = useChatHome((s) => s.follows);
  const mutes = useChatHome((s) => s.mutes);
  const list = useMemo(
    () => chatListOf({ termId, synced, unread, courses, follows, mutes }),
    [termId, synced, unread, courses, follows, mutes],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Your classes" sub={<ListControls />} />
      <PanelBody>
        {status === "loading" || status === "idle" ? (
          <ListSkeleton />
        ) : status === "error" ? (
          <PanelNote
            action={
              <WithTooltip label="Load your classes again">
                <Button
                  variant="outline"
                  size="sm"
                  className="max-md:h-11"
                  onClick={() =>
                    void useChatHome.getState().load(view.term ?? null)
                  }
                >
                  Try again
                </Button>
              </WithTooltip>
            }
          >
            We couldn't load your classes. Check your connection and try again.
          </PanelNote>
        ) : list.length === 0 ? (
          <NoRooms go={go} />
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
      <WithTooltip label={`Every room in ${courseCode}`}>
        <button
          type="button"
          onClick={() => go({ course: courseCode })}
          className="flex h-9 w-full items-center gap-2 bg-panel px-4 text-left text-sm transition-colors hover:bg-hover max-md:h-11"
        >
          <span className="ident font-semibold">{courseCode}</span>
          <span className="min-w-0 flex-1 truncate text-muted">
            {course?.title ?? ""}
          </span>
          <UnreadCount count={entry.unread} />
          <ChevronRight size={14} aria-hidden="true" className="text-muted" />
        </button>
      </WithTooltip>
      {course === null ? (
        <div className="px-4 py-2 text-muted text-sm">
          {courseCode} isn't in this term's catalog.
        </div>
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

function ListControls() {
  const terms = useChatHome((s) => s.terms);
  const termId = useChatHome((s) => s.termId);
  const synced = useChatHome((s) => s.synced);
  const plans = useMemo(
    () => termPlans(synced.plans, termId),
    [synced, termId],
  );
  const chatPlan = useChatPlan();
  const canChoose = synced.settings !== null;
  const termName = terms.find((t) => t.id === termId)?.name ?? "";
  if (!termId) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
      {terms.length > 1 ? (
        <Select
          value={termId}
          onValueChange={(next) => void useChatHome.getState().setTerm(next)}
        >
          <WithTooltip label="Show another term's classes">
            <SelectTrigger
              size="sm"
              aria-label="Term"
              className="max-md:data-[size=sm]:h-11"
            >
              <SelectValue>{termName}</SelectValue>
            </SelectTrigger>
          </WithTooltip>
          <SelectContent>
            {terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span>{termName}</span>
      )}
      {chatPlan && plans.length > 1 && canChoose ? (
        <Select
          value={chatPlan.id}
          onValueChange={(planId) =>
            void useChatHome
              .getState()
              .setChatPlan(planId)
              .then((ok) => {
                if (!ok) showNote("We couldn't switch plans. Try again.");
              })
          }
        >
          <WithTooltip label="Pick the plan whose sections are your rooms">
            <SelectTrigger
              size="sm"
              aria-label="Rooms from"
              className="max-md:data-[size=sm]:h-11"
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
      ) : chatPlan ? (
        <span>Rooms from {chatPlan.name}</span>
      ) : null}
    </span>
  );
}

/**
 * No classes in a synced plan yet: any course's room is still a search away
 * (course rooms are open to anyone signed in), and the scheduler is where
 * your own rooms come from.
 */
function NoRooms({ go }: { go: ChatGo }) {
  return (
    <div className="py-3">
      <p className="px-4 pb-3 text-muted text-sm">
        No classes here yet. Find any course to open its chat, or add classes to
        a plan and their rooms show up here.
      </p>
      <CourseFinder go={go} />
      <div className="px-4 pt-4">
        <WithTooltip label="Add classes to a plan">
          <Button asChild variant="outline" size="sm" className="max-md:h-11">
            <a href="/schedule">Open the scheduler</a>
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4" aria-busy="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
