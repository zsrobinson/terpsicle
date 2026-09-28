# Moderation

One shared, model-first service decides whether something a person wrote in Terpsicle Reviews or Terpsicle Chat can be shown. Clean posts publish on their own. Only uncertain or flagged ones reach the owner in `/admin`, so the human queue stays small (`docs/decisions.md`: "Moderation is model-first").

**Chat is lighter than Reviews** (the owner, 2026-09-27, `docs/decisions.md`: "Chat moderation is light, invisible and hard to spam"): "i just don't want any *really* nasty things there. i mostly want to make sure that it's not abused in ways like spamming something in a million different course channels". Phone numbers, emails, rooms, links, casual insults, homework talk, asking for help and code all publish in chat. Sharing answers is never held: "Posting here" and a one-time note in the composer say, as a plain fact, that your name is on it. What still stops a chat message: slurs, blocked words, Llama Guard's serious categories, attacks on a person, someone else's private details, clear spam, and the spam guard across courses (§2). The author never sees a "checking" state; only a message that's actually held or removed is tinted yellow for its author, with one plain line under it.

- Pure rules and policy text: `src/core/moderation/`
- The service, models, storage and admin API: `src/server/moderation/`
- Tables: `migrations/0004_moderation.sql` (V2 §9.4)
- Chat's spam guard: `src/core/moderation/cross-room.ts` (the rules), `src/server/chat/spam-guard.ts` (D1, `migrations/0014_chat_spam_guard.sql`)
- Retries and cleanup: `src/jobs/moderation.ts`, every 5 minutes
- The eval set: `src/server/moderation/eval/cases.ts`; the live run: `scripts/moderation-eval.ts`

**Names.** The code's API says `kind`, `targetId` and `publish | hold | remove`. The tables use V2 §9.4's words: `surface`, `ref`, and verdicts `allow | hold | reject` (automatic) or `allow | remove | hold` (the owner). `src/server/moderation/store.ts` maps between them.

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
| `hold` | Keep it unpublished; tell the author it's waiting for a person. | Show it only to its author, tinted yellow (the warn tokens) with one plain line ("Held for review. Only you can see it until a person checks it."). |
| `remove` | Don't publish. Show the author the reason (below). | Don't deliver. Tell only the author, the same way ("Taken down after review. Only you can see it."). |

- **Before submitting,** the review composer runs `precheck({kind, text})` from `~/core/moderation` to point at the exact words (every rule reason has a `span`) and say what to fix, with `REASON_WORDS[code]`. `LENGTH_LIMITS` gives the character limits. Nothing is stored by `precheck`. The chat composer says nothing about checking; its only hint is `answersHint(text)`, a one-time nudge about graded answers (§3).
- **"What's allowed":** `MODERATION_POLICY.review` and `MODERATION_POLICY.chat` hold the text for the panel next to each composer.
- **Edits:** call `moderate()` again with the same `targetId`. A waiting hold is replaced (held again with the new text, or cleared when the edit passes).
- **The current state** of an item, including a later decision by a retry or the owner: `currentDecision(db, kind, targetId)`.
- **Later decisions** (a retry that passes, or the owner) reach the feature through a `ModerationHandler`, called as `(targetId, decision, {db, now, reasons})`: `reasons` are the retry's, or the owner's (`admin` with their `adminReason` on a removal, `undo` on an undo; empty on an approval). They come from `moderationHandlers(env)` in `src/server/moderation/handlers.ts`: Reviews' (`src/server/reviews/decisions.ts`) and Chat's, which reaches the message's `CourseChat` object through the `COURSE_CHAT` binding. `latestDecision(db, kind, targetId)` also returns the reasons and time, so a feature can tell a hold waiting for a retry from one waiting for the owner.
- **Sending something to the owner for a reason that isn't the text** (a report, a burst of reviews): `queueForOwner(env, {kind, targetId, text, course, reasons, urgent}, {now, decision?})`. A waiting item keeps its place and snapshot, gains the reasons and becomes `open` (a retry can't clear it); `decision` also logs a `reports:hide` or `rules:hold`. `withdrawFromQueue(db, kind, targetId)` takes out an item its author deleted.
- **Reports:** `POST /api/reports/create` (§6).

## 2. The pipeline

0. **Chat's spam guard** (chat only, before anything else; in the `CourseChat` object's send and edit). Each course is its own Durable Object, so one person's messages across courses are only visible in D1: `chat_send_hashes` keeps, per message or edit, the author, the course, the time and a fingerprint of the words (`textFingerprint`: a 64-bit SimHash of the normalized text, which near-same texts share and which can't be turned back into words), never the words. `crossRoomRule` (`src/core/moderation/cross-room.ts`) holds the message when:
   - **`repeat`:** the same or a near-same text (fingerprints at most 10 of 64 bits apart; normalized texts under 20 characters never count) is in **3 or more different courses within an hour**, this one included;
   - **`flood`:** **more than 12 messages across more than 4 courses within 10 minutes**, this one included.

   It counts **courses, not rooms**: the same question in a course's room, its professor room and your section room is one course, and normal.

   A held message goes to the owner's queue through `queueForOwner` as `{code: "spam", source: "cross-room", action: "hold", crossRoom}`, **urgent**, and the decision log gets a `rules`/`hold` row. No model is called, so a spammer can't spend the daily cap. Its author sees it with the usual held line; classmates never get it. Rows older than an hour are pruned by the every-5-minutes moderation cron and deleted with the account. A D1 failure in the guard lets the message through to the usual screening (the models still read it). Reviews keep their own `burst` rule.
1. **Rules** (`precheck`, no model). A `remove` from the rules (a slur, an empty or over-long post) ends it: no model is called. In chat, a message that's only a common short reply ("thanks!", "same", "+1") or has no letters or digits (an emoji) publishes here too (`isTrivialChat`): the cheapest clean message is one no model reads.
2. **Llama Guard** (`@cf/meta/llama-guard-3-8b`) for safety categories, on every post the rules didn't decide.
3. **The policy model** for the site's own rules, with a strict JSON schema, on every post, in parallel with Guard (V2 §9.2).
   - Reviews score and act on every label.
   - Chat scores only `targets-person`, `personal-info` and `spam`, a shorter prompt and answer than before. `targets-person` holds at 0.5. `spam` holds at 0.9 and never removes. `personal-info` holds at 0.9, and only when there's something to expose: a contact detail the rules found that isn't plainly the writer's own ("her cell is …"), or Guard's privacy category (`actingPolicyLabels`). Measured on 2026-09-27, the small chat model scored `personal-info` 1 on "text me at …" and on a message with no details at all, so the score alone can't tell a study group from a leak.
   - `chatPolicy: "flagged"` in `MODERATION_CONFIG` reads chat only when the rules or Guard flagged it (cheaper, but it misses attacks on a person with no flagged word).

Each reason carries an action: `flag`, `hold` or `remove`. The decision is the most severe action. `flag` alone never holds anything: it's logged, and with `chatPolicy: "flagged"` it's what makes the policy model read a chat message.

**Fail closed, then retry.** A model error, a timeout, output that doesn't parse, or the daily cap each add a `system` reason that **holds** the post (`model-unavailable` or `daily-cap`). Nothing publishes without every check it needed. A post held *only* for those reasons waits in the queue as `retry`, which the owner never sees. The every-5-minutes cron (`src/jobs/moderation.ts`, beside seats) screens it again:
- if it passes, it's published through the feature's handler and the row is deleted. It never reached a person;
- if the retry finds a real problem, it goes to the owner at once;
- if the check keeps failing, it goes to the owner after `MAX_RETRIES` (2) retries, so within about 10 minutes.

The first retry comes within 5 minutes, as V2 §9.2 asks for chat; reviews get the same treatment. Only `model-unavailable` and `daily-cap` count as "held only for a failed check" (`needsRetry`): Reviews' `burst` is also a `system` reason, but it's for a person. A chat message waiting for a retry stays `checking`, which its author sees as sent: nothing tells them a check failed.

**Hedging.** Workers AI usually answers in well under a second, but a few percent of Llama Guard calls take 5–10 s (measured 2026-09-26: 2 of 12 sequential calls). So each stage starts a second attempt when the first fails or hasn't answered after **1 s**, and takes whichever answers first. A stage gives up after 10 s in all. In the first eval run, a plain 5 s timeout lost 5 of 35 Guard calls; with the hedge, none have been lost since (about 700 posts). Chat p95 end to end was 2.6–3.1 s with a 2.5 s hedge and 0.9–1.4 s with 1 s (§8).

**Cost cap.** Every model attempt counts against `MODERATION_DAILY_CAP` (2,000 per UTC day, V2 §13, in the `counters` table): hedges and retries included. Past it, posts hold and are retried. At today's prices a review costs about $0.0004 and a chat message about $0.0001, most of it Llama Guard's prompt, so a full day's cap is well under $1. A chat message costs two calls (none for a short reply or one the spam guard holds), so 2,000 covers roughly 1,000 messages a day. The admin health header (V2 §10) shows calls today against the cap. Raise it when real traffic gets near.

**Prompt injection.** Post text is fenced in `<post>` tags with `<` and `>` removed, and the model is told the post is data. The policy model only returns numbers, so an injected instruction can at worst move a score, and every score is validated.

## 3. Rules (`src/core/moderation`)

| Code | Finds | Review | Chat |
|---|---|---|---|
| `empty`, `too-short`, `too-long` | length, after trimming (reviews 40–2,000, chat 1–2,000) | remove | remove |
| `slur` | a small blocklist, whole words, after undoing leetspeak, separators and stretched letters | remove | remove |
| `blocked-word` | slurs with reclaimed or innocent uses ("a chink in the armor") | hold | hold |
| `insult` | everyday insults ("stupid", "loser") | flag | allowed |
| `link` | a link outside `umd.edu` and `terpsicle.com` | hold | allowed |
| `cheating-site` | a link to Chegg, Course Hero, Studocu, Brainly or Numerade | hold | flag (the composer's nudge) |
| `email`, `phone`, `address` | contact details and street addresses (a building or room is normal) | hold | allowed, whoever's they are; someone else's only feed the policy model's `personal-info` (§2) |
| `uid` | a 9-digit UID | hold | hold, unless the writer is plainly sharing their own |
| `shares-answers` | a list of 3+ multiple-choice answers ("1. B 2. D 3. A"); "here are the answers/solutions/my code" | hold | flag (the composer's nudge) |
| `asks-for-answers` | "does anyone have the answers to hw 3", "hw 3 solutions", "answer key" | flag | allowed |
| `code-paste` | a pasted block of code while `activeAssignments` is true | hold | allowed |

"Allowed" means no reason at all: nothing holds, nothing flags, nothing is logged. A chat "flag" never holds; it's kept in the decision log, and `answersHint` uses it for the one-time note in the chat composer ("This reads like answers to graded work, and your name goes on it."), shown once per browser, after which the message sends as usual. "Posting here" says it as a fact, not a request: "Your name is on everything you post here, so posting answers to graded work is a bad idea." Chat's words stay neutral: no please, no lecture, no jokes (the owner, 2026-09-28: "like you're a cop").

The integrity rules are deliberately conservative for reviews: people talk about homework, solutions and code for honest reasons all the time ("solutions are posted on ELMS"). Only patterns that are nearly always a problem hold on their own; the rest flag, and the policy model reads them in context. The golden tests in `moderation.test.ts` pin both kinds, and the detectors themselves, including innocent words the blocklist must never match ("Niger", "spices", "raccoon").

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

Chat and reviews share these actions: hate, threats and violence, sexual content, sex crimes, child safety, weapons and self-harm keep holding (or removing) chat too. Categories that fire on ordinary student complaints ("he robbed us of our grade", "a liar about the curve") only flag, so the policy model judges them with the site's own rules instead of queueing every harsh review. **Urgent** items sort to the top of the owner's queue: the urgent categories above, a reported threat, and everything the spam guard holds.

## 5. The policy model

| Label | Kinds | Reviews: hold / remove at | Chat: hold / remove at |
|---|---|---|---|
| `academic-integrity`: shares or asks for answers, solutions or code for graded work | reviews | 0.5 / never | not scored |
| `targets-person`: attacks or mocks a person, names a student, comments on identity or looks | both | 0.5 / never | 0.5 / never |
| `personal-info`: someone else's contact or private details | both | 0.5 / never | 0.9 / never, and only with a detail to expose (§2) |
| `misconduct-claim`: states misconduct as fact (the main defamation risk) | reviews | 0.5 / never | not scored |
| `spam`: ads, selling, scams, gibberish | both | 0.5 / 0.9 | 0.9 / never |
| `off-topic`: not about the course at all | reviews | 0.6 / 0.9 | not scored |

Only clear spam and clear non-reviews are removed without a person, and only in reviews. Every other label holds: a wrong hold costs the owner a click, a wrong removal silences someone. Chat's bars are high because what the small model over-reads there (a study group's numbers, a link, a textbook for sale) is allowed. Chat's definitions say so too: sharing your own details or a room to meet in, pointing to a website or a study group, and selling a used textbook all score 0.

**Models** (`POLICY_MODELS` in `models.ts`, V2 §9.2's measurement):
- **Reviews:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, the model summaries already use. Reviews are few and each matters, and on held-out cases it caught a comment on an instructor's age that the 8B model scored 0.
- **Chat:** `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. It's small and fast: chat p95 end to end was 1.4 s over 75 messages, against V2's 2 s. It missed no `graded-work` case, and costs about a sixth of the 70B's price per token. The plain `-fp8` variant rejects JSON schemas.

## 6. The owner's queue and the admin API

**Storage** (`migrations/0004_moderation.sql`, V2 §9.4's columns):
- `moderation_decisions`: every decision, text-free. Columns: `surface`, `ref`, `stage` (`rules`, `model`, `human`), `verdict`, `labels` (the reasons as JSON), `guard` (Llama Guard's answer), `policy` (the scores), `models`, `latency_ms`, `decided_by` (`system`, `admin`), `reason` (the owner's) and `created_at`. The latest row for a ref is its state.
- `moderation_queue`: held items. The `snapshot` JSON holds the text, course, `activeAssignments`, scores and retry count, plus `labels`, `urgent`, `status` and `closed_at`.
  - Status is `retry` (waiting for the cron; not in V2 §9.4, added for the retry rule), `open` (the owner's) or `closed`.
  - One waiting row per ref. A ref held again after it closed gets a new row.
  - **The snapshot is blanked 30 days after the item closes**, by the same cron. After that the owner still sees the labels and decision, not the text.
- `reports` (V2 §9.3): one row per person per item (`reporter_id` is only ever counted, never shown). See "Reports" below.
- **No table stores an author**, only a surface and ref. The admin view can't show who wrote something, even by accident. Reviews keeps its author in its own table.

**Endpoints** (`POST /api/admin/moderation/*`, 600 per IP per hour), all `auth: "admin"` in the route table: a same-origin request with an admin session (`config/admins.txt`, `docs/AUTH.md`), else `401 unauthorized` signed out or `403 forbidden`.

| Endpoint | Input | Result |
|---|---|---|
| `admin/moderation/queue` | `{status?: "open" \| "closed", limit?: 1–100}` | `{items: QueueItem[], open}`. Open: urgent first, then oldest. Closed: most recently closed first, each with its `resolution`. `retry` items never appear. |
| `admin/moderation/resolve` | `{id, action: "approve" \| "remove", reason: AdminReason, authorAction?: "stop"}` | `{status: "ok", item}` or `{status: "not-found"}` |
| `admin/moderation/undo` | `{id}` | `{status: "ok", item}`, `{status: "nothing-to-undo"}` or `{status: "not-found"}` |

- **No confirmation dialogs** (DESIGN §5): approve and remove act at once, and the UI offers **Undo**. Undo reopens the item, held, unless its ref was held again since (an edit), which answers `nothing-to-undo`.
- **Stopping an author** (V2 §7.5, §10): `authorAction: "stop"`, only with `remove`, also keeps whoever wrote the item from writing more: reviews for 30 days, Chat for 7 (`AUTHOR_STOP_DAYS`). Moderation picks the stop's id and end; the surface's `AuthorActor` (`authorActors(env)` in `handlers.ts`: Reviews' store, or the message's `CourseChat` object) finds the author, records the stop on them in `author_stops` and sets `users.reviews_blocked_until` or `chat_blocked_until` to the latest stop still in force (`src/server/auth/stops.ts`), answering only whether anyone was there to stop. `moderation_author_stops` (migration `0013_author_stops.sql`) keeps the id and end per queue item, never who; the item shows `stoppedUntil`, the decision's labels gain `author-stopped`, and Undo lifts that stop alone (another stop on the same person stays in force). If recording the decision fails, the stop is lifted again. Nobody to stop (a purged account, a deleted message, a sample) leaves the removal standing with `stoppedUntil: null`.
- **Queue context:** review items carry `review: {instructor, rating, termId, grade}` from Reviews (the waiting edit's numbers for an edit); chat items `null`.
- **Reaching the feature:** each handler from `moderationHandlers(env)` gets `(targetId, "publish" | "remove" | "hold", {db, now, reasons})` and must be idempotent. It runs before anything is recorded, so if it fails, nothing changes and the owner (or the next cron run) can try again. Tests pass their own through `handleApi(…, {moderationHandlers})`.
- **A handler must treat a `targetId` it doesn't know as done**, not as an error: the author may have deleted the post while it waited, and on test copies the queue holds made-up posts (`admin/samples`, below) whose ids no feature stored. Throwing would leave the owner unable to close the item.

The rest of the panel's API (`src/server/admin/`, V2 §10), also `auth: "admin"`:

| Endpoint | Input | Result |
|---|---|---|
| `admin/decisions` | `{surface?, stage?, verdict?, cursor?, limit?: 1–100}` | `{decisions: DecisionEntry[], cursor, days}`. Newest first; pass `cursor` back for the next page (`null` on the last). `days`: the last 14 UTC days of automatic decisions (allowed, held, rejected) for the surface filter, for the held share against the 5% target. Entries carry the reasons, never text, model ids or an author. |
| `admin/health` | `{}` | `{aiCalls: {today, cap}, retry: {waiting, oldestAt}, queue: {open, urgent, oldestAt}}`. `today` counts model attempts this UTC day, up to the cap (attempts the cap turned away never reached a model). |
| `admin/chat/remove` | `{termId, courseCode, messageId, reason, authorAction?}` | Removes a chat message found outside the queue: it's queued (or its waiting item is used) and resolved like any other, so the log has it without its author and Undo reopens it held. `{status: "ok", item}` or `not-found` when the message is gone. |
| `admin/samples` | `{}` | Test mode only (previews, `pnpm dev:mock`, e2e; `not-found` elsewhere): puts four made-up held posts in the queue, one urgent, so the panel can be tried without real posts. `{items: QueueItem[]}` |

The panel itself is `src/features/admin/` at `/admin` (the queue, with the health header and a "Decided" view with Undo per item) and `/admin/decisions` (the log, filters in the URL). Held text renders as plain text with each rule's match marked. "Paste a chat link" takes a thread link from Chat or a ref from the decision log for `admin/chat/remove`; a removal's "Also stop this author …" checkbox sends `authorAction`.

**Reports** (V2 §9.3): `POST /api/reports/create {surface, ref, reason, note | null}`, `auth: "user"`, 30 per person per hour, in `src/server/moderation/reports.ts`.
- Each surface takes its own reasons (`ReportCreateInputSchema`), with a note of at most 300 characters:
  - **Reviews:** `personal-info`, `names-a-student`, `hate`, `threat`, `sexual`, `misconduct-claim`, `graded-work`, `off-topic`, `other`.
  - **Chat, abuse only** (the owner, 2026-09-27): `hate` ("Harassment or hate"), `threat`, `sexual`, `spam`, `personal-info` ("Someone's private info") and `other` ("Something else"), which needs a note. Anything else is `400`.
- Answers `reported` (also when this person already reported it: one report per person per item), `not-found` (nothing the reporter could be reading), or `own` (you wrote it).
- Each surface finds its items through a `ReportTarget` (`reportTargets(env)`): Reviews' reads D1. Chat's (`src/server/chat/report-target.ts`, `v2/chat-ui`) reaches the message's `CourseChat` object from the ref (`<termId>:<courseCode>:<messageId>`): `reportTarget` finds a message the reporter can read (visible, or taken down by reports and maybe still on their screen), with its text for the snapshot and never its author; `hideReported` holds it for its author only (`held: reported`) until a person decides, and the owner's approve or remove reaches it through Chat's handler as usual.
- Every report puts the item in the owner's queue (`queueForOwner`) with one `reported` label per report reason (`{code: "reported", source: "reports", report}`). The labels only flag it, unless the reports **hide** it: 3 different people, or 1 report of `threat`, `personal-info` or `names-a-student` (`shouldHide` in `src/core/moderation/reports.ts`). Hiding logs `reports:hide` and makes the labels holds. A reported threat is urgent.
- Only reports since the owner last **approved** the item count, so an approval settles them. The pure rules are in `src/core/moderation/reports.ts`; the reporter's id never reaches the queue.
- Each surface follows its own switch: review reports need `REVIEWS_ENABLED` at `read` or `on`, chat reports `CHAT_ENABLED` at `read` or `on`; otherwise `unavailable`.

## 7. Configuration

| Var | Default | What |
|---|---|---|
| `MODERATION_DAILY_CAP` | `2000` (in `wrangler.jsonc`, V2 §13) | Model attempts per UTC day, hedges and retries included. |
| `MODERATION_CONFIG` | unset | JSON overrides, validated by `ModerationConfigOverridesSchema`; anything invalid is ignored as a whole. |

The spam guard's thresholds are constants (`CROSS_ROOM` in `src/core/moderation/cross-room.ts`), not config: they're the owner's numbers.

```jsonc
// MODERATION_CONFIG: every key optional
{
  "guardModel": "@cf/meta/llama-guard-3-8b",
  "policyModel": "@cf/…",                         // both kinds
  "policyModels": { "review": "@cf/…", "chat": "@cf/…" },
  "timeoutMs": 10000,                             // per stage, across attempts
  "hedgeAfterMs": 1000,
  "chatPolicy": "always",                         // or "flagged": skip the policy model for unflagged chat
  "guardActions": { "S5": "hold" },               // flag | hold | remove
  "policyThresholds": { "spam": { "hold": 0.4, "remove": 0.95 } },  // both kinds
  "chatPolicyThresholds": { "personal-info": { "hold": 0.95 } }    // chat, over the line above
}
```

## 8. The eval

`src/server/moderation/eval/cases.ts` holds 55 invented, harmless review and chat snippets with the decision each should get; borderline ones list every acceptable decision. The last ten are **held out**: written after the prompt and thresholds were tuned, and not tuned against (one held-out chat case changed its wanted decision with the owner's lighter chat, not with tuning). Two chat cases about a named student (one mocking, one kind) were added with the always-on chat read. The lighter chat (2026-09-27) added study-group numbers and rooms, a groupmate's email, a resource link, homework talk and a casual insult (publish), and a threat, someone's home address and a slur (hold, hold, remove); answers, code and an answer site now publish. `CROSS_ROOM_CASES` holds the spam guard's cases (the same ad in three courses, near-same copies, one question in three rooms of one course, "thanks!" everywhere, a flood across five courses, a busy talker in four courses or one).

- **In CI** (`eval.test.ts`): the rules alone never hold or remove a case that should publish, and decide the cases marked `rules` exactly; every spam-guard case gets its rule.
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
| 70B for reviews, 8B for chat, with the rule fix below | final | 35 | 10 | 0 | 0.7 s / 3.8 s |
| **Shipped:** the same, chat read always, hedge at 1 s (47 cases) | final | 47 of 47 | – | 0 | 1.2 s / 3.5 s |

Guard was `@cf/meta/llama-guard-3-8b` throughout, with the hedge. The "final" prompt added one line to each of two rules: harsh criticism of teaching scores 0 on `targets-person`, and solutions the course staff posted score 0 on `academic-integrity`.

- The 3B model marked nearly every review `off-topic`.
- The held-out chat miss in both first runs ("can someone **just** send me their lab 4 code") was a rule gap: the filler word hid the request, so the policy model never read it. The rule now allows a filler word; that case is no longer truly held out.
- The first run of all held 25 of 35 posts for model failures. Most came from the plain `-fp8` 8B model rejecting JSON schemas; 5 were Guard calls past a plain 5 s timeout, which the hedge fixed.
- The overall p95 of 3.5 s is reviews on the 70B model; V2 §7.4 expects about 4 s for a review submit.

**Reading every chat message** (2026-09-26, the 23 chat cases, three runs per row):

| Chat policy | Hedge | Acceptable | Good messages held or removed | p50 / p95 end to end |
|---|---|---|---|---|
| flagged only | 2.5 s | 23 of 23 | 0 | 0.4 s / 3.1 s |
| every message, all labels | 2.5 s | 19 of 23 | 4 | 0.5 s / 2.6 s |
| flagged only | 1 s | 23 of 23 | 0 | 0.4 s / 1.2 s |
| every message, all labels | 1 s | 19 of 23 | 4 | 0.5 s / 0.9 s |
| **every message, `targets-person` unless flagged** (shipped; 25 cases) | 1 s | 25 of 25 | 0 | 0.5 s / 1.4 s |

Reading every message adds little latency, because the policy model runs beside Guard and the tail is Guard's. The shipped row had 3 of 75 messages over 2 s (the slowest 8.6 s, when both of Guard's attempts were slow).

**Lighter chat** (2026-09-27, the 33 chat cases; the first row two runs, the shipped row three, the full set once):

| Chat setup | Acceptable | Good messages held or removed | Problems published | p50 / p95 |
|---|---|---|---|---|
| Three labels, `personal-info` and `spam` at 0.9, no gate | 30 of 33 | 3 ("text me at …", an answer site read as spam, "send me your code" scored as personal info) | 0 | 0.42 s / 1.2 s |
| **Shipped:** the same, `personal-info` gated on a detail to expose, spam defined as promotion | 33 of 33 (all three runs) | 0 | 0 | 0.38–0.42 s / 0.56–0.81 s |
| The full set (55: reviews unchanged) with the shipped chat | 55 of 55 | 0 | 0 | 0.49 s / 1.7 s |

The small model's scores are nearly all 0, 0.5 or 1, so raising a bar from 0.5 to 0.9 changes little on its own; the gate and the definitions are what cleared the false holds.

## 9. Known limits and next steps

- **Chat publishes answers and contact details on purpose** (the owner, 2026-09-27). Someone else's details hold only when the rules or Guard see a detail to expose and the model is very sure; a leak in words alone ("she lives above the Chipotle") relies on `targets-person` or a report.
- **The spam guard sees only one person.** Many accounts posting the same thing aren't caught by it (each needs a real UMD sign-in, and the owner can stop an author). The first two copies of a repeated message publish; only the third course's and later hold. Rooms of one course count as one course, so spam kept inside one course's rooms is left to reports and the per-course send limit.
- **Scores near 0.5 wobble.** One harsh-but-fair review flipped between publish and hold across runs. That costs the owner a click, not a wrong publish.
- **Decision rows are kept.** V2 says a year; nothing prunes them yet (it's the daily job's, V2 §13).
- **V2 §9 and §10 describe this API** (`moderate()`, per-label scores, `admin/moderation/*`) and point here for details.
- **Reports** landed with `v2/reviews-api` (§6); chat reports with `v2/chat-ui`.
- **Analytics:** no moderation events yet. When added, they carry counts and reason codes only, never text (`docs/ANALYTICS.md`).
