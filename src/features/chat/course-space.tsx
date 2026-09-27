import { useEffect, useMemo, useState } from "react";
import { PanelBody, PanelNote } from "~/app/panel";
import {
  canReadRoom,
  chatPlanFor,
  type Room,
  type RoomGroup,
  roomsForCourse,
  sectionsInPlans,
} from "~/core/chat";
import type { ChatUnreadRoom, CourseCode, RoomId } from "~/core/schema";
import { Button } from "~/ui/button";
import { GroupHeader } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { useChatHome, withMutes } from "./chat-home";
import type { ChatGo, ChatView } from "./nav";
import { RoomRow } from "./room-row";
import { showNote, showUndo } from "./undo";

// A course's rooms (V2.md §8.1), laid out like its section list in course
// details: the course room, then one group per professor with their room and
// sections under it. Rooms for sections you don't have in a plan stay in the
// tree, quiet, and say how to join. Past MANY_SECTIONS, groups start closed
// and yours come first.

export function CourseSpace({
  courseCode,
  view,
  go,
}: {
  courseCode: CourseCode;
  view: ChatView;
  go: ChatGo;
}) {
  const termId = useChatHome((s) => s.termId);
  const course = useChatHome((s) => s.courses.get(courseCode) ?? null);
  const status = useChatHome((s) => s.status);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (course || status !== "ready") return;
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
  }, [course, courseCode, status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        size="panel"
        back={{
          label: "Your classes",
          to: "/chat",
          search: { term: view.term },
        }}
        title={<span className="ident">{courseCode}</span>}
        status={course?.title}
        actions={
          termId && course ? <FollowButton courseCode={courseCode} /> : null
        }
      />
      <PanelBody>
        {!termId || (!course && !missing) ? (
          <RowSkeleton label={`Loading ${courseCode}'s rooms`} />
        ) : !course ? (
          <PanelNote>
            {courseCode} isn't in this term's catalog, so it has no rooms.
          </PanelNote>
        ) : (
          <RoomTreeList
            courseCode={courseCode}
            current={view.room ?? null}
            go={go}
          />
        )}
      </PanelBody>
    </div>
  );
}

function RoomTreeList({
  courseCode,
  current,
  go,
}: {
  courseCode: CourseCode;
  current: RoomId | null;
  go: ChatGo;
}) {
  const termId = useChatHome((s) => s.termId) ?? "";
  const course = useChatHome((s) => s.courses.get(courseCode));
  const plans = useChatHome((s) => s.synced.plans);
  const rawUnread = useChatHome((s) => s.unread);
  const mutes = useChatHome((s) => s.mutes);
  const unread = useMemo(() => withMutes(rawUnread, mutes), [rawUnread, mutes]);
  const tree = course ? roomsForCourse(termId, course) : null;
  const mine = useMemo(
    () => sectionsInPlans(termId, courseCode, plans),
    [termId, courseCode, plans],
  );
  const byRoom = useMemo(
    () => new Map<RoomId, ChatUnreadRoom>(unread.map((r) => [r.room, r])),
    [unread],
  );
  const groups = useMemo(() => {
    if (!tree) return [];
    // Many sections: yours pinned on top, like course details.
    return tree.size === "many"
      ? [...tree.groups].sort(
          (a, b) => Number(hasYours(b, mine)) - Number(hasYours(a, mine)),
        )
      : tree.groups;
  }, [tree, mine]);
  // Many sections start closed but for yours.
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        (tree?.groups ?? [])
          .filter((g) => tree?.size !== "many" || hasYours(g, mine))
          .map((g) => g.key),
      ),
  );
  if (!tree) return null;

  const row = (room: Room, indent = false) => {
    const readable = canReadRoom(tree, room.id, mine);
    const counts = byRoom.get(room.id);
    return (
      <RoomRow
        key={room.id}
        room={room}
        indent={indent}
        unread={counts?.unread ?? 0}
        muted={counts?.muted ?? false}
        current={room.id === current}
        locked={readable ? null : lockedWords(room)}
        onOpen={() => go({ course: courseCode, room: room.id })}
      />
    );
  };

  return (
    <div>
      {row(tree.course)}
      {groups.map((g) => {
        const isOpen = !g.heading || open.has(g.key);
        return (
          <section key={g.key} aria-label={g.heading ? g.title : undefined}>
            {g.heading ? (
              <GroupHeader
                open={isOpen}
                onToggle={() =>
                  setOpen((was) => {
                    const next = new Set(was);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                toggleLabel={`${isOpen ? "Hide" : "Show"} ${g.title}'s rooms`}
                title={g.title}
                meta={g.summary}
                className="max-md:h-11"
              />
            ) : null}
            {isOpen
              ? g.nodes.map((node) => (
                  <div key={node.room.id}>
                    {row(node.room)}
                    {node.children.map((child) => row(child, true))}
                  </div>
                ))
              : null}
          </section>
        );
      })}
    </div>
  );
}

/** Whether a group holds one of your sections. */
function hasYours(group: RoomGroup, mine: readonly string[]): boolean {
  return group.nodes.some((n) =>
    [n.room, ...n.children].some(
      (r) =>
        r.kind === "section" && r.sectionCodes.some((c) => mine.includes(c)),
    ),
  );
}

/** What a room you can't open says: whose it is, and how to join. */
function lockedWords(room: Room): string {
  if (room.kind === "section")
    return `For people with ${room.code} in a plan. Add it to one of yours to join.`;
  return `For people with one of ${room.label.replace(/'s sections$/, "")}'s sections in a plan. Add one to join.`;
}

/**
 * Join or leave a course you're following along (V2.md §8.2: course rooms
 * are open to anyone signed in). A course in your chat plan is already
 * yours, so there's nothing to press.
 */
function FollowButton({ courseCode }: { courseCode: CourseCode }) {
  const termId = useChatHome((s) => s.termId);
  const following = useChatHome((s) =>
    s.termId ? (s.follows[s.termId] ?? []).includes(courseCode) : false,
  );
  const inPlan = useChatHome((s) =>
    s.termId
      ? (chatPlanFor(
          s.termId,
          s.synced.plans,
          s.synced.settings?.body.chatPlans ?? {},
        )?.courses.some((c) => c.courseCode === courseCode) ?? false)
      : false,
  );
  const [busy, setBusy] = useState(false);
  if (!termId || inPlan) return null;
  const home = useChatHome.getState;
  const leave = async () => {
    setBusy(true);
    const left = await home().unfollow(courseCode);
    setBusy(false);
    if (!left) return showNote(`We couldn't leave ${courseCode} chat.`, leave);
    showUndo(`Left ${courseCode} chat`, () => void home().follow(courseCode));
  };
  const join = async () => {
    setBusy(true);
    const result = await home().follow(courseCode);
    setBusy(false);
    if (result === "too-many")
      showNote(
        "You've joined 100 courses' chats this term. Leave one to join another.",
      );
    else if (result === "failed")
      showNote(`We couldn't join ${courseCode} chat.`, join);
  };
  if (following)
    return (
      <WithTooltip
        label={`Take ${courseCode} out of your list. You can undo this`}
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void leave()}
        >
          Leave
        </Button>
      </WithTooltip>
    );
  return (
    <WithTooltip label={`Keep ${courseCode}'s course room in your list`}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void join()}
      >
        Join
      </Button>
    </WithTooltip>
  );
}
