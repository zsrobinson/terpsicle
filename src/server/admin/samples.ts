// POST /api/admin/samples: test mode only (previews, `pnpm dev:mock`, e2e).
// Puts a few made-up held posts in the queue, one of each common reason, so
// the panel can be tried and tested before Reviews and Chat send real ones.
// Everywhere else it answers not-found, like auth/test-sign-in.
import type {
  AdminSamplesResult,
  ModerationKind,
  ModerationReason,
  ModerationScores,
  QueueItem,
} from "~/core/schema";
import { apiError } from "../api/http";
import { type AuthEnv, isTestMode } from "../auth/config";
import { randomToken } from "../crypto";
import type { ModerationEnv } from "../moderation/service";
import {
  insertDecision,
  toQueueItem,
  upsertQueueItem,
  waitingRowFor,
} from "../moderation/store";

interface Sample {
  kind: ModerationKind;
  course: string;
  text: string;
  /** The words a rule matched, if a rule held it. */
  matched?: { code: ModerationReason["code"]; words: string };
  reasons: ModerationReason[];
  scores: ModerationScores;
  urgent?: boolean;
}

// Invented and harmless: the words the rules and checks would catch, and
// nothing that names a real person.
const SAMPLES: readonly Sample[] = [
  {
    kind: "review",
    course: "CMSC351",
    text: "Great lectures and fair exams. The TA posted everyone's scores on the course site, though. You can reach her at jane.doe@example.com if yours are wrong.",
    matched: { code: "email", words: "jane.doe@example.com" },
    reasons: [
      { code: "personal-info", source: "policy", action: "hold", score: 0.74 },
    ],
    scores: { "personal-info": 0.74, "targets-person": 0.12, spam: 0 },
  },
  {
    kind: "chat",
    course: "CMSC131",
    text: "if they curve this exam down again I'm going to flip a table in office hours",
    reasons: [
      {
        code: "violence",
        source: "guard",
        action: "hold",
        category: "S1",
      },
    ],
    scores: { "targets-person": 0.08 },
    urgent: true,
  },
  {
    kind: "chat",
    course: "MATH140",
    text: "here are the answers to quiz 4: 1. B 2. D 3. A 4. C",
    matched: { code: "shares-answers", words: "1. B 2. D 3. A 4. C" },
    reasons: [
      {
        code: "academic-integrity",
        source: "policy",
        action: "hold",
        score: 0.88,
      },
    ],
    scores: { "academic-integrity": 0.88 },
  },
  {
    kind: "review",
    course: "ENGL101",
    text: "The easiest way through this class is to buy your essays. Use code TERP10 at the site in my profile for 20% off!",
    reasons: [{ code: "spam", source: "policy", action: "hold", score: 0.71 }],
    scores: { spam: 0.71, "off-topic": 0.4 },
  },
];

function reasonsOf(sample: Sample): ModerationReason[] {
  if (!sample.matched) return sample.reasons;
  const at = sample.text.indexOf(sample.matched.words);
  return [
    {
      code: sample.matched.code,
      source: "rules",
      action: "hold",
      span: [at, at + sample.matched.words.length],
    },
    ...sample.reasons,
  ];
}

export async function addSamples(
  env: AuthEnv & Pick<ModerationEnv, "DB">,
  ctx: { request: Request; now: Date },
): Promise<AdminSamplesResult | Response> {
  if (!isTestMode(env, new URL(ctx.request.url))) return apiError("not-found");
  const made = SAMPLES.map((sample) => ({
    sample,
    ref: `sample-${randomToken(9)}`,
    reasons: reasonsOf(sample),
  }));
  await env.DB.batch(
    made.flatMap(({ sample, ref, reasons }) => [
      upsertQueueItem(env.DB, {
        surface: sample.kind,
        ref,
        snapshot: {
          text: sample.text,
          course: sample.course,
          activeAssignments: false,
          scores: sample.scores,
          retries: 0,
        },
        labels: reasons,
        urgent: sample.urgent ?? false,
        status: "open",
        now: ctx.now,
      }),
      insertDecision(env.DB, {
        surface: sample.kind,
        ref,
        stage: "model",
        verdict: "hold",
        labels: reasons,
        guard: null,
        policy: sample.scores,
        models: null,
        latencyMs: null,
        decidedBy: "system",
        reason: null,
        now: ctx.now,
      }),
    ]),
  );
  const items: QueueItem[] = [];
  for (const { sample, ref } of made) {
    const row = await waitingRowFor(env.DB, sample.kind, ref);
    if (row) items.push(await toQueueItem(env.DB, row));
  }
  return { items };
}
