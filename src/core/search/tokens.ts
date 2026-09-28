import { parseWildcard } from "../catalog/wildcard";
import type { GenEdCode, WildcardPattern } from "../schema";
import { CREDIT_OPTIONS, LEVEL_OPTIONS, type SearchFilters } from "./filters";
import type { WildcardSearchInfo } from "./wildcards";

// What someone types into any course search box, read the same way in every
// product (owner, 2026-09-28: "familiarity carries over"). Three kinds of
// word mean more than their letters:
// - a code pattern, "cmsc4xx", "CMSC42X" or "cmsc4x": X is a digit after
//   the department, and the course list narrows to what matches;
// - a filter token, "DSNS", "400s" or "3cr": it names a filter chip, so it
//   filters right away, and on space or Enter the box turns it into the
//   chip (`takeFilterToken`);
// - everything else is text, for the index.
// A department's code always stays text: a GenEd code that's also a
// department's ("check each against the department list") never becomes a
// chip.

export type FilterToken =
  | { readonly kind: "gen-ed"; readonly code: GenEdCode }
  /** 100–800. */
  | { readonly kind: "level"; readonly level: number }
  /** A `CREDIT_OPTIONS` value; the top one means "or more". */
  | { readonly kind: "credits"; readonly credits: number };

/** "400s", "400-level", "400level". */
const LEVEL = /^([1-8])00(?:s|-?level)$/i;
/** "3cr", "3crs", "3credits", "4-credit". */
const CREDITS = /^(\d{1,2})-?(?:cr|crs|credits?)$/i;
const TOP_CREDITS = CREDIT_OPTIONS[CREDIT_OPTIONS.length - 1] ?? 5;

/** The filter a word names, or null when it's a code, a department or plain text. */
export function readFilterToken(
  word: string,
  info: WildcardSearchInfo,
): FilterToken | null {
  const text = word.trim();
  const upper = text.toUpperCase();
  if (
    /^[A-Z]{4}$/.test(upper) &&
    info.genEds.includes(upper) &&
    !info.depts.has(upper)
  )
    return { kind: "gen-ed", code: upper };
  const level = LEVEL.exec(text);
  if (level) {
    const n = Number(level[1]) * 100;
    return (LEVEL_OPTIONS as readonly number[]).includes(n)
      ? { kind: "level", level: n }
      : null;
  }
  const credits = CREDITS.exec(text);
  if (credits) {
    const n = Number(credits[1]);
    if (n < 1) return null;
    return { kind: "credits", credits: Math.min(n, TOP_CREDITS) };
  }
  return null;
}

/** The chip's own words: "DSNS", "400-level", "3 credits", "5+ credits". */
export function filterTokenName(token: FilterToken): string {
  switch (token.kind) {
    case "gen-ed":
      return token.code;
    case "level":
      return `${token.level}-level`;
    case "credits":
      return token.credits >= TOP_CREDITS
        ? `${token.credits}+ credits`
        : `${token.credits} credit${token.credits === 1 ? "" : "s"}`;
  }
}

const add = <T>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? [...list] : [...list, value];

/** The filters with the token's chip on. */
export function withFilterToken(
  filters: SearchFilters,
  token: FilterToken,
): SearchFilters {
  switch (token.kind) {
    case "gen-ed":
      return { ...filters, genEds: add(filters.genEds, token.code) };
    case "level":
      return { ...filters, levels: add(filters.levels, token.level) };
    case "credits":
      return { ...filters, credits: add(filters.credits, token.credits) };
  }
}

/** The filters with the token's chip off. */
export function withoutFilterToken(
  filters: SearchFilters,
  token: FilterToken,
): SearchFilters {
  switch (token.kind) {
    case "gen-ed":
      return {
        ...filters,
        genEds: filters.genEds.filter((c) => c !== token.code),
      };
    case "level":
      return {
        ...filters,
        levels: filters.levels.filter((l) => l !== token.level),
      };
    case "credits":
      return {
        ...filters,
        credits: filters.credits.filter((c) => c !== token.credits),
      };
  }
}

/** Whether the token's chip is on. */
export function hasFilterToken(
  filters: SearchFilters,
  token: FilterToken,
): boolean {
  switch (token.kind) {
    case "gen-ed":
      return filters.genEds.includes(token.code);
    case "level":
      return filters.levels.includes(token.level);
    case "credits":
      return filters.credits.includes(token.credits);
  }
}

/**
 * The filters without the last chip on the line (Backspace in an empty
 * box), in the chips' order: Gen-eds, Credits, Fits my plan, Open seats,
 * Level. Unchanged when nothing's on.
 */
export function withoutLastChip(filters: SearchFilters): SearchFilters {
  if (filters.levels.length > 0)
    return { ...filters, levels: filters.levels.slice(0, -1) };
  if (filters.openSeats) return { ...filters, openSeats: false };
  if (filters.fitsMyPlan) return { ...filters, fitsMyPlan: false };
  if (filters.credits.length > 0)
    return { ...filters, credits: filters.credits.slice(0, -1) };
  if (filters.genEds.length > 0)
    return { ...filters, genEds: filters.genEds.slice(0, -1) };
  return filters;
}

export type CourseQuery = {
  /** The words left for the index, as typed. */
  readonly text: string;
  /** Code patterns typed ("cmsc4xx"): results are only codes that fit one. */
  readonly patterns: readonly WildcardPattern[];
  /** Filter tokens still in the box: they filter as if they were chips. */
  readonly tokens: readonly FilterToken[];
};

/** A word as a code pattern: "cmsc4xx", "CMSC42X", "cmsc4x" (padded to CMSC4XX). */
function readPattern(word: string): WildcardPattern | null {
  // No GenEd codes here: those are filter tokens.
  const parsed = parseWildcard(word, []);
  return parsed.kind === "wildcard" && parsed.wildcard.kind === "pattern"
    ? parsed.wildcard.pattern
    : null;
}

/** Splits what's typed into text, code patterns and filter tokens. */
export function parseCourseQuery(
  query: string,
  info: WildcardSearchInfo,
): CourseQuery {
  // "cmsc 4xx", with its space, is one pattern.
  const whole = readPattern(query);
  if (whole) return { text: "", patterns: [whole], tokens: [] };
  const text: string[] = [];
  const patterns: WildcardPattern[] = [];
  const tokens: FilterToken[] = [];
  const words = query.split(/\s+/).filter((w) => w !== "");
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    // "cmsc 4xx 3cr": a department and a number pattern, spaced apart.
    const spaced = readPattern(`${word}${words[i + 1] ?? ""}`);
    if (/^[a-z]{4}$/i.test(word) && spaced) {
      patterns.push(spaced);
      i++;
      continue;
    }
    const pattern = readPattern(word);
    const token = pattern ? null : readFilterToken(word, info);
    if (pattern) patterns.push(pattern);
    else if (token) tokens.push(token);
    else text.push(word);
  }
  return { text: text.join(" "), patterns, tokens };
}

/** The chips plus the tokens still in the box: what the results are filtered by. */
export function queryFilters(
  filters: SearchFilters,
  query: CourseQuery,
): SearchFilters {
  return query.tokens.reduce(withFilterToken, filters);
}

/**
 * A filter token at the end of the box, taken out (space or Enter after
 * "DSNS"): the box's text without it, and the token for its chip. Null when
 * the last word isn't one.
 */
export function takeFilterToken(
  text: string,
  info: WildcardSearchInfo,
): { readonly text: string; readonly token: FilterToken } | null {
  const trimmed = text.trimEnd();
  const start = trimmed.search(/\S+$/);
  if (start < 0) return null;
  const token = readFilterToken(trimmed.slice(start), info);
  if (!token) return null;
  const rest = trimmed.slice(0, start);
  return { text: rest, token };
}
