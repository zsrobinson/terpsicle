// Timing for the perf project's budgets (BUILD §5: regressions fail CI).

/** The middle value; the upper middle for an even count. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/**
 * Median wall time of `runs` runs, in ms, after `warmups` unmeasured ones
 * (JIT tiers). A few slow runs, from GC or a busy CI machine, don't move a
 * median; a real regression moves every run.
 */
export function medianMs(
  run: () => void,
  { runs = 7, warmups = 3 }: { runs?: number; warmups?: number } = {},
): number {
  for (let i = 0; i < warmups; i++) run();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return median(times);
}
