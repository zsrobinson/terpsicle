import { Bell, BellOff, Info, LogOut, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { Room } from "~/core/chat";
import { mainPlanFor } from "~/core/plans/main-plan";
import type { CourseCode } from "~/core/schema";
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuSeparator,
} from "~/ui/action-menu";
import { Button } from "~/ui/button";
import { isMuted, useChatHome } from "./chat-home";
import { showNote, showUndo } from "./undo";

// The room's one button in its top bar (the owner, 2026-09-29: "we don't
// need the room info thing, just a button in that top bar (with icon and
// label)"): "Options", holding what room info did, as a menu (a sheet on
// a phone): mute or unmute, leave a course you joined, and what's allowed.
// Who's here shows in the room itself, as joins; how many, in the header.

// "Posting here": neutral and matter-of-fact, never a lecture (the owner,
// 2026-09-28: "like you're a cop"), and nothing about a bot reading every
// message (2026-09-27). Your name being on it says the rest.
export const ROOM_RULES = [
  "Your name is on everything you post here, so posting answers to graded work is a bad idea.",
  "Report is in each message's menu (…). A person reads every report, and nobody sees who sent it.",
] as const;

export function RoomMenu({
  courseCode,
  room,
  onAllowed,
}: {
  courseCode: CourseCode;
  room: Room;
  /** Opens "What's allowed". */
  onAllowed: () => void;
}) {
  const muted = useChatHome((s) => isMuted(s, room.id));
  const following = useChatHome((s) =>
    s.termId ? (s.follows[s.termId] ?? []).includes(courseCode) : false,
  );
  const plan = useChatHome((s) =>
    s.termId
      ? mainPlanFor(
          s.termId,
          s.synced.plans,
          s.synced.settings?.body.mainPlans ?? {},
        )
      : null,
  );
  const inPlan = plan?.courses.find((c) => c.courseCode === courseCode);
  const [busy, setBusy] = useState(false);
  const home = useChatHome.getState;

  const mute = async (on: boolean) => {
    setBusy(true);
    const ok = await home().mute(courseCode, room.id, on);
    setBusy(false);
    if (!ok)
      showNote(
        on ? "We couldn't mute this room." : "We couldn't unmute this room.",
        () => void mute(on),
      );
  };
  const leave = async () => {
    if (!(await home().unfollow(courseCode)))
      return showNote(`We couldn't leave ${courseCode} chat.`, leave);
    showUndo(`Left ${courseCode} chat`, () => void home().follow(courseCode));
  };

  return (
    <ActionMenu
      title={room.label}
      tooltip="Mute, leave, and what's allowed"
      align="end"
      trigger={
        <Button variant="ghost" size="sm" disabled={busy}>
          {muted ? (
            <BellOff aria-hidden="true" />
          ) : (
            <SlidersHorizontal aria-hidden="true" />
          )}
          {muted ? "Muted" : "Options"}
        </Button>
      }
    >
      <ActionMenuItem
        icon={muted ? <Bell /> : <BellOff />}
        tooltip={
          muted
            ? "Count this room's messages as unread again"
            : "Stop counting this room's messages as unread"
        }
        onSelect={() => void mute(!muted)}
      >
        {muted ? "Unmute this room" : "Mute this room"}
      </ActionMenuItem>
      {inPlan && plan ? (
        <ActionMenuItem
          icon={<LogOut />}
          disabled
          hint={`It's in ${plan.name}, your main plan`}
        >
          Leave {courseCode} chat
        </ActionMenuItem>
      ) : following ? (
        <ActionMenuItem
          icon={<LogOut />}
          tooltip={`Take ${courseCode} out of your list. You can undo this`}
          onSelect={() => void leave()}
        >
          Leave {courseCode} chat
        </ActionMenuItem>
      ) : null}
      <ActionMenuSeparator />
      <ActionMenuItem
        icon={<Info />}
        tooltip="Chat's rules, in a few lines"
        onSelect={onAllowed}
      >
        What's allowed
      </ActionMenuItem>
    </ActionMenu>
  );
}
