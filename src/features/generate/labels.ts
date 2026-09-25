import type { SectionDifference } from "~/core/generate/describe";
import { RANK_FACTOR_LABELS } from "~/core/generate/score";
import type {
  Day,
  Equivalents,
  GenerateRequest,
  PlanStats,
} from "~/core/schema";
import { DAY_SHORT_NAMES, formatTime, sortDays } from "~/core/time";

// Plain-words summaries of a generated plan (SPEC §3.13).

export const optionLabel = (rank: number) => `Option ${rank}`;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "Fri off", "Tue, Thu off", or "5 days" when no weekday is free. */
export function freeDaysLabel(free: readonly Day[], stats: PlanStats): string {
  if (free.length === 0) return plural(stats.daysOnCampus, "day");
  return `${free.map((d) => DAY_SHORT_NAMES[d]).join(", ")} off`;
}

/** "9am–3:15pm", the week's earliest start to its latest end. */
export function spanLabel(stats: PlanStats): string {
  if (stats.firstClass === null || stats.lastClass === null)
    return "No set times";
  return `${formatTime(stats.firstClass)}–${formatTime(stats.lastClass)}`;
}

/** "Fewest seats: 3 open", "Fewest seats: full"; null when seats are unknown. */
export function seatsLabel(stats: PlanStats): string | null {
  if (stats.fewestOpenSeats === null) return null;
  return stats.fewestOpenSeats === 0
    ? "Fewest seats: full"
    : `Fewest seats: ${stats.fewestOpenSeats} open`;
}

/**
 * The same, short enough for a result row's stats column beside the mini
 * week: "Seats: full". The row's tooltip carries the long form.
 */
export function seatsShortLabel(stats: PlanStats): string | null {
  if (stats.fewestOpenSeats === null) return null;
  return stats.fewestOpenSeats === 0
    ? "Seats: full"
    : `Seats: ${stats.fewestOpenSeats} open`;
}

/** "16 credits · ★ 4.1 average · 3.21 average GPA · Fewest seats: 3 open" */
export function statsLine(stats: PlanStats): string {
  const parts = [plural(stats.credits, "credit")];
  if (stats.avgRating !== null)
    parts.push(`★ ${stats.avgRating.toFixed(1)} average`);
  if (stats.avgGpa !== null)
    parts.push(`${stats.avgGpa.toFixed(2)} average GPA`);
  const seats = seatsLabel(stats);
  if (seats) parts.push(seats);
  return parts.join(" · ");
}

/** "ENGL101 9020 MF 11am", "ENGL101 9009 Tu 12:30pm, Th online" */
export function differenceLabel(d: SectionDifference): string {
  return `${d.courseCode} ${d.sectionCode} ${differenceWhen(d)}`;
}

/** The when of a difference, set apart from its codes: "Tu 12:30pm, Th online". */
export function differenceWhen(d: SectionDifference): string {
  const at = d.start === null ? "" : ` ${formatTime(d.start)}`;
  return d.start === null
    ? "online"
    : d.days && d.onlineDays
      ? `${d.days}${at}, ${d.onlineDays} online`
      : d.onlineDays
        ? `${d.onlineDays}${at} online`
        : `${d.days}${at}`;
}

/** The tooltip on "×3": which sections are interchangeable. */
export function equivalentsTip(equivalents: Equivalents): string {
  const lines = equivalents.byCourse.map(
    (c) => `${c.courseCode} ${c.sectionCodes.join(", ")}`,
  );
  return `${equivalents.count} ways to get this same week: ${lines.join("; ")}`;
}

/** "3 courses", "3 courses (1 optional) + 1 of 3" */
function coursesPart(items: GenerateRequest["items"]): string {
  const courses = items.filter((i) => i.kind === "course");
  const optional = courses.filter((i) => i.kind === "course" && !i.required);
  const parts: string[] = [];
  if (courses.length > 0)
    parts.push(
      plural(courses.length, "course") +
        (optional.length > 0 ? ` (${optional.length} optional)` : ""),
    );
  for (const item of items)
    if (item.kind === "pick")
      parts.push(`${item.count} of ${item.courses.length}`);
  return parts.join(" + ");
}

/**
 * What was asked, in one line above the results so the form's context
 * isn't lost (UX-REVIEW §4.8): "4 courses · Fri off · from 10am ·
 * compact days". Defaults (walking time checked, blocks respected) go
 * unsaid; turning them off is said.
 */
export function requestSummary(request: GenerateRequest): string {
  const m = request.mustHaves;
  const parts = [coursesPart(request.items)];
  if (m.daysOff.length > 0)
    parts.push(
      `${sortDays(m.daysOff)
        .map((d) => DAY_SHORT_NAMES[d])
        .join(", ")} off`,
    );
  if (m.earliestStart !== null)
    parts.push(`from ${formatTime(m.earliestStart)}`);
  if (m.latestEnd !== null) parts.push(`done by ${formatTime(m.latestEnd)}`);
  const { min, max } = m.credits;
  if (min !== null && max !== null) parts.push(`${min}–${max} credits`);
  else if (min !== null) parts.push(`${min}+ credits`);
  else if (max !== null) parts.push(`up to ${max} credits`);
  if (m.openSeatsOnly) parts.push("open seats only");
  if (!m.enoughTravelTime) parts.push("any walking time");
  if (!m.respectBlocks && request.blocks.length > 0)
    parts.push("ignoring blocks");
  parts.push(
    request.rankBy.preset === "custom"
      ? "custom ranking"
      : RANK_FACTOR_LABELS[request.rankBy.preset].toLowerCase(),
  );
  return parts.filter(Boolean).join(" · ");
}
