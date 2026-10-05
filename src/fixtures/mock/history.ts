// The mock instructor history's older terms (DATA.md §3.5), so offering
// patterns have years to read: records for Fall 2018 to Spring 2025 and Fall
// 2026, as the umd.io backfill and the history job would write them. Fall
// 2025 and Spring 2026 are left out on purpose: production's history had no
// record of them either when the patterns were measured, and a term not on
// record must read as unknown, not "not offered". Spring 2027 and Summer
// 2026 come from the mock catalog itself (data-source.ts).
import type { Course, TermId } from "~/core/schema";
import type { HistoryCourse } from "~/core/schema/history";
import { mockCatalog } from "./catalog";

/**
 * Real records from the production history of 30 September 2026: Fall 2018
 * to Spring 2027, fall then spring each year, `1` offered, `0` not, `-` not
 * on record. Only the first 14 (to Spring 2025) and Fall 2026 are used.
 */
const REAL: Record<string, string> = {
  CMSC401: "00000001010101--01", // spring only since 2022
  CMSC416: "00000010111110--11", // every fall, some springs
  CMSC427: "10101010100101--01", // moved from fall to spring in 2023
  CMSC452: "01010101000101--01", // spring only
  CMSC454: "00010001101101--01", // mostly spring
  CMSC457: "01010101011101--01", // spring only, one fall
  CMSC477: "00000000010101--01", // spring only since 2023
  GEOL204: "01010101010101--01", // spring only, a GenEd
  CMSC498A: "00000000100000--01", // a topic, twice: rare
};

/**
 * Real courses Spring 2027 doesn't have, with their real records: the
 * search shows them greyed, with when they run (Fall 2026 is their last).
 */
const NOT_THIS_TERM: Record<string, { title: string; strip: string }> = {
  CMSC471: {
    title: "Introduction to Data Visualization",
    strip: "00000001010011--10",
  },
  CMSC473: {
    title: "Capstone in Machine Learning",
    strip: "00000010101010--10",
  },
  CMSC474: {
    title: "Introduction to Computational Game Theory",
    strip: "01000010101000--10",
  },
  CCJS453: {
    title: "White Collar and Organized Crime",
    strip: "10001000100010--10",
  },
};
/** The CS core and most of the department: every fall and spring. */
const EVERY = "11111111111111--11";

const STRIP_TERMS: TermId[] = [];
for (let year = 2018; year <= 2026; year++)
  STRIP_TERMS.push(`${year}08`, `${year + 1}01`);

/** Which courses get a history: CMSC's undergraduate courses, and the real records. */
function hasHistory(code: string): boolean {
  return code in REAL || /^CMSC[1-4]\d\d$/.test(code);
}

function record(
  course: Pick<Course, "code" | "title" | "credits">,
  source: HistoryCourse["source"],
) {
  return {
    code: course.code,
    title: course.title,
    credits: source === "umdio" ? null : course.credits,
    source,
    instructors: [],
    sections: [],
  } satisfies HistoryCourse;
}

/** Each older term's records, by term. */
export function mockHistoryBackfill(): Map<TermId, HistoryCourse[]> {
  const latest = Object.values(mockCatalog)
    .flat()
    .flatMap((chunk) => chunk.courses)
    .filter((c) => hasHistory(c.code));
  const unique = new Map<string, Pick<Course, "code" | "title" | "credits">>(
    latest.map((c) => [c.code, c]),
  );
  for (const [code, { title }] of Object.entries(NOT_THIS_TERM))
    unique.set(code, { code, title, credits: { min: 3, max: 3 } });
  const stripOf = (code: string) =>
    REAL[code] ?? NOT_THIS_TERM[code]?.strip ?? EVERY;
  const out = new Map<TermId, HistoryCourse[]>();
  STRIP_TERMS.forEach((termId, i) => {
    // Spring 2027 is the mock catalog's own; the gap stays a gap.
    if (termId >= "202701" || (termId > "202501" && termId < "202608")) return;
    const list: HistoryCourse[] = [];
    for (const course of unique.values()) {
      if (stripOf(course.code)[i] !== "1") continue;
      list.push(record(course, termId === "202608" ? "terpsicle" : "umdio"));
    }
    out.set(
      termId,
      list.sort((a, b) => (a.code < b.code ? -1 : 1)),
    );
  });
  return out;
}
