// Academic-integrity heuristics. Deliberately conservative: people talk about
// homework, solutions and code all the time for honest reasons ("solutions
// are posted on ELMS", "my code won't compile"). Only three patterns hold on
// their own: a list of multiple-choice answers, "here are the answers"-style
// sharing, and a pasted block of code while the course has graded work open.
// Everything else that sounds like trading answers is a flag, which asks the
// policy model to read it rather than holding it.

export type IntegrityCode =
  | "shares-answers"
  | "asks-for-answers"
  | "code-paste";

export interface IntegrityMatch {
  code: IntegrityCode;
  /** True for the patterns that hold on their own; false asks the model. */
  strong: boolean;
  span: [number, number];
}

const WORK =
  "(?:hw|homework|pset|problem\\s+set|quiz(?:zes)?|exam|midterm|final|project|proj|lab|assignment|worksheet)";

// "here are the answers", "posting my solutions", "attached is my code"
const SHARING = new RegExp(
  `\\b(?:here'?s|here\\s+(?:is|are)|posting|sharing|dropping|attached(?:\\s+(?:is|are))?)\\s+(?:the|my|our|all\\s+the)\\s+(?:${WORK}\\s*#?\\s*\\d*\\s+)?(?:answers?|solutions?|answer\\s+key|code)\\b`,
  "gi",
);

// "does anyone have the answers to hw 3", "can someone send their code"
const ASKING =
  /\b(?:does\s+any(?:one|body)|any(?:one|body)|can\s+(?:some|any)(?:one|body)|could\s+(?:some|any)(?:one|body)|pls|please)(?:\s+(?:just|pls|please|plz|maybe|like|ever))*\s+(?:have|got|send|share|dm|post|give)\b[^.?!\n]{0,40}?\b(?:answers?|solutions?|answer\s+key|code)\b/gi;

// "answers to hw 3", "hw 3 solutions", "the answer key"
const MENTIONS = new RegExp(
  `\\b(?:answers?|solutions?)\\s+(?:to|for)\\s+(?:the\\s+)?${WORK}\\b|\\b${WORK}\\s*#?\\s*\\d+\\s+(?:answers?|solutions?|key)\\b|\\banswer\\s+key\\b`,
  "gi",
);

// One multiple-choice answer: "1. B", "q2) c", "#3: d", "4 - a". The letter
// must stand alone (end, comma, newline or the next number) so "1. A lot of
// reading" doesn't count.
const ANSWER_PAIR =
  /(?:(?<!\w)(?:q|question|no\.?)\s*|#\s*|(?<![\w.]))\d{1,2}\s*[).:=-]\s*[a-eA-E](?=\s*(?:[,;\n]|$|(?:q|#)?\s*\d{1,2}\s*[).:=-]))/g;
const MIN_ANSWER_PAIRS = 3;

// A line that looks like code rather than prose.
const CODE_LINE =
  /[;{}]\s*$|^\s*(?:def|class|public|private|protected|static|int|void|for|while|if|else|return|import|from|#include|function|const|let|var|fn|func)\b|^\s*\/\/|^ {4,}\S|^\t+\S/;
const MIN_CODE_LINES = 5;
const MIN_FENCED_LINES = 3;

function codeBlock(text: string): [number, number] | null {
  const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  if (fenced) {
    const lines = (fenced[1] ?? "").split("\n").filter((l) => l.trim());
    if (lines.length >= MIN_FENCED_LINES)
      return [fenced.index, fenced.index + fenced[0].length];
  }
  const lines = text.split("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  const code = nonEmpty.filter((l) => CODE_LINE.test(l));
  if (code.length >= MIN_CODE_LINES && code.length * 2 >= nonEmpty.length) {
    const first = text.indexOf(code[0] ?? "");
    const last = code.at(-1) ?? "";
    return [first, text.lastIndexOf(last) + last.length];
  }
  return null;
}

const spanOf = (m: RegExpMatchArray): [number, number] => [
  m.index ?? 0,
  (m.index ?? 0) + m[0].length,
];

export function findIntegrityIssues(
  text: string,
  options: { activeAssignments: boolean },
): IntegrityMatch[] {
  const found: IntegrityMatch[] = [];

  const pairs = [...text.matchAll(ANSWER_PAIR)];
  const firstPair = pairs[0];
  const lastPair = pairs.at(-1);
  if (pairs.length >= MIN_ANSWER_PAIRS && firstPair && lastPair) {
    found.push({
      code: "shares-answers",
      strong: true,
      span: [spanOf(firstPair)[0], spanOf(lastPair)[1]],
    });
  }
  for (const m of text.matchAll(SHARING))
    found.push({ code: "shares-answers", strong: true, span: spanOf(m) });
  // A weaker pattern inside or across a stronger match says nothing new.
  const weak = [...text.matchAll(ASKING), ...text.matchAll(MENTIONS)];
  for (const m of weak) {
    const span = spanOf(m);
    if (!found.some((f) => f.span[0] < span[1] && span[0] < f.span[1]))
      found.push({ code: "asks-for-answers", strong: false, span });
  }

  if (options.activeAssignments) {
    const block = codeBlock(text);
    if (block) found.push({ code: "code-paste", strong: true, span: block });
  }
  return found.sort((a, b) => a.span[0] - b.span[0]);
}
