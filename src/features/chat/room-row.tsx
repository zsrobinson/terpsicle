import { cn } from "cn";
import { BellOff, Hash, Lock, Users } from "lucide-react";
import { type Room, unreadWords } from "~/core/chat";
import { WithTooltip } from "~/ui/tooltip";

// A room in a list (the chat list, a course's room tree): its code in mono
// and its words, where it meets, and its unread count. Rows you can't open
// yet say why on hover and stay quiet (DESIGN §5: no alarms).

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
    <span className="tnum min-w-5 rounded-full bg-accent px-1.5 text-center font-semibold text-2xs text-accent-fg leading-5">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{unreadWords(count)}</span>
    </span>
  );
}

function RoomIcon({ room }: { room: Room }) {
  if (room.kind === "course")
    return <Hash size={14} aria-hidden="true" className="text-muted" />;
  if (room.kind === "professor")
    return <Users size={14} aria-hidden="true" className="text-muted" />;
  return <span aria-hidden="true" className="inline-block size-3.5" />;
}

/** "0303 · MWF 11am and TuTh 11am discussion": the code in mono. */
export function RoomLabel({
  room,
  className,
}: {
  room: Room;
  className?: string;
}) {
  return (
    <span className={cn("truncate", className)}>
      {room.code ? (
        <span className="ident font-semibold">{room.code}</span>
      ) : null}
      {room.code && room.words ? " · " : null}
      {room.words ? <span>{room.words}</span> : null}
    </span>
  );
}

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
  return (
    <WithTooltip label={tooltip} side="right">
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        aria-disabled={locked ? true : undefined}
        onClick={locked ? undefined : onOpen}
        className={cn(
          "flex min-h-9 w-full items-center gap-2 border-hairline border-b px-4 py-1.5 text-left transition-colors last:border-b-0 hover:bg-hover max-md:min-h-11",
          current && "bg-accent-soft hover:bg-accent-soft",
          locked && "cursor-default text-faint hover:bg-transparent",
          indent && "pl-8",
        )}
      >
        <span className="flex w-4 shrink-0 justify-center">
          {locked ? (
            <Lock size={13} aria-hidden="true" className="text-faint" />
          ) : (
            <RoomIcon room={room} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <RoomLabel
            room={room}
            className={cn(
              "block",
              unread > 0 && !muted && !locked && "font-semibold",
            )}
          />
          {room.detail ? (
            <span className="block truncate text-muted text-sm">
              {room.detail}
            </span>
          ) : null}
        </span>
        {locked ? null : <UnreadCount count={unread} muted={muted} />}
      </button>
    </WithTooltip>
  );
}
