import type {
  Connection,
  ConnectionVerdict,
  Day,
  Section,
  TravelMode,
} from "~/core/schema";
import { DAY_SHORT_NAMES, formatDays, formatTimeRange } from "~/core/time";
import type { TravelMath } from "~/core/travel";

// How travel numbers read in the Travel tab and connection details.

/** "1,999 ft": always feet in the math, so the arithmetic can be checked. */
export function exactFeet(feet: number): string {
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
}

/**
 * "1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min", plus
 * ", + 2 min extra = 10 min" when extra time is on (DATA.md §6).
 */
export function estimateLine(math: TravelMath): string {
  const exact = Math.round(math.exactMinutes * 10) / 10;
  const walk =
    exact === math.walkingMinutes
      ? `${math.walkingMinutes} min`
      : `${exact.toFixed(1)} min, rounded up to ${math.walkingMinutes} min`;
  const extra =
    math.extraMinutes > 0
      ? `, + ${math.extraMinutes} min extra = ${math.totalMinutes} min`
      : "";
  return `${exactFeet(math.distanceFeet)} at ${math.mph.toFixed(1)} mph = ${walk}${extra}`;
}

/** Short words for a list row's right edge. */
export const VERDICT_SHORT = {
  ok: "Plenty of time",
  tight: "Tight",
  insufficient: "Not enough time",
  unknown: "No route data yet",
  "no-route": "No route",
} as const satisfies Record<ConnectionVerdict, string>;

/** "No accessible route" in accessible mode, where it's most common. */
export function verdictShort(connection: Connection): string {
  if (connection.verdict === "no-route" && connection.mode === "accessible")
    return "No accessible route";
  return VERDICT_SHORT[connection.verdict];
}

/** "Mon", "Mon and Wed", "Mon, Wed and Fri". */
export function daysInWords(days: readonly Day[]): string {
  const names = days.map((d) => DAY_SHORT_NAMES[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The days this connection happens: the same walk (same meetings, same
 * times) on other days of the week.
 */
export function connectionDays(
  connection: Connection,
  all: readonly Connection[],
): Day[] {
  const same = (c: Connection) =>
    c.from.sectionKey === connection.from.sectionKey &&
    c.to.sectionKey === connection.to.sectionKey &&
    c.from.building === connection.from.building &&
    c.to.building === connection.to.building &&
    c.from.time === connection.from.time &&
    c.to.time === connection.to.time;
  const days = all.filter(same).map((c) => c.day);
  return days.includes(connection.day) ? days : [connection.day, ...days];
}

/** "MWF 11am–11:50am · Tu 2pm–2:50pm", or "No set times". */
export function meetingTimes(section: Pick<Section, "meetings">): string {
  const parts = section.meetings.flatMap((m) =>
    m.timed ? [`${formatDays(m.days)} ${formatTimeRange(m.start, m.end)}`] : [],
  );
  return parts.length > 0 ? [...new Set(parts)].join(" · ") : "No set times";
}

export const MODE_WORDS = {
  standard: "Standard route",
  accessible: "Accessible route",
} as const satisfies Record<TravelMode, string>;
