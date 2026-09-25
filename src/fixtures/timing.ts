// Timing for the perf project's budgets (BUILD §5: regressions fail CI).

/** The middle value; the upper middle for an even count. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

type CpuUsage = { user: number; system: number };
const nodeProcess = (
  globalThis as { process?: { cpuUsage?: () => CpuUsage } }
).process;

/**
 * Milliseconds of CPU this process has used, where Node can say (the perf
 * project runs in Node); wall time otherwise. CPU time is what the code
 * costs: other processes on a busy CI machine don't add to it.
 */
function now(): number {
  const usage = nodeProcess?.cpuUsage?.();
  return usage ? (usage.user + usage.system) / 1000 : performance.now();
}

/**
 * Median CPU time of `runs` runs, in ms, after `warmups` unmeasured ones
 * (JIT tiers). A few slow runs, from GC or a noisy neighbor, don't move a
 * median; a real regression moves every run.
 */
export function medianMs(
  run: () => void,
  { runs = 7, warmups = 3 }: { runs?: number; warmups?: number } = {},
): number {
  for (let i = 0; i < warmups; i++) run();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = now();
    run();
    times.push(now() - start);
  }
  return median(times);
}
