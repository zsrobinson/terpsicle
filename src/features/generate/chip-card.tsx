import { cn } from "cn";
import type { FilterRemoval, Spread } from "~/core/generate/spread";

// What a Generate chip's card shows under its words (SPEC §3.9): a small
// histogram of the plans on screen, or what a filter took out. Drawn as the
// course page's grade bars are (course-details/grades.tsx): Ink's ink at a
// few strengths, no hue, words before the chart (DESIGN §5). The card is a
// tooltip, so nothing in it is interactive; a bar's count shows while the
// pointer is over it, and the screen reader gets the same numbers in words.

const PLOT_HEIGHT = 56;
/** Room over the tallest bar for its count. */
const COUNT_ROOM = 14;

const plansWord = (n: number) =>
  `${n.toLocaleString()} plan${n === 1 ? "" : "s"}`;

/**
 * How the plans spread out on what a chip looks at, the first plan's bar
 * marked: "where the ranking put your top plan".
 */
export function SpreadChart({
  spread,
  axis,
  topWords,
  unknownWords,
  ranks = false,
}: {
  spread: Spread;
  /** What the bars count, as a caption: "Gaps between classes, a week". */
  axis: string;
  /** The first plan on this measure ("No gaps"); omitted for a filter's stat. */
  topWords?: string | null;
  /** Plans left out of the bars: "with no ratings". */
  unknownWords?: string;
  /** A preference's chart: say which end it ranks higher. */
  ranks?: boolean;
}) {
  const { bins, top } = spread;
  const better = ranks ? spread.better : null;
  const tallest = Math.max(1, ...bins.map((b) => b.count));
  // Every other tick once they'd crowd: "8:30" needs about a bar's width.
  const step = bins.length > 7 ? 2 : 1;
  const marked = topWords && top !== null;
  const described = [
    `${axis}:`,
    bins.map((b) => `${b.label}, ${plansWord(b.count)}`).join("; "),
    marked ? `. Your top plan: ${topWords}.` : ".",
  ].join(" ");
  return (
    <figure className="mt-3" data-testid="chip-spread">
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-muted text-xs">
        <span>{axis}</span>
        <span className="tnum text-faint">{plansWord(spread.counted)}</span>
      </figcaption>
      <div
        role="img"
        aria-label={described}
        className="flex items-end gap-0.5"
        style={{ height: PLOT_HEIGHT }}
      >
        {bins.map((bin, i) => {
          const isTop = marked && i === top;
          return (
            <div
              key={bin.label}
              data-top={isTop ? "" : undefined}
              className="group/bar flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            >
              <span
                className={cn(
                  "tnum text-2xs text-muted transition-opacity",
                  !isTop && "opacity-0 group-hover/bar:opacity-100",
                )}
              >
                {bin.count}
              </span>
              <div
                className={cn(
                  // 4px rounded data end, square at the baseline.
                  "forced-fill w-full max-w-6 rounded-t-sm",
                  isTop ? "bg-fg/80" : "bg-fg/25 group-hover/bar:bg-fg/40",
                )}
                style={{
                  height:
                    bin.count === 0
                      ? 0
                      : Math.max(
                          2,
                          (bin.count / tallest) * (PLOT_HEIGHT - COUNT_ROOM),
                        ),
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="flex gap-0.5 border-hairline border-t pt-1"
      >
        {bins.map((bin, i) => (
          <span
            key={bin.label}
            className="tnum min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-2xs text-faint"
          >
            {i % step === 0 || i === bins.length - 1 ? bin.tick : ""}
          </span>
        ))}
      </div>
      {better ? (
        <p
          aria-hidden="true"
          className={cn(
            "mt-0.5 text-2xs text-faint",
            better === "high" ? "text-right" : "text-left",
          )}
        >
          {better === "high" ? "Ranks higher →" : "← Ranks higher"}
        </p>
      ) : null}
      {marked || (spread.unknown > 0 && unknownWords) ? (
        <div className="mt-2 flex flex-col gap-0.5 text-xs">
          {marked ? (
            <p className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="forced-fill size-2.5 shrink-0 rounded-[2px] bg-fg/80"
              />
              <span className="text-muted">Your top plan:</span>
              <span className="tnum">{topWords}</span>
            </p>
          ) : null}
          {spread.unknown > 0 && unknownWords ? (
            <p className="tnum text-faint">
              {plansWord(spread.unknown)} {unknownWords}, not shown
            </p>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}

/** What a filter that's on took out: kept, then taken out, on one bar. */
export function RemovalBar({ removal }: { removal: FilterRemoval }) {
  const { kept, removed, without, atLeast } = removal;
  const keptShare = without === 0 ? 1 : kept / without;
  const removedText = `${atLeast ? "at least " : ""}${removed.toLocaleString()}`;
  return (
    <figure className="mt-3" data-testid="chip-removal">
      <figcaption className="mb-1.5 text-muted text-xs">
        Without it, {atLeast ? "at least " : ""}
        {plansWord(without)}
      </figcaption>
      <div
        role="img"
        aria-label={`Kept ${plansWord(kept)}, took out ${removedText}`}
        className="flex h-2.5 gap-0.5"
      >
        {kept > 0 ? (
          <div
            className="forced-fill h-full rounded-l-sm bg-fg/55"
            style={{ width: `${keptShare * 100}%` }}
          />
        ) : null}
        {removed > 0 ? (
          <div
            className="forced-fill h-full flex-1 rounded-r-sm bg-fg/15"
            data-testid="chip-removed"
          />
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="tnum mt-1 flex justify-between gap-2 text-xs"
      >
        <span>
          <span className="text-muted">Kept </span>
          {kept.toLocaleString()}
        </span>
        <span>
          <span className="text-muted">Took out </span>
          {atLeast ? "≥ " : ""}
          {removed.toLocaleString()}
        </span>
      </div>
    </figure>
  );
}
