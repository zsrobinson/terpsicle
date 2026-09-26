// Runs the moderation eval set (src/server/moderation/eval/cases.ts) live
// against Workers AI over REST, so a model, prompt or threshold change can be
// judged before it ships. Never runs in CI: it costs money and the models
// aren't deterministic enough to gate a build on. Needs CLOUDFLARE_API_TOKEN
// and CLOUDFLARE_ACCOUNT_ID.
//
//   pnpm tsx scripts/moderation-eval.ts
//   ONLY=chat pnpm tsx scripts/moderation-eval.ts
//   MODERATION_CONFIG='{"policyModel":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"}' pnpm tsx scripts/moderation-eval.ts
//   VERBOSE=1 …   prints every case's reasons and scores

import { REASON_WORDS } from "../src/core/moderation";
import type { ModerationDecision } from "../src/core/schema";
import { classify, resolveConfig } from "../src/server/moderation/classify";
import { EVAL_CASES, type EvalCase } from "../src/server/moderation/eval/cases";
import type { AiRunner } from "../src/server/moderation/models";
import { isMain } from "./lib/source-files";

/** The AI binding's `run`, over the REST API. */
export function restAi(accountId: string, token: string): AiRunner {
  return {
    async run(model, inputs) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(inputs),
        },
      );
      const body = (await response.json()) as {
        success?: boolean;
        result?: unknown;
        errors?: unknown;
      };
      if (!response.ok || body.success === false)
        throw new Error(`${response.status} ${JSON.stringify(body.errors)}`);
      return body.result;
    },
  };
}

interface Outcome {
  c: EvalCase;
  decision: ModerationDecision;
  ok: boolean;
  exact: boolean;
  ms: number;
  detail: string;
}

async function runCase(ai: AiRunner, c: EvalCase): Promise<Outcome> {
  const started = performance.now();
  const result = await classify(
    {
      kind: c.kind,
      text: c.text,
      context: {
        targetId: c.id,
        ...(c.course ? { course: c.course } : {}),
        activeAssignments: c.activeAssignments ?? false,
      },
    },
    {
      ai,
      config: resolveConfig(process.env.MODERATION_CONFIG),
      budget: async () => true,
    },
  );
  const ms = Math.round(performance.now() - started);
  const reasons = result.reasons
    .map(
      (r) =>
        `${r.code}:${r.action}${r.category ? `(${r.category})` : ""}${r.score !== undefined ? `(${r.score})` : ""}`,
    )
    .join(" ");
  const scores = Object.entries(result.scores)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return {
    c,
    decision: result.decision,
    exact: result.decision === c.expect,
    ok: [c.expect, ...(c.accept ?? [])].includes(result.decision),
    ms,
    detail: `${reasons || "no reasons"}${scores ? ` | ${scores}` : ""}`,
  };
}

async function pool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        // i < items.length was just checked.
        out[i] = await work(items[i] as T);
      }
    }),
  );
  return out;
}

if (isMain(import.meta.url)) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.");
    process.exit(1);
  }
  const only = process.env.ONLY;
  const cases = EVAL_CASES.filter((c) => !only || c.kind === only);
  const config = resolveConfig(process.env.MODERATION_CONFIG);
  console.log(
    `Moderation eval · ${cases.length} cases · guard ${config.guardModel} · policy ${config.policyModels.review} (reviews), ${config.policyModels.chat} (chat)\n`,
  );
  const outcomes = await pool(cases, 4, (c) =>
    runCase(restAi(accountId, token), c),
  );

  for (const o of outcomes) {
    const mark = o.exact ? "ok  " : o.ok ? "ok~ " : "MISS";
    console.log(
      `${mark} ${o.c.id.padEnd(30)} want ${o.c.expect.padEnd(7)} got ${o.decision.padEnd(7)} ${String(o.ms).padStart(5)} ms`,
    );
    if (!o.ok || process.env.VERBOSE === "1")
      console.log(`       ${o.detail}\n       (${o.c.why})`);
  }

  const passed = outcomes.filter((o) => o.ok).length;
  const exact = outcomes.filter((o) => o.exact).length;
  const held = outcomes.filter((o) => o.decision === "hold").length;
  const unavailable = outcomes.filter((o) =>
    o.detail.includes("model-unavailable"),
  ).length;
  const sorted = outcomes.map((o) => o.ms).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  console.log(
    `\n${passed}/${outcomes.length} acceptable (${exact} exact) · ${held} held for a person · ${unavailable} with a model failure (${REASON_WORDS["model-unavailable"].toLowerCase()}) · p50 ${p50} ms · p95 ${p95} ms`,
  );
  const falseHolds = outcomes.filter(
    (o) => o.c.expect === "publish" && o.decision !== "publish" && !o.ok,
  );
  const missed = outcomes.filter(
    (o) => o.c.expect !== "publish" && o.decision === "publish",
  );
  console.log(
    `False holds/removals of good posts: ${falseHolds.length} · problems published: ${missed.length}`,
  );
  process.exitCode = passed === outcomes.length ? 0 : 1;
}
