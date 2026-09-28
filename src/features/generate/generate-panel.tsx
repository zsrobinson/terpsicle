import { useEffect, useMemo, useRef } from "react";
import { track } from "~/app/analytics";
import { useFocusRequest } from "~/app/focus-request";
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionHeader,
} from "~/app/panel";
import { useTabSearch } from "~/app/schedule-view";
import { resolveCourseColors } from "~/core/color";
import {
  draftCourseCodes,
  relaxDraft,
  requestItems,
} from "~/core/generate/draft";
import { type GenerateChips, sameChips } from "~/core/generate/url";
import type {
  FilterCount,
  GenerateDraft,
  GenerateRequest,
  Relaxable,
  Relaxation,
} from "~/core/schema";
import { GenerateTabSearchSchema } from "~/core/schema/schedule-url";
import { draftFor, useGenerateDrafts } from "~/state/generate-drafts";
import { useActiveTerm, useCurrentPlan, useTermCatalog } from "~/state/hooks";
import { useWorkspace } from "~/state/workspace-store";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { WithTooltip } from "~/ui/tooltip";
import { ChipBar, FilterChipsForGenerate, PreferenceChips } from "./chips";
import { CourseList } from "./course-list";
import { pickChips, useGenerateFromUrl } from "./generate-url";
import { coursesSummary } from "./labels";
import { NothingFits } from "./nothing-fits";
import { Results } from "./results";
import {
  chipsChangedSinceRun,
  type GenerateView,
  runGenerate,
  runLive,
  showGenerateView,
  stopGenerate,
  useGenerateRun,
} from "./run-store";
import { useDraft } from "./use-draft";

// The Generate tab (SPEC §3.9, UX-REVIEW §4.8): the courses, then filter
// chips (what takes plans out) and preference chips (what puts them in
// order); then the ranked plans, with the same chips over them so a click
// re-ranks the list in place. The one primary action (Generate plans) sits
// in the panel footer; a plan is added from its details. Generating creates
// plans; it never edits the open one. No sparkles: this is search, not an
// LLM (DESIGN §4).

/** The form asks for the courses a run was for: only the chips may differ. */
function sameItems(request: GenerateRequest, draft: GenerateDraft): boolean {
  return (
    JSON.stringify(request.items) === JSON.stringify(requestItems(draft.items))
  );
}

const plans = (n: number) => (n === 1 ? "1 plan" : `${n} plans`);

/**
 * Form or results: the URL's while the tab is on screen
 * (`?view=results`), else what it showed last. Back and Forward change the
 * URL's; the run store remembers it for the next time the tab opens. (The
 * shell replaces a `?view=results` whose results are gone.)
 */
function useShownView(): GenerateView {
  const url = useTabSearch("generate");
  const remembered = useGenerateRun((s) => s.view);
  const fromUrl = url
    ? (GenerateTabSearchSchema.parse(url).view ?? "form")
    : null;
  useEffect(() => {
    if (fromUrl) useGenerateRun.getState().setView(fromUrl);
  }, [fromUrl]);
  return fromUrl ?? remembered;
}

export function GeneratePanel() {
  const { term, termId } = useActiveTerm();
  const current = useCurrentPlan();
  const catalog = useTermCatalog(termId);
  const plan = current?.plan ?? null;
  const [draft, update, prefilled] = useDraft(termId, plan);
  const blocks = useWorkspace((s) => s.blocks);
  const status = useGenerateRun((s) => s.status);
  const refreshing = useGenerateRun((s) => s.refreshing);
  const runTermId = useGenerateRun((s) => s.termId);
  const view = useShownView();
  const inputRef = useFocusRequest<HTMLInputElement>("generate");
  const topRef = useRef<HTMLDivElement>(null);
  useGenerateFromUrl(termId, plan);

  const blockCount = useMemo(
    () => blocks.filter((b) => b.termId === termId).length,
    [blocks, termId],
  );
  const runnable = requestItems(draft.items).length > 0;
  const shared = current?.source === "shared";
  const mine = runTermId === termId ? status : { kind: "idle" as const };
  const busy = mine.kind === "loading" || mine.kind === "running";
  const done = mine.kind === "done" ? mine : null;
  const showing = done && view === "results" ? done : null;
  // Only a changed course list waits for "Generate again": the chips re-run
  // on their own.
  const stale = done !== null && !sameItems(done.request, draft);
  // What each filter took out, while the chips still say what was run.
  const counts = useMemo(
    (): ReadonlyMap<Relaxable, FilterCount> | null =>
      done && sameChips(done.request, draft)
        ? new Map(done.result.filterCounts.map((c) => [c.constraint, c]))
        : null,
    [done, draft],
  );

  // Live results: a chip changed since the last run, so run again (the
  // run store waits for a burst of clicks to settle).
  useEffect(() => {
    if (termId && !shared && chipsChangedSinceRun(termId, draft))
      runLive(termId, draft);
  }, [termId, shared, draft]);

  // Each view starts at its top: the results replace the form in place.
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    topRef.current?.scrollIntoView?.({ block: "start" });
  }, [view]);

  const run = () => {
    if (termId) void runGenerate(termId, draft);
  };
  const relax = (r: Relaxation) => {
    if (!termId) return;
    const next = relaxDraft(
      draftFor(useGenerateDrafts.getState().drafts, termId, plan),
      r.patch,
    );
    update(() => next);
    track("generate_relaxation_applied", { constraint: r.constraint });
    void runGenerate(termId, next, { relaxed: true });
  };
  const chips = (next: Partial<GenerateChips>) => {
    if (termId) pickChips(termId, plan, { ...draft, ...next });
  };
  const edit = () => showGenerateView("form");
  const back = () => showGenerateView("results");

  const colors = useMemo(
    // One color per course across every row, as adding one would pick them.
    () =>
      resolveCourseColors(draftCourseCodes(draft.items), current?.colors ?? {}),
    [draft.items, current?.colors],
  );
  const termName = term?.name ?? "this term";

  const filterChips = (
    <FilterChipsForGenerate
      mustHaves={draft.mustHaves}
      blockCount={blockCount}
      counts={counts}
      onChange={(mustHaves, filter, on) => {
        chips({ mustHaves });
        track("generate_filter_changed", { filter, on });
      }}
    />
  );
  const preferenceChips = (
    <PreferenceChips
      rankBy={draft.rankBy}
      onChange={(rankBy) => chips({ rankBy })}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Generate"
        sub="Every combination of sections, ranked"
      />
      <p role="status" className="sr-only">
        {busy
          ? "Generating plans…"
          : refreshing
            ? "Updating the plans…"
            : done
              ? done.result.results.length === 0
                ? "No plans fit."
                : `Found ${plans(done.result.results.length)}.`
              : ""}
      </p>
      {!shared && showing && catalog ? (
        // What was asked for, pinned above the list rather than scrolling
        // half under the results' sticky bar (QA S10). The chips below say
        // the rest.
        <div className="flex shrink-0 items-baseline gap-2 border-hairline border-b px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-muted text-sm">
            {coursesSummary(showing.request.items)}
          </p>
          <WithTooltip label="Change the courses">
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-sm"
              onClick={edit}
            >
              Edit
            </Button>
          </WithTooltip>
        </div>
      ) : null}
      <PanelBody>
        <div ref={topRef} />
        {shared ? (
          <p className="px-4 pt-4 text-muted text-sm">
            You're looking at a shared plan. Close it to generate plans of your
            own.
          </p>
        ) : showing && catalog ? (
          <>
            <div className="px-4 pt-2 pb-2.5">
              <ChipBar filters={filterChips} preferences={preferenceChips} />
            </div>
            {showing.result.results.length > 0 ? (
              <Results
                request={showing.request}
                result={showing.result}
                index={catalog.index}
                colors={colors}
                plan={current?.plan ?? null}
                termName={termName}
                refreshing={refreshing}
              />
            ) : (
              <NothingFits
                result={showing.result}
                index={catalog.index}
                colors={colors}
                termName={termName}
                onRelax={relax}
              />
            )}
          </>
        ) : (
          <>
            <SectionHeader variant="label" title="Courses" />
            <CourseList
              items={draft.items}
              update={update}
              index={catalog?.index}
              complete={catalog?.complete ?? false}
              termName={termName}
              colors={colors}
              plan={current?.plan ?? null}
              prefilledFrom={prefilled ? (plan?.name ?? null) : null}
              inputRef={inputRef}
            />
            <SectionHeader
              variant="label"
              title="Filters"
              right={<span className="font-normal">Take plans out</span>}
            />
            <div className="px-4">{filterChips}</div>
            <SectionHeader
              variant="label"
              title="Preferences"
              right={
                <span className="font-normal">
                  Put plans in order. Click again for 2×
                </span>
              }
            />
            <div className="px-4">{preferenceChips}</div>
            {mine.kind === "error" ? (
              <InlineError
                className="px-4 pt-4"
                message={mine.message}
                reload={mine.reload}
                onRetry={runnable ? run : undefined}
                retryTooltip={mine.reload ? undefined : "Generate plans again"}
              />
            ) : null}
            <div className="h-4" />
          </>
        )}
      </PanelBody>
      {shared || showing ? null : (
        <PanelFooter>
          {busy ? (
            <>
              <WithTooltip label="Stop searching">
                <Button variant="outline" onClick={stopGenerate}>
                  Stop
                </Button>
              </WithTooltip>
              {/* Not a live region: it changes many times a second. The
                  start and the end are announced once, at the panel's top. */}
              <span className="tnum truncate text-muted text-sm">
                {mine.kind === "running" && mine.steps > 0
                  ? `Checked ${mine.steps.toLocaleString()} combinations…`
                  : "Generating…"}
              </span>
            </>
          ) : done && !stale ? (
            // The same courses: its results are still right, and the chips
            // keep them up to date.
            <WithTooltip label="Back to the results for these choices">
              <Button className="flex-1" onClick={back}>
                {done.result.results.length > 0
                  ? `See ${plans(done.result.results.length)}`
                  : "See what to change"}
              </Button>
            </WithTooltip>
          ) : (
            <WithTooltip
              label={
                runnable
                  ? "Try every combination of sections and rank them"
                  : "Add a course first"
              }
            >
              {/* A disabled button gets no pointer events; the span keeps the tooltip. */}
              <span className="flex flex-1">
                <Button
                  className="flex-1"
                  disabled={!runnable || !termId}
                  onClick={run}
                >
                  {done ? "Generate again" : "Generate plans"}
                </Button>
              </span>
            </WithTooltip>
          )}
          {done && stale && !busy ? (
            <WithTooltip label="Back to the plans for your earlier courses">
              <Button variant="ghost" onClick={back}>
                See earlier plans
              </Button>
            </WithTooltip>
          ) : null}
        </PanelFooter>
      )}
    </div>
  );
}
