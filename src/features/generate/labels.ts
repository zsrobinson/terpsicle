import type { SectionDifference } from "~/core/generate";
import type { Day, Equivalents, PlanStats } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTime } from "~/core/time";

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
  const at = d.start === null ? "" : ` ${formatTime(d.start)}`;
  const when =
    d.start === null
      ? "online"
      : d.days && d.onlineDays
        ? `${d.days}${at}, ${d.onlineDays} online`
        : d.onlineDays
          ? `${d.onlineDays}${at} online`
          : `${d.days}${at}`;
  return `${d.courseCode} ${d.sectionCode} ${when}`;
}

/** The tooltip on "×3": which sections are interchangeable. */
export function equivalentsTip(equivalents: Equivalents): string {
  const lines = equivalents.byCourse.map(
    (c) => `${c.courseCode} ${c.sectionCodes.join(", ")}`,
  );
  return `${equivalents.count} ways to get this same week: ${lines.join("; ")}`;
}
