import { cn } from "cn";
import { Route } from "lucide-react";
import type { CSSProperties } from "react";
import { openTab, switchSection } from "~/app/actions";
import { messageToText } from "~/app/message-text";
import {
  type Connection,
  parseSectionKey,
  sectionKey,
  type TravelSettings,
} from "~/core/schema";
import { type SeatsMap, seatCounts, seatStatus } from "~/core/seats";
import { formatDateSpan, formatTimeRange, type Lane } from "~/core/time";
import { formatFeet, travelMath, verdictMessage } from "~/core/travel";
import { useUi } from "~/state/ui-store";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import type { BlockEntry, ClassEntry, GhostEntry, Pill } from "./layout";
import { ghostStyle, tintStyle } from "./tint";

// What sits in a day column: classes, blocks, ghosts and travel pills.

/** Pixel box for an item in its lane. */
export function laneStyle(
  item: Lane<{ start: number; end: number }>,
  yOf: (minute: number) => number,
): CSSProperties {
  const top = yOf(item.start);
  return {
    top: top + 1,
    height: Math.max(8, yOf(item.end) - top - 2),
    left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
    width: `calc(${100 / item.lanes}% - 4px)`,
  };
}

const KIND_WORDS = { discussion: "discussion", lab: "lab" } as const;

export function ClassBlock({
  entry,
  height,
  dimmed,
  selected,
  changed = false,
  onOpen,
  open,
  style,
}: {
  entry: Lane<ClassEntry>;
  height: number;
  /** Another course's sections are showing. */
  dimmed: boolean;
  /** This course's sections are showing: it's the current one. */
  selected: boolean;
  /** In a previewed plan, this section differs from the open plan. */
  changed?: boolean;
  onOpen: () => void;
  open: boolean;
  style: CSSProperties;
}) {
  const kind =
    entry.meetingKind === "discussion" || entry.meetingKind === "lab"
      ? KIND_WORDS[entry.meetingKind]
      : null;
  const place = entry.online
    ? "Online"
    : [entry.building, entry.room].filter(Boolean).join(" ");
  const action = selected
    ? `Your current section, ${entry.sectionCode}`
    : open
      ? `Close ${entry.courseCode}`
      : `See ${entry.courseCode}'s sections`;
  // Summer sessions (and some fall and spring sections) meet for part of the
  // term; two can share a weekday and time without overlapping.
  const dates = entry.dates ? formatDateSpan(entry.dates) : null;
  return (
    <WithTooltip
      label={
        dates ? (
          <span className="flex flex-col">
            <span>{action}</span>
            <span className="tnum opacity-70">Meets {dates}</span>
          </span>
        ) : (
          action
        )
      }
    >
      <button
        type="button"
        onClick={onOpen}
        data-course={entry.courseCode}
        aria-label={`${entry.courseCode} ${entry.sectionCode}${kind ? ` ${kind}` : ""}, ${formatTimeRange(entry.start, entry.end)}${place ? `, ${place}` : ""}${dates ? `, ${dates}` : ""}`}
        className={cn(
          "absolute z-[1] flex flex-col justify-start overflow-hidden rounded-md border px-1.5 py-1 text-left transition-opacity duration-150",
          dimmed && "opacity-35",
          (selected || changed) && "ring-2 ring-fg/70",
        )}
        style={{ ...style, ...tintStyle(entry.color) }}
      >
        <div className="flex items-baseline gap-1 text-[11.5px] leading-tight">
          {/* The code wins the space; "discussion" gives way on narrow days. */}
          <span className="shrink-0 font-mono font-semibold">
            {entry.courseCode}
          </span>
          {kind ? (
            <span className="min-w-0 truncate text-[10px] opacity-70">
              {kind}
            </span>
          ) : null}
        </div>
        {height > 30 ? (
          <div className="tnum truncate text-[10.5px] opacity-75">
            {formatTimeRange(entry.start, entry.end)}
          </div>
        ) : null}
        {height > 46 && place ? (
          <div className="truncate text-[10.5px] opacity-75">{place}</div>
        ) : null}
      </button>
    </WithTooltip>
  );
}

export function BusyBlock({
  entry,
  height,
  dimmed,
  style,
}: {
  entry: Lane<BlockEntry>;
  height: number;
  dimmed: boolean;
  style: CSSProperties;
}) {
  return (
    <WithTooltip label="Edit in Blocks" shortcut="5">
      <button
        type="button"
        onClick={() => openTab("blocks", "click")}
        aria-label={`${entry.label}, ${formatTimeRange(entry.start, entry.end)}`}
        className={cn(
          "stripes absolute z-[1] flex flex-col justify-start overflow-hidden rounded-md border border-hairline bg-panel px-1.5 py-1 text-left text-muted transition-opacity duration-150",
          dimmed && "opacity-35",
        )}
        style={style}
      >
        <div className="truncate font-semibold text-[11.5px] leading-tight">
          {entry.label}
        </div>
        {height > 30 ? (
          <div className="tnum truncate text-[10.5px] opacity-80">
            {formatTimeRange(entry.start, entry.end)}
          </div>
        ) : null}
      </button>
    </WithTooltip>
  );
}

function ghostWords(entry: GhostEntry): string {
  const words = [entry.instructors || "Instructor TBA"];
  if (entry.full) words.push("full");
  if (entry.overlaps) words.push("overlaps another class");
  return words.join(" · ");
}

/**
 * Another section of the open course (SPEC §3.3): dashed, labeled with its
 * code and instructor, plus "Full" or "Overlaps" where true. Overlaps is
 * words only: it's a choice being weighed, so no red (DESIGN §5).
 */
export function Ghost({
  entry,
  height,
  narrow,
  readOnly,
  seats,
  style,
}: {
  entry: Lane<GhostEntry>;
  height: number;
  /** Too narrow for more than the code. */
  narrow: boolean;
  readOnly: boolean;
  seats: SeatsMap | null;
  style: CSSProperties;
}) {
  const setPreview = useUi((s) => s.setPreviewSection);
  const merged = entry.sectionCodes.length > 1;
  const code = entry.sectionCodes[0] ?? "";
  const body = (
    <>
      <div
        className={cn(
          "flex items-baseline gap-1 font-mono font-semibold leading-tight",
          narrow ? "text-[10.5px]" : "text-[11.5px]",
        )}
      >
        {/* Narrow, the code alone must read: it never gives way to "×3". */}
        <span className={narrow ? "shrink-0" : "truncate"}>
          {narrow ? code : entry.label}
        </span>
        {narrow && merged ? (
          <span className="min-w-0 overflow-hidden font-normal text-[10px] opacity-75">
            ×{entry.sectionCodes.length}
          </span>
        ) : null}
      </div>
      {!narrow && height > 30 ? (
        <div className="truncate text-[10.5px] opacity-80">
          {entry.instructors || "Instructor TBA"}
        </div>
      ) : null}
      {height > 44 && (entry.full || entry.overlaps) ? (
        <div className="truncate font-medium text-[10.5px]">
          {entry.full ? "Full" : "Overlaps"}
        </div>
      ) : null}
    </>
  );
  const className = cn(
    "absolute z-10 flex flex-col justify-start overflow-hidden rounded-md border-[1.5px] py-1 text-left",
    narrow ? "px-0.5" : "px-1.5",
    "fade-in-0 animate-in duration-150",
    entry.previewed ? "z-20 border-solid shadow-md" : "border-dashed",
  );
  const boxStyle = {
    ...style,
    ...(entry.previewed ? tintStyle(entry.color) : ghostStyle(entry.color)),
  };
  const hover = {
    onPointerEnter: () => setPreview(entry.sectionKey),
    onPointerLeave: () => {
      if (useUi.getState().previewSection === entry.sectionKey)
        setPreview(null);
    },
  };
  const parsed = parseSectionKey(entry.sectionKey);
  if (!parsed) return null;

  if (readOnly)
    return (
      <WithTooltip label="Save a copy to change sections">
        <div
          className={className}
          style={boxStyle}
          data-ghost={code}
          {...hover}
        >
          {body}
        </div>
      </WithTooltip>
    );

  if (!merged)
    return (
      <WithTooltip
        label={
          <span className="flex flex-col">
            <span>Switch to {code}</span>
            <span className="opacity-70">{ghostWords(entry)}</span>
          </span>
        }
        shortcut="↵"
      >
        <button
          type="button"
          data-ghost={code}
          aria-label={`Switch to ${code}: ${ghostWords(entry)}`}
          className={className}
          style={boxStyle}
          onClick={() =>
            switchSection(parsed.courseCode, parsed.sectionCode, "ghost")
          }
          {...hover}
        >
          {body}
        </button>
      </WithTooltip>
    );

  return (
    <Popover>
      <WithTooltip label={`Pick one of ${entry.sectionCodes.length} sections`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-ghost={code}
            aria-label={`${entry.label}: pick a section`}
            className={className}
            style={boxStyle}
            {...hover}
          >
            {body}
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent className="w-64 p-1" side="right">
        <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted">
          {entry.sameTimes
            ? "Same times · pick a section"
            : "Pick a section · the list shows each one's times"}
        </div>
        {entry.sectionCodes.map((sectionCode) => {
          const key = sectionKey(parsed.courseCode, sectionCode);
          const status = seatStatus(seatCounts(seats, key));
          return (
            <WithTooltip key={sectionCode} label={`Switch to ${sectionCode}`}>
              <button
                type="button"
                onClick={() =>
                  switchSection(parsed.courseCode, sectionCode, "ghost")
                }
                className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-hover"
              >
                <span className="font-mono font-medium">{sectionCode}</span>
                <span
                  className={cn(
                    "ml-auto text-[11.5px]",
                    status.level === "full"
                      ? "text-error"
                      : status.level === "low"
                        ? "text-warn"
                        : "text-muted",
                  )}
                >
                  {status.words}
                </span>
              </button>
            </WithTooltip>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

const PILL_TONE = {
  ok: "border-hairline text-muted",
  tight: "border-warn/50 text-warn",
  insufficient: "border-error/60 text-error",
  unknown: "border-hairline text-faint",
  "no-route": "border-hairline text-faint",
} as const;

/** "6 min" between back-to-back classes in different buildings (SPEC §3.3). */
export function TravelPill({
  pill,
  top,
  x = 0.5,
  travel,
  selected,
  onOpen,
}: {
  pill: Pill;
  top: number;
  /** Across the column, 0.5 centered (`pillColumns`). */
  x?: number;
  travel: TravelSettings;
  selected: boolean;
  onOpen: (connection: Connection) => void;
}) {
  const c = pill.connection;
  const math = travelMath(c, travel);
  const words = messageToText(verdictMessage(c));
  const known = c.walkMinutes !== null;
  return (
    <WithTooltip
      label={
        <span className="flex flex-col">
          <span>{words}</span>
          <span className="opacity-70">
            {c.from.building} to {c.to.building}
            {math
              ? ` · ${formatFeet(math.distanceFeet)} at ${math.mph} mph`
              : ""}{" "}
            · click for details
          </span>
        </span>
      }
    >
      <button
        type="button"
        onClick={() => onOpen(c)}
        data-verdict={c.verdict}
        aria-label={`${words} From ${c.from.building} to ${c.to.building}.`}
        className={cn(
          "tnum -translate-x-1/2 -translate-y-1/2 absolute z-20 flex h-[19px] items-center gap-1 whitespace-nowrap rounded-full border bg-raised px-1.5 text-[10.5px] shadow-xs",
          PILL_TONE[c.verdict],
          selected && "ring-2 ring-fg/70",
        )}
        style={{ top, left: `${x * 100}%` }}
      >
        <Route size={10} aria-hidden="true" />
        {known ? `${c.walkMinutes} min` : null}
      </button>
    </WithTooltip>
  );
}
