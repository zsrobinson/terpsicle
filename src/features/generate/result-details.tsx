import { cn } from "cn";
import { useEffect, useMemo, useState } from "react";
import { MessageText } from "~/components/message-text";
import {
  ListRow,
  PanelBody,
  PanelFooter,
  SectionHeader,
} from "~/components/panel";
import { wildcardFromId, wildcardLabel } from "~/core/catalog";
import type { SectionRef } from "~/core/catalog/catalog-index";
import {
  activePreferences,
  preferenceLevels,
  preferenceMark,
} from "~/core/generate/preferences";
import { sectionQuality } from "~/core/generate/quality";
import { changesFrom, type PlanChange } from "~/core/generate/result-plan";
import { planProblems } from "~/core/problems";
import type { Meeting, Plan, SectionKey } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTime } from "~/core/time";
import { planConnections, verdictMessage } from "~/core/travel";
import {
  meetingKindWords,
  meetingWords,
} from "~/features/course-details/words";
import { SeatMeter } from "~/features/courses/seat-meter";
import { useDrillEntry } from "~/features/schedule/drill-entry";
import { closeDrill } from "~/features/schedule/schedule-nav";
import { track } from "~/lib/analytics";
import { useLoadedPlanetTerp } from "~/state/data-hooks";

import {
  useCurrentPlan,
  usePlanProblems,
  useTermCatalog,
  useTravel,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { PREFERENCE_LABELS } from "./chips";
import { optionLabel, statsLine } from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";
import { useGenerateRun } from "./run-store";
import { addResultAsPlan, coursesOf, nextPlanNameIn } from "./save";
import { ScoreBar } from "./score-bar";

// One generated plan, drilled into by its row's arrow (SPEC §3.9, prototype
// screenshot 09): the calendar previews it while this is open. Here is every
// course and section with what we know of it (instructor, rating, grades,
// times, seats), what it changes from the open plan, the walks between
// classes and its problems, and at the bottom one action: "Add as Plan C".

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

/** How a course's section differs from the open plan: "New", "Was 0101". */
function changeWords(change: PlanChange | undefined): string | null {
  if (!change) return null;
  switch (change.kind) {
    case "added":
      return "New";
    case "switched":
      return `Was ${change.from}`;
    case "placed":
      return "Was bookmarked";
    case "unplaced":
    case "dropped":
      return null;
  }
}

/** A detail row's lead: the course code, one width down the list. */
function Code({ code }: { code: string }) {
  return <span className="block w-16 ident font-semibold">{code}</span>;
}

/** One meeting on its own line: "Lec  MWF 10–10:50am  IRB 0324". */
function MeetingLine({ meeting }: { meeting: Meeting }) {
  const when = meetingWords(meeting, { kind: false, place: false });
  const place = meeting.online
    ? meeting.timed
      ? "Online"
      : ""
    : [meeting.building, meeting.room].filter(Boolean).join(" ");
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="w-7 shrink-0 text-muted text-xs">
        {meetingKindWords(meeting.kind).short}
      </span>
      <span className="tnum shrink-0">{when}</span>
      {place ? <span className="truncate text-muted">{place}</span> : null}
    </span>
  );
}

/**
 * "28 other sections meet at the same times · Show", opening the section
 * numbers in place (UX-REVIEW §4.8): a wall of codes up front buried the
 * rest of the details.
 */
function SameTimes({ others }: { others: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const n = others.length;
  return (
    <div className="text-muted text-sm">
      {n === 1 ? "1 other section meets" : `${n} other sections meet`} at the
      same times ·{" "}
      <WithTooltip
        label={open ? "Hide the section numbers" : "Show the section numbers"}
      >
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </WithTooltip>
      {open ? (
        <p className="mt-0.5">
          <span className="ident text-fg">{others.join(", ")}</span>. Rooms may
          differ. Switch any time in course details.
        </p>
      ) : null}
    </div>
  );
}

/** A generated plan's drill-in (`/schedule/result/$resultId`). */
export function ResultDetails() {
  const entry = useDrillEntry("generated-plan");
  const found = useResult(entry.resultId);
  const current = useCurrentPlan();
  const catalog = useTermCatalog(found?.request.termId ?? null);
  const instructors = useLoadedPlanetTerp();
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
  const refs = useMemo(
    (): SectionRef[] =>
      found && catalog
        ? found.result.sections.flatMap((k) => {
            const ref = catalog.index.sections.get(k);
            return ref ? [ref] : [];
          })
        : [],
    [found, catalog],
  );
  // Ratings and GPAs per section, joined the way the ranking joined them.
  const quality = useMemo(
    () =>
      sectionQuality(
        refs.map((r) => r.course),
        [...instructors.values()],
      ),
    [refs, instructors],
  );
  const walks = useMemo(
    () =>
      planConnections(refs, travel, campus).filter(
        (c) => c.verdict !== "unknown",
      ),
    [refs, travel, campus],
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
  const changeOf = new Map(changes.map((c) => [c.courseCode, c]));
  const left = changes.filter(
    (c) => c.kind === "dropped" || c.kind === "unplaced",
  );
  const filledFor = new Map(result.filled.map((f) => [f.courseCode, f]));
  const chosen = new Set<string>(result.sections);
  const s = result.stats;
  const why = activePreferences(preferenceLevels(request.rankBy));
  const name = nextPlanNameIn(request.termId);
  const planName = current.plan.name;

  return (
    <>
      <PanelBody className="pb-6">
        <div className="px-4 pt-4 pb-4">
          <h2 className="emph-title text-lg">{optionLabel(found.rank)}</h2>
          <p className="tnum mt-1 text-base text-muted">
            {problems.length === 1
              ? "1 problem"
              : `${problems.length} problems`}{" "}
            (vs {before} in {planName}) · {s.daysOnCampus}{" "}
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
          {why.length > 0 ? (
            <ul
              aria-label="How it ranks"
              className="mt-2 flex flex-col gap-0.5 text-sm"
            >
              {why.map((f) => {
                const m = preferenceMark(f, result.breakdown, s);
                return (
                  <li key={f} className="flex items-center gap-2">
                    <ScoreBar score={m.score} />
                    <span className="w-24 shrink-0 text-muted">
                      {PREFERENCE_LABELS[f]}
                    </span>
                    <span className="tnum min-w-0 truncate">{m.words}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <SectionHeader
          title="Courses"
          count={refs.length}
          right={
            <span className="truncate text-muted text-xs">
              Compared with {planName}
            </span>
          }
        />
        <ul aria-label="Courses and sections">
          {refs.map(({ course, section }) => {
            const key: SectionKey = `${course.code}-${section.code}`;
            const q = quality.get(key);
            const change = changeWords(changeOf.get(course.code));
            const filled = filledFor.get(course.code);
            const wildcard = filled ? wildcardFromId(filled.wildcard) : null;
            const same =
              result.equivalents.byCourse
                .find((c) => c.courseCode === course.code)
                ?.sectionCodes.filter(
                  (code) => !chosen.has(`${course.code}-${code}`),
                ) ?? [];
            return (
              <ListRow
                as="li"
                key={key}
                align="start"
                data-testid={`result-section-${key}`}
                className="text-base"
                lead={<Code code={course.code} />}
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 truncate" title={course.title}>
                    {course.title}
                  </span>
                  {change ? (
                    <span className="shrink-0 rounded-sm bg-accent-soft px-1 text-muted text-xs">
                      {change}
                    </span>
                  ) : null}
                </div>
                <div className="tnum truncate text-muted text-sm">
                  <span className="ident text-fg">{section.code}</span>
                  {" · "}
                  {section.instructors.length > 0
                    ? section.instructors.join(", ")
                    : "Instructor TBA"}
                  {q?.rating != null ? ` · ★ ${q.rating.toFixed(1)}` : ""}
                  {q?.gpa != null ? ` · ${q.gpa.toFixed(2)} GPA` : ""}
                </div>
                <div className="mt-0.5 flex flex-col text-sm">
                  {section.meetings.length > 0 ? (
                    section.meetings.map((m, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: meetings are positional and never reorder
                      <MeetingLine key={i} meeting={m} />
                    ))
                  ) : (
                    <span className="text-muted">
                      Contact the department for times
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  {/* The seat words course details and Register show, in their colors. */}
                  <SeatMeter
                    seats={catalog.seats?.seats ?? null}
                    sectionKey={key}
                    meter={false}
                  />
                  {wildcard ? (
                    <span className="text-muted">
                      {" "}
                      · for {wildcardLabel(wildcard)}
                    </span>
                  ) : null}
                </div>
                {same.length > 0 ? <SameTimes others={same} /> : null}
              </ListRow>
            );
          })}
          {left.map((c) => (
            <ListRow
              as="li"
              key={c.courseCode}
              className="text-base text-muted"
              lead={<Code code={c.courseCode} />}
            >
              {c.kind === "unplaced"
                ? `Bookmarked, not placed (was ${c.from})`
                : "Left out of this plan"}
            </ListRow>
          ))}
        </ul>

        {walks.length > 0 ? (
          <>
            <SectionHeader title="Walks" count={walks.length} />
            <ul aria-label="Walks between classes">
              {walks.map((c) => (
                <ListRow
                  as="li"
                  key={c.id}
                  align="start"
                  className="text-base"
                  lead={
                    <span className="block w-16 text-muted">
                      {DAY_SHORT_NAMES[c.day]}
                    </span>
                  }
                >
                  <div className="ident">
                    {c.from.building} → {c.to.building}
                  </div>
                  <div
                    className={cn(
                      "text-sm",
                      c.verdict === "insufficient" || c.verdict === "tight"
                        ? "text-warn"
                        : "text-muted",
                    )}
                  >
                    <MessageText message={verdictMessage(c)} />
                  </div>
                </ListRow>
              ))}
            </ul>
          </>
        ) : null}

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
        <WithTooltip
          label={`Adds it as ${name}, a new plan tab, and opens it. You can undo.`}
        >
          <Button
            className="flex-1"
            onClick={() => {
              addResultAsPlan(result, request);
              useUi.getState().setPreviewPlan(null);
              closeDrill();
            }}
          >
            Add as {name}
          </Button>
        </WithTooltip>
      </PanelFooter>
    </>
  );
}
