import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { termLabel } from "~/core/catalog/terms";
import { roomSlug } from "~/core/chat/room-paths";
import { unreadWords } from "~/core/chat/talk-words";
import { unreadByCourse } from "~/core/home";
import type {
  ChatUnreadRoom,
  CourseCode,
  CourseColor,
  TermId,
} from "~/core/schema";
import { CourseTag } from "~/features/todo/todo-item";
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
// The page asks (`chatRoomsQuery`), since whether any room has a message
// also decides Chat's callout.

/** At most this many courses. */
const SHOWN = 4;

export function ChatSection({
  termId,
  rooms,
  colors,
}: {
  termId: TermId;
  rooms: UseQueryResult<ChatUnreadRoom[]>;
  colors: Readonly<Record<CourseCode, CourseColor>>;
}) {
  const courses = useMemo(
    () => (rooms.data ? unreadByCourse(rooms.data) : []),
    [rooms.data],
  );
  const total = courses.reduce((n, c) => n + c.unread, 0);
  return (
    <HomeSection
      product="chat"
      title="Chat"
      meta={total > 0 ? unreadWords(total) : undefined}
      to="/chat"
      search={{ term: termId }}
      tooltip={`Your rooms for ${termLabel(termId)}`}
    >
      {rooms.isPending ? (
        <HomeSkeleton rows={1} label="Loading your rooms" />
      ) : rooms.isError ? (
        <InlineError
          message="Couldn't check your rooms."
          onRetry={() => void rooms.refetch()}
        />
      ) : courses.length === 0 ? (
        <HomeNote>You're all caught up.</HomeNote>
      ) : (
        <ul aria-label="Unread messages">
          {courses.slice(0, SHOWN).map((c) => (
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
                  to="/chat/$course/$room"
                  params={{ course: c.courseCode, room: roomSlug(c.room) }}
                  onClick={() => homeLinkClicked("chat")}
                  className={ROW_LINK}
                >
                  <CourseTag
                    code={c.courseCode}
                    label={null}
                    color={colors[c.courseCode] ?? null}
                  />
                </Link>
              </WithTooltip>
            </ListRow>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}
