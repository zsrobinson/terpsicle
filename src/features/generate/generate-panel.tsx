import { useEffect, useMemo, useRef } from "react";
import { track } from "~/app/analytics";
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionHeader,
  useFocusRequest,
} from "~/app/panel";
import { resolveCourseColors } from "~/core/color";
import {
  draftCourseCodes,
  relaxDraft,
  requestItems,
} from "~/core/generate/draft";
import type { GenerateDraft, Relaxation } from "~/core/schema";
import { draftFor, useGenerateDrafts } from "~/state/generate-drafts";
import { useActiveTerm, useCurrentPlan, useTermCatalog } from "~/state/hooks";
import { useWorkspace } from "~/state/workspace-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { CourseList } from "./course-list";
import { requestSummary } from "./labels";
import { MustHaveFields } from "./must-haves";
import { NothingFits } from "./nothing-fits";
import { CustomWeights, RankBySelect } from "./rank-by";
import { Results } from "./results";
import { runGenerate, stopGenerate, useGenerateRun } from "./run-store";
import { saveResults } from "./save";
import { useDraft } from "./use-draft";

// The Generate tab (SPEC §3.9, UX-REVIEW §4.8): the form, then the ranked
// plans under a one-line summary of what was asked. The one primary action
// (Generate plans, or Save N plans) sits in the panel footer. Generating
// creates plans; it never edits the open one. No sparkles: this is search,
// not an LLM (DESIGN §4).

/** Two drafts ask for the same run (the form hasn't changed since). */
function sameInputs(a: GenerateDraft, b: GenerateDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const plans = (n: number) => (n === 1 ? "1 plan" : `${n} plans`);

export function GeneratePanel() {
  const { term, termId } = useActiveTerm();
  const current = useCurrentPlan();
  const catalog = useTermCatalog(termId);
  const [draft, update] = useDraft(termId);
  const blocks = useWorkspace((s) => s.blocks);
  const status = useGenerateRun((s) => s.status);
  const runTermId = useGenerateRun((s) => s.termId);
  const view = useGenerateRun((s) => s.view);
  const selected = useGenerateRun((s) => s.selected);
  const inputRef = useFocusRequest<HTMLInputElement>("generate");
  const topRef = useRef<HTMLDivElement>(null);

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
  const stale =
    done !== null &&
    !sameInputs(
      {
        items: done.request.items,
        mustHaves: done.request.mustHaves,
        rankBy: done.request.rankBy,
      },
      { ...draft, items: requestItems(draft.items) },
    );

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
      draftFor(useGenerateDrafts.getState().drafts, termId),
      r.patch,
    );
    update(() => next);
    track("generate_relaxation_applied", { constraint: r.constraint });
    void runGenerate(termId, next, { relaxed: true });
  };
  const edit = () => useGenerateRun.getState().setView("form");
  const back = () => useGenerateRun.getState().setView("results");
  const save = () => {
    if (!done) return;
    saveResults(
      done.result.results.filter((r) => selected.includes(r.id)),
      done.request,
    );
    useGenerateRun.getState().clearSelected();
  };

  const colors = useMemo(
    // One color per course across every row, as saving would pick them.
    () =>
      resolveCourseColors(draftCourseCodes(draft.items), current?.colors ?? {}),
    [draft.items, current?.colors],
  );
  const termName = term?.name ?? "this term";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Generate"
        sub="Every combination of sections, ranked"
      />
      <p role="status" className="sr-only">
        {busy
          ? "Generating plans…"
          : done
            ? done.result.results.length === 0
              ? "No plans fit."
              : `Found ${done.result.results.length === 1 ? "1 plan" : `${done.result.results.length} plans`}.`
            : ""}
      </p>
      <PanelBody>
        <div ref={topRef} />
        {shared ? (
          <p className="px-4 pt-4 text-muted text-sm">
            You're looking at a shared plan. Close it to generate plans of your
            own.
          </p>
        ) : showing && catalog ? (
          <>
            <div className="flex items-baseline gap-2 border-hairline border-b px-4 py-2">
              <p className="min-w-0 flex-1 text-muted text-sm">
                {requestSummary(showing.request)}
              </p>
              <WithTooltip label="Change courses, must-haves or ranking">
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
            {showing.result.results.length > 0 ? (
              <Results
                request={showing.request}
                result={showing.result}
                index={catalog.index}
                colors={colors}
                plan={current?.plan ?? null}
              />
            ) : (
              <NothingFits
                result={showing.result}
                index={catalog.index}
                colors={colors}
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
              inputRef={inputRef}
            />
            <SectionHeader variant="label" title="Must have" />
            <MustHaveFields
              mustHaves={draft.mustHaves}
              blockCount={blockCount}
              onChange={(mustHaves) => update((d) => ({ ...d, mustHaves }))}
            />
            <SectionHeader
              variant="label"
              title="Rank by"
              right={
                <RankBySelect
                  rankBy={draft.rankBy}
                  onChange={(rankBy) => update((d) => ({ ...d, rankBy }))}
                />
              }
            />
            {draft.rankBy.preset === "custom" ? (
              <CustomWeights
                weights={draft.rankBy.weights}
                onChange={(rankBy) => update((d) => ({ ...d, rankBy }))}
              />
            ) : null}
            {mine.kind === "error" ? (
              <p role="status" className="px-4 pt-4 text-muted text-sm">
                {mine.message}
              </p>
            ) : null}
            <div className="h-4" />
          </>
        )}
      </PanelBody>
      {shared ? null : showing ? (
        selected.length > 0 ? (
          <PanelFooter>
            <WithTooltip label="Each becomes a new plan tab. You can undo.">
              <Button className="flex-1" onClick={save}>
                Save {plans(selected.length)}
              </Button>
            </WithTooltip>
            <WithTooltip label="Untick every plan">
              <Button
                variant="ghost"
                onClick={() => useGenerateRun.getState().clearSelected()}
              >
                Clear
              </Button>
            </WithTooltip>
          </PanelFooter>
        ) : null
      ) : (
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
            // Nothing changed since the last run: its results are still right.
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
            <WithTooltip label="Back to the plans for your earlier choices">
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
