import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import { unreadWords } from "~/core/chat/talk-words";
import { type UnreadCourse, unreadByCourse } from "~/core/home";
import type { TermId } from "~/core/schema";
import { chatApi } from "~/server/fns/chat-api";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import {
  HomeNote,
  HomeSection,
  HomeSkeleton,
  homeLinkClicked,
  ROW_LINK,
} from "./section";

// "Chat" (docs/V3.md §1.5): your rooms with unread messages, a course at a
// time, from `chat/unread` (one D1 query that wakes no room). Muted rooms
// don't count. Each row opens the course's room with the newest message.

/** At most this many courses. */
const SHOWN = 4;

type Unread =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; courses: UnreadCourse[] };

export function ChatSection({ termId }: { termId: TermId }) {
  const [unread, setUnread] = useState<Unread>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` asks again (Try again)
  useEffect(() => {
    let live = true;
    setUnread({ state: "loading" });
    chatApi
      .unread({ termId })
      .then(({ rooms }) => {
        if (live) setUnread({ state: "ready", courses: unreadByCourse(rooms) });
      })
      .catch(() => {
        if (live) setUnread({ state: "failed" });
      });
    return () => {
      live = false;
    };
  }, [termId, attempt]);

  return (
    <HomeSection
      product="chat"
      title="Chat"
      to="/chat"
      search={{ term: termId }}
      tooltip={`Your rooms for ${termLabel(termId)}`}
    >
      {unread.state === "loading" ? (
        <HomeSkeleton rows={2} label="Loading your rooms" />
      ) : unread.state === "failed" ? (
        <InlineError
          message="Couldn't check your rooms."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : unread.courses.length === 0 ? (
        <HomeNote>You're all caught up.</HomeNote>
      ) : (
        <ul aria-label="Unread messages">
          {unread.courses.slice(0, SHOWN).map((c) => (
            <ListRow
              key={c.courseCode}
              as="li"
              className="relative px-0 hover:bg-hover"
              trail={
                <span className="font-medium text-fg">
                  {unreadWords(c.unread)}
                </span>
              }
            >
              <WithTooltip label={`Open ${c.courseCode} chat`}>
                <Link
                  to="/chat"
                  search={{ term: termId, course: c.courseCode, room: c.room }}
                  onClick={() => homeLinkClicked("chat")}
                  className={ROW_LINK}
                >
                  <span className="ident font-semibold">{c.courseCode}</span>
                </Link>
              </WithTooltip>
            </ListRow>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}
