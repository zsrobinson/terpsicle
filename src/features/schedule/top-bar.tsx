import { cn } from "cn";
import type { ReactNode } from "react";
import { AppBar } from "~/components/app-bar";
import { CreditsStatus, ProblemsStatus } from "~/components/workbench/status";
import { SCHEDULE_PATH } from "~/core/routing";
import { SyncStatusIcon } from "~/features/sync/status-view";
import { useCatalog } from "~/state/catalog-store";
import {
  useCreditsLabel,
  usePlanProblemsState,
  useProblemCounts,
} from "~/state/hooks";
import { openTab } from "./actions";
import { tabById } from "./tabs";

// The scheduler's bar (SPEC §2): the family bar (~/components/app-bar.tsx) with the term
// and plans as its context, and credits, the problem count and sync as its
// status. The middle (tabs or the shared pill) comes from the shell.

export function TopBar({
  term,
  plans,
  compact = false,
}: {
  term: ReactNode;
  plans: ReactNode;
  compact?: boolean;
}) {
  return (
    <AppBar
      current="schedule"
      heading
      crowdedBelow2xl
      compact={compact}
      feedback="schedule"
      pathname={SCHEDULE_PATH}
      context={
        <>
          {term}
          {compact ? null : <Slash />}
          <div className="flex min-w-0 flex-1 items-center">{plans}</div>
        </>
      }
      status={
        <>
          <OfflineNote compact={compact} />
          {compact ? null : <Credits />}
          <ProblemsButton compact={compact} />
          {compact ? null : <SyncStatusIcon />}
        </>
      }
    />
  );
}

function Slash({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("text-faint", className)}>
      /
    </span>
  );
}

/**
 * The only sign of being offline with saved data (SPEC §3.13, DESIGN §5):
 * quiet words, no banner. With nothing saved, the calendar's place shows
 * the error and a retry instead (catalog-error.tsx).
 */
function OfflineNote({ compact }: { compact: boolean }) {
  const offline = useCatalog(
    (s) => s.network === "offline" && s.terms !== null,
  );
  if (!offline) return null;
  return (
    <span role="status" className="text-faint text-sm">
      {compact ? "Offline" : "Offline · showing saved data"}
    </span>
  );
}

function Credits() {
  // Below 1280px the product tabs, term and plan tabs fill the bar, and the
  // Courses panel's header already says "N courses · N credits" (QA2).
  return (
    <div className="hidden xl:flex">
      <CreditsStatus label={useCreditsLabel()} />
    </div>
  );
}

/** The problem count, which opens the Problems tab (~/components/workbench/status). */
function ProblemsButton({ compact }: { compact: boolean }) {
  const { checking } = usePlanProblemsState();
  const counts = useProblemCounts();
  return (
    <ProblemsStatus
      counts={counts}
      checking={checking}
      compact={compact}
      shortcut={tabById("problems").shortcut}
      onOpen={() => openTab("problems", "click")}
    />
  );
}
