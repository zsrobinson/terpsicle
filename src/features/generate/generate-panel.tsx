import { useEffect, useMemo, useRef } from "react";
import { track } from "~/app/analytics";
import {
  PanelBody,
  PanelHeader,
  PanelLabel,
  useFocusRequest,
} from "~/app/panel";
import { resolveCourseColors } from "~/core/color";
import { draftCourseCodes, relaxDraft, requestItems } from "~/core/generate";
import type { GenerateDraft, Relaxation } from "~/core/schema";
import { draftFor, useGenerateDrafts } from "~/state/generate-drafts";
import { useActiveTerm, useCurrentPlan, useTermCatalog } from "~/state/hooks";
import { useWorkspace } from "~/state/workspace-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { CourseList } from "./course-list";
import { MustHaveFields } from "./must-haves";
import { NothingFits } from "./nothing-fits";
import { CustomWeights, RankBySelect } from "./rank-by";
import { Results } from "./results";
import { runGenerate, stopGenerate, useGenerateRun } from "./run-store";
import { useDraft } from "./use-draft";

// The Generate tab (SPEC §3.9, prototype screenshot 08): courses, must-haves
// and ranking, then ranked plans. Generating creates plans; it never edits
// the open one. No sparkles: this is search, not an LLM (DESIGN §4).

/** Two drafts ask for the same run (the form hasn't changed since). */
function sameInputs(a: GenerateDraft, b: GenerateDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function GeneratePanel() {
  const { term, termId } = useActiveTerm();
  const current = useCurrentPlan();
  const catalog = useTermCatalog(termId);
  const [draft, update] = useDraft(termId);
  const blocks = useWorkspace((s) => s.blocks);
  const status = useGenerateRun((s) => s.status);
  const runTermId = useGenerateRun((s) => s.termId);
  const inputRef = useFocusRequest<HTMLInputElement>("generate");
  const resultsRef = useRef<HTMLDivElement>(null);

  const blockCount = useMemo(
    () => blocks.filter((b) => b.termId === termId).length,
    [blocks, termId],
  );
  const runnable = requestItems(draft.items).length > 0;
  const shared = current?.source === "shared";
  const mine = runTermId === termId ? status : { kind: "idle" as const };
  const busy = mine.kind === "loading" || mine.kind === "running";
  const done = mine.kind === "done" ? mine : null;
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

  // Bring fresh results into view when they land below the fold (the form
  // is long, and on phones the drawer is short).
  useEffect(() => {
    const el = resultsRef.current;
    if (!done || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.6)
      el.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [done]);

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
      <PanelBody className="pb-4">
        {shared ? (
          <p className="px-4 pt-4 text-[12.5px] text-muted">
            You're looking at a shared plan. Close it to generate plans of your
            own.
          </p>
        ) : (
          <>
            <PanelLabel>Courses</PanelLabel>
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
            <PanelLabel>Must have</PanelLabel>
            <MustHaveFields
              mustHaves={draft.mustHaves}
              blockCount={blockCount}
              onChange={(mustHaves) => update((d) => ({ ...d, mustHaves }))}
            />
            <PanelLabel
              right={
                <RankBySelect
                  rankBy={draft.rankBy}
                  onChange={(rankBy) => update((d) => ({ ...d, rankBy }))}
                />
              }
            >
              Rank by
            </PanelLabel>
            {draft.rankBy.preset === "custom" ? (
              <CustomWeights
                weights={draft.rankBy.weights}
                onChange={(rankBy) => update((d) => ({ ...d, rankBy }))}
              />
            ) : null}
            <div className="sticky top-0 z-10 mt-2 flex items-center gap-2 border-hairline border-b bg-bg px-4 py-2">
              {busy ? (
                <>
                  <WithTooltip label="Stop searching">
                    <Button
                      variant="outline"
                      className="text-[12.5px]"
                      onClick={stopGenerate}
                    >
                      Stop
                    </Button>
                  </WithTooltip>
                  <span
                    role="status"
                    className="tnum truncate text-[12px] text-muted"
                  >
                    {mine.kind === "running" && mine.steps > 0
                      ? `Checked ${mine.steps.toLocaleString()} combinations…`
                      : "Generating…"}
                  </span>
                </>
              ) : (
                <WithTooltip
                  label={
                    runnable
                      ? "Try every combination of sections and rank them"
                      : "Add a course first"
                  }
                >
                  {/* A disabled button gets no pointer events; the span keeps the tooltip. */}
                  <span className="flex-1">
                    <Button
                      className="w-full text-[12.5px]"
                      disabled={!runnable || !termId}
                      onClick={run}
                    >
                      {done && stale ? "Generate again" : "Generate plans"}
                    </Button>
                  </span>
                </WithTooltip>
              )}
            </div>
            {mine.kind === "error" ? (
              <p role="status" className="px-4 pt-2 text-[12.5px] text-muted">
                {mine.message}
              </p>
            ) : null}
            {done && stale ? (
              <p className="px-4 pt-2 text-[11.5px] text-faint">
                These plans are for your earlier choices.
              </p>
            ) : null}
            <div ref={resultsRef} className="scroll-mt-14" />
            {done && catalog ? (
              done.result.results.length > 0 ? (
                <Results
                  request={done.request}
                  result={done.result}
                  index={catalog.index}
                  colors={colors}
                  plan={current?.plan ?? null}
                />
              ) : (
                <NothingFits
                  result={done.result}
                  index={catalog.index}
                  colors={colors}
                  onRelax={relax}
                />
              )
            ) : null}
          </>
        )}
      </PanelBody>
    </div>
  );
}
