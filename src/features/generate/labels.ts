import type { PlanChange } from "~/core/generate";
import type { Equivalents, PlanStats } from "~/core/schema";
import { formatTime } from "~/core/time";

// Plain-words summaries of a generated plan (SPEC §3.13).

export const optionLabel = (rank: number) => `Option ${rank}`;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "5 days · first class 9am" */
export function daysLine(stats: PlanStats): string {
  if (stats.firstClass === null) return "No set meeting times";
  return `${plural(stats.daysOnCampus, "day")} · first class ${formatTime(stats.firstClass)}`;
}

/** "16 credits · ★ 4.1 average · at least 12 open seats" */
export function qualityLine(stats: PlanStats): string {
  const parts = [plural(stats.credits, "credit")];
  if (stats.avgRating !== null)
    parts.push(`★ ${stats.avgRating.toFixed(1)} average`);
  if (stats.fewestOpenSeats !== null)
    parts.push(
      stats.fewestOpenSeats === 0
        ? "a full section"
        : `at least ${plural(stats.fewestOpenSeats, "open seat")}`,
    );
  return parts.join(" · ");
}

/** "3 changes from Plan A" */
export function changesLine(changes: readonly PlanChange[], planName: string) {
  return changes.length === 0
    ? `Same as ${planName}`
    : `${plural(changes.length, "change")} from ${planName}`;
}

/** "Same times: CMSC351 0301, 0302, 0303" */
export function equivalentsTip(equivalents: Equivalents): string {
  const lines = equivalents.byCourse.map(
    (c) => `${c.courseCode} ${c.sectionCodes.join(", ")}`,
  );
  return `${equivalents.count} versions of this plan with sections at the same times: ${lines.join("; ")}`;
}
