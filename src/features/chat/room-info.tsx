import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { chatPlanFor, peopleWords, type Room } from "~/core/chat";
import type { ChatAuthor, CourseCode, TermId } from "~/core/schema";
import { Avatar } from "~/features/auth/avatar";
import { chatApi } from "~/server/fns/chat-api";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { isMuted, useChatHome } from "./chat-home";
import { showNote, showUndo } from "./undo";

// Room info (V2.md §8.2, §8.6): who the room is for and how many are in it,
// who they are, mute, leave, and how reporting works. Membership is on
// trust, and it says so.

export const ROOM_RULES = [
  "Talk about the class, not the answers.",
  "Use your real name; everyone here can see it.",
  "A person checks anything flagged.",
] as const;

type Members =
  | { state: "loading" }
  | { state: "ready"; members: ChatAuthor[]; total: number }
  | { state: "failed" };

const SHOW_FIRST = 12;

export function RoomInfo({
  termId,
  courseCode,
  room,
  members: memberCount,
}: {
  termId: TermId;
  courseCode: CourseCode;
  room: Room;
  /** From the socket's welcome; null until it arrives. */
  members: number | null;
}) {
  const [members, setMembers] = useState<Members>({ state: "loading" });
  const [all, setAll] = useState(false);
  // Try again asks once more.
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt asks again
  useEffect(() => {
    let live = true;
    setMembers({ state: "loading" });
    chatApi
      .members({ termId, courseCode, roomId: room.id })
      .then((result) => {
        if (!live) return;
        setMembers(
          result.status === "ok"
            ? { state: "ready", members: result.members, total: result.total }
            : { state: "failed" },
        );
      })
      .catch(() => live && setMembers({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [termId, courseCode, room.id, attempt]);

  const total =
    members.state === "ready" ? members.total : (memberCount ?? null);
  const shown =
    members.state === "ready"
      ? all
        ? members.members
        : members.members.slice(0, SHOW_FIRST)
      : [];

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-sm">
      <div>
        <p className="text-fg">{room.description}.</p>
        {room.detail ? <p className="text-muted">{room.detail}</p> : null}
        {room.kind !== "course" && total !== null ? (
          <p className="mt-2 text-muted">
            {peopleWords(total)} {total === 1 ? "has" : "have"}{" "}
            {room.kind === "section" ? room.code : "these sections"} in a plan.
            Terpsicle can't see registrations.
          </p>
        ) : null}
      </div>

      <PageSection
        headingLevel={3}
        title={total === null ? "People" : peopleWords(total)}
      >
        {members.state === "loading" ? (
          <RowSkeleton rows={2} inset={false} label="Loading who's here" />
        ) : members.state === "failed" ? (
          <InlineError
            className="py-0"
            message="We couldn't load who's here."
            onRetry={() => setAttempt((n) => n + 1)}
            retryTooltip="Load who's here again"
          />
        ) : (
          <>
            <ul>
              {shown.map((m) => (
                <ListRow
                  key={m.directoryId}
                  as="li"
                  density="compact"
                  className="px-0"
                  lead={<Avatar name={m.name} src={m.picture} />}
                >
                  <span className="block truncate" data-private="">
                    {m.name}
                  </span>
                </ListRow>
              ))}
            </ul>
            {members.members.length > SHOW_FIRST && !all ? (
              <WithTooltip label="List everyone in the room">
                <Button
                  variant="link"
                  size="row"
                  className="self-start px-0 max-md:h-11"
                  onClick={() => setAll(true)}
                >
                  Show all {members.members.length}
                </Button>
              </WithTooltip>
            ) : null}
          </>
        )}
      </PageSection>

      <section
        aria-label="Your settings"
        className="flex flex-col gap-2 border-hairline border-t pt-3"
      >
        <MuteButton courseCode={courseCode} room={room} />
        <LeaveOrWhy courseCode={courseCode} room={room} />
      </section>

      <PageSection headingLevel={3} title="Room rules">
        <ul className="list-disc pl-4 text-muted">
          {ROOM_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="text-muted">
          To report a message, open its menu (…) and pick Report. A person
          checks every report, and nobody sees who sent it.
        </p>
      </PageSection>
    </div>
  );
}

function MuteButton({
  courseCode,
  room,
}: {
  courseCode: CourseCode;
  room: Room;
}) {
  const muted = useChatHome((s) => isMuted(s, room.id));
  const [busy, setBusy] = useState(false);
  const toggle = async (mute: boolean) => {
    setBusy(true);
    const ok = await useChatHome.getState().mute(courseCode, room.id, mute);
    setBusy(false);
    if (!ok)
      showNote(
        mute ? "We couldn't mute this room." : "We couldn't unmute this room.",
        () => void toggle(mute),
      );
  };
  return (
    <WithTooltip
      label={
        muted
          ? "Count this room's messages as unread again"
          : "Stop counting this room's messages as unread"
      }
    >
      <Button
        variant="outline"
        size="sm"
        aria-pressed={muted}
        disabled={busy}
        className="self-start max-md:h-11"
        onClick={() => void toggle(!muted)}
      >
        {muted ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
        {muted ? "Muted" : "Mute this room"}
      </Button>
    </WithTooltip>
  );
}

/**
 * Leaving: a course you follow can go (with undo). Rooms from your chat plan
 * come with its sections, so the way out is the plan, and it says so.
 */
function LeaveOrWhy({
  courseCode,
  room,
}: {
  courseCode: CourseCode;
  room: Room;
}) {
  const termId = useChatHome((s) => s.termId);
  const following = useChatHome((s) =>
    s.termId ? (s.follows[s.termId] ?? []).includes(courseCode) : false,
  );
  const plan = useChatHome((s) =>
    s.termId
      ? chatPlanFor(
          s.termId,
          s.synced.plans,
          s.synced.settings?.body.chatPlans ?? {},
        )
      : null,
  );
  const inPlan = plan?.courses.find((c) => c.courseCode === courseCode);
  if (!termId) return null;
  if (inPlan && plan)
    return (
      <p className="text-muted">
        You're here because{" "}
        {inPlan.sectionCode
          ? `${courseCode} ${inPlan.sectionCode}`
          : courseCode}{" "}
        is in {plan.name}. To leave, take it out of that plan, or pick another
        plan for your rooms.
      </p>
    );
  if (!following || room.kind !== "course") return null;
  const home = useChatHome.getState;
  const leave = async () => {
    if (!(await home().unfollow(courseCode)))
      return showNote(`We couldn't leave ${courseCode} chat.`, leave);
    showUndo(`Left ${courseCode} chat`, () => void home().follow(courseCode));
  };
  return (
    <WithTooltip
      label={`Take ${courseCode} out of your list. You can undo this`}
    >
      <Button
        variant="outline"
        size="sm"
        className="self-start max-md:h-11"
        onClick={() => void leave()}
      >
        Leave {courseCode} chat
      </Button>
    </WithTooltip>
  );
}
