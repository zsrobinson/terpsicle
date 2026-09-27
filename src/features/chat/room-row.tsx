import { cn } from "cn";
import { BellOff, CalendarClock, Hash, Lock, Users } from "lucide-react";
import { type Room, unreadWords } from "~/core/chat";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";

// A room in a list (the chat list, a course's room tree), on the kit's row:
// its code in mono and its words, where it meets, and its unread count. Rows
// you can't open yet say why on hover and stay quiet (DESIGN §5: no alarms).

/** A row's one control, answering for the whole row (which is `relative`). */
export const ROW_LINK = "after:absolute after:inset-0";

export function UnreadCount({
  count,
  muted = false,
}: {
  count: number;
  muted?: boolean;
}) {
  if (muted)
    return (
      <span className="flex items-center gap-1 text-faint text-xs">
        <BellOff size={12} aria-label="Muted" />
        {count > 0 ? <span className="tnum">{count}</span> : null}
      </span>
    );
  if (count <= 0) return null;
  return (
    <span className="tnum block min-w-5 rounded-full bg-accent px-1.5 text-center font-semibold text-2xs text-accent-fg leading-5">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{unreadWords(count)}</span>
    </span>
  );
}

/** Every kind of room has its icon: # the course, people, a section's meetings. */
function RoomIcon({ room }: { room: Room }) {
  if (room.kind === "course")
    return <Hash size={14} aria-hidden="true" className="text-muted" />;
  if (room.kind === "professor")
    return <Users size={14} aria-hidden="true" className="text-muted" />;
  return <CalendarClock size={14} aria-hidden="true" className="text-muted" />;
}

/** "0303 · MWF 11am and TuTh 11am discussion": the code in mono. */
export function RoomLabel({
  room,
  wrap = false,
  className,
}: {
  room: Room;
  /** In a list, a section's meetings wrap rather than lose their end. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(wrap ? "text-pretty" : "truncate", className)}>
      {room.code ? (
        <span className="ident font-semibold">{room.code}</span>
      ) : null}
      {room.code && room.words ? " · " : null}
      {room.words ? <span>{room.words}</span> : null}
    </span>
  );
}

/**
 * A room as the kit's `ListRow`: its icon, its label with where it meets
 * under it, and its unread count at the right. The open room wears the
 * kit's one selected look.
 */
export function RoomRow({
  room,
  unread = 0,
  muted = false,
  current = false,
  locked = null,
  indent = false,
  onOpen,
}: {
  room: Room;
  unread?: number;
  muted?: boolean;
  current?: boolean;
  /** Why it can't be opened yet ("Add 0101 to a plan to join"), or null. */
  locked?: string | null;
  indent?: boolean;
  onOpen: () => void;
}) {
  const tooltip = locked ?? room.description;
  const counted = !locked && (unread > 0 || muted);
  return (
    <ListRow
      state={current ? "current" : undefined}
      lead={
        <span className="flex w-4 justify-center">
          {locked ? (
            <Lock size={13} aria-hidden="true" className="text-faint" />
          ) : (
            <RoomIcon room={room} />
          )}
        </span>
      }
      secondary={room.detail ? room.detail : undefined}
      trail={counted ? <UnreadCount count={unread} muted={muted} /> : undefined}
      className={cn(
        "relative max-md:min-h-11",
        locked ? "text-faint" : current ? undefined : "hover:bg-hover",
        indent && "pl-8",
      )}
    >
      <WithTooltip label={tooltip} side="right">
        <button
          type="button"
          aria-current={current ? "page" : undefined}
          aria-disabled={locked ? true : undefined}
          onClick={locked ? undefined : onOpen}
          className={cn(
            ROW_LINK,
            "block w-full min-w-0 text-left",
            locked && "cursor-default",
          )}
        >
          <RoomLabel
            room={room}
            wrap
            className={cn(
              "block",
              unread > 0 && !muted && !locked && "font-semibold",
            )}
          />
        </button>
      </WithTooltip>
    </ListRow>
  );
}
