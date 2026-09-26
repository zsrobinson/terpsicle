# Moderation

One shared, model-first service decides whether something a person wrote in Terpsicle Reviews or Terpsicle Chat can be shown. Clean posts publish on their own. Only uncertain or flagged ones reach the owner in `/admin`, so the human queue stays small (`v2-decisions`: "Moderation is model-first").

- Pure rules and policy text: `src/core/moderation/`
- The service, models, storage and admin API: `src/server/moderation/`
- Tables: `migrations/0003_moderation.sql`
- The eval set: `src/server/moderation/eval/cases.ts`; the live run: `scripts/moderation-eval.ts`

## 1. The API

```ts
import { moderate } from "~/server/moderation";

const result = await moderate(env, {
  kind: "review",                 // or "chat"
  text,                           // exactly what will be shown
  context: {
    targetId: review.id,          // your id for the item; the only link back to it
    course: "CMSC351",            // optional, shown to the owner and the model
    activeAssignments: true,      // optional: graded work is open in this course
  },
}, { now });

// result: {
//   decision: "publish" | "hold" | "remove",
//   reasons:  ModerationReason[],   // why, with spans for rule matches
//   model:    { guard, policy },    // model ids that ran, or null
//   scores:   { "academic-integrity"?: 0.1, spam?: 0, … },  // policy model, 0–1
// }
```

`env` needs `DB` and `AI`, and reads `MODERATION_DAILY_CAP` and `MODERATION_CONFIG` if set (`ModerationEnv`). `moderate()` records the decision and queues held items itself. It throws only when the input is malformed or D1 fails. Model trouble never throws: it becomes a hold.

What the caller does with each decision:

| Decision | Reviews | Chat |
|---|---|---|
| `publish` | Publish the review. | Deliver the message to the room. |
| `hold` | Keep it unpublished; tell the author it's waiting for a person. | Show it only to its author, marked as waiting. |
| `remove` | Don't publish. Show the author the reason (below). | Don't deliver. Show the author the reason. |

- **Before submitting,** the composer can run `precheck({kind, text})` from `~/core/moderation` to point at the exact words (every rule reason has a `span`) and say what to fix, with `REASON_WORDS[code]`. `LENGTH_LIMITS` gives the character limits. Nothing is stored by `precheck`.
- **"What's allowed":** `MODERATION_POLICY.review` and `MODERATION_POLICY.chat` hold the text for the panel next to each composer.
- **Edits:** call `moderate()` again with the same `targetId`. A pending hold is replaced (held again with the new text, or cleared when the edit passes).
- **The current state** of an item, including the owner's later decision: `currentDecision(db, kind, targetId)`.
- **The owner's decisions** reach the feature through a `ModerationHandler` (§6). Reviews and Chat each register one when they land.

## 2. The pipeline

1. **Rules** (`precheck`, no model). A `remove` from the rules (a slur, an empty or over-long post) ends it: no model is called.
2. **Llama Guard** (`@cf/meta/llama-guard-3-8b`) for safety categories, on every post the rules didn't remove.
3. **The policy model** for the site's own rules, with a strict JSON schema:
   - every review (run alongside Guard, since reviews always need both);
   - a chat message only when the rules or Guard **flagged** something, which keeps a busy chat cheap.

Each reason carries an action: `flag`, `hold` or `remove`. The decision is the most severe action; `flag` alone never holds anything, it only asks the policy model to read the post.

**Fail closed.** A model error, a timeout, output that doesn't parse, or the daily cap each add a `system` reason that **holds** the post (`model-unavailable` or `daily-cap`). Nothing publishes without every check it needed.

**Hedging.** Workers AI usually answers in well under a second, but a few percent of Llama Guard calls take 5–10 s (measured 2026-09-26: 2 of 12 sequential calls). Without help those would all land in the owner's queue. So each stage starts a second attempt when the first fails or hasn't answered after 2.5 s, and takes whichever answers first. A stage gives up after 10 s in all. In the first eval run, a plain 5 s timeout lost 5 of 35 Guard calls; with the hedge, none were lost in the ten runs since (about 400 posts).

**Cost cap.** Every model attempt counts against `MODERATION_DAILY_CAP` (default 5,000 per UTC day, in the `counters` table). Past it, posts hold. At today's prices a review costs about $0.0004 and a chat message about $0.0001, most of it Llama Guard's prompt.

**Prompt injection.** Post text is fenced in `<post>` tags with `<` and `>` removed, and the model is told the post is data. The policy model only returns numbers, so an injected instruction can at worst move a score, and every score is validated.

## 3. Rules (`src/core/moderation`)

| Code | Finds | Review | Chat |
|---|---|---|---|
| `empty`, `too-short`, `too-long` | length, after trimming (reviews 40–2,000, chat 1–2,000) | remove | remove |
| `slur` | a small blocklist, whole words, after undoing leetspeak, separators and stretched letters | remove | remove |
| `blocked-word` | slurs with reclaimed or innocent uses ("a chink in the armor") | hold | hold |
| `insult` | everyday insults ("stupid", "loser") | flag | flag |
| `link` | a link outside `umd.edu` and `terpsicle.com` | hold | flag |
| `cheating-site` | a link to Chegg, Course Hero, Studocu, Brainly or Numerade | hold | hold |
| `email`, `phone`, `address`, `uid` | contact details, street addresses, 9-digit UIDs | hold | hold, unless the writer is plainly sharing their own ("text me at …") |
| `shares-answers` | a list of 3+ multiple-choice answers ("1. B 2. D 3. A"); "here are the answers/solutions/my code" | hold | hold |
| `asks-for-answers` | "does anyone have the answers to hw 3", "hw 3 solutions", "answer key" | flag | flag |
| `code-paste` | a pasted block of code while `activeAssignments` is true | hold | hold |

The integrity rules are deliberately conservative: people talk about homework, solutions and code for honest reasons all the time ("solutions are posted on ELMS"). Only patterns that are nearly always a problem hold on their own; the rest flag, and the policy model reads them in context. The golden tests in `moderation.test.ts` pin both sides, including innocent words the blocklist must never match ("Niger", "spices", "raccoon").

## 4. Llama Guard categories

| Category | Code | Action |
|---|---|---|
| S1 Violent crimes | `violence` | hold, urgent |
| S2 Non-violent crimes | `crime` | flag |
| S3 Sex-related crimes | `sex-crime` | hold, urgent |
| S4 Child sexual exploitation | `child-safety` | remove |
| S5 Defamation | `defamation` | flag |
| S6 Specialized advice | `specialized-advice` | flag |
| S7 Privacy | `privacy` | flag |
| S8 Intellectual property | `intellectual-property` | flag |
| S9 Indiscriminate weapons | `weapons` | hold, urgent |
| S10 Hate | `hate` | hold |
| S11 Suicide and self-harm | `self-harm` | hold, urgent |
| S12 Sexual content | `sexual` | hold |
| S13 Elections | `elections` | flag |
| S14 Code interpreter abuse | `code-abuse` | flag |
| unsafe, no category | `unsafe` | hold |

Categories that fire on ordinary student complaints ("he robbed us of our grade", "a liar about the curve") only flag, so the policy model judges them with the site's own rules instead of queueing every harsh review. **Urgent** items sort to the top of the owner's queue.

## 5. The policy model

| Label | Kinds | Hold at | Remove at |
|---|---|---|---|
| `academic-integrity`: shares or asks for answers, solutions or code for graded work | both | 0.5 | never |
| `targets-person`: attacks or mocks a person, names a student, comments on identity or looks | both | 0.5 | never |
| `personal-info`: someone else's contact or private details | both | 0.5 | never |
| `misconduct-claim`: states misconduct as fact (the main defamation risk) | reviews | 0.5 | never |
| `spam`: ads, selling, scams, gibberish | both | 0.5 | 0.9 |
| `off-topic`: not about the course at all | reviews | 0.6 | 0.9 |

Only clear spam and clear non-reviews are removed without a person. Every other label holds: a wrong hold costs the owner a click, a wrong removal silences someone.

**Models** (`POLICY_MODELS` in `models.ts`):
- **Reviews:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, the model summaries already use. Reviews are few and each matters, and on held-out cases it caught a comment on an instructor's age that the 8B model scored 0.
- **Chat:** `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, small, fast (p50 about 0.5 s) and about a sixth of the 70B's price per token. The plain `-fp8` variant rejects JSON schemas.

## 6. The owner's queue and the admin API

**Storage** (`migrations/0003_moderation.sql`):
- `moderation_decisions`: every decision, automatic or the owner's (id, kind, target id, decision, actor, reasons JSON, model ids, scores, created). The latest row for a target is its state.
- `moderation_queue`: held items (the text as written, course, reasons, scores, urgent) and what the owner decided, kept so it can be undone. One row per target.
- **Neither table stores an author**, only the kind and target id. The admin view can't show who wrote something, even by accident. Reviews keeps its author in its own table (`reviews.reviewer_key`).

**Endpoints** (`POST /api/admin/moderation/*`, 600 per IP per hour). Callers who aren't the admin get `404 not-found`, so the routes don't advertise themselves.

| Endpoint | Input | Result |
|---|---|---|
| `admin/moderation/queue` | `{status?: "pending" \| "approved" \| "removed", limit?: 1–100}` | `{items: QueueItem[], pending}`. Pending: urgent first, then oldest. Resolved: most recent first. |
| `admin/moderation/resolve` | `{id, action: "approve" \| "remove", reason: AdminReason, note?}` | `{status: "ok", item}` or `{status: "not-found"}` |
| `admin/moderation/undo` | `{id}` | `{status: "ok", item}`, `{status: "nothing-to-undo"}` or `{status: "not-found"}` |

- **No confirmation dialogs** (DESIGN §5): approve and remove act at once, and the UI offers **Undo**, which puts the item back in the queue, held.
- **Who is the admin:** `handleApi(…, {requireAdmin})` takes an `AdminGuard`. Until Identity's `requireAdmin` (Google sign-in plus the admin allowlist) is merged, the default `denyAllAdmins` lets nobody in. Wiring it is one line in `src/server/worker.ts`.
- **Reaching the feature:** `handleApi(…, {moderationHandlers: {review, chat}})`. Each handler gets `(targetId, "publish" | "remove" | "hold")` and must be idempotent. It runs before anything is recorded, so if it fails, nothing changes and the owner can try again.

## 7. Configuration

| Var | Default | What |
|---|---|---|
| `MODERATION_DAILY_CAP` | `5000` (in `wrangler.jsonc`) | Model attempts per UTC day. |
| `MODERATION_CONFIG` | unset | JSON overrides, validated by `ModerationConfigOverridesSchema`; anything invalid is ignored as a whole. |

```jsonc
// MODERATION_CONFIG: every key optional
{
  "guardModel": "@cf/meta/llama-guard-3-8b",
  "policyModel": "@cf/…",                         // both kinds
  "policyModels": { "review": "@cf/…", "chat": "@cf/…" },
  "timeoutMs": 10000,                             // per stage, across attempts
  "hedgeAfterMs": 2500,
  "guardActions": { "S5": "hold" },               // flag | hold | remove
  "policyThresholds": { "spam": { "hold": 0.4, "remove": 0.95 } }
}
```

## 8. The eval

`src/server/moderation/eval/cases.ts` holds 45 invented, harmless review and chat snippets with the decision each should get; borderline ones list every acceptable decision. The last ten are **held out**: written after the prompt and thresholds were tuned, and not tuned against.

- **In CI** (`eval.test.ts`): the rules alone never hold or remove a case that should publish, and decide the cases marked `rules` exactly.
- **Live** (never in CI): `pnpm tsx scripts/moderation-eval.ts`, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. `ONLY=chat`, `VERBOSE=1` and `MODERATION_CONFIG` work as expected.

Results on 2026-09-26:

Acceptable decisions (the wanted one, or one listed in `accept`):

| Policy model | Prompt | Tuned cases (35) | Held out (10), first run | Model failures | p50 / p95 |
|---|---|---|---|---|---|
| Llama 3.2 3B | first | 26 | – | 0 | 0.4 s / 2.6 s |
| Llama 3.1 8B (`-instruct-fast`) | first | 32 | – | 0 | 0.4 s / 3.1 s |
| Llama 4 Scout 17B | first | 30 | – | 3 | 1.1 s / 10 s |
| Llama 3.3 70B fp8-fast | first | 33 | – | 0 | 1.5 s / 3.9 s |
| Llama 3.1 8B fp8-fast | final | 35 (two runs) | 8 | 0 | 0.5 s / 1.1 s |
| Llama 3.3 70B fp8-fast | final | 35 | 9 | 0 | 1.3 s / 1.8 s |
| **Shipped:** 70B for reviews, 8B for chat, with the rule fix below | final | 35 | 10 | 0 | 0.7 s / 3.8 s |

Guard was `@cf/meta/llama-guard-3-8b` throughout, with the hedge. The "final" prompt added one line to each of two rules: harsh criticism of teaching scores 0 on `targets-person`, and solutions the course staff posted score 0 on `academic-integrity`.

- The 3B model marked nearly every review `off-topic`.
- The held-out chat miss in both first runs ("can someone **just** send me their lab 4 code") was a rule gap: the filler word hid the request, so the policy model never read it. The rule now allows a filler word; that case is no longer truly held out.
- A plain 5 s timeout with no hedge held 25 of 35 posts for model failures.

## 9. Known limits and next steps

- **Chat reads the policy model only when flagged.** Mockery of a named student with no insult word and no Guard category publishes. Running the policy model on every chat message is one line (`needsPolicy`) at roughly double the cost per message.
- **Scores near 0.5 wobble.** One harsh-but-fair review flipped between publish and hold across runs. That costs the owner a click, not a wrong publish.
- **Items held only for model failures** could be retried by a cron before a person sees them. Not built: nothing re-runs today, and the owner sees them with `model-unavailable`.
- **Retention:** held text stays in `moderation_queue` after it's resolved, for undo. A prune (for example, resolved items after 30 days) should land with Chat's retention rules.
- **Reports** from readers (planetterp-fallback §6.4) and **rate limits** on writing (§6.5) belong to Reviews and Chat; they can queue an item by calling `moderate()` again or through a future `report()`.
- **Analytics:** no moderation events yet. When added, they carry counts and reason codes only, never text (`docs/ANALYTICS.md`).
