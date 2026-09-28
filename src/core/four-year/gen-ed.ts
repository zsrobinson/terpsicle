import type { CourseCode, GenEdCode, GenEdGroup, LocalId } from "../schema";
import type {
  FourYearDoc,
  FourYearEntry,
  FourYearTermStatus,
} from "../schema/four-year";
import { courseDetails, type FourYearCourses } from "./course-lookup";
import { countedEntries } from "./credits";
import type { StatusOf } from "./status";
import { compareFourYearTerms } from "./terms";

// GenEd progress (docs/V3.md §2.7) from Testudo's GenEd codes. Not an audit:
// the panel says so, and the degree audit is the official check.

export type GenEdRequirement = {
  /** A code for one-code categories; "DSN" and "DV" for the two with a mix. */
  readonly id: string;
  readonly group:
    | "Fundamental Studies"
    | "Distributive Studies"
    | "I-Series"
    | "Diversity";
  readonly label: string;
  /** The codes that count toward it. */
  readonly codes: readonly GenEdCode[];
  /** How many courses it needs. */
  readonly needed: number;
  /** Of those, at least this many with this code. */
  readonly atLeast: { readonly code: GenEdCode; readonly count: number } | null;
};

/**
 * UMD's General Education requirements, as courses per category. Source:
 * the GenEd checklist at gened.umd.edu ("Requirements", for students who
 * entered in 2012 or later). Kept by hand: it changes rarely. Fundamental
 * Studies exemptions (a math placement, say) aren't modeled.
 */
export const GEN_ED_REQUIREMENTS: readonly GenEdRequirement[] = [
  one("FSAW", "Academic Writing"),
  one("FSPW", "Professional Writing"),
  one("FSOC", "Oral Communication"),
  one("FSMA", "Math"),
  one("FSAR", "Analytic Reasoning"),
  {
    id: "DSN",
    group: "Distributive Studies",
    label: "Natural Sciences",
    codes: ["DSNL", "DSNS"],
    needed: 2,
    atLeast: { code: "DSNL", count: 1 },
  },
  two("DSHS", "History and Social Sciences"),
  two("DSHU", "Humanities"),
  two("DSSP", "Scholarship in Practice"),
  {
    id: "SCIS",
    group: "I-Series",
    label: "I-Series",
    codes: ["SCIS"],
    needed: 2,
    atLeast: null,
  },
  {
    id: "DV",
    group: "Diversity",
    label: "Diversity",
    codes: ["DVUP", "DVCC"],
    needed: 2,
    atLeast: { code: "DVUP", count: 1 },
  },
];

function one(code: GenEdCode, label: string): GenEdRequirement {
  return {
    id: code,
    group: "Fundamental Studies",
    label,
    codes: [code],
    needed: 1,
    atLeast: null,
  };
}

function two(code: GenEdCode, label: string): GenEdRequirement {
  return {
    id: code,
    group: "Distributive Studies",
    label,
    codes: [code],
    needed: 2,
    atLeast: null,
  };
}

/** The category a code counts toward; undefined for a code UMD doesn't use now. */
export function genEdRequirementOf(
  code: GenEdCode,
): GenEdRequirement | undefined {
  return GEN_ED_REQUIREMENTS.find((r) => r.codes.includes(code));
}

const COURSE_IN_TEXT = /\b([A-Z]{4}) ?(\d{3}[A-Z]?)\b/g;

/**
 * Whether a conditional option holds: "if taken with GEOL110" holds when
 * GEOL110 is in the same or an earlier semester. A condition that names no
 * course can't be checked, so it doesn't hold.
 */
export function conditionMet(
  condition: string,
  entry: Pick<FourYearEntry, "id" | "term">,
  doc: Pick<FourYearDoc, "entries">,
): boolean {
  const codes = new Set<CourseCode>(
    [...condition.matchAll(COURSE_IN_TEXT)].map((m) => `${m[1]}${m[2]}`),
  );
  if (codes.size === 0) return false;
  return doc.entries.some(
    (other) =>
      other.kind === "course" &&
      other.id !== entry.id &&
      codes.has(other.code) &&
      compareFourYearTerms(other.term, entry.term) <= 0,
  );
}

/** What one of a course's GenEd groups counts for. */
export type GenEdPick = {
  /** Index into the course's `genEds`. */
  readonly group: number;
  /** The option it counts as; null when no option can. */
  readonly code: GenEdCode | null;
  /** The person picked it (`genEdChoices`); never overridden. */
  readonly chosen: boolean;
  /** The picked option's condition, for its chip ("if taken with GEOL110"). */
  readonly condition: string | null;
  /** False when its condition doesn't hold, the course doesn't count (a replaced attempt, an F), or it already counts for this category. */
  readonly counts: boolean;
};

export type GenEdProgress = {
  readonly requirement: GenEdRequirement;
  readonly done: number;
  readonly inProgress: number;
  readonly planned: number;
  /** Entries that count, in allocation order. */
  readonly entryIds: readonly LocalId[];
  /** How many more courses it needs, counting planned ones; 0 when met. */
  readonly short: number;
  /** What "Find a course" filters by; empty when met. */
  readonly searchCodes: readonly GenEdCode[];
};

export type GenEdAllocation = {
  /** Per course entry, one pick per GenEd group. Placeholders and credit entries have none. */
  readonly picks: ReadonlyMap<LocalId, readonly GenEdPick[]>;
  /** One row per `GEN_ED_REQUIREMENTS` category, in its order. */
  readonly progress: readonly GenEdProgress[];
};

type Contributor = {
  readonly entry: FourYearEntry;
  readonly status: FourYearTermStatus;
  readonly groups: readonly GenEdGroup[];
  readonly choices: Readonly<Record<string, GenEdCode>>;
  readonly counted: boolean;
};

const STATUS_RANK: Record<FourYearTermStatus, number> = {
  done: 0,
  "in-progress": 1,
  planned: 2,
};

function contributors(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  lookup: FourYearCourses,
  statusOf: StatusOf,
): Contributor[] {
  const counted = new Set(
    countedEntries(doc, lookup, statusOf).map((e) => e.id),
  );
  const out: Contributor[] = [];
  for (const entry of doc.entries) {
    const base = { entry, counted: counted.has(entry.id) };
    if (entry.kind === "course")
      out.push({
        ...base,
        status: statusOf(entry.term),
        groups:
          lookup.courses.get(entry.code)?.genEds ??
          // What the person said it covered: each one applies.
          courseDetails(lookup, entry)?.genEds.map((code) => [{ code }]) ??
          [],
        choices: entry.genEdChoices,
      });
    else if (entry.kind === "credit")
      out.push({
        ...base,
        status: "done",
        groups: entry.genEds.map((code) => [{ code }]),
        choices: {},
      });
    // A GenEd placeholder counts as planned for its category, wherever it sits.
    else if (entry.wildcard.kind === "gen-ed")
      out.push({
        ...base,
        status: "planned",
        groups: [[{ code: entry.wildcard.code }]],
        choices: {},
      });
  }
  // Done courses first, then in term order; `sort` is stable, so position breaks ties.
  return out.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      compareFourYearTerms(a.entry.term, b.entry.term),
  );
}

/**
 * Which category each course counts for. Every group applies; within a
 * group a course counts for one option: the person's choice where they made
 * one, else the option whose category is furthest from done, deciding done
 * courses first and then in term order. Choices and one-option groups are
 * placed before any open group, so an open option sees the whole plan.
 * Deterministic: the same doc always allocates the same way.
 */
export function allocateGenEds(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  lookup: FourYearCourses,
  statusOf: StatusOf,
): GenEdAllocation {
  const members = new Map<string, LocalId[]>(
    GEN_ED_REQUIREMENTS.map((r) => [r.id, []]),
  );
  const statuses = new Map<LocalId, FourYearTermStatus>();
  const codeCounts = new Map<GenEdCode, number>();
  const picks = new Map<LocalId, (GenEdPick | undefined)[]>();
  const all = contributors(doc, lookup, statusOf);

  const usedBy = (entryId: LocalId, code: GenEdCode): boolean => {
    const req = genEdRequirementOf(code);
    return req !== undefined && (members.get(req.id) ?? []).includes(entryId);
  };
  const place = (
    c: Contributor,
    group: number,
    code: GenEdCode | null,
    chosen: boolean,
    condition: string | null,
    holds: boolean,
  ) => {
    const counts =
      code !== null && holds && c.counted && !usedBy(c.entry.id, code);
    if (code !== null && counts) {
      const req = genEdRequirementOf(code);
      if (req) members.get(req.id)?.push(c.entry.id);
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
      statuses.set(c.entry.id, c.status);
    }
    if (c.entry.kind !== "course") return;
    const list = picks.get(c.entry.id) ?? [];
    list[group] = { group, code, chosen, condition, counts };
    picks.set(c.entry.id, list);
  };
  const holds = (c: Contributor, condition: string | undefined) =>
    condition === undefined || conditionMet(condition, c.entry, doc);
  const need = (code: GenEdCode): number => {
    const req = genEdRequirementOf(code);
    if (!req) return 0;
    const have = members.get(req.id)?.length ?? 0;
    const sub =
      req.atLeast?.code === code
        ? Math.max(0, req.atLeast.count - (codeCounts.get(code) ?? 0))
        : 0;
    return Math.max(0, req.needed - have) + sub;
  };

  // Pass 1: choices and groups with one option.
  const open: { c: Contributor; group: number }[] = [];
  for (const c of all)
    c.groups.forEach((options, group) => {
      const choice = c.choices[String(group)];
      const chosen = options.find((o) => o.code === choice);
      const only = options.length === 1 ? options[0] : undefined;
      const fixed = chosen ?? only;
      if (fixed)
        place(
          c,
          group,
          fixed.code,
          chosen !== undefined,
          fixed.condition ?? null,
          holds(c, fixed.condition),
        );
      else open.push({ c, group });
    });

  // Pass 2: open groups, each to the option furthest from done.
  for (const { c, group } of open) {
    const options = c.groups[group] ?? [];
    const candidates = options.filter(
      (o) => holds(c, o.condition) && !usedBy(c.entry.id, o.code),
    );
    let best = candidates[0];
    for (const o of candidates.slice(1))
      if (best && need(o.code) > need(best.code)) best = o;
    if (best) place(c, group, best.code, false, best.condition ?? null, true);
    else {
      // Nothing can count: show the first option, with its condition.
      const first = options[0];
      place(
        c,
        group,
        first?.code ?? null,
        false,
        first?.condition ?? null,
        false,
      );
    }
  }

  const progress = GEN_ED_REQUIREMENTS.map((requirement): GenEdProgress => {
    const entryIds = members.get(requirement.id) ?? [];
    const by = { done: 0, "in-progress": 0, planned: 0 };
    for (const id of entryIds) by[statuses.get(id) ?? "planned"]++;
    const sub = requirement.atLeast
      ? Math.max(
          0,
          requirement.atLeast.count -
            (codeCounts.get(requirement.atLeast.code) ?? 0),
        )
      : 0;
    const overall = Math.max(0, requirement.needed - entryIds.length);
    const short = Math.max(overall, sub);
    const searchCodes =
      short === 0
        ? []
        : requirement.atLeast && sub >= overall
          ? [requirement.atLeast.code]
          : [...requirement.codes];
    return {
      requirement,
      done: by.done,
      inProgress: by["in-progress"],
      planned: by.planned,
      entryIds,
      short,
      searchCodes,
    };
  });

  const dense = new Map<LocalId, readonly GenEdPick[]>();
  for (const [id, list] of picks)
    dense.set(
      id,
      list.filter((p): p is GenEdPick => p !== undefined),
    );
  return { picks: dense, progress };
}

/**
 * A category's line in words: "Needs 2 courses", "1 planned, needs 1 more",
 * "Covered: 1 done, 1 planned", "Done". In-progress courses count as
 * planned. (QA P2: "1 planned · of 1" read as a sum, not a status.)
 */
export function genEdProgressLabel(p: GenEdProgress): string {
  const planned = p.inProgress + p.planned;
  const parts: string[] = [];
  if (p.done > 0) parts.push(`${p.done} done`);
  if (planned > 0) parts.push(`${planned} planned`);
  if (p.short === 0)
    return planned === 0 ? "Done" : `Covered: ${parts.join(", ")}`;
  const { atLeast } = p.requirement;
  const which = atLeast ? `, at least ${atLeast.count} ${atLeast.code}` : "";
  if (parts.length === 0) {
    const n = p.requirement.needed;
    return `Needs ${n} ${n === 1 ? "course" : "courses"}${which}`;
  }
  return `${parts.join(", ")}, needs ${p.short} more${which}`;
}
