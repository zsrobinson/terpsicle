import { useState } from "react";
import { chatPlanFor } from "~/core/chat";
import type { CourseCode } from "~/core/schema";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { useChatHome } from "./chat-home";
import { showNote } from "./undo";

// Join, in the room's header, for a course you opened but haven't joined
// (V2.md §8.2: course rooms are open to anyone signed in). A course in your
// chat plan, or one you've joined, is already yours, so there's nothing to
// press; Leave lives in room info.

/** Whether the course is in your list already: from your chat plan, or joined. */
function useIsYours(courseCode: CourseCode): boolean {
  return useChatHome((s) => {
    if (!s.termId) return true;
    if ((s.follows[s.termId] ?? []).includes(courseCode)) return true;
    return (
      chatPlanFor(
        s.termId,
        s.synced.plans,
        s.synced.settings?.body.chatPlans ?? {},
      )?.courses.some((c) => c.courseCode === courseCode) ?? false
    );
  });
}

export function JoinButton({ courseCode }: { courseCode: CourseCode }) {
  const yours = useIsYours(courseCode);
  const [busy, setBusy] = useState(false);
  if (yours) return null;
  const join = async () => {
    setBusy(true);
    const result = await useChatHome.getState().follow(courseCode);
    setBusy(false);
    if (result === "too-many")
      showNote(
        "You've joined 100 courses' chats this term. Leave one to join another.",
      );
    else if (result === "failed")
      showNote(`We couldn't join ${courseCode} chat.`, join);
  };
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
