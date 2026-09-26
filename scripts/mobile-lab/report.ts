// A run's results: summary.json (everything, for agents and scripts) and
// README.md (screenshots next to what each step measured, which GitHub
// renders on the mobile-runs branch).

import type { Check } from "./checks";
import type { Step } from "./lab";

export interface ScenarioResult {
  id: string;
  title: string;
  /** Wall-clock milliseconds. */
  ms: number;
  video: string | null;
  error: string | null;
  /** Why it didn't run on this engine. */
  skipped: string | null;
  steps: Step[];
}

export interface RunResult {
  engine: string;
  device: string;
  url: string;
  startedAt: string;
  ms: number;
  /** Where this run came from (a workflow run link), if known. */
  source: string | null;
  scenarios: ScenarioResult[];
}

export interface Tally {
  failed: number;
  warnings: number;
  errors: number;
}

export function failedChecks(steps: Step[]): Check[] {
  return steps.flatMap((s) =>
    s.checks.filter((c) => !c.ok && c.severity === "fail"),
  );
}

export function tally(scenarios: ScenarioResult[]): Tally {
  let failed = 0;
  let warnings = 0;
  let errors = 0;
  for (const s of scenarios) {
    if (s.error) errors++;
    for (const step of s.steps) {
      if (step.error) errors++;
      for (const c of step.checks)
        if (!c.ok) c.severity === "fail" ? failed++ : warnings++;
    }
  }
  return { failed, warnings, errors };
}

/** A run passes when no "fail" check failed and nothing threw. */
export function passed(run: RunResult): boolean {
  if (run.scenarios.length === 0) return false;
  const t = tally(run.scenarios);
  return t.failed === 0 && t.errors === 0;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(0)} s`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function status(checks: Check[], error?: string): string {
  if (error) return "ERROR";
  if (checks.some((c) => !c.ok && c.severity === "fail")) return "FAIL";
  if (checks.some((c) => !c.ok)) return "warn";
  return "ok";
}

/** The numbers worth seeing at a glance, from a step's probe. */
function glance(step: Step): string[] {
  const p = step.probe;
  if (!p) return [];
  const vv = p.visualViewport;
  const lines = [
    `viewport ${p.innerWidth}×${p.innerHeight}` +
      (vv
        ? `, visual ${vv.height} tall at ${vv.offsetTop}${vv.scale !== 1 ? ` ×${vv.scale}` : ""}`
        : "") +
      `, scrollY ${p.scrollY}`,
  ];
  if (p.drawer)
    lines.push(
      `drawer ${p.drawer.snap}, top ${p.drawer.rect?.y}, inside ${p.drawer.contentHeight}px`,
    );
  if (step.keyboard !== null)
    lines.push(`keyboard ${step.keyboard ? "up" : "down"}`);
  if (p.activeElement)
    lines.push(
      `focus ${p.activeElement.describe}` +
        (p.activeElement.rect
          ? ` at y ${p.activeElement.rect.y}–${p.activeElement.rect.bottom}`
          : ""),
    );
  if (p.panel?.heading) lines.push(`panel "${p.panel.heading}"`);
  const notable = (p.events ?? []).filter((e) =>
    [
      "resize",
      "vv-resize",
      "scroll",
      "visibility",
      "pagehide",
      "beforeunload",
      "pointercancel",
      "orientationchange",
      "installed",
    ].includes(e.type),
  );
  if (notable.length > 0) {
    const counts = new Map<string, number>();
    for (const e of notable) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    lines.push(
      `events: ${[...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(", ")}`,
    );
  }
  return lines;
}

export function markdown(run: RunResult): string {
  const t = tally(run.scenarios);
  const out: string[] = [];
  out.push(`# Mobile lab: ${run.engine}`);
  out.push("");
  out.push(
    `**${passed(run) ? "Passed" : "Failed"}**: ${t.failed} failed check(s), ${t.warnings} warning(s), ${t.errors} error(s).`,
  );
  out.push("");
  out.push(`- URL: ${run.url}`);
  out.push(`- Device: ${run.device}`);
  out.push(`- Started: ${run.startedAt}, took ${seconds(run.ms)}`);
  if (run.source) out.push(`- Workflow run: ${run.source}`);
  out.push(
    "- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.",
  );
  out.push("");
  out.push("| Scenario | Result | Steps | Time | Recording |");
  out.push("|---|---|---|---|---|");
  for (const s of run.scenarios) {
    const checks = s.steps.flatMap((step) => step.checks);
    const stepError = s.steps.find((step) => step.error)?.error;
    out.push(
      `| [${cell(s.title)}](#${s.id}) | ${s.skipped ? "skipped" : status(checks, s.error ?? stepError)} | ${s.steps.length} | ${seconds(s.ms)} | ${s.video ? `[video](${s.video})` : "none"} |`,
    );
  }
  for (const s of run.scenarios) {
    out.push("");
    out.push(`<a id="${s.id}"></a>`);
    out.push("");
    out.push(`## ${s.title}`);
    out.push("");
    out.push(`\`${s.id}\`${s.video ? ` · [recording](${s.video})` : ""}`);
    if (s.skipped) {
      out.push("");
      out.push(`Skipped on this engine: ${cell(s.skipped)}.`);
      continue;
    }
    if (s.error) {
      out.push("");
      out.push(`**Error:** ${cell(s.error)}`);
    }
    out.push("");
    out.push("| Screen | Step |");
    out.push("|---|---|");
    for (const step of s.steps) {
      const img = step.screenshot
        ? `<img src="${s.id}/${step.screenshot}" width="220">`
        : "";
      const lines = [
        `**${step.index}. ${cell(step.name)}** (${status(step.checks, step.error)}, ${seconds(step.t)})`,
        ...step.actions.map(
          (a) =>
            `after: ${a.type} ${cell(JSON.stringify(a.detail)).slice(0, 160)}`,
        ),
        ...glance(step),
        ...step.checks
          .filter((c) => !c.ok)
          .map(
            (c) =>
              `**${c.severity === "fail" ? "FAIL" : "warn"} ${c.id}**: ${cell(c.detail)}`,
          ),
        ...(step.error ? [`**Error:** ${cell(step.error)}`] : []),
      ];
      out.push(`| ${img} | ${lines.join("<br>")} |`);
    }
  }
  out.push("");
  return out.join("\n");
}
