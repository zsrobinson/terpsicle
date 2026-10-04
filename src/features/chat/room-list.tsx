import { ChevronDown } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { PanelBody, PanelNote } from "~/components/panel";
import { termLabel } from "~/core/catalog/terms";
import type { ChatListCourse } from "~/core/chat";
import { type CourseCode, parseRoomId, type RoomId } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { InlineError } from "~/ui/inline-error";
import { GroupHeader } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { chatListOf, termPlans, useChatHome, useMainPlan } from "./chat-home";
import type { ChatGo } from "./nav";
import { RoomContextMenu } from "./room-menu";
import { RoomRow } from "./room-row";
import { showNote, showUndo, useNow } from "./undo";

// The chat list (V2.md §8.6): your courses this term, each under a tinted
// course bar with your rooms ("Everyone", "Nelson's Sections", "Section
// 0101") as rows, each with its newest message and an unread mark, like
// the scheduler's Courses tab. "Rooms from Plan A, your
// main plan ▾" says where your rooms come from and changes the main plan
// (V2 §5.5); the term is in the bar, tagged Now or Next, since Schedule is
// usually on the next one.
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
  currentRoom,
  go,
  empty,
}: {
  /** The open room, if any. */
  currentRoom: RoomId | null;
  go: ChatGo;
  /** What the list shows with no classes yet (the page decides, by width). */
  empty: ReactNode;
}) {
  const status = useChatHome((s) => s.status);
  const viewing = currentRoom
    ? (parseRoomId(currentRoom)?.courseCode ?? null)
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
            onRetry={() => void useChatHome.getState().load()}
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
                currentRoom={currentRoom}
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
  const latest = useChatHome((s) => s.latest);
  const you = useAccount((s) => s.user?.id ?? null);
  const now = new Date(useNow()).toISOString();
  // Just a heading: its rooms are right under it, so there's nowhere else
  // to go (a course's other rooms aren't yours, so they aren't listed), and
  // each room carries its own unread mark.
  return (
    <li className="border-hairline border-b last:border-b-0">
      <GroupHeader
        headingLevel={3}
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
      />
      {course === null ? (
        <PanelNote>{courseCode} isn't in this term's catalog.</PanelNote>
      ) : (
        <div>
          {rooms.map((r) => (
            <RoomContextMenu
              key={r.room.id}
              courseCode={courseCode}
              room={r.room}
              unread={r.muted ? 0 : r.unread}
            >
              <RoomRow
                room={r.room}
                latest={latest[r.room.id]}
                you={you}
                now={now}
                unread={r.unread}
                muted={r.muted}
                current={r.room.id === currentRoom}
                onOpen={() => go({ course: courseCode, room: r.room.id })}
              />
            </RoomContextMenu>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * "Rooms from Plan A, your main plan ▾": your rooms are the main plan's
 * sections (V2 §5.5), for the term in the bar beside it (tagged Now or
 * Next). With one plan it names the term instead: "Rooms from Plan A, your
 * Fall 2026 plan". With two or more, picking another here makes it the main
 * plan everywhere, with Undo.
 */
function RoomsFrom() {
  const termId = useChatHome((s) => s.termId);
  const terms = useChatHome((s) => s.terms);
  const synced = useChatHome((s) => s.synced);
  const plans = useMemo(
    () => termPlans(synced.plans, termId),
    [synced, termId],
  );
  const main = useMainPlan();
  if (!termId || !main) return null;
  const term = terms.find((t) => t.id === termId)?.name ?? termLabel(termId);
  if (plans.length < 2 || synced.settings === null)
    return (
      <IntegrationLabel product="schedule">
        Rooms from {main.name}, your {term} plan
      </IntegrationLabel>
    );
  const pick = (planId: string) => {
    const before = main.id;
    const next = plans.find((p) => p.id === planId);
    if (!next || planId === before) return;
    void useChatHome
      .getState()
      .setMainPlan(planId)
      .then((ok) => {
        if (!ok)
          return showNote("We couldn't change your main plan.", () =>
            pick(planId),
          );
        showUndo(
          `${next.name} is your main plan for ${term}`,
          () => void useChatHome.getState().setMainPlan(before),
          undefined,
          "Schedule, Plan, Todo and your calendar use it now.",
        );
      });
  };
  return (
    <DropdownMenu>
      <WithTooltip
        label={`Your rooms come from your main plan for ${term}. Pick another to change it everywhere.`}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Rooms from ${main.name}, your main plan`}
            className="-ml-1.5 flex h-7 max-w-full items-center gap-1.5 px-1.5 text-muted transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg max-md:h-11"
          >
            <IntegrationLabel product="schedule" className="truncate">
              Rooms from {main.name}, your main plan
            </IntegrationLabel>
            <ChevronDown size={12} aria-hidden="true" className="shrink-0" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="start" className="w-[280px]">
        <DropdownMenuLabel>{term} · your main plan</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={main.id} onValueChange={pick}>
          {plans.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              <span className="truncate">{p.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-muted text-xs">
          Picking one makes it your main plan everywhere: Schedule, Plan, Todo
          and your calendar too.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
