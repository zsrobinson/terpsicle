import { cn } from "cn";
import { BellOff, CalendarClock, Hash, Users } from "lucide-react";
import type { ComponentProps } from "react";
import {
  DELETED_MESSAGE_WORDS,
  listTimeWords,
  type Room,
  unreadWords,
} from "~/core/chat";
import type { ChatLatestMessage } from "~/core/schema";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";

// A room in the chat list, on the kit's row (the owner, 2026-09-29): its
// name ("Everyone", "Nelson's Sections", "Section 0101") with its newest
// message under it, when that came, and an unread mark in Chat's blue (a
// dot for one, the count for more). A muted room shows its muted bell at
// the row's right edge instead. Only your rooms are ever listed.

/** A row's one control, answering for the whole row (which is `relative`). */
export const ROW_LINK = "after:absolute after:inset-0";

/** Unread, in Chat's blue: a dot for one message, the count for more. */
export function UnreadMark({ count }: { count: number }) {
  if (count <= 0) return null;
  if (count === 1)
    return (
      <span
        data-unread-mark="dot"
        className="block size-2.5 rounded-full bg-product-chat"
      >
        <span className="sr-only">{unreadWords(count)}</span>
      </span>
    );
  return (
    <span
      data-unread-mark="count"
      className="tnum block min-w-5 rounded-full bg-product-chat px-1.5 text-center font-semibold text-2xs text-product-chat-fg leading-5"
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{unreadWords(count)}</span>
    </span>
  );
}

/** Every kind of room has its icon: # everyone, people, a section's meetings. */
function RoomIcon({ room }: { room: Room }) {
  if (room.kind === "course")
    return <Hash size={14} aria-hidden="true" className="text-muted" />;
  if (room.kind === "professor")
    return <Users size={14} aria-hidden="true" className="text-muted" />;
  return <CalendarClock size={14} aria-hidden="true" className="text-muted" />;
}

/** "Alex: anyone get 3b?", "You: on it", "Alex: Message deleted by author". */
function LatestLine({
  latest,
  you,
}: {
  latest: ChatLatestMessage | undefined;
  you: string | null;
}) {
  if (!latest) return <span className="text-faint">No messages yet</span>;
  const who =
    latest.author.directoryId === you
      ? "You"
      : (latest.author.name.split(/\s+/)[0] ?? latest.author.name);
  return (
    <span className="block truncate" data-private="">
      {who}:{" "}
      {latest.deleted ? (
        <span className="italic">{DELETED_MESSAGE_WORDS}</span>
      ) : (
        latest.text
      )}
    </span>
  );
}

/**
 * A room as the kit's `ListRow`: its icon, its name with its newest message
 * under it, and at the right when that was and its unread mark (or, muted,
 * the muted bell). The open room wears the kit's one selected look.
 */
export function RoomRow({
  room,
  latest,
  you = null,
  now,
  unread = 0,
  muted = false,
  current = false,
  onOpen,
  ...rest
}: Omit<ComponentProps<"div">, "children"> & {
  room: Room;
  latest?: ChatLatestMessage;
  /** Your directory id: your own message reads "You: …". */
  you?: string | null;
  now: string;
  unread?: number;
  muted?: boolean;
  current?: boolean;
  onOpen: () => void;
}) {
  const bold = unread > 0 && !muted;
  return (
    <ListRow
      // A context menu's trigger props and ref (./room-menu).
      {...rest}
      state={current ? "current" : undefined}
      data-room-row={room.id}
      lead={
        <span className="flex w-4 justify-center">
          <RoomIcon room={room} />
        </span>
      }
      secondary={<LatestLine latest={latest} you={you} />}
      trail={
        <span className="flex flex-col items-end gap-1">
          {latest ? (
            <time
              dateTime={latest.createdAt}
              className={cn("tnum text-xs", bold ? "text-fg" : "text-faint")}
            >
              {listTimeWords(latest.createdAt, now)}
            </time>
          ) : null}
          {muted ? (
            <BellOff
              size={14}
              aria-label="Muted"
              data-muted-mark=""
              className="text-faint"
            />
          ) : (
            <UnreadMark count={unread} />
          )}
        </span>
      }
      className={cn(
        "relative max-md:min-h-11",
        !current && "hover:bg-hover menu-open:bg-hover",
      )}
    >
      <WithTooltip label={room.description} side="right">
        <button
          type="button"
          aria-current={current ? "page" : undefined}
          onClick={onOpen}
          className={cn(
            ROW_LINK,
            "block w-full min-w-0 truncate text-left",
            bold && "font-semibold",
          )}
        >
          {room.name}
        </button>
      </WithTooltip>
    </ListRow>
  );
}
