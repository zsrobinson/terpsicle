import { describe, expect, it } from "vitest";
import {
  type ModerationKind,
  type ModerationReason,
  ReasonCodeSchema,
} from "~/core/schema";
import {
  BLOCKED_WORDS,
  DEFAULT_GUARD_ACTIONS,
  decide,
  findBlockedWords,
  findLinks,
  guardReasons,
  isUrgent,
  LENGTH_LIMITS,
  MODERATION_POLICY,
  needsPolicy,
  needsRetry,
  normalizeWord,
  policyLabelsFor,
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

  // Links: UMD and Terpsicle are fine; others flag in chat, hold in reviews.
  ["chat", "syllabus: https://www.cs.umd.edu/class/fall2026/cmsc351/.", []],
  ["chat", "plan it on terpsicle.com/schedule", []],
  [
    "chat",
    "notes here https://docs.google.com/document/d/abc, enjoy",
    ["link:flag@https://docs.google.com/document/d/abc"],
  ],
  [
    "review",
    "Take this class, and read my blog at www.example.net for more thoughts on it.",
    ["link:hold@www.example.net"],
  ],
  [
    "chat",
    "it's on chegg.com/homework-help/q123",
    ["cheating-site:hold@chegg.com/homework-help/q123"],
  ],
  ["chat", "email me at testudo@terpmail.umd.edu", []],

  // Contact details: someone else's always hold; your own is fine in chat.
  ["chat", "study group tonight, text me at 301-555-0199", []],
  ["chat", "his number is (301) 555-0199 lol", ["phone:hold@(301) 555-0199"]],
  [
    "review",
    "Text me at 301.555.0199 and I'll explain why this course is worth it.",
    ["phone:hold@301.555.0199"],
  ],
  [
    "chat",
    "her email is jdoe42@terpmail.umd.edu",
    ["email:hold@jdoe42@terpmail.umd.edu"],
  ],
  [
    "review",
    "He lives at 4321 Knox Rd, a 10 minute drive from campus, which says a lot.",
    ["address:hold@4321 Knox Rd"],
  ],
  ["chat", "come over to 7400 Baltimore Avenue at 6 to study", []],
  [
    "chat",
    "my UID is 118234567, is that bad to share?",
    ["uid:hold@118234567"],
  ],

  // Academic integrity: strong patterns hold, the rest flag for the model.
  [
    "chat",
    "does anyone have the answers to hw 3?",
    ["asks-for-answers:flag@does anyone have the answers"],
  ],
  [
    "chat",
    "can someone just send me their lab 4 code",
    ["asks-for-answers:flag@can someone just send me their lab 4 code"],
  ],
  [
    "chat",
    "hw 3 solutions are posted on ELMS now",
    ["asks-for-answers:flag@hw 3 solutions"],
  ],
  [
    "chat",
    "is there an answer key for the practice exam",
    ["asks-for-answers:flag@answer key"],
  ],
  [
    "chat",
    "quiz 4: 1. B 2. C 3. A 4. D",
    ["shares-answers:hold@1. B 2. C 3. A 4. D"],
  ],
  ["chat", "q1) a, q2) d, q3) c", ["shares-answers:hold@q1) a, q2) d, q3) c"]],
  [
    "chat",
    "here are the answers for the worksheet",
    ["shares-answers:hold@here are the answers"],
  ],
  [
    "chat",
    CODE_BLOCK,
    [`code-paste:hold@${CODE_BLOCK.slice(CODE_BLOCK.indexOf("```"))}`],
    true,
  ],
  ["chat", CODE_BLOCK, [], false],
  ["chat", UNFENCED_CODE, [`code-paste:hold@${UNFENCED_CODE}`], true],

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

  it("acts only on targeting a person for chat nothing flagged", () => {
    expect(policyLabelsFor("chat", [])).toEqual(["targets-person"]);
    expect(policyLabelsFor("chat", [r("phone", "hold")])).toEqual([
      "targets-person",
    ]);
    expect(policyLabelsFor("chat", [r("insult", "flag")])).toContain(
      "academic-integrity",
    );
    expect(policyLabelsFor("review", [])).toContain("off-topic");
    const scores = { "personal-info": 1, "targets-person": 0.7 };
    expect(
      policyReasons("chat", scores, undefined, policyLabelsFor("chat", [])).map(
        (x) => x.code,
      ),
    ).toEqual(["targets-person"]);
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
});
