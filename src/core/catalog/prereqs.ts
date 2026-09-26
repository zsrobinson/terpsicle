import type { CourseCode, Prereqs } from "../schema";

// Testudo's prerequisite sentence → groups of course codes (docs/V3.md §2.8).
// The sentence is free text, so this reads the shape Testudo's sentences
// share and says, with `complete: false`, whenever it met anything else.
//
// Reading: sentences and `;` clauses join left to right, with "and" unless
// the clause starts with "or" ("A; or B and C; or permission of instructor").
// Inside a clause, `and` binds tighter than `or`, commas take the list's own
// conjunction ("A, B, or C"), and "1 course from (A, B)" is a choice. The
// result is turned into groups that all apply (an AND of ORs), so
// "A; or B and C" becomes [[A, B], [A, C]].
//
// Anything that isn't a course ("permission of", "or equivalent", a score, a
// program, "any STAT400-level course") can't be checked, so it never adds a
// requirement and never meets one: "A or permission" still asks for A, and
// "A and permission" asks only for A. It makes the result incomplete.

const CODE = /^([A-Z]{4}\d{3}[A-Z]?)$/;

/** Words that may sit next to a course without changing what it asks for. */
const FILLER =
  /^(?:(?:either|both) )?(?:(?:a |the )?minimum grade (?:of )?[a-d][+-]? (?:in|from)|(?:1|one) course (?:with a minimum grade (?:of )?[a-d][+-]? )?from)?$/;

/** Sentences Testudo appends to the prerequisite that aren't requirements. */
const NOT_A_REQUIREMENT =
  /^(?:cross-listed with|jointly offered with|also offered as|credit (?:will )?(?:be )?only (?:be )?granted for|credit only granted for|formerly|repeatable)\b/i;

/** Past this many groups the reading is too tangled to be useful. */
const MAX_GROUPS = 64;

type Expr =
  | { kind: "course"; code: CourseCode }
  | { kind: "other" }
  | { kind: "and" | "or"; items: Expr[] };

type Op = "and" | "or" | ",";

const OTHER: Expr = { kind: "other" };

interface Reading {
  complete: boolean;
}

/**
 * Reads a prerequisite sentence. No sentence means no prerequisites. Every
 * group needs one of its codes; `complete` is false when the sentence asks
 * for anything the groups don't say.
 */
export function parsePrerequisite(text: string | null): Prereqs {
  const normalized = (text ?? "")
    .replace(/\s+/g, " ")
    // "CMSC 131" → "CMSC131".
    .replace(/\b([A-Z]{4}) (\d{3}[A-Z]?)\b/g, "$1$2")
    .trim();
  if (normalized === "") return { groups: [], complete: true };

  const reading: Reading = { complete: true };
  let expr: Expr | null = null;
  for (const sentence of splitTopLevel(normalized, ".")) {
    const trimmed = sentence.trim().replace(/\.$/, "");
    if (trimmed === "") continue;
    if (NOT_A_REQUIREMENT.test(trimmed)) {
      reading.complete = false;
      continue;
    }
    for (const clause of splitTopLevel(trimmed, ";")) {
      const tokens = tokenize(clause);
      const lead = tokens[0]?.toLowerCase();
      const joiner = lead === "or" || lead === "and/or" ? "or" : "and";
      if (lead === "or" || lead === "and/or" || lead === "and") tokens.shift();
      const next = parseSequence(tokens, reading, false);
      if (!next) continue;
      expr = expr ? join(joiner, [expr, next]) : next;
    }
  }
  const courses = expr ? withoutOthers(expr) : null;
  if (!courses) return { groups: [], complete: false };
  const clauses = conjunctiveForm(courses);
  if (!clauses) return { groups: [], complete: false };
  return { groups: simplify(clauses), complete: reading.complete };
}

/**
 * Splits on `separator` outside parentheses. A "." splits only when a space
 * follows, so "e.g." inside a clause stays put.
 */
function splitTopLevel(text: string, separator: "." | ";"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (
      ch === separator &&
      depth === 0 &&
      (separator === ";" || text[i + 1] === " " || i === text.length - 1)
    ) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function tokenize(clause: string): string[] {
  return clause.match(/[(),]|[^\s(),]+/g) ?? [];
}

const opOf = (token: string): Op | null => {
  const lower = token.toLowerCase();
  if (lower === ",") return ",";
  if (lower === "and") return "and";
  if (lower === "or" || lower === "and/or") return "or";
  return null;
};

interface Operand {
  words: string[];
  groups: { expr: Expr | null; hasCourse: boolean }[];
}

/** Parses tokens up to the matching ")" (or the end); `tokens` is consumed. */
function parseSequence(
  tokens: string[],
  reading: Reading,
  nested: boolean,
): Expr | null {
  const operands: Operand[] = [{ words: [], groups: [] }];
  const ops: Op[] = [];
  while (tokens.length > 0) {
    const token = tokens.shift() as string;
    if (token === ")") {
      if (nested) break;
      continue; // A stray ")" in Testudo's text.
    }
    // biome-ignore lint/style/noNonNullAssertion: operands starts non-empty and only grows.
    const current = operands[operands.length - 1]!;
    if (token === "(") {
      const inner = parseSequence(tokens, reading, true);
      current.groups.push({ expr: inner, hasCourse: hasCourse(inner) });
      continue;
    }
    const op = opOf(token);
    if (!op) {
      current.words.push(token);
      continue;
    }
    if (current.words.length === 0 && current.groups.length === 0) {
      // "A, and B": the word wins over the comma; a leading op is dropped.
      if (ops.length > 0 && op !== ",") ops[ops.length - 1] = op;
      continue;
    }
    ops.push(op);
    operands.push({ words: [], groups: [] });
  }

  const exprs: (Expr | null)[] = operands.map((o) => operandExpr(o, reading));
  const resolved = resolveCommas(ops);
  // `and` binds tighter than `or`: split into or-alternatives of and-runs.
  const alternatives: Expr[][] = [[]];
  exprs.forEach((expr, i) => {
    if (i > 0 && resolved[i - 1] === "or") alternatives.push([]);
    // biome-ignore lint/style/noNonNullAssertion: alternatives starts non-empty and only grows.
    if (expr) alternatives[alternatives.length - 1]!.push(expr);
  });
  const ors = alternatives
    .filter((items) => items.length > 0)
    .map((items) => join("and", items));
  return ors.length === 0 ? null : join("or", ors);
}

/** A comma takes the next conjunction in its list, else the previous, else "or" ("from (A, B)"). */
function resolveCommas(ops: readonly Op[]): ("and" | "or")[] {
  return ops.map((op, i) => {
    if (op !== ",") return op;
    const after = ops.slice(i + 1).find((o) => o !== ",");
    const before = ops
      .slice(0, i)
      .reverse()
      .find((o) => o !== ",");
    return (after ?? before ?? "or") as "and" | "or";
  });
}

function operandExpr(operand: Operand, reading: Reading): Expr | null {
  const courses: Expr[] = [];
  const rest: string[] = [];
  for (const word of operand.words) {
    const code = CODE.exec(word)?.[1];
    if (code) courses.push({ kind: "course", code });
    else rest.push(word);
  }
  let unreadGroup = false;
  for (const group of operand.groups) {
    if (group.expr && group.hasCourse) courses.push(group.expr);
    else unreadGroup = true;
  }
  if (courses.length === 0) {
    if (rest.length === 0 && !unreadGroup) return null;
    reading.complete = false;
    return OTHER;
  }
  // "must have completed CMSC131", "be concurrently enrolled in …", two
  // codes side by side: the courses still count, but the reading is partial.
  if (
    unreadGroup ||
    courses.length > 1 ||
    !FILLER.test(rest.join(" ").toLowerCase())
  )
    reading.complete = false;
  return join("and", courses);
}

function hasCourse(expr: Expr | null): boolean {
  if (!expr) return false;
  if (expr.kind === "course") return true;
  if (expr.kind === "other") return false;
  return expr.items.some(hasCourse);
}

function join(kind: "and" | "or", items: Expr[]): Expr {
  const flat = items.flatMap((e) => (e.kind === kind ? e.items : [e]));
  // biome-ignore lint/style/noNonNullAssertion: callers never pass an empty list.
  return flat.length === 1 ? flat[0]! : { kind, items: flat };
}

/** The expression with every part that isn't a course taken out; null when nothing's left. */
function withoutOthers(expr: Expr): Expr | null {
  if (expr.kind === "course") return expr;
  if (expr.kind === "other") return null;
  const items = expr.items
    .map(withoutOthers)
    .filter((e): e is Expr => e !== null);
  return items.length === 0 ? null : join(expr.kind, items);
}

/** The expression as groups that all apply (each a list of alternatives); null if it grows too big. */
function conjunctiveForm(expr: Expr): CourseCode[][] | null {
  switch (expr.kind) {
    case "course":
      return [[expr.code]];
    case "other":
      return [];
    case "and": {
      const out: CourseCode[][] = [];
      for (const item of expr.items) {
        const clauses = conjunctiveForm(item);
        if (!clauses) return null;
        out.push(...clauses);
        if (out.length > MAX_GROUPS) return null;
      }
      return out;
    }
    case "or": {
      let out: CourseCode[][] = [[]];
      for (const item of expr.items) {
        const clauses = conjunctiveForm(item);
        if (!clauses) return null;
        out = out.flatMap((left) =>
          clauses.map((right) => [...left, ...right]),
        );
        if (out.length > MAX_GROUPS) return null;
      }
      return out;
    }
  }
}

/**
 * Drops repeats and groups another group already implies ([A] makes [A, B]
 * redundant), keeping first-seen order.
 */
function simplify(clauses: readonly CourseCode[][]): CourseCode[][] {
  const groups = clauses.map((c) => [...new Set(c)]);
  const subset = (a: readonly string[], b: readonly string[]) =>
    a.every((code) => b.includes(code));
  return groups.filter(
    (group, i) =>
      !groups.some(
        (other, j) =>
          j !== i &&
          subset(other, group) &&
          // Equal groups: keep the first.
          (other.length < group.length || j < i),
      ),
  );
}
