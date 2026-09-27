import { describe, expect, it } from "vitest";
import {
  type ModerationKind,
  type ModerationReason,
  ReasonCodeSchema,
} from "~/core/schema";
import {
  actingPolicyLabels,
  answersHint,
  BLOCKED_WORDS,
  DEFAULT_GUARD_ACTIONS,
  decide,
  findBlockedWords,
  findContacts,
  findIntegrityIssues,
  findLinks,
  guardReasons,
  INSULTS,
  isTrivialChat,
  isUrgent,
  LENGTH_LIMITS,
  MODERATION_POLICY,
  needsPolicy,
  needsRetry,
  normalizeWord,
  POLICY_LABELS,
  policyReasons,
  precheck,
  REASON_WORDS,
  SLURS,
} from ".";

/** "code:action@matched text", the shape the golden table uses. */
function summarize(
  kind: ModerationKind,
  text: string,
  activeAssignments = false,
): string[] {
  return precheck({ kind, text, context: { activeAssignments } }).map(
    (r) =>
      `${r.code}:${r.action}${r.span ? `@${text.slice(r.span[0], r.span[1])}` : ""}`,
  );
}

type Golden = [
  kind: ModerationKind,
  text: string,
  expected: string[],
  activeAssignments?: boolean,
];

const CODE_BLOCK = [
  "here's what I have, not sure why it fails:",
  "```java",
  "public int solve(int[] a) {",
  "  int best = 0;",
  "  for (int x : a) best = Math.max(best, x);",
  "  return best;",
  "}",
  "```",
].join("\n");

const UNFENCED_CODE = [
  "def solve(nums):",
  "    best = 0",
  "    for n in nums:",
  "        best = max(best, n)",
  "    return best",
].join("\n");

const GOLDEN: Golden[] = [
  // Clean text publishes with no reasons.
  ["chat", "anyone want to form a study group for the midterm?", []],
  [
    "review",
    "Lectures were clear and well paced. Exams were hard but fair, and office hours helped a lot.",
    [],
  ],
  ["chat", "the Niger river, spicy food, and a raccoon walk into Hornbake", []],
  [
    "chat",
    "we meet in IRB 1116 on TuTh 12:30-1:45, sections 0101 and 0102",
    [],
  ],
  ["chat", "1. A lot of reading 2. B+ average 3. curve at the end", []],

  // Length.
  ["chat", "   ", ["empty:remove"]],
  ["review", "Too short to say much.", ["too-short:remove"]],
  ["chat", "x".repeat(LENGTH_LIMITS.chat.max + 1), ["too-long:remove"]],

  // Links: UMD and Terpsicle are fine; others are fine in chat and hold in
  // reviews.
  ["chat", "syllabus: https://www.cs.umd.edu/class/fall2026/cmsc351/.", []],
  ["chat", "plan it on terpsicle.com/schedule", []],
  ["chat", "notes here https://docs.google.com/document/d/abc, enjoy", []],
  ["chat", "this video explains it way better https://youtu.be/xyz123", []],
  [
    "review",
    "Take this class, and read my blog at www.example.net for more thoughts on it.",
    ["link:hold@www.example.net"],
  ],
  // An answer site only flags chat (the author may get a nudge); reviews hold.
  [
    "chat",
    "it's on chegg.com/homework-help/q123",
    ["cheating-site:flag@chegg.com/homework-help/q123"],
  ],
  [
    "review",
    "Every worksheet answer is on chegg.com/homework-help/q123 so the class is easy.",
    ["cheating-site:hold@chegg.com/homework-help/q123"],
  ],
  ["chat", "email me at testudo@terpmail.umd.edu", []],

  // Contact details: any hold in reviews. Chat allows them, whoever's they
  // are; only the policy model's very sure `personal-info` holds there.
  ["chat", "study group tonight, text me at 301-555-0199", []],
  ["chat", "his number is (301) 555-0199 lol", []],
  [
    "review",
    "Text me at 301.555.0199 and I'll explain why this course is worth it.",
    ["phone:hold@301.555.0199"],
  ],
  ["chat", "her email is jdoe42@terpmail.umd.edu", []],
  [
    "review",
    "Email the TA at jdoe42@terpmail.umd.edu before the exam, she answers fast.",
    ["email:hold@jdoe42@terpmail.umd.edu"],
  ],
  [
    "review",
    "He lives at 4321 Knox Rd, a 10 minute drive from campus, which says a lot.",
    ["address:hold@4321 Knox Rd"],
  ],
  ["chat", "come over to 7400 Baltimore Avenue at 6 to study", []],
  ["chat", "study group in 1101 Kirwan Hall, 5 Paint Branch Dr at 7", []],
  // A UID is still held in chat, unless it's plainly the writer's own.
  [
    "chat",
    "my UID is 118234567, is that bad to share?",
    ["uid:hold@118234567"],
  ],

  // Academic integrity. Reviews: strong patterns hold, the rest flag for
  // the model. Chat: asking, homework talk and code are fine; answer lists
  // and "here are the answers" only flag (a nudge, never a hold).
  ["chat", "does anyone have the answers to hw 3?", []],
  ["chat", "can someone just send me their lab 4 code", []],
  ["chat", "hw 3 solutions are posted on ELMS now", []],
  ["chat", "is there an answer key for the practice exam", []],
  [
    "review",
    "Does anyone have the answers to hw 3? The class never posts solutions at all.",
    ["asks-for-answers:flag@Does anyone have the answers"],
  ],
  [
    "chat",
    "quiz 4: 1. B 2. C 3. A 4. D",
    ["shares-answers:flag@1. B 2. C 3. A 4. D"],
  ],
  ["chat", "q1) a, q2) d, q3) c", ["shares-answers:flag@q1) a, q2) d, q3) c"]],
  [
    "chat",
    "here are the answers for the worksheet",
    ["shares-answers:flag@here are the answers"],
  ],
  [
    "review",
    "Easy class. For quiz 4: 1. B 2. C 3. A 4. D, and the rest is the same.",
    ["shares-answers:hold@1. B 2. C 3. A 4. D"],
  ],
  [
    "review",
    "Here are the answers for the worksheet since the TA never explains them.",
    ["shares-answers:hold@Here are the answers"],
  ],
  ["chat", CODE_BLOCK, [], true],
  ["chat", CODE_BLOCK, [], false],
  ["chat", UNFENCED_CODE, [], true],
  [
    "review",
    CODE_BLOCK,
    [`code-paste:hold@${CODE_BLOCK.slice(CODE_BLOCK.indexOf("```"))}`],
    true,
  ],
  [
    "review",
    `What we wrote in lecture, for anyone curious:\n${UNFENCED_CODE}`,
    [`code-paste:hold@${UNFENCED_CODE}`],
    true,
  ],

  // Words.
  ["chat", "found a chink in his argument", ["blocked-word:hold@chink"]],
];

describe("precheck (golden)", () => {
  it.each(GOLDEN)("%s: %j", (kind, text, expected, active) => {
    expect(summarize(kind, text, active)).toEqual(expected);
  });

  it("removes slurs, including disguised ones, and never flags innocent words", () => {
    for (const slur of SLURS) {
      const disguised = slur
        .replace(/i/g, "1")
        .replace(/a/g, "@")
        .toUpperCase();
      for (const word of [slur, `${slur}s`, disguised]) {
        const reasons = precheck({ kind: "chat", text: `you ${word}.` });
        expect(reasons.map((r) => `${r.code}:${r.action}`)).toEqual([
          "slur:remove",
        ]);
      }
    }
    for (const word of BLOCKED_WORDS)
      expect(
        precheck({ kind: "chat", text: `so ${word}` }).map((r) => r.code),
      ).toEqual(["blocked-word"]);
  });

  it("lets casual insults through in chat, and flags them in reviews", () => {
    for (const word of INSULTS) {
      expect(precheck({ kind: "chat", text: `that's so ${word} lol` })).toEqual(
        [],
      );
      expect(
        precheck({
          kind: "review",
          text: `The grading policy is honestly ${word} and nobody explains it.`,
        }).map((r) => `${r.code}:${r.action}`),
      ).toEqual(["insult:flag"]);
    }
  });

  it("undoes leetspeak, separators and stretched letters", () => {
    expect(normalizeWord("K.1.K.E!")).toBe("kike");
    expect(normalizeWord("$p!c")).toBe("spic");
    const stretched = (SLURS[0] ?? "").replace(/(.)/, "$1$1$1");
    expect(findBlockedWords(`what a ${stretched}`)).toHaveLength(1);
    expect(
      findBlockedWords("Niger Scunthorpe spices raccoons Pakistan"),
    ).toEqual([]);
  });

  it("reports link hosts without trailing punctuation", () => {
    expect(
      findLinks("see http://Example.COM/path?x=1, or www.umd.edu."),
    ).toEqual([
      { host: "example.com", span: [4, 31] },
      { host: "umd.edu", span: [36, 47] },
    ]);
  });
});

const r = (
  code: ModerationReason["code"],
  action: ModerationReason["action"],
  source: ModerationReason["source"] = "rules",
): ModerationReason => ({ code, action, source });

// The detectors behind both kinds, pinned apart from what each kind does
// with them: chat ignores most of them now, reviews don't.
describe("detectors", () => {
  const integrity = (text: string, activeAssignments = false) =>
    findIntegrityIssues(text, { activeAssignments }).map(
      (m) =>
        `${m.code}:${m.strong ? "strong" : "weak"}@${text.slice(...m.span)}`,
    );

  it("finds answers, requests for them and pasted code", () => {
    expect(integrity("does anyone have the answers to hw 3?")).toEqual([
      "asks-for-answers:weak@does anyone have the answers",
    ]);
    expect(integrity("can someone just send me their lab 4 code")).toEqual([
      "asks-for-answers:weak@can someone just send me their lab 4 code",
    ]);
    expect(integrity("hw 3 solutions are posted on ELMS now")).toEqual([
      "asks-for-answers:weak@hw 3 solutions",
    ]);
    expect(integrity("is there an answer key for the practice exam")).toEqual([
      "asks-for-answers:weak@answer key",
    ]);
    expect(integrity("q1) a, q2) d, q3) c")).toEqual([
      "shares-answers:strong@q1) a, q2) d, q3) c",
    ]);
    expect(integrity(UNFENCED_CODE, true)).toEqual([
      `code-paste:strong@${UNFENCED_CODE}`,
    ]);
    expect(integrity(UNFENCED_CODE, false)).toEqual([]);
  });

  it("finds contact details, and whether they're the writer's own", () => {
    const contacts = (text: string) =>
      findContacts(text).map(
        (c) => `${c.kind}:${c.own ? "own" : "other"}@${text.slice(...c.span)}`,
      );
    expect(contacts("his number is (301) 555-0199 lol")).toEqual([
      "phone:other@(301) 555-0199",
    ]);
    expect(contacts("text me at 301-555-0199")).toEqual([
      "phone:own@301-555-0199",
    ]);
    expect(contacts("her email is jdoe42@terpmail.umd.edu")).toEqual([
      "email:other@jdoe42@terpmail.umd.edu",
    ]);
  });
});

describe("chat nudges and shortcuts", () => {
  it("nudges about graded answers only when a draft looks like them", () => {
    expect(answersHint("quiz 4: 1. B 2. C 3. A 4. D")).toBe(true);
    expect(answersHint("here are the answers for the worksheet")).toBe(true);
    expect(answersHint("it's all on chegg.com/homework-help/q123")).toBe(true);
    expect(answersHint("does anyone have the answers to hw 3?")).toBe(false);
    expect(answersHint("hw 3 solutions are posted on ELMS now")).toBe(false);
    expect(answersHint(CODE_BLOCK)).toBe(false);
  });

  it("skips the models only for the smallest, harmless messages", () => {
    for (const text of [
      "thanks!",
      "Thank you!!",
      "same",
      "lol",
      "👍",
      "?",
      "+1",
    ])
      expect(isTrivialChat(text), text).toBe(true);
    for (const text of [
      "kys",
      "thanks idiot",
      "no one likes you",
      "ok see you at 6",
      "💣💣💣💣💣💣💣💣",
      "",
    ])
      expect(isTrivialChat(text), text).toBe(false);
  });
});

describe("decide", () => {
  it("takes the most severe action and ignores flags", () => {
    expect(decide([])).toBe("publish");
    expect(decide([r("link", "flag")])).toBe("publish");
    expect(decide([r("link", "flag"), r("phone", "hold")])).toBe("hold");
    expect(decide([r("phone", "hold"), r("slur", "remove")])).toBe("remove");
  });

  it("asks the policy model for every review, and for chat as configured", () => {
    expect(needsPolicy("review", [])).toBe(true);
    expect(needsPolicy("chat", [])).toBe(true);
    expect(needsPolicy("chat", [], "flagged")).toBe(false);
    expect(needsPolicy("chat", [r("phone", "hold")], "flagged")).toBe(false);
    expect(needsPolicy("chat", [r("link", "flag")], "flagged")).toBe(true);
  });

  it("reads chat for people, private details and spam only, with high bars", () => {
    expect(POLICY_LABELS.chat).toEqual([
      "targets-person",
      "personal-info",
      "spam",
    ]);
    expect(POLICY_LABELS.review).toContain("academic-integrity");
    // Answers never act on chat; a phone number for a study group is fine.
    expect(
      policyReasons("chat", {
        "academic-integrity": 1,
        "personal-info": 0.85,
        spam: 0.85,
        "targets-person": 0.49,
      }),
    ).toEqual([]);
    // Someone else's details, or clear spam, hold; spam never removes chat.
    expect(
      policyReasons("chat", {
        "personal-info": 0.9,
        spam: 0.99,
        "targets-person": 0.5,
      }).map((x) => `${x.code}:${x.action}`),
    ).toEqual(["targets-person:hold", "personal-info:hold", "spam:hold"]);
    // Reviews keep theirs.
    expect(
      policyReasons("review", {
        "personal-info": 0.5,
        spam: 0.95,
        "academic-integrity": 0.5,
      }).map((x) => `${x.code}:${x.action}`),
    ).toEqual(["academic-integrity:hold", "personal-info:hold", "spam:remove"]);
  });

  it("retries only what a failed check held", () => {
    const failed = {
      code: "model-unavailable",
      source: "system",
      action: "hold",
    } as const;
    const capped = {
      code: "daily-cap",
      source: "system",
      action: "hold",
    } as const;
    expect(needsRetry([failed])).toBe(true);
    expect(needsRetry([capped, r("link", "flag")])).toBe(true);
    expect(needsRetry([failed, r("phone", "hold")])).toBe(false);
    expect(needsRetry([r("link", "flag")])).toBe(false);
    expect(needsRetry([])).toBe(false);
    // A burst of reviews is for a person; screening again changes nothing.
    const burst = { code: "burst", source: "system", action: "hold" } as const;
    expect(needsRetry([burst])).toBe(false);
    expect(needsRetry([failed, burst])).toBe(false);
  });

  it("maps Llama Guard categories through the configured actions", () => {
    expect(guardReasons(["S10", "S2", "S10"])).toEqual([
      { code: "hate", source: "guard", action: "hold", category: "S10" },
      { code: "crime", source: "guard", action: "flag", category: "S2" },
    ]);
    expect(guardReasons(["S4"])[0]?.action).toBe("remove");
    expect(
      guardReasons(["S10"], { ...DEFAULT_GUARD_ACTIONS, S10: "remove" })[0]
        ?.action,
    ).toBe("remove");
  });

  it("applies policy thresholds per kind", () => {
    const scores = {
      "academic-integrity": 0.49,
      "targets-person": 0.5,
      spam: 0.95,
      "off-topic": 0.7,
      "misconduct-claim": 0.8,
    };
    expect(policyReasons("review", scores)).toEqual([
      {
        code: "targets-person",
        source: "policy",
        action: "hold",
        score: 0.5,
      },
      {
        code: "misconduct-claim",
        source: "policy",
        action: "hold",
        score: 0.8,
      },
      { code: "spam", source: "policy", action: "remove", score: 0.95 },
      { code: "off-topic", source: "policy", action: "hold", score: 0.7 },
    ]);
    // Chat doesn't score off-topic or misconduct claims.
    expect(policyReasons("chat", scores).map((x) => x.code)).toEqual([
      "targets-person",
      "spam",
    ]);
  });

  it("marks threats and self-harm as urgent, but not when only flagged", () => {
    expect(isUrgent([r("self-harm", "hold", "guard")])).toBe(true);
    expect(isUrgent([r("violence", "flag", "guard")])).toBe(false);
    expect(isUrgent([r("phone", "hold")])).toBe(false);
  });

  it("lets personal info act on chat only when there's someone else's detail to expose", () => {
    const labels = (text: string, reasons: ModerationReason[] = []) =>
      actingPolicyLabels("chat", text, reasons);
    expect(labels("study group tonight, text me at 301-555-0199")).toEqual([
      "targets-person",
      "spam",
    ]);
    expect(labels("can someone send me their lab 4 code")).toEqual([
      "targets-person",
      "spam",
    ]);
    expect(labels("her cell is 240-555-0188, text her")).toEqual(
      POLICY_LABELS.chat,
    );
    expect(
      labels("you know where he lives", [r("privacy", "flag", "guard")]),
    ).toEqual(POLICY_LABELS.chat);
    expect(actingPolicyLabels("review", "anything", [])).toEqual(
      POLICY_LABELS.review,
    );
  });

  it("marks the spam guard's holds as urgent, not the policy model's spam", () => {
    expect(isUrgent([r("spam", "hold", "cross-room")])).toBe(true);
    expect(isUrgent([r("spam", "hold", "policy")])).toBe(false);
  });
});

describe("policy text", () => {
  it("has words for every reason code", () => {
    for (const code of ReasonCodeSchema.options)
      expect(REASON_WORDS[code].length).toBeGreaterThan(0);
  });

  it("states the length limits it enforces", () => {
    const good = MODERATION_POLICY.review.sections[0]?.items.join(" ");
    expect(good).toContain(String(LENGTH_LIMITS.review.min));
    expect(good).toContain("2,000");
    expect(MODERATION_POLICY.chat.title).toBe("What's allowed");
  });

  it("asks kindly about answers in chat, and never says a bot reads every message", () => {
    const chat = MODERATION_POLICY.chat;
    const all = [
      chat.intro,
      chat.process,
      ...chat.sections.flatMap((s) => [s.heading, ...s.items]),
    ].join(" ");
    expect(all).toMatch(/please don't/i);
    expect(all).toMatch(/answers to graded work/);
    expect(all).not.toMatch(/checked automatically|automatic check|bot/i);
    expect(all).toMatch(/kept to these rules/);
  });
});
