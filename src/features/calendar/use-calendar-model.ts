import { useMemo } from "react";
import { placedSections } from "~/core/catalog";
import type { SeatsMap } from "~/core/seats";
import { planConnections } from "~/core/travel";
import {
  type CurrentPlan,
  useCurrentPlan,
  useFitContext,
  usePlanConnections,
  useTermCatalog,
  useTravel,
} from "~/state/hooks";
import { selectGhostCourse, selectOpenCourse, useUi } from "~/state/ui-store";
import { buildCalendarModel, type CalendarModel } from "./layout";

export interface CalendarView {
  model: CalendarModel | null;
  current: CurrentPlan | null;
  /** Ghosts come from the course open in the sidebar (clickable), not a hover. */
  ghostsFromOpenCourse: boolean;
  /** A generated plan shown instead of the open one (read-only). */
  previewing: { label: string; changed: ReadonlySet<string> } | null;
  seats: SeatsMap | null;
}

/** The calendar model for what's on screen, rebuilt only when an input changes. */
export function useCalendarModel(): CalendarView {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const connections = usePlanConnections();
  const fit = useFitContext();
  const ghostCode = useUi(selectGhostCourse);
  const openCourse = useUi(selectOpenCourse);
  const preview = useUi((s) => s.previewSection);
  const planPreview = useUi((s) => s.previewPlan);

  const ghostCourse =
    (ghostCode ? catalog?.index.courses.get(ghostCode) : undefined) ?? null;
  const index = catalog?.index;
  const seats = catalog?.seats?.seats ?? null;
  const { travel, campus } = useTravel();
  // A previewed plan (Generate) gets its own connections, through the same
  // path as the open plan's, so its pills say what its details say.
  const previewConnections = useMemo(
    () =>
      planPreview && index
        ? planConnections(
            placedSections(planPreview.plan, index),
            travel,
            campus,
          )
        : null,
    [planPreview, index, travel, campus],
  );

  const model = useMemo(
    () =>
      current && index
        ? buildCalendarModel({
            plan: planPreview?.plan ?? current.plan,
            index,
            blocks: current.blocks,
            colors: current.colors,
            connections: previewConnections ?? connections,
            ghostCourse: planPreview ? null : ghostCourse,
            fit,
            seats,
            preview,
          })
        : null,
    [
      current,
      index,
      connections,
      previewConnections,
      ghostCourse,
      fit,
      seats,
      preview,
      planPreview,
    ],
  );
  const previewing = useMemo(() => {
    if (!planPreview || !current) return null;
    const mine = new Set(
      current.plan.courses.map((c) => `${c.courseCode}-${c.sectionCode}`),
    );
    const changed = new Set(
      planPreview.plan.courses
        .map((c) => `${c.courseCode}-${c.sectionCode}`)
        .filter((key) => !mine.has(key)),
    );
    return { label: planPreview.label, changed };
  }, [planPreview, current]);

  return {
    model,
    current,
    ghostsFromOpenCourse:
      !planPreview && ghostCode !== null && ghostCode === openCourse,
    previewing,
    seats,
  };
}
