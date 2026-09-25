// Plan names: "Plan A", "Plan B", …, "Plan Z", "Plan AA", … and "Copy of X".

/** Max plan name length, matching `PlanNameSchema`. */
export const PLAN_NAME_MAX = 60;

function letters(n: number): string {
  // Spreadsheet-column style: 0 → A, 25 → Z, 26 → AA.
  let s = "";
  let k = n + 1;
  while (k > 0) {
    const r = (k - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    k = Math.floor((k - 1) / 26);
  }
  return s;
}

/** The first "Plan <letters>" not already taken in the term. */
export function nextPlanName(taken: Iterable<string>): string {
  const names = new Set(taken);
  for (let i = 0; ; i++) {
    const name = `Plan ${letters(i)}`;
    if (!names.has(name)) return name;
  }
}

/** "Copy of Plan A", then "Copy of Plan A 2", … trimmed to fit. */
export function copyName(source: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  const base = `Copy of ${source}`;
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? "" : ` ${i}`;
    const name =
      base.slice(0, PLAN_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!names.has(name)) return name;
  }
}

/** A cleaned-up name, or null when nothing's left (the rename is ignored). */
export function cleanPlanName(name: string): string | null {
  const trimmed = name
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PLAN_NAME_MAX)
    .trimEnd();
  return trimmed === "" ? null : trimmed;
}
