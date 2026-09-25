import { useEffect, useMemo } from "react";
import { track } from "~/app/analytics";
import { MessageText } from "~/app/message-text";
import { PanelBody } from "~/app/panel";
import type { DrillViewProps } from "~/app/registry";
import { changesFrom, type PlanChange } from "~/core/generate";
import { planProblems } from "~/core/problems";
import type { Plan, SectionKey } from "~/core/schema";
import { formatTime } from "~/core/time";
import {
  useCurrentPlan,
  usePlanProblems,
  useTermCatalog,
  useTravel,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { optionLabel, statsLine } from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";
import { useGenerateRun } from "./run-store";
import { coursesOf, saveResults } from "./save";

// One generated plan, drilled into (SPEC §3.9, prototype screenshot 09): the
// calendar previews it while this is open; here are its problems, what
// changes from the open plan, and Save as new plan.

declare module "~/state/drill" {
  interface DrillViews {
    "generated-plan": { resultId: string };
  }
}

/** The result and its rank in the latest run, if it's still there. */
function useResult(resultId: string) {
  const status = useGenerateRun((s) => s.status);
  return useMemo(() => {
    if (status.kind !== "done") return null;
    const i = status.result.results.findIndex((r) => r.id === resultId);
    const result = status.result.results[i];
    return result ? { result, rank: i + 1, request: status.request } : null;
  }, [status, resultId]);
}

/** The breadcrumb: "Option 3". */
export function resultCrumb(resultId: string): string {
  const { status } = useGenerateRun.getState();
  if (status.kind !== "done") return "Plan";
  const i = status.result.results.findIndex((r) => r.id === resultId);
  return i >= 0 ? optionLabel(i + 1) : "Plan";
}

function changeText(c: PlanChange) {
  switch (c.kind) {
    case "added":
      return { from: "added: ", to: c.to };
    case "switched":
      return { from: `${c.from} → `, to: c.to };
    case "placed":
      return { from: "placed: ", to: c.to };
    case "unplaced":
      return { from: `${c.from} → `, to: "saved for later" };
    case "dropped":
      return { from: "", to: "not in this plan" };
  }
}

export function ResultDetails({ entry }: DrillViewProps<"generated-plan">) {
  const found = useResult(entry.resultId);
  const current = useCurrentPlan();
  const catalog = useTermCatalog(found?.request.termId ?? null);
  const { travel, campus } = useTravel();
  const currentProblems = usePlanProblems();

  const courses = useMemo(
    () => (found ? coursesOf(found.result, found.request) : []),
    [found],
  );
  const plan = current?.plan ?? null;
  const preview: Plan | null = useMemo(
    () =>
      plan && found
        ? { ...plan, courses, name: optionLabel(found.rank) }
        : null,
    [plan, courses, found],
  );
  const changes = useMemo(
    () => (plan ? changesFrom(plan, courses) : []),
    [plan, courses],
  );
  const problems = useMemo(
    () =>
      preview && catalog && current
        ? planProblems({
            plan: preview,
            index: catalog.index,
            blocks: current.blocks,
            travel,
            campus,
            seats: catalog.seats?.seats ?? null,
            changes: catalog.changes?.changes ?? [],
          }).filter((p) => p.severity !== "info")
        : [],
    [preview, catalog, current, travel, campus],
  );
  const before = currentProblems.filter((p) => p.severity !== "info").length;

  // Preview on the calendar while this is open.
  const label = found ? optionLabel(found.rank) : null;
  useEffect(() => {
    if (!preview || !label) return;
    const shown = { plan: preview, label };
    useUi.getState().setPreviewPlan(shown);
    return () => {
      if (useUi.getState().previewPlan === shown)
        useUi.getState().setPreviewPlan(null);
    };
  }, [preview, label]);
  const rank = found?.rank;
  useEffect(() => {
    if (rank) track("generate_result_previewed", { rank });
  }, [rank]);

  if (!found || !catalog || !current)
    return (
      <PanelBody className="px-4 py-3 text-[12.5px] text-muted">
        This plan isn't in the latest results. Go back to see them.
      </PanelBody>
    );

  const { result, request } = found;
  const marks = new Map<SectionKey, MiniWeekMark>();
  for (const c of changes)
    if (c.kind === "added" || c.kind === "switched" || c.kind === "placed")
      marks.set(`${c.courseCode}-${c.to}`, "changed");
  const instructorsOf = (courseCode: string, sectionCode: string) =>
    catalog.index.sections
      .get(`${courseCode}-${sectionCode}`)
      ?.section.instructors.join(", ");
  const s = result.stats;

  return (
    <PanelBody className="px-4 pt-4 pb-6">
      <h3 className="font-semibold text-[15px]">{optionLabel(found.rank)}</h3>
      <p className="tnum mt-1 text-[12.5px] text-muted">
        {problems.length === 1 ? "1 problem" : `${problems.length} problems`}{" "}
        (vs {before} in {current.plan.name}) · {s.daysOnCampus}{" "}
        {s.daysOnCampus === 1 ? "day" : "days"} on campus
      </p>
      <div className="mt-3 h-[88px]">
        <MiniWeek
          sections={result.sections}
          index={catalog.index}
          colors={current.colors}
          marks={marks}
        />
      </div>
      <p className="tnum mt-2 text-[11.5px] text-muted">
        {s.firstClass !== null && s.lastClass !== null
          ? `${formatTime(s.firstClass)} to ${formatTime(s.lastClass)} · `
          : ""}
        {statsLine(s)}
      </p>

      <div className="mt-4 font-medium text-[11px] text-muted">
        Changes from {current.plan.name}
      </div>
      <ul className="mt-1.5 divide-y divide-hairline rounded-lg border border-hairline text-[12.5px]">
        {changes.length > 0 ? (
          changes.map((c) => {
            const t = changeText(c);
            const who =
              c.kind === "added" || c.kind === "switched" || c.kind === "placed"
                ? instructorsOf(c.courseCode, c.to)
                : undefined;
            return (
              <li key={c.courseCode} className="px-3 py-2">
                <span className="font-mono font-semibold">{c.courseCode}</span>{" "}
                <span className="text-muted">{t.from}</span>
                <span
                  className={
                    c.kind === "dropped" || c.kind === "unplaced"
                      ? "text-muted"
                      : "font-mono"
                  }
                >
                  {t.to}
                </span>
                {who ? <span className="text-muted"> · {who}</span> : null}
              </li>
            );
          })
        ) : (
          <li className="px-3 py-2 text-muted">No changes.</li>
        )}
      </ul>

      {result.equivalents.byCourse.length > 0 ? (
        <>
          <div className="mt-4 font-medium text-[11px] text-muted">
            Same times, other sections
          </div>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px]">
            {result.equivalents.byCourse.map((c) => (
              <li key={c.courseCode}>
                <span className="font-mono font-semibold">{c.courseCode}</span>{" "}
                <span className="font-mono">{c.sectionCodes.join(", ")}</span>
                <span className="text-muted">
                  {" "}
                  meet at the same times (rooms may differ). Switch any time in
                  course details.
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {problems.length > 0 ? (
        <>
          <div className="mt-4 font-medium text-[11px] text-muted">
            Problems
          </div>
          <ul className="mt-1.5 flex flex-col gap-1.5 text-[12.5px]">
            {problems.map((p) => (
              <li key={p.id}>
                <div>
                  <MessageText message={p.title} />
                </div>
                <div className="text-[11.5px] text-muted">
                  <MessageText message={p.detail} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-4 flex gap-2">
        <WithTooltip label="Adds it as a new plan tab and opens it. You can undo.">
          <Button
            className="text-[12.5px]"
            onClick={() => {
              saveResults([result], request);
              useUi.getState().setPreviewPlan(null);
              useUi.getState().back();
            }}
          >
            Save as new plan
          </Button>
        </WithTooltip>
      </div>
    </PanelBody>
  );
}
