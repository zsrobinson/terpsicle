import { termIdFromLabel } from "../../catalog/terms";
import {
  type CourseCode,
  GEN_ED_LABELS,
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
// - AP, exam and transfer lines come first, under headings for the kind of
//   credit and each school: title, grade (P, NC, a letter, or none), the UMD
//   equivalent ("MATH140", a department's "CHEM 1XX", an elective's "LTR"
//   or "XXX 1XX"), credits, GenEd codes, and the registrar's evaluation
//   and footnote codes (L1, N2, NE, EX, 35), which aren't GenEds;
// - then a term line ("Fall 2025") and its course lines: code, title, grade,
//   credits attempted, earned, quality points, GenEd codes; an in-progress
//   term prints the section after the code and no grade, and a D there marks
//   a dropped course;
// - everything else (`Meth = Reg …`, `=====`, totals) is page furniture.
// A row that wrapped (a long title, GenEds after an "or") is joined back on.
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

/** UMD's transfer evaluation codes (the registrar's list): a course waiting on an evaluation earns nothing yet. */
const NOT_EVALUATED = new Set(["NE", "ST", "UR"]);
/** Evaluated as an elective, final or waiting on a syllabus, or as a lab. */
const ELECTIVE_EVALUATION = new Set([
  "N1",
  "N2",
  "R1",
  "R2",
  "L1",
  "L2",
  "G1",
  "G2",
  "LB",
]);
/**
 * An elective equivalent that names no department: "LTR" and "UTR" (lower-
 * and upper-level transfer), "XXX1XX". The credit counts; no course does.
 */
const ELECTIVE = /^(?:LTR|UTR|XXXX?)(?:[0-9X]{3})?$/;
const ELECTIVE_DEPT = /^(?:LTR|UTR|XXXX?)$/;
/** A footnote code: two capitals or digits (CV, EX, 35). */
const FOOTNOTE = /^[A-Z0-9]{2}$/;
/** Grade-column marks transfer credit carries besides grades: credit, transfer. */
const TRANSFER_MARKS = new Set(["CR", "T", "TR"]);
/** Lines with a number that aren't credit: totals and GPA lines. */
const FURNITURE =
  /\b(?:total|totals|cumulative|gpa|attempted|earned|combined)\b|sem:|^meth\b|^=/i;

function isEvaluation(text: string): boolean {
  return NOT_EVALUATED.has(text) || ELECTIVE_EVALUATION.has(text);
}

/** A grade-column mark on credit: a grade, NC or W, or credit without a grade. D never transfers. */
function isTransferMark(text: string): boolean {
  return (isGradeish(text) && text !== "D") || TRANSFER_MARKS.has(text);
}

/** How many tokens an equivalent at `i` takes ("MATH140", "CHEM 1XX", "LTR"); 0 when there's none. */
function equivalentAt(tokens: readonly Token[], i: number): number {
  const text = tokens[i]?.text ?? "";
  const next = tokens[i + 1]?.text ?? "";
  // "XXX 1XX" before "XXX": a bare elective code takes no number.
  if (
    (DEPT.test(text) || ELECTIVE_DEPT.test(text)) &&
    (COURSE_NUMBER.test(next) || PATTERN_NUMBER.test(next))
  )
    return 2;
  if (COURSE_CODE.test(text) || PATTERN.test(text) || ELECTIVE.test(text))
    return 1;
  return 0;
}

/** Whether what starts at `i` can follow a title: an evaluation, an equivalent, credits or "Credit not granted". */
function tailAt(tokens: readonly Token[], i: number): boolean {
  const text = tokens[i]?.text;
  return (
    text === undefined ||
    DECIMAL.test(text) ||
    isEvaluation(text) ||
    equivalentAt(tokens, i) > 0 ||
    /^credit/i.test(text)
  );
}

/**
 * Where an AP or transfer line's title ends: at a mark (a grade, NC, W)
 * followed by what can follow one, or, for credit printed without a grade,
 * at an equivalent, an evaluation code or the credits in a column of their
 * own. -1 when the line isn't shaped like credit.
 */
function transferTitleEnd(tokens: readonly Token[]): number {
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) break;
    if (isTransferMark(t.text) && tailAt(tokens, i + 1)) return i;
    if (!t.wide) continue;
    const used = equivalentAt(tokens, i);
    if (used > 0 && tokens[i + used] !== undefined && tailAt(tokens, i + used))
      return i;
    if (isEvaluation(t.text) || DECIMAL.test(t.text)) return i;
  }
  return -1;
}

/** Whether a line is AP, exam or transfer credit (rather than a heading or furniture). */
function isTransferCandidate(tokens: readonly Token[]): boolean {
  const body = /^\d/.test(tokens[0]?.text ?? "") ? tokens.slice(1) : tokens;
  if (FURNITURE.test(words(body))) return false;
  const end = transferTitleEnd(body);
  if (end < 1) return false;
  const tail = body.slice(end);
  return (
    tail[0]?.text === "NC" ||
    tail.some((t) => DECIMAL.test(t.text) || NOT_EVALUATED.has(t.text))
  );
}

/**
 * A transfer title as printed, less what isn't the course's name: an AP
 * score ("AP CALCULUS AB SCR 4") and the other school's own code after a
 * slash ("INTRO TO SOCIOLOGY/SOCY 101").
 */
function cleanTransferTitle(title: string): string {
  return title
    .replace(/\s+(?:SCR|SCORE)\s*:?\s*\d{1,2}$/i, "")
    .replace(/\s*\/\s*[A-Z]{2,5}\s?\d{2,4}[A-Z]?$/, "")
    .trim();
}

function viaOfTitle(title: string, hint: TranscriptVia): TranscriptVia {
  if (/^AP\b/.test(title)) return "ap";
  if (/^(?:IB|CLEP|DSST)\b/.test(title)) return "exam";
  return hint;
}

/** An AP, exam or transfer credit line. */
function readTransferLine(
  tokens: readonly Token[],
  viaHint: TranscriptVia,
): Read {
  // v1: some lines lead with a number (a sequence or a year); it isn't part of the title.
  const body = /^\d/.test(tokens[0]?.text ?? "") ? tokens.slice(1) : tokens;
  const end = transferTitleEnd(body);
  if (end < 1) return UNREADABLE;
  const printed = titleOf(body.slice(0, end));
  const title = printed === null ? "" : cleanTransferTitle(printed);
  if (title === "") return UNREADABLE;
  const first = body[end]?.text ?? "";
  const mark = isTransferMark(first) ? first : null;

  let equivalentOf: CourseCode | null = null;
  let equivalentPattern: string | null = null;
  let sawEquivalent = false;
  let credits: number | null = null;
  let notEvaluated = false;
  const leftover: Token[] = [];
  const tail = body.slice(mark === null ? end : end + 1);
  for (let i = 0; i < tail.length; i++) {
    const token = tail[i];
    if (!token) break;
    const { text } = token;
    if (!sawEquivalent) {
      const used = equivalentAt(tail, i);
      if (used > 0) {
        sawEquivalent = true;
        const code = used === 2 ? text + (tail[i + 1]?.text ?? "") : text;
        if (COURSE_CODE.test(code)) equivalentOf = code;
        else if (!ELECTIVE.test(code)) equivalentPattern = code;
        i += used - 1;
        continue;
      }
    }
    if (isEvaluation(text)) {
      if (NOT_EVALUATED.has(text)) notEvaluated = true;
      continue;
    }
    if (DECIMAL.test(text)) {
      // The first number is the credits; a school may print more columns.
      if (credits === null) credits = Number(text);
      continue;
    }
    // Footnotes; "OR" in capitals is a GenEd "or".
    if (FOOTNOTE.test(text) && text !== "OR") continue;
    leftover.push(token);
  }

  const rest = words(leftover);
  const noCredit = mark === "NC" || /\b(no credit|not granted)\b/i.test(rest);
  const genEds = noCredit ? [] : parseGenEdText(rest);
  if (genEds === null) return UNREADABLE;
  if (credits !== null && !creditsOk(credits)) return UNREADABLE;
  if (credits === null && !noCredit) return UNREADABLE;

  const line: TranscriptLine = {
    term: "before",
    code: equivalentOf,
    title,
    grade: mark !== null && isGrade(mark) ? mark : null,
    credits: credits ?? 0,
    earned: noCredit ? 0 : (credits ?? 0),
    qualityPoints: null,
    genEds,
    via: viaOfTitle(title, viaHint),
    equivalentOf,
    equivalentPattern,
    sectionCode: null,
    inProgress: false,
  };
  if (noCredit) return { kind: "skip", reason: "no-credit", line };
  if (mark === "W") return { kind: "skip", reason: "withdrawn", line };
  if (notEvaluated) return { kind: "skip", reason: "not-evaluated", line };
  return { kind: "line", line };
}

/** A heading in the AP and transfer block says which kind of credit follows. */
function viaFromHeading(text: string, current: TranscriptVia): TranscriptVia {
  if (/advanced placement|\bAP\b/i.test(text)) return "ap";
  if (
    /baccalaureate|\bIB\b|\bCLEP\b|\bexam(s|inations?)?\b|test credit/i.test(
      text,
    )
  )
    return "exam";
  if (/transfer|college|university|institution|school|academy/i.test(text))
    return "transfer";
  return current;
}

/** Words that make a line a heading (a school, a kind of credit), never part of a title. */
const HEADING_WORDS =
  /\b(?:college|university|univ|institute|institution|school|academy|community|placement|baccalaureate|exam\w*|clep|credits?|transfer|accepted|totals?)\b/i;

/**
 * The first row of a transfer title that wrapped: capitals only (titles are
 * printed in capitals; a school's name usually isn't), no credits or
 * columns of its own, and not a heading.
 */
function isTitleFragment(line: string): boolean {
  const body = line.replace(/^\d+\s+/, "");
  return (
    /[A-Z]/.test(body) &&
    !/[a-z]/.test(body) &&
    !/\d\.\d/.test(body) &&
    !/\S {2,}\S/.test(body) &&
    !HEADING_WORDS.test(body) &&
    !TERM_HEADING.test(body) &&
    !BEFORE_HEADING.test(body)
  );
}

/** GenEd codes UMD uses and nothing else ("DSHU, DVUP"): a course line's GenEds that wrapped. */
function isGenEdContinuation(line: string): boolean {
  const groups = parseGenEdText(line);
  return (
    groups !== null &&
    groups.length > 0 &&
    groups.every((g) => g.every((o) => GEN_ED_LABELS[o.code] !== undefined))
  );
}

/** How a wrapped row of GenEds joins its line: inside the last group, as the next group, or as the first. */
function genEdJoiner(line: string): string {
  if (/(?:,|\bor)$/i.test(line)) return " ";
  const last = line.split(/\s+/).at(-1) ?? "";
  if (/\)$/.test(last) || GEN_ED_LABELS[last] !== undefined) return ", ";
  return "  ";
}

/**
 * The row at `i` with the rows it wrapped onto joined back on, and the index
 * after the last row it used. Three wraps: a transfer title that ran onto
 * the next row, a UMD course's title that did, and GenEds that did.
 */
function joinWrapped(
  rows: readonly string[],
  i: number,
): { line: string; next: number } {
  let line = rows[i] ?? "";
  let at = i + 1;
  const following = rows[at];
  if (following !== undefined && !leadingCode(tokenize(following))) {
    if (
      isTitleFragment(line) &&
      !isTransferCandidate(tokenize(line)) &&
      isTransferCandidate(tokenize(`${line} ${following}`))
    ) {
      line = `${line} ${following}`;
      at++;
    } else if (
      leadingCode(tokenize(line)) &&
      !/\d\.\d/.test(line) &&
      /\d\.\d/.test(following) &&
      !/[a-z]/.test(following) &&
      !TERM_HEADING.test(following)
    ) {
      line = `${line} ${following}`;
      at++;
    }
  }
  const isCourse = (text: string) => {
    const tokens = tokenize(text);
    return leadingCode(tokens) !== null || isTransferCandidate(tokens);
  };
  while (at < rows.length && isCourse(line)) {
    const more = rows[at];
    if (more === undefined || !isGenEdContinuation(more)) break;
    line = `${line}${genEdJoiner(line)}${more}`;
    at++;
  }
  return { line, next: at };
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
  /** Whether the term has had a UMD course line yet. */
  let termHasCourses = false;
  const rows = normalizePaste(text)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  let i = 0;
  while (i < rows.length) {
    const first = rows[i] ?? "";
    if (!inBody) {
      const heading = TERM_HEADING.exec(first);
      const startsBody =
        (heading !== null &&
          termIdFromLabel(`${heading[1]} ${heading[2]}`) !== null) ||
        BEFORE_HEADING.test(first);
      // The email line ends the header; so does the first heading, for a
      // paste that starts below it.
      if (first.includes("@")) {
        inBody = true;
        i++;
        continue;
      }
      if (!startsBody) {
        i++;
        continue;
      }
      inBody = true;
    }

    const joined = joinWrapped(rows, i);
    const trimmed = joined.line;
    i = joined.next;

    const heading = TERM_HEADING.exec(trimmed);
    const headingTerm = heading
      ? termIdFromLabel(`${heading[1]} ${heading[2]}`)
      : null;
    if (headingTerm !== null) {
      term = headingTerm;
      termHasCourses = false;
      continue;
    }
    const tokens = tokenize(trimmed);
    let read: Read | null = null;
    if (BEFORE_HEADING.test(trimmed)) {
      // A transfer section can come after the terms, too.
      term = "before";
      viaHint = viaFromHeading(trimmed, viaHint);
    } else if (term === "before") {
      if (isTransferCandidate(tokens)) read = readTransferLine(tokens, viaHint);
      else if (/[a-z]/i.test(trimmed) && !/\d\.\d/.test(trimmed))
        viaHint = viaFromHeading(trimmed, viaHint);
    } else if (leadingCode(tokens)) {
      termHasCourses = true;
      read = readUmdLine(tokens, term);
    } else if (!termHasCourses && isTransferCandidate(tokens)) {
      // Credit listed under the term it was accepted in: still Before UMD.
      read = readTransferLine(tokens, viaHint);
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
