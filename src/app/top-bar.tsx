import { cn } from "cn";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useCatalog } from "~/state/catalog-store";
import { useCreditsLabel, useProblemCounts } from "~/state/hooks";
import { WithTooltip } from "~/ui/tooltip";
import { openTab } from "./actions";
import { Logo } from "./logo";
import { tabById } from "./tabs";

// The top bar (SPEC §2): logo / term / plans on the left, credits and the
// problem count on the right. The middle (tabs or the shared pill) comes
// from the shell.

export function TopBar({
  term,
  plans,
  end,
  compact = false,
}: {
  term: ReactNode;
  plans: ReactNode;
  /** Extra controls at the far right (the theme toggle on phones). */
  end?: ReactNode;
  compact?: boolean;
}) {
  return (
    // Phones drop the slashes and tighten gaps so the open plan's name fits.
    <header
      className={cn(
        "flex h-12 shrink-0 items-center border-hairline border-b",
        compact ? "gap-1 px-2" : "gap-2 px-3",
      )}
    >
      <Logo compact={compact} />
      {compact ? null : <Slash className="ml-2" />}
      {term}
      {compact ? null : <Slash />}
      <div className="flex min-w-0 flex-1 items-center">{plans}</div>
      <div
        className={cn(
          "flex shrink-0 items-center",
          compact ? "gap-1" : "gap-3",
        )}
      >
        <OfflineNote compact={compact} />
        {compact ? null : <Credits />}
        <ProblemsButton compact={compact} />
        {end}
      </div>
    </header>
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
    <span role="status" className="text-[12px] text-faint">
      {compact ? "Offline" : "Offline · showing saved data"}
    </span>
  );
}

function Credits() {
  const label = useCreditsLabel();
  if (!label) return null;
  const [number, ...rest] = label.split(" ");
  return (
    <span className="tnum text-[12.5px] text-muted">
      <span className="font-medium text-fg">{number}</span> {rest.join(" ")}
    </span>
  );
}

/**
 * Calm by default (DESIGN §5): red only when there's an error, amber for
 * warnings alone, and quiet when there's nothing to fix.
 */
function ProblemsButton({ compact }: { compact: boolean }) {
  const counts = useProblemCounts();
  const n = counts.error + counts.warning;
  const tone =
    counts.error > 0 ? "error" : counts.warning > 0 ? "warning" : "none";
  const Icon =
    tone === "error"
      ? CircleAlert
      : tone === "warning"
        ? TriangleAlert
        : CircleCheck;
  const words =
    n === 0 ? "No problems" : `${n} ${n === 1 ? "problem" : "problems"}`;
  return (
    <WithTooltip
      label={n === 0 ? "Open Problems" : "See what needs attention"}
      shortcut={tabById("problems").shortcut}
    >
      <button
        type="button"
        onClick={() => openTab("problems", "click")}
        aria-label={words}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] transition-colors",
          tone === "error" && "bg-error-soft text-error",
          tone === "warning" && "bg-warn-soft text-warn",
          tone === "none" && "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Icon size={14} aria-hidden="true" />
        <span className={cn("tnum", compact && n === 0 && "sr-only")}>
          {compact && n > 0 ? n : words}
        </span>
      </button>
    </WithTooltip>
  );
}
