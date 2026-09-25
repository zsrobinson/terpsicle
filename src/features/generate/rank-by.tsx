import { RANK_FACTOR_LABELS, RANK_FACTORS } from "~/core/generate";
import type { RankBy, RankFactor, RankWeights } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";

// How results are ordered (SPEC §3.9): one factor, or Custom weights across
// all six. Switching to Custom starts from the preset that was chosen.

const FACTOR_TIPS: Record<RankFactor, string> = {
  compact: "Least idle time between classes",
  "fewer-days": "Fewest days you have to come to campus",
  "later-starts": "Latest first class of the week",
  "best-rated": "Highest PlanetTerp instructor ratings",
  "higher-gpa": "Highest average GPA in past sections",
  "safest-seats": "Most open seats in the tightest section",
};

function weightsFrom(rankBy: RankBy): RankWeights {
  if (rankBy.preset === "custom") return rankBy.weights;
  return Object.fromEntries(
    RANK_FACTORS.map((f) => [f, f === rankBy.preset ? 1 : 0]),
  ) as RankWeights;
}

export function RankBySelect({
  rankBy,
  onChange,
}: {
  rankBy: RankBy;
  onChange: (next: RankBy) => void;
}) {
  return (
    <WithTooltip label="How to order the plans">
      <select
        aria-label="Rank by"
        value={rankBy.preset}
        onChange={(e) => {
          const preset = e.target.value;
          if (preset === "custom")
            onChange({ preset: "custom", weights: weightsFrom(rankBy) });
          else {
            const factor = RANK_FACTORS.find((f) => f === preset);
            if (factor) onChange({ preset: factor });
          }
        }}
        className="h-6 rounded-md border border-hairline-strong bg-bg px-1 font-normal text-[11.5px] text-fg outline-none"
      >
        {RANK_FACTORS.map((f) => (
          <option key={f} value={f}>
            {RANK_FACTOR_LABELS[f]}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
    </WithTooltip>
  );
}

/** One slider per factor, shown under "Rank by" when Custom is chosen. */
export function CustomWeights({
  weights,
  onChange,
}: {
  weights: RankWeights;
  onChange: (next: RankBy) => void;
}) {
  return (
    <fieldset
      aria-label="Custom weights"
      className="flex flex-col gap-1.5 px-4"
    >
      {RANK_FACTORS.map((f) => (
        <WithTooltip key={f} label={FACTOR_TIPS[f]} side="right">
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-36 shrink-0 truncate text-muted">
              {RANK_FACTOR_LABELS[f]}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              aria-label={RANK_FACTOR_LABELS[f]}
              value={Math.round(weights[f] * 100)}
              onChange={(e) =>
                onChange({
                  preset: "custom",
                  weights: { ...weights, [f]: Number(e.target.value) / 100 },
                })
              }
              className="h-4 min-w-0 flex-1 accent-accent"
            />
            <span className="tnum w-7 text-right font-mono text-[11px] text-muted">
              {Math.round(weights[f] * 100)}
            </span>
          </label>
        </WithTooltip>
      ))}
    </fieldset>
  );
}
