import { useQuery } from "@tanstack/react-query";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { peopleWords } from "~/core/chat";
import { chatPath } from "~/core/chat/room-paths";
import { type CourseCode, courseRoomId, type TermId } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { buttonVariants } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { roomMembersQuery } from "./queries";

// The way into a course's chat from the scheduler's course details
// (V2.md §8.2): "Join CMSC351 chat · 42 people". Loaded on demand, and only
// while Chat is on, so the scheduler's first load doesn't carry it. Signed
// out, the link leads to Chat's sign-in moment and back.

export function CourseChatEntry({
  termId,
  courseCode,
}: {
  termId: TermId;
  courseCode: CourseCode;
}) {
  const signedIn = useAccount((s) => s.status === "signed-in");
  // The course room's head count, shared with its room's "@" list.
  const people = useQuery({
    ...roomMembersQuery({
      id: courseRoomId(termId, courseCode),
      termId,
      courseCode,
    }),
    enabled: signedIn,
    select: (m) => m.total,
  }).data;

  const label = `Join ${courseCode} chat`;
  return (
    <WithTooltip label={`Talk with the people in ${courseCode}`}>
      <a
        href={chatPath({ course: courseCode, join: 1 })}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <IntegrationLabel product="chat">{label}</IntegrationLabel>
        {signedIn && people ? (
          <span className="tnum font-normal text-muted">
            · {peopleWords(people)}
          </span>
        ) : null}
      </a>
    </WithTooltip>
  );
}
