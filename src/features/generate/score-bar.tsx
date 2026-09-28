// Why a generated plan ranks where it does, one preference at a time: its
// 0–1 score as a short bar beside the plain number behind it (SPEC §3.9).

/** A factor's score as a short bar: fuller is better. */
export function ScoreBar({ score }: { score: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative h-1 w-4 shrink-0 overflow-hidden rounded-full bg-hairline-strong"
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-fg"
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`,
        }}
      />
    </span>
  );
}
