import { create } from "zustand";
import {
  EMPTY_TRANSCRIPT_CHECKS,
  normalizeCourseCode,
  parseTranscript,
  type TranscriptChecks,
  type TranscriptRow,
  transcriptRows,
} from "~/core/four-year/transcript";
import type { GenEdCode, TranscriptParse } from "~/core/schema";

// The Import tab's working state (docs/V3.md §2.10), shared by the paste in
// the side panel and the check list beside it on desktop. Memory only: it's
// never written to storage, the URL, analytics or a log, and `reset` drops
// it when the import is done or the tab closes.

export type TranscriptImportState = {
  readonly text: string;
  /** Null until something's pasted. */
  readonly parse: TranscriptParse | null;
  readonly rows: readonly TranscriptRow[];
  readonly unreadable: readonly string[];
  readonly checks: TranscriptChecks;
  /** What's typed in each mapping field, valid or not. */
  readonly mappingText: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly error: string | null;
};

const EMPTY: TranscriptImportState = {
  text: "",
  parse: null,
  rows: [],
  unreadable: [],
  checks: EMPTY_TRANSCRIPT_CHECKS,
  mappingText: {},
  busy: false,
  error: null,
};

export const useTranscriptImport = create<TranscriptImportState>()(() => EMPTY);

const set = useTranscriptImport.setState;
const updateChecks = (change: (c: TranscriptChecks) => TranscriptChecks) =>
  set((s) => ({ checks: change(s.checks) }));

/** Parses as you paste. A new paste starts its decisions over, all but "Keep grades". */
export function setTranscriptText(text: string): void {
  const parse = text.trim() === "" ? null : parseTranscript(text);
  const { rows, unreadable } = parse
    ? transcriptRows(parse)
    : { rows: [], unreadable: [] };
  set((s) => ({
    text,
    parse,
    rows,
    unreadable,
    checks: { ...EMPTY_TRANSCRIPT_CHECKS, keepGrades: s.checks.keepGrades },
    mappingText: {},
    error: null,
  }));
}

export function toggleRow(key: string): void {
  updateChecks((c) => {
    const toggled = new Set(c.toggled);
    if (toggled.has(key)) toggled.delete(key);
    else toggled.add(key);
    return { ...c, toggled };
  });
}

export function chooseGenEd(key: string, group: number, code: GenEdCode): void {
  updateChecks((c) => ({
    ...c,
    choices: { ...c.choices, [key]: { ...c.choices[key], [group]: code } },
  }));
}

/** A mapping field's text; only a valid code maps the row. */
export function mapRow(key: string, typed: string): void {
  set((s) => {
    const code = normalizeCourseCode(typed);
    const { [key]: _old, ...mappings } = s.checks.mappings;
    return {
      mappingText: { ...s.mappingText, [key]: typed },
      checks: {
        ...s.checks,
        mappings: code ? { ...mappings, [key]: code } : mappings,
      },
    };
  });
}

export function setKeepGrades(keepGrades: boolean): void {
  updateChecks((c) => ({ ...c, keepGrades }));
}

export function setImportStatus(busy: boolean, error: string | null): void {
  set({ busy, error });
}

/** Forgets the paste and everything decided about it. */
export function resetTranscriptImport(): void {
  set(EMPTY);
}
