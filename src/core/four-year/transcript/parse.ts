import { termIdFromLabel } from "../../catalog/terms";
import {
  type CourseCode,
  type GenEdGroup,
  type GenEdOption,
  GRADES,
  type Grade,
  type SectionCode,
  type TranscriptLine,
  type TranscriptParse,
  type TranscriptSkipped,
  type TranscriptSkipReason,
  type TranscriptTerm,
  type TranscriptVia,
} from "../../schema";

// Reads a pasted UMD unofficial transcript (docs/V3.md §2.10). The format is
// v1's (terpsicle-bitcamp, lib/transcript-parser.ts, 2025) until a fresh
// paste says otherwise:
// - everything before the first line with an `@` (the email) is header, and
//   header lines are never read or reported;
// - AP and transfer lines come first: title, grade (P, NC or a letter),
//   the UMD equivalent, credits, GenEd codes;
// - then a term line ("Fall 2025") and its course lines: code, title, grade,
//   credits attempted, earned, quality points, GenEd codes; an in-progress
//   term prints the section after the code and no grade, and a D there marks
//   a dropped course;
// - everything else (`Meth = Reg …`, `=====`, totals) is page furniture.
// Columns are separated by two or more spaces or a tab; words in a title by
// one. That's what tells "VITAMIN D" (a title) from "INTRO   D   3.00" (a
// dropped course), so only a paste that collapses every run of spaces loses
// that, and then a title-ending letter reads as part of the title.

const MAX_RAW = 300;
const MAX_TITLE = 120;

/** One whitespace-separated token and whether a column gap comes before it. */
interface Token {
  text: string;
  /** Two or more spaces (or a tab) before it: a column boundary. */
  wide: boolean;
}

const COURSE_CODE = /^[A-Z]{4}\d{3}[A-Z]?$/;
const DEPT = /^[A-Z]{4}$/;
const COURSE_NUMBER = /^\d{3}[A-Z]?$/;
/** "CHEM1XX", or "CHEM" + "1XX": a transfer equivalent that isn't one course. */
const PATTERN = /^[A-Z]{4}[0-9X]{3}$/;
const PATTERN_NUMBER = /^[0-9X]{3}$/;
/** Section codes always have a digit ("0101", "FC01"); that keeps "DATA" a title word. */
const SECTION = /^(?=.*\d)[A-Z0-9]{4}$/;
const DECIMAL = /^\d{1,3}\.\d{1,3}$/;
const TERM_HEADING = /^(spring|summer|fall|winter)\s+(\d{4})(?:\s{2,}.*)?$/i;
const BEFORE_HEADING =
  /^(transfer credit|transfer courses|advanced placement|ap credit|test credit|credit by exam)/i;

const GRADE_SET: ReadonlySet<string> = new Set(GRADES);
/** Marks that aren't grades we keep: withdrawn, no credit, and (in progress) dropped. */
const MARKS = new Set(["W", "NC", "D"]);

function isGrade(text: string): text is Grade {
  return GRADE_SET.has(text);
}

function isGradeish(text: string): boolean {
  return isGrade(text) || MARKS.has(text);
}

/**
 * Lines of a paste with browser and OS differences evened out: CRLF and CR
 * line ends, a BOM, zero-width characters, non-breaking and other fixed-width
 * spaces (Safari copies `&nbsp;` as U+00A0), and tabs (a copied table's
 * column separator) as a two-space column gap.
 */
export function normalizePaste(text: string): string[] {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n?|[\u0085\u2028\u2029]/g, "\n")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\f\v]/g, " ")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd());
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  for (const match of line.matchAll(/( *)(\S+)/g)) {
    tokens.push({ text: match[2] ?? "", wide: (match[1] ?? "").length >= 2 });
  }
  return tokens;
}

function words(tokens: readonly Token[]): string {
  return tokens.map((t) => t.text).join(" ");
}

/** Splits on `separator` outside parentheses. */
function splitTopLevel(text: string, separator: RegExp): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return null;
    } else if (depth === 0) {
      const match = separator.exec(text.slice(i));
      if (match?.index === 0) {
        parts.push(text.slice(start, i));
        start = i + match[0].length;
        i = start - 1;
      }
    }
  }
  if (depth !== 0) return null;
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

/**
 * GenEd codes as a transcript (or Testudo) prints them: groups split on ","
 * and options on " or ", with an optional parenthetical condition.
 * "DSNL (if taken with GEOL110) or DSNS, SCIS" →
 * [[{DSNL, "if taken with GEOL110"}, {DSNS}], [{SCIS}]]. Null when the text
 * isn't GenEd codes; empty text is no GenEds.
 */
export function parseGenEdText(text: string): GenEdGroup[] | null {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const groups = splitTopLevel(trimmed, /^,/);
  if (!groups) return null;
  const out: GenEdGroup[] = [];
  for (const group of groups) {
    const options = splitTopLevel(group, /^\s+or\s+/i);
    if (!options) return null;
    const parsed: GenEdOption[] = [];
    for (const option of options) {
      const match = /^([A-Z]{4})(?:\s*\(\s*([^()]{1,120}?)\s*\))?$/.exec(
        option,
      );
      if (!match?.[1]) return null;
      parsed.push(
        match[2] ? { code: match[1], condition: match[2] } : { code: match[1] },
      );
    }
    out.push(parsed);
  }
  return out;
}

type Read =
  | { kind: "line"; line: TranscriptLine }
  | { kind: "skip"; reason: TranscriptSkipReason; line: TranscriptLine | null };

const UNREADABLE: Read = { kind: "skip", reason: "unreadable", line: null };

function titleOf(tokens: readonly Token[]): string | null {
  const title = words(tokens);
  return title === "" ? null : title.slice(0, MAX_TITLE);
}

function creditsOk(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 40;
}

/** The code a UMD course line starts with ("CMSC131", or "CMSC 131"), and how many tokens it took. */
function leadingCode(
  tokens: readonly Token[],
): { code: CourseCode; used: number } | null {
  const first = tokens[0]?.text ?? "";
  if (COURSE_CODE.test(first)) return { code: first, used: 1 };
  const second = tokens[1]?.text ?? "";
  if (DEPT.test(first) && COURSE_NUMBER.test(second))
    return { code: first + second, used: 2 };
  return null;
}

/** A course line in a UMD term. */
function readUmdLine(tokens: readonly Token[], term: TranscriptTerm): Read {
  const lead = leadingCode(tokens);
  if (!lead) return UNREADABLE;
  const rest = tokens.slice(lead.used);

  let at = 0;
  let sectionCode: SectionCode | null = null;
  const maybeSection = rest[0]?.text ?? "";
  if (
    SECTION.test(maybeSection) &&
    rest[1] !== undefined &&
    !DECIMAL.test(rest[1].text)
  ) {
    sectionCode = maybeSection;
    at = 1;
  }

  const firstNumber = rest.findIndex((t, i) => i >= at && DECIMAL.test(t.text));
  if (firstNumber < 0) return UNREADABLE;
  const numbers: number[] = [];
  let after = firstNumber;
  while (after < rest.length && numbers.length < 3) {
    const t = rest[after];
    if (!t || !DECIMAL.test(t.text)) break;
    numbers.push(Number(t.text));
    after++;
  }

  // The token before the numbers is a grade when it's grade-shaped and in
  // its own column (or a finished course's three numbers say one must be
  // there), and something is left for the title.
  const before = rest[firstNumber - 1];
  const hasMark =
    before !== undefined &&
    firstNumber - 1 > at &&
    isGradeish(before.text) &&
    (before.wide || numbers.length >= 2);
  const mark = hasMark ? before.text : null;
  const title = titleOf(
    rest.slice(at, hasMark ? firstNumber - 1 : firstNumber),
  );
  if (title === null) return UNREADABLE;

  const genEds = parseGenEdText(words(rest.slice(after)));
  if (genEds === null) return UNREADABLE;

  const [credits = 0, earned, qualityPoints] = numbers;
  if (!creditsOk(credits) || (earned !== undefined && !creditsOk(earned)))
    return UNREADABLE;
  // A finished course's line has earned credits; without a grade we can't
  // tell what happened to it.
  if (mark === null && numbers.length >= 2) return UNREADABLE;

  const grade = mark !== null && isGrade(mark) ? mark : null;
  const dropped = mark === "D" && sectionCode !== null;
  const line: TranscriptLine = {
    term,
    code: lead.code,
    title,
    grade: dropped ? null : grade,
    credits,
    earned: mark === null ? null : (earned ?? null),
    qualityPoints:
      mark === null || qualityPoints === undefined || qualityPoints > 200
        ? null
        : qualityPoints,
    genEds,
    via: "umd",
    equivalentOf: null,
    equivalentPattern: null,
    sectionCode,
    inProgress: mark === null || dropped,
  };
  if (mark === "W") return { kind: "skip", reason: "withdrawn", line };
  if (mark === "NC") return { kind: "skip", reason: "no-credit", line };
  if (dropped) return { kind: "skip", reason: "dropped", line };
  return { kind: "line", line };
}

/** Where an AP or transfer line's grade is: grade-shaped, and followed by what comes after a grade. */
function transferGradeIndex(tokens: readonly Token[]): number {
  return tokens.findIndex((t, i) => {
    if (i < 1 || !isGradeish(t.text) || t.text === "D") return false;
    const next = tokens[i + 1]?.text;
    const nextNumber = tokens[i + 2]?.text ?? "";
    return (
      next === undefined ||
      DECIMAL.test(next) ||
      COURSE_CODE.test(next) ||
      PATTERN.test(next) ||
      (DEPT.test(next) && PATTERN_NUMBER.test(nextNumber)) ||
      /^credit/i.test(next)
    );
  });
}

/** Whether a line in the AP and transfer block is a credit line (rather than a heading or furniture). */
function isTransferCandidate(tokens: readonly Token[]): boolean {
  const g = transferGradeIndex(tokens);
  if (g < 0) return false;
  return (
    tokens[g]?.text === "NC" ||
    tokens.slice(g).some((t) => DECIMAL.test(t.text))
  );
}

/** An AP or transfer credit line. */
function readTransferLine(
  tokens: readonly Token[],
  viaHint: TranscriptVia,
): Read {
  // v1: some lines lead with a number (a sequence or a year); it isn't part of the title.
  const body = /^\d/.test(tokens[0]?.text ?? "") ? tokens.slice(1) : tokens;
  const g = transferGradeIndex(body);
  const gradeText = body[g]?.text;
  if (g < 1 || gradeText === undefined) return UNREADABLE;
  const title = titleOf(body.slice(0, g));
  if (title === null) return UNREADABLE;

  let equivalentOf: CourseCode | null = null;
  let equivalentPattern: string | null = null;
  let credits: number | null = null;
  const leftover: Token[] = [];
  const tail = body.slice(g + 1);
  for (let i = 0; i < tail.length; i++) {
    const text = tail[i]?.text ?? "";
    const next = tail[i + 1]?.text ?? "";
    if (equivalentOf === null && equivalentPattern === null) {
      if (COURSE_CODE.test(text)) {
        equivalentOf = text;
        continue;
      }
      if (DEPT.test(text) && COURSE_NUMBER.test(next)) {
        equivalentOf = text + next;
        i++;
        continue;
      }
      if (PATTERN.test(text)) {
        equivalentPattern = text;
        continue;
      }
      if (DEPT.test(text) && PATTERN_NUMBER.test(next)) {
        equivalentPattern = text + next;
        i++;
        continue;
      }
    }
    if (credits === null && DECIMAL.test(text)) {
      credits = Number(text);
      continue;
    }
    leftover.push({ text, wide: tail[i]?.wide ?? false });
  }

  const rest = words(leftover);
  const noCredit =
    gradeText === "NC" || /\b(no credit|not granted)\b/i.test(rest);
  const genEds = noCredit ? [] : parseGenEdText(rest);
  if (genEds === null) return UNREADABLE;
  if (credits !== null && !creditsOk(credits)) return UNREADABLE;
  if (credits === null && !noCredit) return UNREADABLE;

  const via: TranscriptVia = /^AP\b/.test(title) ? "ap" : viaHint;
  const grade = isGrade(gradeText) ? gradeText : null;
  const line: TranscriptLine = {
    term: "before",
    code: equivalentOf,
    title,
    grade,
    credits: credits ?? 0,
    earned: noCredit ? 0 : (credits ?? 0),
    qualityPoints: null,
    genEds,
    via,
    equivalentOf,
    equivalentPattern,
    sectionCode: null,
    inProgress: false,
  };
  if (noCredit) return { kind: "skip", reason: "no-credit", line };
  if (gradeText === "W") return { kind: "skip", reason: "withdrawn", line };
  return { kind: "line", line };
}

/** A heading in the AP and transfer block says which kind of credit follows. */
function viaFromHeading(text: string, current: TranscriptVia): TranscriptVia {
  if (/advanced placement|\bAP\b/i.test(text)) return "ap";
  if (
    /transfer|college|university|institution|baccalaureate|\bIB\b|\bexam(s|inations?)?\b/i.test(
      text,
    )
  )
    return "transfer";
  return current;
}

/**
 * Reads a pasted unofficial transcript. Never throws: text that isn't a
 * transcript gives `recognized: false`. Nothing from the header (name, UID,
 * birth date, address, email) is in the result: header lines are never read,
 * and only course lines are reported as skipped.
 */
export function parseTranscript(text: string): TranscriptParse {
  const lines: TranscriptLine[] = [];
  const skipped: TranscriptSkipped[] = [];
  let inBody = false;
  let term: TranscriptTerm = "before";
  let viaHint: TranscriptVia = "transfer";

  for (const raw of normalizePaste(text)) {
    const trimmed = raw.trim();
    if (trimmed === "") continue;

    const heading = TERM_HEADING.exec(trimmed);
    const headingTerm = heading
      ? termIdFromLabel(`${heading[1]} ${heading[2]}`)
      : null;
    if (!inBody) {
      // The email line ends the header; so does the first heading, for a
      // paste that starts below it.
      if (trimmed.includes("@")) {
        inBody = true;
        continue;
      }
      if (headingTerm === null && !BEFORE_HEADING.test(trimmed)) continue;
      inBody = true;
    }

    if (headingTerm !== null) {
      term = headingTerm;
      continue;
    }
    const tokens = tokenize(trimmed);
    let read: Read | null = null;
    if (term === "before") {
      if (BEFORE_HEADING.test(trimmed))
        viaHint = viaFromHeading(trimmed, viaHint);
      else if (isTransferCandidate(tokens))
        read = readTransferLine(tokens, viaHint);
      else if (/[a-z]/i.test(trimmed) && !/\d\.\d/.test(trimmed))
        viaHint = viaFromHeading(trimmed, viaHint);
    } else if (leadingCode(tokens)) {
      read = readUmdLine(tokens, term);
    }
    if (read === null) continue;
    if (read.kind === "line") lines.push(read.line);
    else
      skipped.push({
        raw: words(tokens).slice(0, MAX_RAW),
        reason: read.reason,
        line: read.line,
      });
  }

  return {
    lines,
    skipped,
    recognized:
      lines.length > 0 || skipped.some((s) => s.reason !== "unreadable"),
  };
}
