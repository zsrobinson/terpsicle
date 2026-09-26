import { useEffect, useState } from "react";
import { Mark } from "~/app/brand/mark";
import { peopleWords } from "~/core/chat";
import {
  type CourseCode,
  chatHref,
  courseRoomId,
  type TermId,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { chatApi } from "~/server/fns/chat-api";
import { buttonVariants } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

// The way into a course's chat from the scheduler's course details
// (V2.md §8.2): "Join CMSC351 chat · 42 people". Loaded on demand, and only
// while Chat is on, so the scheduler's first load doesn't carry it. Signed
// out, the link leads to Chat's sign-in moment and back.

/** Course room head counts, once per course per page load. */
const counts = new Map<string, Promise<number | null>>();

function peopleIn(
  termId: TermId,
  courseCode: CourseCode,
): Promise<number | null> {
  const key = `${termId}:${courseCode}`;
  let count = counts.get(key);
  if (!count) {
    count = chatApi
      .members({ termId, courseCode, roomId: courseRoomId(termId, courseCode) })
      .then((r) => (r.status === "ok" ? r.total : null))
      .catch(() => null);
    counts.set(key, count);
  }
  return count;
}

export function CourseChatEntry({
  termId,
  courseCode,
}: {
  termId: TermId;
  courseCode: CourseCode;
}) {
  const signedIn = useAccount((s) => s.status === "signed-in");
  const [people, setPeople] = useState<number | null>(null);
  useEffect(() => {
    setPeople(null);
    if (!signedIn) return;
    let live = true;
    void peopleIn(termId, courseCode).then((n) => {
      if (live) setPeople(n);
    });
    return () => {
      live = false;
    };
  }, [signedIn, termId, courseCode]);

  const label = `Join ${courseCode} chat`;
  return (
    <WithTooltip label={`Talk with the people in ${courseCode}`}>
      <a
        href={chatHref({ term: termId, course: courseCode, join: 1 })}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Mark id="chat" size={16} className="size-4" />
        {label}
        {people ? (
          <span className="tnum font-normal text-muted">
            · {peopleWords(people)}
          </span>
        ) : null}
      </a>
    </WithTooltip>
  );
}
