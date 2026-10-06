import { cn } from "cn";
import { termLabel } from "~/core/catalog/terms";
import type { StripCell } from "~/core/history/offering-pattern";

// An offering pattern at a glance (docs/decisions.md, "Offering patterns
// from the history"): a course's falls and springs over the window, a
// school year to a pair, filled where it ran, hollow where it didn't, and
// dashed where the history has no record (unknown, not "not offered"). No
// color: it's information, in Plan's problems and Schedule's course details.

/** Fall then spring, one pair per school year, oldest first. */
function pairs(cells: readonly StripCell[]): StripCell[][] {
  const out: StripCell[][] = [];
  for (const cell of cells) {
    const last = out.at(-1);
    if (cell.termId.endsWith("01") && last && last.length === 1)
      last.push(cell);
    else out.push([cell]);
  }
  return out;
}

export function OfferingStrip({
  cells,
  label,
  className,
}: {
  cells: readonly StripCell[];
  /** What it shows in words, for screen readers. */
  label: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
    >
      {pairs(cells).map((pair) => (
        <span
          key={pair[0]?.termId}
          aria-hidden="true"
          className="inline-flex gap-px"
        >
          {pair.map((cell) => (
            <span
              key={cell.termId}
              title={`${termLabel(cell.termId)}: ${
                cell.state === "offered"
                  ? "offered"
                  : cell.state === "not-offered"
                    ? "not offered"
                    : "not on record"
              }`}
              className={cn(
                "block h-2.5 w-2 rounded-[1px] border",
                cell.state === "offered" && "border-fg bg-fg",
                cell.state === "not-offered" && "border-hairline-strong",
                cell.state === "not-on-record" &&
                  "border-hairline-strong border-dashed opacity-60",
              )}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

/** "Fall 2018 to Spring 2027": the strip's span, for the words beside it. */
export function stripSpan(cells: readonly StripCell[]): string | null {
  const first = cells[0];
  const last = cells.at(-1);
  if (!first || !last) return null;
  return `${termLabel(first.termId)} to ${termLabel(last.termId)}`;
}
