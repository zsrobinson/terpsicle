// Zod compiles each object schema's parser with `new Function` when it can,
// and probes for that with a `new Function("")` first. The CSP allows no
// eval (docs/V2.md §12): once enforced, the probe throws and Zod quietly
// parses without compiling, but a report-only policy lets every compile
// through and reports each one. So the page says it up front. Zod reads
// `globalThis.__zod_globalConfig` when it loads, so this must run before any
// app code: a head script (inline-scripts.ts).
//
// Web workers need nothing: their scripts come from /assets, which the
// Worker never serves, so they run without a CSP.

/** The global Zod reads its config from (zod/v4/core, `globalConfig`). */
export const ZOD_GLOBAL_CONFIG = "__zod_globalConfig";

// Stringified into the document head, so it must be self-contained.
function disableZodJit(key: string) {
  const g = globalThis as unknown as Record<string, { jitless?: boolean }>;
  // In place: Zod keeps the object it found when it loaded.
  const config = g[key] ?? {};
  config.jitless = true;
  g[key] = config;
}

export const zodJitlessScript = `(${disableZodJit.toString()})(${JSON.stringify(ZOD_GLOBAL_CONFIG)});`;
