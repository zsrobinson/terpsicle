import {
  type CatalogIndex,
  placedSections,
  type SectionRef,
} from "../catalog/catalog-index";
import { diffPlanAgainstCatalog } from "../catalog/plan-diff";
import {
  type Block,
  type CatalogChange,
  type Connection,
  type CourseCode,
  type Day,
  type DeptCode,
  type Message,
  type Plan,
  PROBLEM_SEVERITY,
  type Problem,
  type ProblemFix,
  type ProblemKind,
  type SectionKey,
  type Subject,
  type TravelSettings,
} from "../schema";
import { type SeatsMap, seatCounts, seatLevel } from "../seats/seats";
import { compareDays, sortDays } from "../time/format";
import {
  blockWeekItems,
  itemsOverlap,
  sectionWeekItems,
  type WeekItem,
} from "../time/week";
import type { CampusMap } from "../travel/campus";
import { planConnections } from "../travel/connections";
import {
  course,
  daysAndTime,
  duration,
  joinParts,
  section,
  snapshotChangeParts,
  text,
} from "./messages";

// Detecting SPEC §3.6's problems, without fixes (see problems.ts).

export type ProblemsInput = {
  readonly plan: Plan;
  readonly index: CatalogIndex;
  readonly blocks: readonly Block[];
  readonly travel: TravelSettings;
  /** Routes and off-campus codes; connection problems wait for the routes file. */
  readonly campus: CampusMap;
  readonly seats: SeatsMap | null;
  /** The changes file's entries, newest first; only adds when a change happened. */
  readonly changes?: readonly CatalogChange[];
  /**
   * Departments not loaded yet (`pendingPlanDepts`): their sections are
   * unknown, so they're never reported as cancelled.
   */
  readonly pendingDepts?: ReadonlySet<DeptCode>;
};

/** A problem before fixes are attached, plus what the fix search needs. */
export type Detected = Omit<Problem, "fix"> & {
  /** Course-level identity, so a switch that only renames the sections involved isn't "new". */
  readonly signature: string;
  /** Courses whose section a switch could change to fix it, most direct first. */
  readonly switchable: readonly CourseCode[];
  /** A fix that needs no search ("Keep new times"). */
  readonly presetFix: ProblemFix | null;
};

function subjectId(s: Subject): string {
  switch (s.kind) {
    case "course":
      return s.courseCode;
    case "section":
      return s.sectionKey;
    case "connection":
      return s.connectionId;
    case "block":
      return `block:${s.blockId}`;
  }
}

function make(
  kind: ProblemKind,
  subjects: [Subject, ...Subject[]],
  title: Message,
  detail: Message,
  signature: string,
  switchable: readonly CourseCode[],
  id: string = `${kind}:${subjects.map(subjectId).join(",")}`,
): Detected {
  return {
    id,
    severity: PROBLEM_SEVERITY[kind],
    kind,
    subjects,
    title,
    detail,
    signature: `${kind}:${signature}`,
    switchable,
    presetFix: null,
  };
}

const sectionSubject = (key: SectionKey): Subject => ({
  kind: "section",
  sectionKey: key,
});

// ---------- travel ----------

function connectionProblems(
  connections: readonly Connection[],
  byKey: ReadonlyMap<SectionKey, SectionRef>,
): Detected[] {
  const groups = new Map<string, Connection[]>();
  for (const c of connections) {
    if (c.verdict !== "insufficient" && c.verdict !== "tight") continue;
    const k = `${c.verdict}|${c.from.sectionKey}>${c.to.sectionKey}`;
    const list = groups.get(k);
    if (list) list.push(c);
    else groups.set(k, [c]);
  }
  const out: Detected[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const fromRef = first && byKey.get(first.from.sectionKey);
    const toRef = first && byKey.get(first.to.sectionKey);
    if (!first || !fromRef || !toRef || first.walkMinutes === null) continue;
    const kind: ProblemKind =
      first.verdict === "insufficient" ? "not-enough-time" : "tight-connection";
    const a = fromRef.course.code;
    const b = toRef.course.code;
    const days = sortDays(list.map((c) => c.day));
    out.push(
      make(
        kind,
        [
          { kind: "connection", connectionId: first.id },
          sectionSubject(toRef.key),
          sectionSubject(fromRef.key),
        ],
        [
          text(
            kind === "not-enough-time"
              ? "Not enough time to get from "
              : "Tight connection from ",
          ),
          course(a),
          text(" to "),
          course(b),
        ],
        [
          duration(first.walkMinutes),
          text(" to get there, "),
          duration(first.gapMinutes),
          text(" between classes · "),
          ...joinParts(
            days.map((d) => [{ kind: "day", day: d }]),
            ", ",
          ),
        ],
        `${a}>${b}`,
        a === b ? [b] : [b, a],
        `${kind}:${fromRef.key}>${toRef.key}`,
      ),
    );
  }
  return out;
}

// ---------- overlaps ----------

type Owner = {
  id: string;
  subject: Subject;
  course: CourseCode | null;
  block: Block | null;
};

function ownerOf(item: WeekItem, blocks: ReadonlyMap<string, Block>): Owner {
  const s = item.source;
  if (s.kind === "block") {
    const block = blocks.get(s.blockId) ?? null;
    return {
      id: `block:${s.blockId}`,
      subject: { kind: "block", blockId: s.blockId },
      course: null,
      block,
    };
  }
  return {
    id: s.sectionKey,
    subject: sectionSubject(s.sectionKey),
    course: s.courseCode,
    block: null,
  };
}

function ownerParts(o: Owner): Message {
  if (o.course) return [course(o.course)];
  const s = o.subject;
  return s.kind === "block"
    ? [{ kind: "block", blockId: s.blockId, label: o.block?.label ?? "" }]
    : [];
}

function overlapProblems(
  placed: readonly SectionRef[],
  blocks: readonly Block[],
): Detected[] {
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const items: WeekItem[] = [
    ...placed.flatMap((r) => sectionWeekItems(r.course.code, r.section)),
    ...blocks.flatMap(blockWeekItems),
  ];
  // pair id → [first owner, second owner, clash ranges]
  const pairs = new Map<
    string,
    { a: Owner; b: Owner; ranges: { day: Day; start: number; end: number }[] }
  >();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const x = items[i];
      const y = items[j];
      if (!x || !y || !itemsOverlap(x, y)) continue;
      const a = ownerOf(x, blockById);
      const b = ownerOf(y, blockById);
      if (a.id === b.id || (a.block && b.block)) continue; // blocks may overlap each other
      const k = `${a.id}|${b.id}`;
      const range = {
        day: x.day,
        start: Math.max(x.start, y.start),
        end: Math.min(x.end, y.end),
      };
      const pair = pairs.get(k);
      if (pair) pair.ranges.push(range);
      else pairs.set(k, { a, b, ranges: [range] });
    }
  }
  const out: Detected[] = [];
  for (const { a, b, ranges } of pairs.values()) {
    // "M, W 10am–10:15am · F 1pm–1:30pm": one entry per distinct time.
    const byTime = new Map<
      string,
      { start: number; end: number; days: Day[] }
    >();
    for (const r of ranges.sort(
      (p, q) => compareDays(p.day, q.day) || p.start - q.start,
    )) {
      const k = `${r.start}-${r.end}`;
      const e = byTime.get(k);
      if (e) {
        if (!e.days.includes(r.day)) e.days.push(r.day);
      } else byTime.set(k, { start: r.start, end: r.end, days: [r.day] });
    }
    const detail = joinParts(
      [...byTime.values()].map((e) => daysAndTime(e.days, e.start, e.end)),
      " · ",
    );
    const title: Message = b.block
      ? [...ownerParts(a), text(" overlaps "), ...ownerParts(b)]
      : [...ownerParts(a), text(" and "), ...ownerParts(b), text(" overlap")];
    const courses = [a.course, b.course].filter(
      (c): c is CourseCode => c !== null,
    );
    const sigIds = [a.course ?? a.id, b.course ?? b.id].sort();
    out.push(
      make(
        "overlap",
        [a.subject, b.subject],
        title,
        detail,
        sigIds.join("|"),
        courses,
      ),
    );
  }
  return out;
}

// ---------- per section ----------

function sectionProblems(ref: SectionRef, seats: SeatsMap | null): Detected[] {
  const { key, course: c, section: s } = ref;
  const code = c.code;
  const subjects: [Subject] = [sectionSubject(key)];
  const out: Detected[] = [];
  const counts = seatCounts(seats, key);
  const level = seatLevel(counts);
  if (counts && level === "full")
    out.push(
      make(
        "full",
        subjects,
        [section(key), text(" is full")],
        [
          text(
            counts.waitlist === null
              ? "Testudo doesn't show a waitlist for it."
              : counts.waitlist > 0
                ? `${counts.waitlist} waitlisted.`
                : "Nobody is on the waitlist yet.",
          ),
        ],
        code,
        [code],
      ),
    );
  else if (counts && level === "low")
    out.push(
      make(
        "few-seats",
        subjects,
        [
          section(key),
          text(` has ${counts.open} seat${counts.open === 1 ? "" : "s"} left`),
        ],
        [text("It may fill before your registration time.")],
        code,
        [code],
      ),
    );
  if (s.restriction)
    out.push(
      make(
        "restricted",
        subjects,
        [section(key), text(" is restricted")],
        [text(s.restriction)],
        code,
        [code],
      ),
    );
  if (!s.meetings.some((m) => m.timed))
    out.push(
      make(
        "no-set-times",
        subjects,
        s.delivery === "online-async"
          ? [section(key), text(" is online with no set times")]
          : [section(key), text(" has no set times")],
        [
          text(
            s.delivery === "online-async"
              ? "Coursework happens on ELMS."
              : "Testudo lists its times as TBA.",
          ),
        ],
        code,
        [],
      ),
    );
  if (s.instructors.length === 0)
    out.push(
      make(
        "instructor-tba",
        subjects,
        [text("Instructor TBA for "), section(key)],
        [text("Testudo hasn't named an instructor yet.")],
        code,
        [],
      ),
    );
  return out;
}

// ---------- all ----------

/** Every problem in the plan, in emission order within each kind, without fixes. */
export function detectProblems(input: ProblemsInput): Detected[] {
  const { plan, index } = input;
  const placed = placedSections(plan, index);
  const byKey = new Map(placed.map((r) => [r.key, r]));
  const diffs = diffPlanAgainstCatalog(
    plan,
    index,
    input.changes,
    input.pendingDepts,
  );

  const catalogProblems: Detected[] = diffs.map((d) => {
    const subjects: [Subject] = [sectionSubject(d.key)];
    if (d.kind === "cancelled")
      return make(
        "cancelled",
        subjects,
        [section(d.key), text(" was cancelled")],
        [text("It's no longer in the Schedule of Classes.")],
        d.courseCode,
        [d.courseCode],
      );
    return {
      ...make(
        "changed",
        subjects,
        [section(d.key), text(" changed since you added it")],
        snapshotChangeParts(d.before, d.after, d.parts),
        d.courseCode,
        [],
      ),
      presetFix: {
        kind: "accept-change",
        sectionKey: d.key,
        label:
          d.parts.includes("meetings") || d.parts.includes("dates")
            ? "Keep new times"
            : "Keep changes",
      },
    };
  });

  const travel = connectionProblems(
    planConnections(placed, input.travel, input.campus),
    byKey,
  );
  const perSection = placed.flatMap((r) => sectionProblems(r, input.seats));
  const all = [
    ...travel,
    ...catalogProblems,
    ...overlapProblems(placed, input.blocks),
    ...perSection,
  ];
  // Stable within a kind; kinds in the schema's order.
  const kindOrder = Object.keys(PROBLEM_SEVERITY);
  return all
    .map((p, i) => ({ p, i }))
    .sort(
      (x, y) =>
        kindOrder.indexOf(x.p.kind) - kindOrder.indexOf(y.p.kind) || x.i - y.i,
    )
    .map(({ p }) => p);
}
