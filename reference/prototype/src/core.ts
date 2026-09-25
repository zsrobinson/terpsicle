// PROTOTYPE logic. Pure functions, no DOM: the shape we'd lift into packages/core.
import {
  BUILDINGS, COURSES, PROFS, SECTION_BY_ID, sectionsOf,
  type Block, type Course, type Day, type Meeting, type Section,
} from "./data";

// ---------- time ----------
export const fmt = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
export const fmtRange = (a: number, b: number) => `${fmt(a)}–${fmt(b)}`;
export const daysLabel = (days: Day[]) => days.map((d) => ["M", "Tu", "W", "Th", "F"][d]).join("");
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ---------- travel time ----------
// Real version: precomputed distances over UMD's campus path network (standard + step-free).
// Here: straight-line distance × a detour factor, so the numbers are plausible but made up.
export type TravelSettings = { mph: number; stepFree: boolean; buffer: number };
export const DEFAULT_TRAVEL: TravelSettings = { mph: 3, stepFree: false, buffer: 0 };
export const PACES = [
  { mph: 2.5, label: "Slower", hint: "2.5 mph" },
  { mph: 3, label: "Typical", hint: "3.0 mph" },
  { mph: 3.5, label: "Faster", hint: "3.5 mph" },
];

export function distanceFeet(a?: string, b?: string, stepFree = false): number | null {
  if (!a || !b) return null;
  if (a === b) return 0;
  const A = BUILDINGS[a], B = BUILDINGS[b];
  if (!A || !B) return null;
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (B.lat - A.lat) * toR, dLng = (B.lng - A.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * toR) * Math.cos(B.lat * toR) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(h)) * (stepFree ? 1.5 : 1.35);
  return Math.round((meters * 3.281) / 10) * 10;
}
export const feetPerMinute = (mph: number) => mph * 88;
export const travelMinutes = (ft: number, t: TravelSettings) => Math.max(1, Math.round(ft / feetPerMinute(t.mph))) + t.buffer;
export const fmtFeet = (ft: number) => (ft >= 2640 ? `${(ft / 5280).toFixed(2)} mi` : `${ft.toLocaleString()} ft`);

// ---------- schedule items ----------
export type Item = {
  key: string;
  kind: "section" | "block";
  sectionId?: string;
  course?: Course;
  section?: Section;
  block?: Block;
  meeting?: Meeting;
  day: Day;
  start: number;
  end: number;
  bldg?: string;
  room?: string;
  label: string;
};

export function itemsFor(sectionIds: string[], blocks: Block[] = []): Item[] {
  const out: Item[] = [];
  for (const id of sectionIds) {
    const s = SECTION_BY_ID[id];
    if (!s) continue;
    s.meetings.forEach((m, mi) =>
      m.days.forEach((d) =>
        out.push({ key: `${id}:${mi}:${d}`, kind: "section", sectionId: id, section: s, course: COURSES[s.course], meeting: m, day: d, start: m.start, end: m.end, bldg: m.bldg, room: m.room, label: s.course }),
      ),
    );
  }
  for (const b of blocks)
    b.days.forEach((d) => out.push({ key: `${b.id}:${d}`, kind: "block", block: b, day: d, start: b.start, end: b.end, bldg: b.bldg, label: b.label }));
  return out;
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Column layout for overlapping items in one day. */
export function layoutDay(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { item: Item; col: number; cols: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => (p.cols = cols));
    cluster = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((p) => overlaps(p.item, item)).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col++;
    const p = { item, col, cols: 1 };
    cluster.push(p); placed.push(p);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

// ---------- connections (back-to-back classes in different buildings) ----------
export type Leg = {
  key: string; day: Day; from: Item; to: Item; gap: number; feet: number; minutes: number;
  status: "ok" | "tight" | "short";
};
export const LEG_WORDS = { ok: "Plenty of time", tight: "Tight", short: "Not enough time" } as const;

export function legsFor(items: Item[], t: TravelSettings = DEFAULT_TRAVEL): Leg[] {
  const legs: Leg[] = [];
  for (let d = 0 as Day; d < 5; d = (d + 1) as Day) {
    const day = items.filter((i) => i.day === d && i.bldg).sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < day.length; i++) {
      const a = day[i], b = day[i + 1];
      const gap = b.start - a.end;
      if (gap < 0 || gap > 45) continue;
      const feet = distanceFeet(a.bldg, b.bldg, t.stepFree);
      if (feet == null || feet === 0) continue;
      const minutes = travelMinutes(feet, t);
      const status = minutes > gap ? "short" : minutes >= gap * 0.75 ? "tight" : "ok";
      legs.push({ key: `${a.key}>${b.key}`, day: d, from: a, to: b, gap, feet, minutes, status });
    }
  }
  return legs;
}

// ---------- problems ----------
export type Problem = {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  course?: string;
  legKey?: string;
  fix?: { label: string; swapTo: string };
};

export function problems(sectionIds: string[], blocks: Block[], t: TravelSettings): Problem[] {
  const out: Problem[] = [];
  const items = itemsFor(sectionIds, blocks);
  const seen = new Set<string>();
  for (const a of items)
    for (const b of items) {
      if (a.key >= b.key || a.day !== b.day || !overlaps(a, b)) continue;
      const k = [a.label, b.label].sort().join(" & ");
      if (seen.has(k)) continue;
      seen.add(k);
      const sid = a.sectionId ?? b.sectionId;
      out.push({ id: "ov" + k, severity: "error", title: `${a.label} and ${b.label} overlap`, detail: `${DAY_NAMES[a.day]} ${fmtRange(Math.max(a.start, b.start), Math.min(a.end, b.end))}`, course: sid && SECTION_BY_ID[sid].course, fix: sid ? bestSwap(sectionIds, blocks, sid, t) : undefined });
    }
  const legs = legsFor(items, t).filter((l) => l.status !== "ok");
  const byPair = new Map<string, Leg[]>();
  for (const l of legs) byPair.set(`${l.from.label}→${l.to.label}`, [...(byPair.get(`${l.from.label}→${l.to.label}`) ?? []), l]);
  for (const [k, ls] of byPair) {
    const l = ls[0];
    const sid = l.to.sectionId ?? l.from.sectionId;
    out.push({
      id: "leg" + k,
      severity: l.status === "short" ? "error" : "warning",
      title: l.status === "short" ? `Not enough time to get from ${l.from.label} to ${l.to.label}` : `Tight connection from ${l.from.label} to ${l.to.label}`,
      detail: `${l.minutes} min needed, ${l.gap} min between classes · ${ls.map((x) => DAY_NAMES[x.day]).join(", ")}`,
      course: sid && SECTION_BY_ID[sid].course,
      legKey: l.key,
      fix: sid ? bestSwap(sectionIds, blocks, sid, t) : undefined,
    });
  }
  for (const id of sectionIds) {
    const s = SECTION_BY_ID[id];
    if (!s) continue;
    if (s.seats.open === 0)
      out.push({ id: "full" + id, severity: "warning", title: `${s.course} ${s.code} is full`, detail: `${s.seats.wait} on the waitlist`, course: s.course, fix: bestSwap(sectionIds, blocks, id, t) });
    else if (s.seats.open <= 3)
      out.push({ id: "low" + id, severity: "warning", title: `${s.course} ${s.code} has ${s.seats.open} seat${s.seats.open === 1 ? "" : "s"} left`, detail: "It may fill before your registration time.", course: s.course });
    if (s.note && /restricted/i.test(s.note))
      out.push({ id: "res" + id, severity: "warning", title: `${s.course} ${s.code} is restricted`, detail: s.note, course: s.course });
    if (s.delivery === "online-async")
      out.push({ id: "async" + id, severity: "info", title: `${s.course} ${s.code} is online with no set times`, detail: "Coursework happens on ELMS.", course: s.course });
  }
  const exams = new Map<string, string[]>();
  for (const id of sectionIds) {
    const c = COURSES[SECTION_BY_ID[id]?.course];
    if (c?.exam) exams.set(c.exam, [...(exams.get(c.exam) ?? []), c.code]);
  }
  for (const [slot, cs] of exams)
    if (cs.length > 1) out.push({ id: "exam" + slot, severity: "error", title: `${cs.join(" and ")} finals are at the same time`, detail: `${slot}. You'd need to request a make-up exam.`, course: cs[0] });
  const order = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const credits = (ids: string[]) => ids.reduce((n, id) => n + (COURSES[SECTION_BY_ID[id]?.course]?.credits ?? 0), 0);

function bestSwap(ids: string[], blocks: Block[], sid: string, t: TravelSettings) {
  const s = SECTION_BY_ID[sid];
  const base = hardCount(ids, blocks, t);
  let best: { id: string; n: number } | null = null;
  for (const alt of sectionsOf(s.course)) {
    if (alt.id === sid || alt.seats.open === 0) continue;
    const n = hardCount(ids.map((x) => (x === sid ? alt.id : x)), blocks, t);
    if (n < base && (!best || n < best.n)) best = { id: alt.id, n };
  }
  return best ? { label: `Switch to ${best.id.split("-")[1]}`, swapTo: best.id } : undefined;
}
function hardCount(ids: string[], blocks: Block[], t: TravelSettings) {
  const items = itemsFor(ids, blocks);
  let n = 0;
  for (const a of items) for (const b of items) if (a.key < b.key && a.day === b.day && overlaps(a, b)) n += 2;
  return n + legsFor(items, t).reduce((k, l) => k + (l.status === "short" ? 2 : l.status === "tight" ? 1 : 0), 0);
}

// ---------- does a section fit my plan? ----------
export type Fit = { kind: "current" | "fits" | "clash" | "short" | "tight" | "none"; label: string };
export function fitOf(sec: Section, ids: string[], blocks: Block[], t: TravelSettings): Fit {
  if (ids.includes(sec.id)) return { kind: "current", label: "In your plan" };
  if (!sec.meetings.length) return { kind: "none", label: "No set times" };
  const others = ids.filter((id) => SECTION_BY_ID[id].course !== sec.course);
  const mine = itemsFor([sec.id]);
  const clash = itemsFor(others, blocks).find((o) => mine.some((m) => m.day === o.day && overlaps(m, o)));
  if (clash) return { kind: "clash", label: `Overlaps ${clash.label}` };
  const legs = legsFor(itemsFor([...others, sec.id], blocks), t).filter((l) => l.from.sectionId === sec.id || l.to.sectionId === sec.id);
  const short = legs.find((l) => l.status === "short");
  if (short) return { kind: "short", label: `Not enough time ${short.to.sectionId === sec.id ? "after" : "before"} ${short.to.sectionId === sec.id ? short.from.label : short.to.label}` };
  const tight = legs.find((l) => l.status === "tight");
  if (tight) return { kind: "tight", label: "Fits, tight connection" };
  return { kind: "fits", label: "Fits" };
}

// ---------- search ----------
export type SearchHit = { course: Course; sections: Section[]; score: number };
export function search(q: string, gened: string[] = []): SearchHit[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out: SearchHit[] = [];
  for (const c of Object.values(COURSES)) {
    const secs = sectionsOf(c.code);
    if (gened.length && !gened.every((g) => c.geneds.includes(g))) continue;
    const profs = secs.flatMap((s) => s.profs).join(" ");
    const hay = `${c.code} ${c.code.slice(0, 4)} ${c.code.slice(4)} ${c.title} ${c.geneds.join(" ")} ${profs}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (c.code.toLowerCase().startsWith(w)) score += 3;
      else if (hay.includes(w)) score += 1;
      else { score = -1; break; }
    }
    if (score >= 0) out.push({ course: c, sections: secs, score });
  }
  return out.sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code));
}

export const profRating = (s: Section) => {
  const rs = s.profs.map((p) => PROFS[p]?.rating).filter(Boolean) as number[];
  return rs.length ? rs.reduce((a, b) => a + b) / rs.length : null;
};

export const seatWords = (s: Section) => {
  const { open, total, wait } = s.seats;
  if (open === 0) return { text: wait ? `Full · ${wait} waitlisted` : "Full", tone: "err" as const };
  if (open <= 3) return { text: `${open} left`, tone: "warn" as const };
  return { text: `${open} of ${total} open`, tone: "muted" as const };
};
