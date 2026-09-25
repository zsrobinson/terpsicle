import { COURSE_COLORS, type CourseCode, type CourseColor } from "../schema";

// Course colors (SPEC §3.2–3.3): soft tints from a fixed palette. Core deals
// in palette ids only; the UI maps each id to light and dark theme tokens.
//
// The prototype's tints are oklch at a fixed lightness and chroma with these
// hues: blue 250, green 155, amber 70, violet 305, cyan 200, pink 345,
// lime 110, indigo 280; the schema adds orange (45) and teal (180).

export const COURSE_COLOR_LABELS = {
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  violet: "Violet",
  cyan: "Cyan",
  pink: "Pink",
  lime: "Lime",
  indigo: "Indigo",
  orange: "Orange",
  teal: "Teal",
} as const satisfies Record<CourseColor, string>;

/**
 * Theme token names for a palette color, e.g. `course-blue-bg`. The UI
 * defines each token for both themes and maps it to a Tailwind class.
 */
export type CourseColorTokens = {
  /** Block fill. */
  readonly bg: string;
  /** Block border. */
  readonly border: string;
  /** Text on the fill. */
  readonly fg: string;
  /** The course dot. */
  readonly dot: string;
};

export function courseColorTokens(color: CourseColor): CourseColorTokens {
  const base = `course-${color}`;
  return {
    bg: `${base}-bg`,
    border: `${base}-border`,
    fg: `${base}-fg`,
    dot: `${base}-dot`,
  };
}

/** FNV-1a: a small, stable string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The color a course gets when first added to a plan (DATA §5): the palette
 * color least used by the plan's other courses. Ties start from a spot picked
 * by hashing the course code, so the same course tends to get the same color
 * and neighbors in the code order don't march through the palette together.
 */
export function defaultCourseColor(
  courseCode: CourseCode,
  colorsInPlan: Iterable<CourseColor>,
): CourseColor {
  const uses = new Map<CourseColor, number>();
  for (const c of colorsInPlan) uses.set(c, (uses.get(c) ?? 0) + 1);
  const n = COURSE_COLORS.length;
  const startAt = hash(courseCode) % n;
  let best: CourseColor = COURSE_COLORS[startAt] ?? "blue";
  let bestUses = Number.POSITIVE_INFINITY;
  for (let k = 0; k < n; k++) {
    const color = COURSE_COLORS[(startAt + k) % n] ?? "blue";
    const u = uses.get(color) ?? 0;
    if (u < bestUses) {
      best = color;
      bestUses = u;
    }
  }
  return best;
}

/**
 * A color for every course in a plan: its stored color if it has one, else
 * `defaultCourseColor` against the colors already taken, in plan order. For
 * plans whose courses have no stored color (a shared link, a generated
 * result), so courses still come out distinct instead of whatever their
 * codes hash to, which can collide.
 */
export function resolveCourseColors(
  courseCodes: Iterable<CourseCode>,
  stored: Readonly<Partial<Record<CourseCode, CourseColor>>>,
): Record<CourseCode, CourseColor> {
  const codes = [...new Set(courseCodes)];
  const out: Record<CourseCode, CourseColor> = {};
  const used: CourseColor[] = [];
  for (const code of codes) {
    const color = stored[code];
    if (color) {
      out[code] = color;
      used.push(color);
    }
  }
  for (const code of codes) {
    if (out[code]) continue;
    const color = defaultCourseColor(code, used);
    out[code] = color;
    used.push(color);
  }
  return out;
}
