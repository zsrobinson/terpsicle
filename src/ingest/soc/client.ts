import { type HttpClient, streamText } from "../http";
import {
  createDepartmentParser,
  type RawDepartmentPage,
} from "./parse-department";
import {
  parseDepartmentList,
  parseTermDropdown,
  type RawDepartment,
  type RawTerm,
} from "./parse-index";
import { createSectionsParser, type RawCourseSections } from "./parse-sections";

// Fetching SOC pages. Every page is parsed as it streams in.

export const SOC_ORIGIN = "https://app.testudo.umd.edu";

/**
 * Apache rejects request lines over ~8 KB with 414 (RESEARCH.md §5.1.3); stay
 * well under it.
 */
const MAX_COURSE_IDS_CHARS = 4000;

export async function fetchTerms(http: HttpClient): Promise<RawTerm[]> {
  const terms = parseTermDropdown(await http.text(`${SOC_ORIGIN}/soc/`));
  if (terms.length === 0) {
    throw new Error(
      "Testudo's term dropdown (select#term-id-input) listed no terms; the page layout may have changed.",
    );
  }
  return terms;
}

export async function fetchDepartments(
  http: HttpClient,
  termId: string,
): Promise<RawDepartment[]> {
  return parseDepartmentList(await http.text(`${SOC_ORIGIN}/soc/${termId}`));
}

export async function fetchDepartmentPage(
  http: HttpClient,
  termId: string,
  dept: string,
): Promise<RawDepartmentPage> {
  const response = await http.get(`${SOC_ORIGIN}/soc/${termId}/${dept}`);
  const parser = createDepartmentParser();
  await streamText(response, (chunk) => parser.write(chunk));
  return parser.end();
}

/** Splits course ids into request-sized batches. */
export function courseIdBatches(courseIds: readonly string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const id of courseIds) {
    if (current.length > 0 && length + id.length + 1 > MAX_COURSE_IDS_CHARS) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(id);
    length += id.length + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Sections for the given courses; `onCourse` gets each as it's parsed. */
export async function fetchSections(
  http: HttpClient,
  termId: string,
  courseIds: readonly string[],
  onCourse: (course: RawCourseSections) => void,
): Promise<void> {
  for (const batch of courseIdBatches(courseIds)) {
    const response = await http.get(
      `${SOC_ORIGIN}/soc/${termId}/sections?courseIds=${batch.join(",")}`,
    );
    const parser = createSectionsParser(onCourse);
    await streamText(response, (chunk) => parser.write(chunk));
    parser.end();
  }
}

/** The building popup: `/soc/buildings/{CODE}%20{ROOM}` → building number and name. */
export async function fetchBuildingPopup(
  http: HttpClient,
  code: string,
  room: string,
): Promise<{ number: string; name: string } | null> {
  const url = `${SOC_ORIGIN}/soc/buildings/${encodeURIComponent(`${code} ${room}`)}`;
  let html: string;
  try {
    html = await http.text(url);
  } catch {
    // Unknown codes answer 404 or 500.
    return null;
  }
  return parseBuildingPopup(html);
}

export function parseBuildingPopup(
  html: string,
): { number: string; name: string } | null {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const number =
    /Bldg Number:<\/span>\s*<span class="code">\s*([^<\s]+)\s*<\/span>/.exec(
      clean,
    )?.[1];
  const name = /<div class="building-name">\s*<a[^>]*>([^<]*)<\/a>/.exec(
    clean,
  )?.[1];
  if (!number) return null;
  return { number: number.trim(), name: (name ?? "").trim() };
}
