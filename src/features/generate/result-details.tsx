import { useEffect, useMemo, useState } from "react";
import { track } from "~/app/analytics";
import { MessageText } from "~/app/message-text";
import { ListRow, PanelBody, PanelFooter, SectionHeader } from "~/app/panel";
import type { DrillViewProps } from "~/app/registry";
import { changesFrom, type PlanChange } from "~/core/generate/result-plan";
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
// calendar previews it while this is open; here is what changes from the
// open plan and its problems, with Save as new plan in the footer.

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

/** The section side of a change row: "0101 → 0312", "added 0201". */
function ChangeText({ change: c }: { change: PlanChange }) {
  switch (c.kind) {
    case "added":
      return (
        <>
          <span className="text-muted">added </span>
          <span className="ident">{c.to}</span>
        </>
      );
    case "switched":
      return (
        <span className="ident">
          <span className="text-muted">{c.from} → </span>
          {c.to}
        </span>
      );
    case "placed":
      return (
        <>
          <span className="text-muted">placed </span>
          <span className="ident">{c.to}</span>
        </>
      );
    case "unplaced":
      return (
        <span className="text-muted">
          <span className="ident">{c.from}</span> → saved for later
        </span>
      );
    case "dropped":
      return <span className="text-muted">not in this plan</span>;
  }
}

/** A detail row's lead: the course code, one width down the list. */
function Code({ code }: { code: string }) {
  return <span className="block w-16 ident font-semibold">{code}</span>;
}

/**
 * "ENGL393: 28 other sections meet at the same times · Show", opening the
 * section numbers in place (UX-REVIEW §4.8): a wall of codes up front
 * buried the rest of the details.
 */
function SameTimesRow({
  courseCode,
  others,
}: {
  courseCode: string;
  others: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const n = others.length;
  return (
    <ListRow
      as="li"
      className="items-start text-base"
      lead={<Code code={courseCode} />}
    >
      <span className="text-muted">
        {n === 1 ? "1 other section meets" : `${n} other sections meet`} at the
        same times ·{" "}
      </span>
      <WithTooltip
        label={open ? "Hide the section numbers" : "Show the section numbers"}
      >
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-base"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </WithTooltip>
      {open ? (
        <p className="mt-1 text-muted text-sm">
          <span className="ident text-fg">{others.join(", ")}</span>. Rooms may
          differ. Switch any time in course details.
        </p>
      ) : null}
    </ListRow>
  );
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
      <PanelBody className="px-4 py-3 text-base text-muted">
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
  const chosen = new Set<string>(result.sections);
  const s = result.stats;

  return (
    <>
      <PanelBody className="pb-6">
        <div className="px-4 pt-4 pb-4">
          <h3 className="font-semibold text-lg">{optionLabel(found.rank)}</h3>
          <p className="tnum mt-1 text-base text-muted">
            {problems.length === 1
              ? "1 problem"
              : `${problems.length} problems`}{" "}
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
          <p className="tnum mt-2 text-muted text-sm">
            {s.firstClass !== null && s.lastClass !== null
              ? `${formatTime(s.firstClass)} to ${formatTime(s.lastClass)} · `
              : ""}
            {statsLine(s)}
          </p>
        </div>

        <SectionHeader title={`Changes from ${current.plan.name}`} />
        <ul aria-label={`Changes from ${current.plan.name}`}>
          {changes.length > 0 ? (
            changes.map((c) => {
              const who =
                c.kind === "added" ||
                c.kind === "switched" ||
                c.kind === "placed"
                  ? instructorsOf(c.courseCode, c.to)
                  : undefined;
              return (
                <ListRow
                  as="li"
                  key={c.courseCode}
                  className="text-base"
                  lead={<Code code={c.courseCode} />}
                >
                  <div className="truncate" title={who || undefined}>
                    <ChangeText change={c} />
                    {who ? <span className="text-muted"> · {who}</span> : null}
                  </div>
                </ListRow>
              );
            })
          ) : (
            <ListRow as="li" className="text-base text-muted">
              No changes.
            </ListRow>
          )}
          {result.equivalents.byCourse.map((c) => (
            <SameTimesRow
              key={c.courseCode}
              courseCode={c.courseCode}
              others={c.sectionCodes.filter(
                (code) => !chosen.has(`${c.courseCode}-${code}`),
              )}
            />
          ))}
        </ul>

        {problems.length > 0 ? (
          <>
            <SectionHeader title="Problems" count={problems.length} />
            <ul aria-label="Problems">
              {problems.map((p) => (
                <ListRow as="li" key={p.id} className="text-base">
                  <div>
                    <MessageText message={p.title} />
                  </div>
                  <div className="text-muted text-sm">
                    <MessageText message={p.detail} />
                  </div>
                </ListRow>
              ))}
            </ul>
          </>
        ) : null}
      </PanelBody>
      <PanelFooter>
        <WithTooltip label="Adds it as a new plan tab and opens it. You can undo.">
          <Button
            className="flex-1"
            onClick={() => {
              saveResults([result], request);
              useUi.getState().setPreviewPlan(null);
              useUi.getState().back();
            }}
          >
            Save as new plan
          </Button>
        </WithTooltip>
      </PanelFooter>
    </>
  );
}
