import {
  BookOpen,
  CircleAlert,
  FileText,
  LayoutGrid,
  type LucideIcon,
  Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { PanelBody, PanelHeader } from "~/app/panel";
import { CountBadge } from "~/app/workbench/rail";
import type { PlanTab } from "~/core/schema";
import { useProblemCounts } from "./model";

// Plan's views (V3 §2.13), on its workbench rail and in its phone drawer,
// in this order. Each is a route (~/core/routing/plan-location); its panel
// fills the sidebar under a panel header, as the scheduler's tabs do.

export type PlanViewInfo = {
  readonly tab: PlanTab;
  readonly label: string;
  /** What it's for: the region's name, and the rail's tooltip. */
  readonly tip: string;
  readonly icon: LucideIcon;
  /** `1`–`5`, as the scheduler's `1`–`7`. */
  readonly shortcut: string;
};

export const PLAN_VIEWS: readonly PlanViewInfo[] = [
  {
    tab: "gened",
    label: "GenEd",
    tip: "GenEd progress",
    icon: BookOpen,
    shortcut: "1",
  },
  {
    tab: "problems",
    label: "Problems",
    tip: "Prerequisites and credits",
    icon: CircleAlert,
    shortcut: "2",
  },
  {
    tab: "search",
    label: "Search",
    tip: "Find a course to add",
    icon: Search,
    shortcut: "3",
  },
  {
    tab: "templates",
    label: "Samples",
    tip: "Start from a sample plan",
    icon: LayoutGrid,
    shortcut: "4",
  },
  {
    tab: "import",
    label: "Import",
    tip: "Import your transcript",
    icon: FileText,
    shortcut: "5",
  },
];

export function planView(tab: PlanTab): PlanViewInfo {
  const view = PLAN_VIEWS.find((v) => v.tab === tab);
  if (!view) throw new Error(`Unknown Plan view ${tab}`);
  return view;
}

/** Warnings on the Problems view, as the scheduler's rail counts them: notes don't. */
export function ProblemsBadge({ className }: { className?: string }) {
  const counts = useProblemCounts();
  return (
    <CountBadge
      count={counts.error + counts.warning}
      tone={counts.error > 0 ? "error" : "warn"}
      className={className}
    />
  );
}

/**
 * A view's panel: its header, then its body, the one scroll area. The body
 * takes Tab, since a view may have nothing focusable to scroll to (GenEd
 * with every category covered).
 */
export function PlanView({
  tab,
  status,
  children,
}: {
  tab: PlanTab;
  /** The header's one line: "5 of 11 categories covered", "1 problem". */
  status?: ReactNode;
  children: ReactNode;
}) {
  const view = planView(tab);
  return (
    <section aria-label={view.tip} className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title={view.label} sub={status} />
      <PanelBody focusable>{children}</PanelBody>
    </section>
  );
}
