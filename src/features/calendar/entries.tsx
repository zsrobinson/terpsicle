import { cn } from "cn";
import { CircleX, Route, TriangleAlert } from "lucide-react";
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
import { formatDateSpan, type Lane } from "~/core/time";
import { formatFeet, travelMath, verdictMessage } from "~/core/travel";
import { useUi } from "~/state/ui-store";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import { blockLabel, classLabel, ghostName, pillLabel } from "./labels";
import {
  type BlockEntry,
  type ClassEntry,
  clockLabel,
  type GhostEntry,
  ghostLabel,
  type Pill,
} from "./layout";
import { dimmedStyle, ghostStyle, tintStyle } from "./tint";

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

/**
 * What makes a calendar item one stop of the roving tabindex
 * (calendar.tsx, keyboard.ts): `tabIndex` 0 on the one Tab lands on.
 */
export interface NavProps {
  "data-nav-key": string;
  tabIndex: number;
  "aria-describedby"?: string;
}

const KIND_WORDS = { discussion: "discussion", lab: "lab" } as const;

/** The width in px a course code needs on one line (10px mono, padding and border). */
function fitsCode(code: string): number {
  return code.length * 6.1 + 14;
}

export function ClassBlock({
  entry,
  height,
  dimmed,
  selected,
  changed = false,
  onOpen,
  open,
  style,
  width = null,
  nav,
}: {
  entry: Lane<ClassEntry>;
  height: number;
  /** Its width in px, so a narrow lane can stack the code; null before it's measured. */
  width?: number | null;
  nav?: NavProps;
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
  // Secondary lines are softer, except when dimmed: muted text is already
  // as light as AA contrast allows.
  const soft = dimmed ? undefined : "opacity-80";
  const action = selected
    ? `Your current section, ${entry.sectionCode}`
    : open
      ? `Close ${entry.courseCode}`
      : `See ${entry.courseCode}'s sections`;
  // Summer sessions (and some fall and spring sections) meet for part of the
  // term; two can share a weekday and time without overlapping.
  const dates = entry.dates ? formatDateSpan(entry.dates) : null;
  // Two classes side by side on a narrow day (a wide sidebar, a phone):
  // "CMSC" over "330" reads where "CMSC3" wouldn't.
  const stacked = width !== null && width < fitsCode(entry.courseCode);
  const tight = stacked && width !== null && width < 40;
  const extra = stacked ? 13 : 0;
  // A lane that stacks the code has no room for a place worth reading.
  const clock = clockLabel(entry.start, entry.end, width, tight ? 6 : 14);
  const where = stacked ? null : place;
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
        // Forced colors drop the ring (a box-shadow); styles.css draws a
        // thicker border instead.
        data-selected={selected || changed ? "" : undefined}
        aria-label={classLabel(entry)}
        {...nav}
        className={cn(
          "absolute z-[1] flex flex-col justify-start overflow-hidden rounded-md border py-1 text-left transition-colors duration-150",
          tight ? "px-0.5" : "px-1.5",
          (selected || changed) && "ring-2 ring-fg/70",
        )}
        style={{
          ...style,
          ...(dimmed ? dimmedStyle(entry.color) : tintStyle(entry.color)),
        }}
      >
        <div className="flex items-baseline gap-1 text-2xs">
          {/* The code wins the space; "discussion" gives way on narrow days. */}
          <span
            className={cn(
              "ident shrink-0 font-semibold",
              stacked && "flex flex-col",
            )}
          >
            {stacked ? (
              <>
                <span>{entry.courseCode.slice(0, 4)}</span>
                <span>{entry.courseCode.slice(4)}</span>
              </>
            ) : (
              entry.courseCode
            )}
          </span>
          {kind ? (
            <span className={cn("min-w-0 truncate font-normal", soft)}>
              {kind}
            </span>
          ) : null}
        </div>
        {height > 30 + extra && clock ? (
          <div className={cn("tnum truncate text-2xs", soft)}>{clock}</div>
        ) : null}
        {height > 46 + extra && where ? (
          <div className={cn("truncate text-2xs", soft)}>{where}</div>
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
  width = null,
  nav,
}: {
  entry: Lane<BlockEntry>;
  nav?: NavProps;
  height: number;
  dimmed: boolean;
  style: CSSProperties;
  /** Its width in px, for what the time line can fit; null before it's measured. */
  width?: number | null;
}) {
  const clock = clockLabel(entry.start, entry.end, width, 14);
  return (
    <WithTooltip label="Edit in Blocks" shortcut="5">
      <button
        type="button"
        onClick={() => openTab("blocks", "click")}
        aria-label={blockLabel(entry)}
        // The label is the person's own words: autocapture skips it
        // (docs/ANALYTICS.md "Privacy").
        data-private=""
        {...nav}
        className={cn(
          "stripes absolute z-[1] flex flex-col justify-start overflow-hidden rounded-md border bg-panel px-1.5 py-1 text-left transition-colors duration-150",
          // Dimmed with color, not opacity, so its words stay readable.
          dimmed
            ? "border-hairline/60 text-faint"
            : "border-hairline text-muted",
        )}
        style={style}
      >
        <div className="truncate font-semibold text-2xs">{entry.label}</div>
        {height > 30 && clock ? (
          <div className="tnum truncate text-2xs">{clock}</div>
        ) : null}
      </button>
    </WithTooltip>
  );
}

function ghostWords(entry: GhostEntry): string {
  const words = [entry.instructors || "Instructor TBA"];
  if (entry.full) words.push("full");
  if (entry.overlaps)
    words.push(`overlaps ${entry.overlapsWith ?? "another class"}`);
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
  width,
  readOnly,
  seats,
  style,
  nav = null,
}: {
  entry: Lane<GhostEntry>;
  height: number;
  /** Its width in px, for what the label can fit; null before it's measured. */
  width: number | null;
  readOnly: boolean;
  seats: SeatsMap | null;
  style: CSSProperties;
  /** Null for an overlay, which is drawn over its merge and isn't a stop. */
  nav?: NavProps | null;
}) {
  const setPreview = useUi((s) => s.setPreviewSection);
  const merged = entry.sectionCodes.length > 1;
  const label = ghostLabel(entry, width);
  const narrow = width !== null && width < 44;
  // Name what it overlaps where there's room: the ghost covers its label.
  const overlapWords =
    entry.overlapsWith &&
    (width === null || (entry.overlapsWith.length + 9) * 6.1 + 16 <= width)
      ? `Overlaps ${entry.overlapsWith}`
      : "Overlaps";
  const body = (
    <>
      <div className="ident flex items-baseline gap-1 font-semibold text-2xs">
        {/* The code must read: it never gives way to "×3". */}
        <span className={label.count ? "shrink-0" : "truncate"}>
          {label.text}
        </span>
        {label.count ? (
          <span className="min-w-0 overflow-hidden font-normal opacity-75">
            {label.count}
          </span>
        ) : null}
      </div>
      {label.instructor && height > 30 ? (
        <div className="truncate text-2xs opacity-80">
          {entry.instructors || "Instructor TBA"}
        </div>
      ) : null}
      {height > 44 && (entry.full || entry.overlaps) ? (
        <div className="truncate font-medium text-2xs">
          {entry.full ? "Full" : overlapWords}
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
  const shown = entry.previewCode ?? entry.sectionCodes[0] ?? "";

  // A preview inside a merged stretch, drawn at its own time over the merge.
  if (entry.overlay)
    return (
      <div
        aria-hidden="true"
        className={cn(className, "pointer-events-none")}
        style={boxStyle}
      >
        {body}
      </div>
    );

  // Pointing at a ghost previews it, and so does focusing it: the keyboard
  // compares sections the way the pointer does.
  const show = () => setPreview(entry.sectionKey);
  const hide = () => {
    if (useUi.getState().previewSection === entry.sectionKey) setPreview(null);
  };
  const hover = {
    onPointerEnter: show,
    onPointerLeave: hide,
    onFocus: show,
    onBlur: hide,
    ...nav,
  };
  const parsed = parseSectionKey(entry.sectionKey);
  if (!parsed) return null;

  if (readOnly)
    return (
      <WithTooltip label="Save a copy to change sections">
        {/* A button that does nothing, so it can be reached and read. */}
        <button
          type="button"
          aria-disabled="true"
          aria-label={ghostName(entry, parsed.courseCode, { readOnly: true })}
          className={cn(className, "cursor-default")}
          style={boxStyle}
          data-ghost={shown}
          {...hover}
        >
          {body}
        </button>
      </WithTooltip>
    );

  if (!merged)
    return (
      <WithTooltip
        label={
          <span className="flex flex-col">
            <span>Switch to {shown}</span>
            <span className="opacity-70">{ghostWords(entry)}</span>
          </span>
        }
        shortcut="↵"
      >
        <button
          type="button"
          data-ghost={shown}
          aria-label={ghostName(entry, parsed.courseCode)}
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
            data-ghost={shown}
            aria-label={ghostName(entry, parsed.courseCode)}
            className={className}
            style={boxStyle}
            {...hover}
          >
            {body}
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        className="w-64 p-1"
        side="right"
        aria-label={`Sections of ${parsed.courseCode}`}
      >
        <div className="px-2 pt-1 pb-1.5 text-muted text-xs">
          {entry.sameTimes
            ? "Same times · pick a section"
            : "Pick a section · each one's times"}
        </div>
        {entry.sectionCodes.map((sectionCode) => {
          const key = sectionKey(parsed.courseCode, sectionCode);
          const status = seatStatus(seatCounts(seats, key));
          const when = entry.sameTimes ? null : entry.when[sectionCode];
          return (
            <WithTooltip key={sectionCode} label={`Switch to ${sectionCode}`}>
              <button
                type="button"
                onClick={() =>
                  switchSection(parsed.courseCode, sectionCode, "ghost")
                }
                // The calendar shows the row's section while it's pointed at.
                onPointerEnter={() => setPreview(key)}
                onPointerLeave={() => {
                  if (useUi.getState().previewSection === key) setPreview(null);
                }}
                className="flex min-h-8 w-full flex-col justify-center rounded-md px-2 py-1 text-left hover:bg-hover"
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="ident font-medium text-base">
                    {sectionCode}
                  </span>
                  <span
                    className={cn(
                      "tnum ml-auto text-sm",
                      status.level === "full"
                        ? "text-error"
                        : status.level === "low"
                          ? "text-warn"
                          : "text-muted",
                    )}
                  >
                    {status.words}
                  </span>
                </span>
                {when ? (
                  <span className="tnum w-full truncate text-muted text-sm">
                    {when}
                  </span>
                ) : null}
              </button>
            </WithTooltip>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

const VERDICT_ICON = {
  ok: Route,
  tight: TriangleAlert,
  insufficient: CircleX,
  unknown: Route,
  "no-route": Route,
} as const;

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
  onIntent,
  nav,
}: {
  pill: Pill;
  top: number;
  /** Across the column, 0.5 centered (`spreadPills`). */
  x?: number;
  travel: TravelSettings;
  selected: boolean;
  onOpen: (connection: Connection) => void;
  /** Hovered or focused: connection details are likely next. */
  onIntent?: () => void;
  nav?: NavProps;
}) {
  // Color is never the only sign (WCAG 1.4.1): a tight or impossible
  // connection swaps the route icon for a warning one.
  const Icon = VERDICT_ICON[pill.connection.verdict];
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
        onPointerEnter={onIntent}
        onFocus={onIntent}
        data-verdict={c.verdict}
        data-selected={selected ? "" : undefined}
        aria-label={pillLabel(c)}
        {...nav}
        // The button is a 24px-tall target (WCAG 2.5.8); the pill drawn
        // inside it stays 20px so it doesn't crowd the classes around it.
        className="-translate-x-1/2 -translate-y-1/2 absolute z-20 flex h-6 items-center rounded-full"
        style={{ top, left: `${x * 100}%` }}
      >
        <span
          className={cn(
            "tnum flex h-5 items-center gap-1 whitespace-nowrap rounded-full border bg-raised px-1.5 text-2xs shadow-xs",
            PILL_TONE[c.verdict],
            selected && "ring-2 ring-fg/70",
          )}
        >
          <Icon size={10} aria-hidden="true" />
          {known ? `${c.walkMinutes} min` : null}
        </span>
      </button>
    </WithTooltip>
  );
}
