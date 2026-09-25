// Derives the real-data half of the mock catalog (src/fixtures/mock/derived/)
// from the saved Testudo pages in src/ingest/__fixtures__/soc, so titles,
// descriptions, gen-eds, meeting times and buildings are real, not hand-typed.
// Instructor names are replaced with invented ones: the mock pairs them with
// invented ratings and reviews, which must never be attached to real people.
//
// This is a fixture generator, not the ingest parser (that's M2's streaming
// htmlparser2 adapter). Run `pnpm tsx scripts/derive-mock-catalog.ts`, then
// `pnpm fix` to format the output.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Window } from "happy-dom";
import {
  type Course,
  CourseSchema,
  DAYS,
  type Day,
  type Delivery,
  type GenEdGroup,
  type Meeting,
  type MeetingKind,
  type Section,
} from "../src/core/schema";
import { restrictionOf } from "../src/ingest/soc/normalize";
import { isMain, ROOT } from "./lib/source-files";

const SOC = path.join(ROOT, "src/ingest/__fixtures__/soc");
const PLANETTERP = path.join(ROOT, "src/ingest/__fixtures__/planetterp");
const BUILDINGS = path.join(ROOT, "src/ingest/__fixtures__/buildings");
const GIS = path.join(ROOT, "src/ingest/__fixtures__/gis");
/** When the recon captured the GIS responses. */
const GIS_FETCHED_AT = "2026-09-25T07:45:00.000Z";
const OUT = path.join(ROOT, "src/fixtures/mock/derived");

/** Which saved pages feed which mock term. */
const SOURCES: { termId: string; depts: string[] }[] = [
  {
    termId: "202701",
    depts: ["AAAS", "AGNR", "ANTH", "ARMY", "BUSI", "CMSC", "GEOL", "IDEA"],
  },
  { termId: "202605", depts: ["CMSC"] },
];

/** A deterministic pool of invented names (about 1,600 combinations). */
const FIRST = [
  "Ada",
  "Amara",
  "Ben",
  "Carmen",
  "Dario",
  "Elena",
  "Farid",
  "Grace",
  "Hana",
  "Ivan",
  "Jada",
  "Kofi",
  "Lena",
  "Malik",
  "Nadia",
  "Omar",
  "Priya",
  "Quinn",
  "Rosa",
  "Sam",
  "Tariq",
  "Uma",
  "Victor",
  "Wren",
  "Xavier",
  "Yara",
  "Zane",
  "Beatriz",
  "Chen",
  "Dmitri",
  "Esi",
  "Felix",
  "Gita",
  "Hugo",
  "Iris",
  "Jonah",
  "Keiko",
  "Luca",
  "Mira",
  "Nils",
];
const LAST = [
  "Abernathy",
  "Brandt",
  "Castellano",
  "Delacroix",
  "Eriksen",
  "Fairbanks",
  "Galloway",
  "Hollis",
  "Ibarra",
  "Jansen",
  "Kowalczyk",
  "Lindgren",
  "Marchetti",
  "Nakamura",
  "Okonkwo",
  "Pellegrino",
  "Quintero",
  "Rasmussen",
  "Sandoval",
  "Thornbury",
  "Underhill",
  "Varga",
  "Whitlock",
  "Yamada",
  "Zielinski",
  "Ashdown",
  "Beaumont",
  "Calloway",
  "Draper",
  "Ellery",
  "Fontaine",
  "Greaves",
  "Halloran",
  "Ingram",
  "Jessop",
  "Kincaid",
  "Lockhart",
  "Merriweather",
  "Norcross",
  "Oyelaran",
];

export function inventedName(index: number): string {
  // A stride coprime with both list lengths spreads neighbors apart.
  const n = (index * 37) % (FIRST.length * LAST.length);
  return `${FIRST[n % FIRST.length]} ${LAST[Math.floor(n / FIRST.length)]}`;
}

type Doc = ReturnType<InstanceType<typeof Window>["document"]["cloneNode"]> &
  Document;

function parse(html: string): Document {
  const window = new Window();
  return new window.DOMParser().parseFromString(
    html,
    "text/html",
  ) as unknown as Doc;
}

const clean = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

const text = (root: ParentNode, selector: string): string =>
  clean(root.querySelector(selector)?.textContent);

function parseTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2})(am|pm)$/i.exec(s);
  if (!m) throw new Error(`bad time "${s}"`);
  const h = Number(m[1]) % 12;
  return (m[3]?.toLowerCase() === "pm" ? h + 12 : h) * 60 + Number(m[2]);
}

function parseDays(s: string): Day[] {
  const tokens: string[] = s.match(/Tu|Th|Sa|Su|M|W|F/g) ?? [];
  return DAYS.filter((d) => tokens.includes(d));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseDate(s: string): string {
  const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(clean(s));
  const month = m ? MONTHS.indexOf(m[1] ?? "") + 1 : 0;
  if (!m || month === 0) throw new Error(`bad date "${s}"`);
  return `${m[3]}-${String(month).padStart(2, "0")}-${(m[2] ?? "").padStart(2, "0")}`;
}

const nullable = (s: string): string | null => (s === "" ? null : s);
const CODE = /[A-Z]{4}\d{3}[A-Z]?/g;

function parseGenEds(course: Element): GenEdGroup[] {
  const container = course.querySelector(".gen-ed-codes-group > div");
  if (!container) return [];
  const groups: GenEdGroup[] = [];
  let current: GenEdGroup = [];
  let sawOr = false;
  for (const node of Array.from(container.childNodes)) {
    const el = node as Element;
    if (el.classList?.contains("course-subcategory")) {
      const code = text(el, "a");
      const condition = clean(el.textContent)
        .slice(code.length)
        .trim()
        .replace(/^\((.*)\)$/, "$1");
      if (current.length > 0 && !sawOr) {
        groups.push(current);
        current = [];
      }
      current.push(condition ? { code, condition } : { code });
      sawOr = false;
    } else if (node.nodeType === 3 && /\bor\b/.test(node.textContent ?? "")) {
      sawOr = true;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

type Texts = Pick<
  Course,
  | "description"
  | "prerequisite"
  | "corequisite"
  | "restriction"
  | "otherNotes"
  | "crossListings"
>;

function parseTexts(course: Element, code: string): Texts {
  const out: Texts = {
    description: null,
    prerequisite: null,
    corequisite: null,
    restriction: null,
    otherNotes: [],
    crossListings: [],
  };
  const cross = new Set<string>();
  for (const block of Array.from(
    course.querySelectorAll(".approved-course-text"),
  )) {
    const labeled = Array.from(block.querySelectorAll("div")).filter(
      (d) => d.querySelector(":scope > strong") !== null,
    );
    if (labeled.length === 0) {
      out.description = nullable(clean(block.textContent));
      continue;
    }
    for (const line of labeled) {
      const label = clean(line.querySelector("strong")?.textContent).replace(
        /:$/,
        "",
      );
      const body = clean(line.textContent)
        .slice(clean(line.querySelector("strong")?.textContent).length)
        .trim();
      if (label === "Prerequisite") out.prerequisite = body;
      else if (label === "Corequisite") out.corequisite = body;
      else if (label === "Restriction") out.restriction = body;
      else if (
        /^(Cross-listed with|Jointly offered with|Also offered as)$/.test(label)
      ) {
        for (const c of body.match(CODE) ?? []) if (c !== code) cross.add(c);
      } else if (body) out.otherNotes.push({ label, text: body });
    }
  }
  const free = Array.from(course.querySelectorAll(".course-text"))
    .map((el) => clean(el.textContent))
    .filter(Boolean);
  if (out.description === null && free.length > 0)
    out.description = free.join(" ");
  else for (const t of free) out.otherNotes.push({ label: "Note", text: t });
  out.crossListings = [...cross].sort();
  return out;
}

type RawSeats = [number, number, number | null, number | null];

function parseSeats(section: Element): RawSeats {
  const total = Number(text(section, ".total-seats-count"));
  const open = Number(text(section, ".open-seats-count"));
  let waitlist: number | null = null;
  let holdfile: number | null = null;
  const labels = Array.from(
    section.querySelectorAll(".waitlist .seats-info-label"),
  );
  const counts = Array.from(section.querySelectorAll(".waitlist-count"));
  labels.forEach((label, i) => {
    const n = Number(clean(counts[i]?.textContent));
    if (/Waitlist/.test(label.textContent ?? "")) waitlist = n;
    else if (/Holdfile/.test(label.textContent ?? "")) holdfile = n;
  });
  return [open, total, waitlist, holdfile];
}

const KINDS: Record<string, MeetingKind> = {
  "": "lecture",
  Discussion: "discussion",
  Lab: "lab",
};

function parseMeetings(section: Element): Meeting[] {
  const meetings: Meeting[] = [];
  for (const row of Array.from(
    section.querySelectorAll(".class-days-container > .row"),
  )) {
    if (row.querySelector(".class-message")) continue;
    const kind = KINDS[text(row, ".class-type")] ?? "other";
    const rawBuilding = text(row, ".building-code");
    const rawRoom = text(row, ".class-room");
    const online = rawRoom === "ONLINE";
    const building =
      online || rawBuilding === "" || rawBuilding === "TBA"
        ? null
        : rawBuilding;
    const room = online || building === null ? null : nullable(rawRoom);
    const days = text(row, ".section-days");
    if (row.querySelector(".elms-class-message") || days === "TBA" || !days) {
      meetings.push({ timed: false, kind, building, room, online });
      continue;
    }
    meetings.push({
      timed: true,
      days: parseDays(days),
      start: parseTime(text(row, ".class-start-time")),
      end: parseTime(text(row, ".class-end-time")),
      kind,
      building,
      room,
      online,
    });
  }
  return meetings;
}

function deliveryOf(section: Element, meetings: Meeting[]): Delivery {
  if (section.classList.contains("delivery-blended")) return "blended";
  if (section.classList.contains("delivery-online"))
    return meetings.some((m) => m.timed) ? "online-sync" : "online-async";
  return "f2f";
}

type RawSection = { section: Section; realInstructors: string[] };

function parseSections(html: string): Map<string, RawSection[]> {
  const doc = parse(html);
  const byCourse = new Map<string, RawSection[]>();
  for (const block of Array.from(doc.querySelectorAll("div.course-sections"))) {
    const list: RawSection[] = [];
    for (const el of Array.from(block.querySelectorAll("div.section"))) {
      const code = clean(
        el.querySelector("input[name=sectionId]")?.getAttribute("value"),
      );
      const realInstructors = Array.from(
        el.querySelectorAll(".section-instructor"),
      )
        .map((i) => clean(i.textContent))
        .filter((n) => n !== "Instructor: TBA");
      const meetings = parseMeetings(el);
      const notes = nullable(
        Array.from(el.querySelectorAll(".section-text"))
          .map((t) => clean(t.textContent))
          .filter(Boolean)
          .join(" "),
      );
      const restriction = restrictionOf(notes);
      const start = text(el, ".section-start-date");
      const end = text(el, ".section-end-date");
      list.push({
        realInstructors,
        section: {
          code,
          instructors: realInstructors,
          delivery: deliveryOf(el, meetings),
          meetings,
          ...(start && end
            ? { dates: { start: parseDate(start), end: parseDate(end) } }
            : {}),
          notes,
          restriction,
        },
      });
      seatsBySection.set(`${block.id}-${code}`, parseSeats(el));
    }
    list.sort((a, b) => (a.section.code < b.section.code ? -1 : 1));
    byCourse.set(block.id, list);
  }
  return byCourse;
}

const seatsBySection = new Map<string, RawSeats>();

function parseDeptPage(html: string, sections: Map<string, RawSection[]>) {
  const doc = parse(html);
  const courses: { course: Course; real: RawSection[] }[] = [];
  for (const el of Array.from(doc.querySelectorAll("div.course"))) {
    const code = el.id;
    const min = Number(text(el, ".course-min-credits"));
    const maxText = text(el, ".course-max-credits");
    const perm = text(el, ".perm-req-message").replace(/^\((.*)\)$/, "$1");
    const real = sections.get(code) ?? [];
    courses.push({
      real,
      course: {
        code,
        title: text(el, ".course-title"),
        credits: { min, max: maxText ? Number(maxText) : min },
        genEds: parseGenEds(el),
        gradingMethods: text(el, ".grading-method")
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
        permission: nullable(perm),
        ...parseTexts(el, code),
        ...(el.querySelector(".individual-instruction-message")
          ? { contactDepartment: true as const }
          : {}),
        sections: real.map((r) => r.section),
      },
    });
  }
  return courses;
}

function deptNames(termId: string): Map<string, string> {
  const file = path.join(SOC, termId, "departments.html");
  const names = new Map<string, string>();
  let doc: Document;
  try {
    doc = parse(readFileSync(file, "utf8"));
  } catch {
    return names;
  }
  for (const row of Array.from(doc.querySelectorAll(".course-prefix")))
    names.set(text(row, ".prefix-abbrev"), text(row, ".prefix-name"));
  return names;
}

/**
 * ENGL101 has only a sections page saved (the > 12 sections case). Its course
 * fields come from PlanetTerp's course-ENGL101.json; the gen-ed is FSAW.
 */
function engl101(): { course: Course; real: RawSection[] } {
  const pt = JSON.parse(
    readFileSync(path.join(PLANETTERP, "course-ENGL101.json"), "utf8"),
  ) as { title: string; credits: number; description: string };
  const lines = pt.description.split("\n");
  const note = lines.find((l) => l.startsWith("<b>")) ?? "";
  const real =
    parseSections(
      readFileSync(path.join(SOC, "202701/sections/ENGL101.html"), "utf8"),
    ).get("ENGL101") ?? [];
  return {
    real,
    course: {
      code: "ENGL101",
      title: pt.title,
      credits: { min: pt.credits, max: pt.credits },
      genEds: [[{ code: "FSAW" }]],
      gradingMethods: ["Reg"],
      permission: null,
      description: clean(lines.find((l) => !/^<[bi]>/.test(l))),
      prerequisite: null,
      corequisite: null,
      restriction: null,
      otherNotes: [
        {
          label: "Additional information",
          text: clean(
            note
              .replace(/<[^>]+>/g, "")
              .replace(/^Additional information:/, ""),
          ),
        },
      ],
      crossListings: [],
      sections: real.map((r) => r.section),
    },
  };
}

/** Real CMSC351 grade totals, summed over every semester and instructor. */
function cmsc351Grades() {
  const rows = JSON.parse(
    readFileSync(path.join(PLANETTERP, "grades-CMSC351.json"), "utf8"),
  ) as Record<string, string | number>[];
  const keys = [
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "F",
    "W",
    "Other",
  ];
  const counts = keys.map((k) =>
    rows.reduce((n, r) => n + Number(r[k] ?? 0), 0),
  );
  const semesters = [...new Set(rows.map((r) => String(r.semester)))].sort();
  return {
    counts,
    semesters: semesters.length,
    latestTermId: semesters[semesters.length - 1],
  };
}

type CodeMap = Record<
  string,
  { number: string; arcgisName: string; lon: number; lat: number }
>;

type GisRoute = {
  attributes: { Name: string; Total_Length: number };
  geometry?: { paths: [number, number][][] };
};

const readJson = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(path.join(dir, file), "utf8"));

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Buildings, off-campus codes, and every real distance and route polyline the
 * recon captured (UMD GIS, outSR 4326). Distances for other pairs are
 * estimated in src/fixtures, not here.
 */
function deriveGeo() {
  const codeMap = readJson(BUILDINGS, "code-map.json") as CodeMap;
  const unresolved = readJson(BUILDINGS, "code-map-unresolved.json") as Record<
    string,
    { why: string }
  >;
  const byNumber = new Map<string, string>();
  const buildings = Object.entries(codeMap)
    .map(([code, b]) => {
      if (!byNumber.has(b.number)) byNumber.set(b.number, code);
      return {
        code,
        number: b.number,
        name: b.arcgisName,
        lat: round6(b.lat),
        lng: round6(b.lon),
      };
    })
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  const offCampus = Object.entries(unresolved)
    .filter(([, v]) => v.why.startsWith("off campus"))
    .map(([code, v]) => ({
      code,
      name: v.why
        .replace(/^off campus: /, "")
        .replace(/ \(.*$/, "")
        .replace(/;.*$/, ""),
    }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));

  const distances: {
    from: string;
    to: string;
    mode: string;
    feet: number | null;
  }[] = [];
  const geometries: {
    from: string;
    to: string;
    mode: string;
    lengthFeet: number;
    coordinates: [number, number][];
  }[] = [];
  const add = (from: string, to: string, mode: string, route: GisRoute) => {
    const feet = Math.round(route.attributes.Total_Length);
    distances.push({ from, to, mode, feet });
    const path0 = route.geometry?.paths[0];
    if (path0)
      geometries.push({
        from,
        to,
        mode,
        lengthFeet: feet,
        coordinates: path0.map(([x, y]) => [round6(x), round6(y)]),
      });
  };
  const code = (n: string) => {
    const c = byNumber.get(n);
    if (!c) throw new Error(`no code for building ${n}`);
    return c;
  };
  // Closest-facility solves: several entrance-to-entrance routes; keep the shortest.
  for (const [a, b] of [
    ["432", "406"],
    ["039", "088"],
    ["085", "084"],
  ] as const) {
    for (const mode of ["standard", "accessible"]) {
      const res = readJson(GIS, `cf-${a}-${b}-${mode}.json`) as {
        routes?: { features: GisRoute[] };
        error?: unknown;
      };
      const best = (res.routes?.features ?? []).reduce<GisRoute | null>(
        (m, r) =>
          m && m.attributes.Total_Length <= r.attributes.Total_Length ? m : r,
        null,
      );
      if (best) add(code(a), code(b), mode, best);
      else if (res.error)
        distances.push({ from: code(a), to: code(b), mode, feet: null });
    }
  }
  // The batched Route solve: VMH to 20 buildings, standard, with geometry.
  const multi = readJson(GIS, "route-multi-039-to-20-standard.json") as {
    routes: { features: GisRoute[] };
  };
  for (const r of multi.routes.features) {
    const [a, b] = r.attributes.Name.split("-");
    if (!a || !b) continue;
    const from = code(a);
    const to = code(b);
    if (
      !distances.some(
        (d) => d.from === from && d.to === to && d.mode === "standard",
      )
    )
      add(from, to, "standard", r);
  }
  return {
    fetchedAt: GIS_FETCHED_AT,
    buildings,
    offCampus,
    distances,
    geometries,
  };
}

export function derive(): void {
  const parsed = SOURCES.map(({ termId, depts }) => {
    const names = deptNames(termId);
    const departments = depts.map((dept) => {
      const html = (kind: string) =>
        readFileSync(path.join(SOC, termId, kind, `${dept}.html`), "utf8");
      return {
        code: dept,
        name: names.get(dept) ?? dept,
        courses: parseDeptPage(html("dept"), parseSections(html("sections"))),
      };
    });
    if (termId === "202701")
      departments.push({
        code: "ENGL",
        name: names.get("ENGL") ?? "English",
        courses: [engl101()],
      });
    departments.sort((a, b) => (a.code < b.code ? -1 : 1));
    return { termId, departments };
  });

  // One invented name per real name, stable across terms: sorted real names
  // get pool slots in order.
  const real = new Set<string>();
  for (const t of parsed)
    for (const d of t.departments)
      for (const c of d.courses)
        for (const s of c.real) for (const n of s.realInstructors) real.add(n);
  const alias = new Map([...real].sort().map((n, i) => [n, inventedName(i)]));

  mkdirSync(OUT, { recursive: true });
  for (const t of parsed) {
    const seats: Record<string, RawSeats> = {};
    const departments = t.departments.map((d) => ({
      code: d.code,
      name: d.name,
      courses: d.courses.map(({ course }) => {
        const out = CourseSchema.parse({
          ...course,
          sections: course.sections.map((s) => ({
            ...s,
            instructors: s.instructors.map((n) => alias.get(n) ?? n),
          })),
        });
        for (const s of out.sections) {
          const raw = seatsBySection.get(`${out.code}-${s.code}`);
          if (raw) seats[`${out.code}-${s.code}`] = raw;
        }
        return out;
      }),
    }));
    const file = path.join(OUT, `soc-${t.termId}.json`);
    writeFileSync(
      file,
      `${JSON.stringify({ termId: t.termId, departments, seats }, null, 2)}\n`,
    );
    const courseCount = departments.reduce((n, d) => n + d.courses.length, 0);
    console.log(`${path.relative(ROOT, file)}: ${courseCount} courses`);
  }
  const geo = path.join(OUT, "geo.json");
  writeFileSync(geo, `${JSON.stringify(deriveGeo(), null, 2)}\n`);
  console.log(path.relative(ROOT, geo));
  const grades = path.join(OUT, "planetterp-grades.json");
  writeFileSync(
    grades,
    `${JSON.stringify({ CMSC351: cmsc351Grades() }, null, 2)}\n`,
  );
  console.log(path.relative(ROOT, grades));
}

if (isMain(import.meta.url)) derive();
