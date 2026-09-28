import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { displayTitle } from "~/core/four-year/display-title";
import { fourYearTermLabel, latestTermOf } from "~/core/four-year/terms";
import {
  buildTranscriptImport,
  EMPTY_TRANSCRIPT_CHECKS,
  fitsEquivalentPattern,
  importReplaceTerms,
  normalizeCourseCode,
  pendingChoices,
  rowCode,
  rowIncluded,
  type TranscriptChecks,
  type TranscriptRow,
  transcriptRows,
} from "~/core/four-year/transcript";
import {
  type CourseSearchRow,
  GEN_ED_LABELS,
  type GenEdCode,
  type TranscriptSkipReason,
} from "~/core/schema";
import type { FourYearTerm } from "~/core/schema/four-year";
import { countWords } from "~/core/words";
import { useIsMobile } from "~/hooks/use-media-query";
import { track } from "~/lib/analytics";
import { modKey } from "~/lib/shortcuts";
import { newLocalId } from "~/state/ids";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { Input, Textarea } from "~/ui/input";
import { SegmentedControl } from "~/ui/segmented-control";
import { WithTooltip } from "~/ui/tooltip";
import { importTranscript } from "./actions";
import { loadCourseLookup, loadCourseSearch, useCourseSearch } from "./data";
import {
  chooseGenEd,
  mapRow,
  resetTranscriptImport,
  setImportStatus,
  setKeepGrades,
  setTranscriptText,
  toggleRow,
  useTranscriptImport,
} from "./import-state";
import { useModel, usePlanNav } from "./model";
import { activeDoc, useFourYear } from "./store";
import { PlanView } from "./views";
import { showBoard } from "./workbench-store";

// The Import tab (docs/V3.md §2.10): paste, check, import. The paste is in
// the side panel; the check list sits beside it on desktop, in the board's
// place, and under it on a phone. The paste lives in memory (./import-state)
// and nowhere else: never stored, sent, logged or put in the URL, and gone
// once the import is done or the tab closes. While checking, the only thing
// fetched is the search file every visit loads anyway, so nothing about the
// paste leaves the browser until the import. Analytics get counts and a
// boolean.

export const IMPORT_INPUT_ID = "plan-import-paste";

/** How long a paste sits still before `transcript_parsed` counts it. */
const PARSED_EVENT_MS = 1500;

const SKIP_REASONS: Record<TranscriptSkipReason, string> = {
  withdrawn: "Withdrawn (W), so it's left out.",
  dropped: "Dropped, so it's left out.",
  "no-credit": "No credit granted, so it's left out.",
  "not-evaluated":
    "UMD hasn't finished evaluating it, so there's no credit yet and it's left out.",
  // Unreadable lines have nothing to import, so they're never rows; the
  // record needs the key.
  unreadable: "We couldn't read this line.",
};

const cr = (n: number) => `${n} cr`;

/** Every course's search row by code: the one file the check step reads. */
function useSearchRows(): ReadonlyMap<string, CourseSearchRow> | null {
  const { rows } = useCourseSearch();
  return useMemo(
    () => (rows ? new Map(rows.map((r) => [r[0], r])) : null),
    [rows],
  );
}

function ChoiceGroup({
  row,
  group,
  name,
  checks,
  onChoose,
}: {
  row: TranscriptRow;
  group: number;
  name: string;
  checks: TranscriptChecks;
  onChoose: (code: GenEdCode) => void;
}) {
  const options = row.line.genEds[group] ?? [];
  const chosen = checks.choices[row.key]?.[group];
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span aria-hidden="true" className="text-muted text-xs">
        Counts as
      </span>
      <SegmentedControl<GenEdCode | "">
        label={`${name} counts as`}
        // Nothing's chosen until the person picks: Testudo says "or".
        value={chosen ?? ""}
        onValueChange={(code) => {
          if (code !== "") onChoose(code);
        }}
        options={options.map((o) => {
          const label = GEN_ED_LABELS[o.code];
          return {
            value: o.code,
            label: (
              <span className="ident">
                {o.code}
                {o.condition ? "*" : ""}
              </span>
            ),
            hint: `Count ${name} for ${o.code}${label ? ` (${label})` : ""}${o.condition ? `, ${o.condition}` : ""}`,
          };
        })}
      />
      {chosen === undefined ? (
        <span className="text-muted text-xs">Pick one</span>
      ) : null}
    </div>
  );
}

function MappingField({
  row,
  text,
  search,
  onType,
}: {
  row: TranscriptRow;
  text: string;
  search: ReadonlyMap<string, CourseSearchRow> | null;
  onType: (text: string) => void;
}) {
  const id = useId();
  const listId = useId();
  const pattern = row.line.equivalentPattern;
  const code = normalizeCourseCode(text);
  const known = code ? search?.get(code) : undefined;
  const suggestions = useMemo(() => {
    if (!pattern || !search) return [];
    return [...search.values()]
      .filter((r) => fitsEquivalentPattern(r[0], pattern))
      .slice(0, 50);
  }, [pattern, search]);
  const kind =
    row.line.via === "ap"
      ? "AP credit"
      : row.line.via === "exam"
        ? "exam credit"
        : "transfer credit";
  return (
    <div className="space-y-1 pt-1">
      <label htmlFor={id} className="block text-muted text-xs">
        {pattern
          ? `Testudo lists it as ${pattern}. `
          : "It has no UMD course. "}
        Which UMD course does it count as, if any?
      </label>
      <WithTooltip label="A UMD course code, like CHEM131. Leave it empty to keep it as credit with no course.">
        <Input
          id={id}
          list={suggestions.length > 0 ? listId : undefined}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onType(event.target.value)}
          placeholder={pattern ? `${pattern.slice(0, 5)}…` : "Optional"}
          className="ident w-36 uppercase placeholder:font-sans placeholder:normal-case"
        />
      </WithTooltip>
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((r) => (
            <option key={r[0]} value={r[0]}>
              {r[1]}
            </option>
          ))}
        </datalist>
      ) : null}
      <p className="text-muted text-xs" aria-live="polite">
        {text.trim() === ""
          ? `It imports as ${cr(row.line.credits)} of ${kind}.`
          : code === null
            ? "Type a course code, like CHEM131."
            : known
              ? `Counts as ${code}, ${known[1]}.`
              : search
                ? `${code} isn't in Testudo. Pick a course Testudo lists, or leave it empty.`
                : `Counts as ${code}.`}
      </p>
    </div>
  );
}

function Row({
  row,
  checks,
  search,
  mappingText,
  onToggle,
  onChoose,
  onMap,
}: {
  row: TranscriptRow;
  checks: TranscriptChecks;
  search: ReadonlyMap<string, CourseSearchRow> | null;
  mappingText: string;
  onToggle: () => void;
  onChoose: (group: number, code: GenEdCode) => void;
  onMap: (text: string) => void;
}) {
  const { line } = row;
  const included = rowIncluded(row, checks);
  const code = rowCode(row, checks);
  const title = displayTitle(line.title);
  const name = line.code ?? title;
  const catalog = line.code ? search?.get(line.code) : undefined;
  const unknown = line.code !== null && search !== null && !catalog;
  const catalogTitle = catalog?.[1] ?? null;
  const grade = checks.keepGrades ? line.grade : null;
  const groups = line.genEds
    .map((g, i) => (g.length > 1 ? i : -1))
    .filter((i) => i !== -1);
  const kind =
    line.via === "ap"
      ? "AP"
      : line.via === "exam"
        ? "Exam"
        : line.via === "transfer"
          ? "Transfer"
          : null;
  return (
    <li
      className={cn(
        "flex gap-2 border-hairline border-b px-4 py-2 last:border-b-0",
      )}
    >
      <WithTooltip label={included ? `Leave ${name} out` : `Import ${name}`}>
        <input
          type="checkbox"
          checked={included}
          onChange={onToggle}
          aria-label={`Import ${name}`}
          className="mt-1 size-4 shrink-0 cursor-pointer accent-product-plan"
        />
      </WithTooltip>
      <div className={cn("min-w-0 flex-1", !included && "text-muted")}>
        <p className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 truncate font-semibold",
              line.code !== null && "ident",
            )}
          >
            {line.code ?? title}
          </span>
          {kind ? (
            <span className="shrink-0 border border-hairline px-1 text-2xs text-muted">
              {kind}
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 text-sm">
            {grade ? (
              <span data-private className="font-semibold">
                {grade}
              </span>
            ) : null}
            <span className="tnum text-muted">{cr(line.credits)}</span>
          </span>
        </p>
        {line.code !== null ? (
          <>
            <p className="truncate text-muted text-sm">
              {catalogTitle ?? title}
            </p>
            {/* The transcript's own words, when they say something else. */}
            {catalogTitle &&
            catalogTitle.toLowerCase() !== title.toLowerCase() ? (
              <p className="truncate text-faint text-xs">{title}</p>
            ) : null}
          </>
        ) : null}
        {row.skipped ? (
          <p className="text-muted text-xs">
            {included
              ? "Imported anyway, without a grade."
              : SKIP_REASONS[row.skipped]}
          </p>
        ) : null}
        {unknown ? (
          <p className="flex items-center gap-1.5 text-muted text-xs">
            <span aria-hidden="true" className="size-1.5 shrink-0 bg-warn" />
            {line.genEds.length > 0
              ? "Not in Testudo's catalog anymore. It imports with the GenEds your transcript lists."
              : "Not in Testudo's catalog. It imports anyway, and you can add its course info."}
          </p>
        ) : null}
        {included
          ? groups.map((g) => (
              <ChoiceGroup
                key={g}
                row={row}
                group={g}
                name={code ?? title}
                checks={checks}
                onChoose={(c) => onChoose(g, c)}
              />
            ))
          : null}
        {included && line.code === null && line.term === "before" ? (
          <MappingField
            row={row}
            text={mappingText}
            search={search}
            onType={onMap}
          />
        ) : null}
      </div>
    </li>
  );
}

function TermGroup({
  term,
  rows,
  children,
}: {
  term: FourYearTerm;
  rows: readonly TranscriptRow[];
  children: React.ReactNode;
}) {
  const name = fourYearTermLabel(term);
  const read = rows.filter((r) => r.skipped === null);
  const credits = read.reduce((n, r) => n + r.line.credits, 0);
  const inProgress = rows.some((r) => r.line.inProgress);
  return (
    <section aria-label={name}>
      <h3 className="tnum flex items-baseline gap-2 border-hairline border-y bg-panel px-4 py-1 font-medium text-sm">
        {name}
        {inProgress ? (
          <span className="font-normal text-muted text-xs">In progress</span>
        ) : null}
        <span className="ml-auto font-normal text-muted text-xs">
          {read.length} {read.length === 1 ? "course" : "courses"} ·{" "}
          {cr(credits)}
        </span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

/** "21 courses from 4 semesters and Before UMD" */
function importScope(rows: readonly TranscriptRow[]): string {
  const semesters = new Set(
    rows.filter((r) => r.line.term !== "before").map((r) => r.line.term),
  ).size;
  const from = [
    semesters > 0 ? countWords(semesters, "semester", "semesters") : null,
    rows.some((r) => r.line.term === "before") ? "Before UMD" : null,
  ].filter((x) => x !== null);
  const courses = countWords(rows.length, "course", "courses");
  return from.length > 0 ? `${courses} from ${from.join(" and ")}` : courses;
}

/** What we read, by semester: the check step's list. */
export function ImportCheck({ columns = false }: { columns?: boolean }) {
  const rows = useTranscriptImport((s) => s.rows);
  const unreadable = useTranscriptImport((s) => s.unreadable);
  const checks = useTranscriptImport((s) => s.checks);
  const mappingText = useTranscriptImport((s) => s.mappingText);
  const search = useSearchRows();
  const included = rows.filter((r) => rowIncluded(r, checks));
  const terms = [...new Set(rows.map((r) => r.line.term))];
  return (
    <section aria-labelledby="plan-import-check">
      <div className="space-y-1 px-4 py-3">
        <h2 id="plan-import-check" className="font-medium">
          Check what we read
        </h2>
        <p role="status" className="text-muted text-sm">
          {importScope(included)} to import. Untick anything you'd rather leave
          out.
        </p>
      </div>
      <div
        className={cn(
          columns &&
            "gap-3 px-3 pb-3 lg:columns-2 2xl:columns-3 [&>section]:mb-3 [&>section]:break-inside-avoid [&>section]:border [&>section]:border-hairline [&>section]:bg-raised",
        )}
      >
        {terms.map((term) => {
          const termRows = rows.filter((r) => r.line.term === term);
          return (
            <TermGroup key={term} term={term} rows={termRows}>
              {termRows.map((r) => (
                <Row
                  key={r.key}
                  row={r}
                  checks={checks}
                  search={search}
                  mappingText={mappingText[r.key] ?? ""}
                  onToggle={() => toggleRow(r.key)}
                  onChoose={(g, c) => chooseGenEd(r.key, g, c)}
                  onMap={(t) => mapRow(r.key, t)}
                />
              ))}
            </TermGroup>
          );
        })}
        {unreadable.length > 0 ? (
          <section
            aria-label="Lines we couldn't read"
            className="space-y-1 border-hairline border-t px-4 py-2"
          >
            <h3 className="font-medium text-sm">
              {unreadable.length === 1
                ? "One line we couldn't read"
                : `${unreadable.length} lines we couldn't read`}
            </h3>
            <p className="text-muted text-xs">
              They're left out. Add them from Search if you need them.
            </p>
            <ul className="space-y-0.5">
              {unreadable.map((raw, i) => (
                <li
                  // By position: a key made of pasted text could reach a console warning.
                  // biome-ignore lint/suspicious/noArrayIndexKey: the list only changes with the paste
                  key={i}
                  data-private
                  className="ident break-words text-muted text-xs"
                >
                  {raw}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

/** True once a paste reads as a transcript: the check list has something to show. */
export function useImportRecognized(): boolean {
  return useTranscriptImport((s) => s.parse?.recognized === true);
}

export function ImportPanel() {
  const { doc, columns, statusOf } = useModel();
  const nav = usePlanNav();
  const wide = !useIsMobile();
  const text = useTranscriptImport((s) => s.text);
  const parse = useTranscriptImport((s) => s.parse);
  const rows = useTranscriptImport((s) => s.rows);
  const checks = useTranscriptImport((s) => s.checks);
  const busy = useTranscriptImport((s) => s.busy);
  const error = useTranscriptImport((s) => s.error);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (!parse) return;
    const timer = setTimeout(() => {
      track("transcript_parsed", {
        recognized: parse.recognized,
        lines: parse.lines.length,
        choices: pendingChoices(
          transcriptRows(parse).rows,
          EMPTY_TRANSCRIPT_CHECKS,
        ),
        skipped: parse.skipped.length,
      });
    }, PARSED_EVENT_MS);
    return () => clearTimeout(timer);
  }, [parse]);

  const recognized = parse?.recognized === true;
  const included = rows.filter((r) => rowIncluded(r, checks));
  const pending = pendingChoices(rows, checks);
  const replacing = doc.entries.some((e) => statusOf(e.term) !== "planned");

  const client = useQueryClient();
  const run = async () => {
    setImportStatus(true, null);
    // Importing is the moment the plan learns the codes: load their
    // departments for credits and GenEd groups, as the plan itself would.
    const depts = new Set<string>();
    for (const r of included) {
      const code = rowCode(r, checks);
      if (code) depts.add(code.slice(0, 4));
    }
    const lookup = await loadCourseLookup(client, [...depts]);
    const current = activeDoc(useFourYear.getState());
    // The terms to replace were worked out for this doc: if another opened
    // while departments loaded, stop rather than replace the wrong ones.
    if (current?.id !== doc.id) return setImportStatus(false, null);
    // "Counts as" only a course Testudo lists (the field says so as you type).
    const listed = await loadCourseSearch(client);
    const known = listed ? new Set(listed.map((r) => r[0])) : null;
    const mappings = Object.fromEntries(
      Object.entries(checks.mappings).filter(
        ([, code]) => known === null || known.has(code),
      ),
    );
    const { entries, grades } = buildTranscriptImport(
      rows,
      { ...checks, mappings },
      { lookup, newId: newLocalId },
    );
    const done = importTranscript(current, {
      replace: importReplaceTerms(columns, statusOf),
      entries,
      grades,
      keptGrades: checks.keepGrades,
    });
    if (!done) {
      setImportStatus(
        false,
        "A four-year plan holds up to 150 courses, and this would go past that. Remove some planned courses or leave some lines out, then import again.",
      );
      return;
    }
    resetTranscriptImport();
    // A phone shows one semester: the latest imported one, not Now's
    // (likely empty), so what just arrived is what you see.
    const latest = wide ? null : latestTermOf(entries);
    nav.go(latest ? { tab: undefined, semester: latest } : { tab: undefined });
    showBoard();
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-2 px-4 py-3">
        <label htmlFor={IMPORT_INPUT_ID} className="block font-medium">
          Paste your unofficial transcript
        </label>
        <p className="text-muted text-sm">
          In Testudo, open Unofficial Transcript, select everything on the page
          ({modKey("A")}), copy, and paste it here.
        </p>
        <p className="text-muted text-sm">
          Your transcript is read here, in your browser, and never saved or
          sent. Only the courses you import are saved.
        </p>
        <div className="space-y-1">
          <WithTooltip label="Paste the whole Unofficial Transcript page">
            <Textarea
              ref={input}
              id={IMPORT_INPUT_ID}
              data-private
              value={text}
              onChange={(event) => setTranscriptText(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              rows={recognized ? 3 : 6}
              placeholder="Paste here"
              className="ident block resize-y placeholder:font-sans md:text-xs"
            />
          </WithTooltip>
          {text !== "" ? (
            <WithTooltip label="Clear the paste">
              <Button
                variant="ghost"
                size="row"
                onClick={() => {
                  setTranscriptText("");
                  input.current?.focus();
                }}
                className="ml-auto flex"
              >
                <X aria-hidden="true" />
                Clear the paste
              </Button>
            </WithTooltip>
          ) : null}
        </div>
        {parse && !recognized ? (
          <p role="status" className="text-sm">
            That doesn't look like a UMD unofficial transcript. Copy the whole
            page from Testudo's Unofficial Transcript.
          </p>
        ) : recognized && wide ? (
          <p role="status" className="text-muted text-sm">
            We read {importScope(rows.filter((r) => r.skipped === null))}. Check
            them beside this, then import.
          </p>
        ) : null}
      </div>

      {recognized ? (
        <>
          {wide ? null : (
            <div className="border-hairline border-t">
              <ImportCheck />
            </div>
          )}
          <div className="space-y-3 border-hairline border-t bg-raised px-4 py-3">
            <div className="space-y-1">
              <WithTooltip label="Show each course's grade in your four-year plan">
                <label className="flex w-fit cursor-pointer items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={checks.keepGrades}
                    onChange={(event) => setKeepGrades(event.target.checked)}
                    className="size-4 accent-product-plan"
                  />
                  Keep grades
                </label>
              </WithTooltip>
              <p className="text-muted text-xs">
                Grades stay in your four-year plan. If you're signed in, they
                sync to your other devices through Terpsicle's server. Nobody
                else can see them.
              </p>
            </div>
            {replacing ? (
              <p className="text-muted text-xs">
                This replaces your done and in-progress semesters. Courses you
                added yourself stay unless the transcript has them, and planned
                semesters stay as they are.
              </p>
            ) : null}
            {pending > 0 ? (
              <p role="status" className="text-sm">
                Pick a GenEd for {countWords(pending, "course", "courses")}{" "}
                where Testudo says "or", then import.
              </p>
            ) : null}
            {error ? <InlineError message={error} className="py-0" /> : null}
            <WithTooltip label="Add these to your four-year plan. Undo takes it back.">
              <Button
                className="w-full"
                disabled={busy || pending > 0 || included.length === 0}
                onClick={() => void run()}
              >
                {included.length === 0
                  ? "Nothing to import"
                  : `Import ${countWords(included.length, "course", "courses")}`}
              </Button>
            </WithTooltip>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The Import view, on its route (`/plan/import`). */
export function ImportView() {
  return (
    <PlanView tab="import">
      <ImportPanel />
    </PlanView>
  );
}
