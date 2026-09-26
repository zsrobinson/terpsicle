// A small eval set for moderation: invented, harmless student reviews and
// chat messages, with what should happen to each. Some are deliberately
// borderline; for those, `accept` lists every decision a reasonable
// moderator could make. People, courses and numbers are made up.
//
// scripts/moderation-eval.ts runs these live against Workers AI (never in
// CI). eval.test.ts checks, in CI, that the rules alone agree with them.
import type { ModerationDecision, ModerationKind } from "~/core/schema";

export interface EvalCase {
  id: string;
  kind: ModerationKind;
  text: string;
  course?: string;
  activeAssignments?: boolean;
  /** The decision we want. */
  expect: ModerationDecision;
  /** Other decisions that are also fine, for borderline cases. */
  accept?: ModerationDecision[];
  /** What the rules alone decide, when they should decide it without a model. */
  rules?: ModerationDecision;
  why: string;
}

export const EVAL_CASES: readonly EvalCase[] = [
  // ---------- reviews that should publish ----------
  {
    id: "review-positive",
    kind: "review",
    course: "CMSC351",
    text: "Lectures are clear and she explains proofs step by step. Homework is long but it prepares you for the exams, which are fair. Go to office hours, they help a lot.",
    expect: "publish",
    why: "An ordinary positive review.",
  },
  {
    id: "review-harsh-teaching",
    kind: "review",
    course: "MATH241",
    text: "Honestly the worst lecturer I've had at UMD. He reads off the slides, never answers questions, and the exams test things we never covered. Take it with someone else if you can.",
    expect: "publish",
    why: "Harsh but about teaching. Negative reviews are welcome.",
  },
  {
    id: "review-grading-unfair",
    kind: "review",
    course: "ECON200",
    text: "Grading felt really unfair to me. The curve was tiny, the TAs took points off for tiny formatting things, and regrade requests were ignored. The content itself is interesting though.",
    expect: "publish",
    why: "An opinion about fairness, not a claim of misconduct.",
  },
  {
    id: "review-workload",
    kind: "review",
    course: "CMSC216",
    text: "Projects are brutal, easily 20 hours each, and the autograder is picky. You learn a ton about C and memory, but don't take this with two other project classes.",
    expect: "publish",
    why: "Workload advice.",
  },
  {
    id: "review-exam-solutions-posted",
    kind: "review",
    course: "STAT400",
    text: "She posts full exam solutions after every midterm, which is great for studying. Practice exams are very close to the real ones, so do all of them.",
    expect: "publish",
    why: "Mentions solutions, but officially posted ones.",
  },
  {
    id: "review-accent-teaching",
    kind: "review",
    course: "PHYS161",
    text: "He can be hard to follow in lecture because he talks fast and skips steps, so read the textbook section first. Once you do, the problem sets make sense.",
    expect: "publish",
    why: "About clarity of teaching, not identity.",
  },
  {
    id: "review-umd-link",
    kind: "review",
    course: "CMSC330",
    text: "Great course. The whole schedule and all the project specs are on https://www.cs.umd.edu/class/ so you can see what you're getting into before registering.",
    expect: "publish",
    rules: "publish",
    why: "A umd.edu link is allowed.",
  },
  {
    id: "review-profanity-mild",
    kind: "review",
    course: "BSCI330",
    text: "This class kicked my ass. So much memorization. But she's genuinely nice and wants you to pass, and the curve saved me in the end.",
    expect: "publish",
    why: "Mild profanity about a course is fine.",
  },

  // ---------- reviews that should wait for a person ----------
  {
    id: "review-appearance",
    kind: "review",
    course: "ENGL101",
    text: "She always dresses like she's going to a funeral and her voice is so annoying, like nails on a chalkboard. Also the essays were graded harshly.",
    expect: "hold",
    why: "Comments on looks and voice, not teaching.",
  },
  {
    id: "review-misconduct-claim",
    kind: "review",
    course: "BMGT220",
    text: "He definitely changed grades for students on the team he coaches, everyone knows it. The rest of us got curved down to make up for it. Avoid.",
    expect: "hold",
    accept: ["hold"],
    why: "An accusation of misconduct stated as fact: defamation risk.",
  },
  {
    id: "review-names-student",
    kind: "review",
    course: "CMSC131",
    text: "The class is fine but my lab partner Jordan Whitfield in section 0104 copied my project and then blamed me. Never pair with him.",
    expect: "hold",
    why: "Names and accuses another student.",
  },
  {
    id: "review-email",
    kind: "review",
    course: "HIST200",
    text: "Nice professor and interesting readings. If you want my old notes, email me at testudo.fan@terpmail.umd.edu and I'll send them over.",
    expect: "hold",
    rules: "hold",
    why: "An email address in an anonymous review.",
  },
  {
    id: "review-exam-questions",
    kind: "review",
    course: "CHEM135",
    text: "The final is the same every year. Question 3 is always the titration one and the answer is 0.25 M, question 7 is the equilibrium one with Kc = 4. Memorize those.",
    expect: "hold",
    why: "Shares answers to graded work.",
  },
  {
    id: "review-threat",
    kind: "review",
    course: "MATH140",
    text: "If he fails me again I swear I'll wait for him outside his office and make him regret it. Worst professor ever, seriously someone should hurt him.",
    expect: "hold",
    accept: ["remove"],
    why: "A threat: a person should read it (and it goes first).",
  },
  {
    id: "review-outside-link",
    kind: "review",
    course: "CMSC132",
    text: "Solid class overall, I wrote up everything you need to know on my blog at myterpnotes.blogspot.com with tips for each project.",
    expect: "hold",
    rules: "hold",
    why: "A non-UMD link in a review.",
  },

  // ---------- reviews that should be removed ----------
  {
    id: "review-spam",
    kind: "review",
    course: "ENGL101",
    text: "Need an A? Our expert writers finish any essay in 24 hours, 100% plagiarism free. DM us on Instagram @essaypros_umd for a 20% student discount!!!",
    expect: "remove",
    accept: ["hold"],
    why: "An ad.",
  },
  {
    id: "review-gibberish",
    kind: "review",
    course: "CMSC351",
    text: "asdkjh asd asd kjhasd qwe qwe qwe lorem ipsum dolor sit amet asdf asdf asdf jkl jkl jkl",
    expect: "remove",
    accept: ["hold"],
    why: "Not a review.",
  },
  {
    id: "review-too-short",
    kind: "review",
    text: "Great prof!!",
    expect: "remove",
    rules: "remove",
    why: "Under the length limit.",
  },

  // ---------- chat that should publish ----------
  {
    id: "chat-study-group",
    kind: "chat",
    course: "CMSC351",
    text: "anyone want to form a study group for the midterm? thinking McKeldin 2nd floor thursday at 7",
    expect: "publish",
    rules: "publish",
    why: "The point of class chat.",
  },
  {
    id: "chat-own-number",
    kind: "chat",
    course: "MATH246",
    text: "I'm making a group chat for section 0201, text me at 301-555-0147 if you want in",
    expect: "publish",
    rules: "publish",
    why: "Sharing your own number is fine in chat.",
  },
  {
    id: "chat-concept-question",
    kind: "chat",
    course: "CMSC351",
    text: "can someone explain why the master theorem doesn't apply when f(n) isn't polynomially larger? I keep getting confused on case 3",
    expect: "publish",
    why: "A concept question.",
  },
  {
    id: "chat-deadline",
    kind: "chat",
    course: "CMSC216",
    text: "wait is project 4 due friday or sunday? the syllabus and ELMS say different things",
    expect: "publish",
    why: "A logistics question mentioning a project.",
  },
  {
    id: "chat-solutions-posted",
    kind: "chat",
    course: "STAT400",
    text: "hw 5 solutions are posted on ELMS now btw, the grader was pretty lenient on number 3",
    activeAssignments: true,
    expect: "publish",
    why: "Officially posted solutions. The rules flag it; the model should clear it.",
  },
  {
    id: "chat-google-doc",
    kind: "chat",
    course: "BSCI170",
    text: "I put together a shared study guide for exam 2 from the lecture slides, feel free to add to it: https://docs.google.com/document/d/1abcDEFghiJK/edit",
    expect: "publish",
    accept: ["hold"],
    why: "A study guide link. Borderline only because it's an outside link.",
  },
  {
    id: "chat-complaint",
    kind: "chat",
    course: "MATH140",
    text: "that quiz was actually insane, I don't think anyone finished it in time lol",
    expect: "publish",
    why: "Venting about a quiz.",
  },
  {
    id: "chat-debug-no-assignment",
    kind: "chat",
    course: "CMSC132",
    text: "for anyone curious how the lecture example worked:\n```java\npublic int sum(int[] a) {\n  int total = 0;\n  for (int x : a) total += x;\n  return total;\n}\n```",
    activeAssignments: false,
    expect: "publish",
    rules: "publish",
    why: "Code from a lecture when nothing is open.",
  },
  {
    id: "chat-banter",
    kind: "chat",
    course: "CMSC330",
    text: "ocaml is going to be the death of me, see you all at office hours crying",
    expect: "publish",
    why: "Hyperbole, not self-harm.",
  },

  // ---------- chat that should wait for a person ----------
  {
    id: "chat-asks-for-answers",
    kind: "chat",
    course: "CMSC351",
    text: "does anyone have the answers to hw 6? it's due at midnight and I haven't started, can you dm me",
    activeAssignments: true,
    expect: "hold",
    why: "Asks for answers to open graded work.",
  },
  {
    id: "chat-answer-list",
    kind: "chat",
    course: "PSYC100",
    text: "quiz 7 answers: 1. B 2. D 3. A 4. C 5. B",
    activeAssignments: true,
    expect: "hold",
    rules: "hold",
    why: "A list of quiz answers.",
  },
  {
    id: "chat-code-during-project",
    kind: "chat",
    course: "CMSC216",
    text: "here's my whole function, it passes all the public tests:\n```c\nint remove_node(List *l, int key) {\n  Node *prev = NULL, *cur = l->head;\n  while (cur && cur->key != key) { prev = cur; cur = cur->next; }\n  if (!cur) return 0;\n  if (prev) prev->next = cur->next; else l->head = cur->next;\n  free(cur);\n  return 1;\n}\n```",
    activeAssignments: true,
    expect: "hold",
    rules: "hold",
    why: "Pasted solution code while the project is open.",
  },
  {
    id: "chat-someone-elses-number",
    kind: "chat",
    course: "ECON200",
    text: "if you want to complain to the TA directly her cell is 240-555-0188, she hates getting texts lol",
    expect: "hold",
    rules: "hold",
    why: "Someone else's phone number.",
  },
  {
    id: "chat-mocks-student",
    kind: "chat",
    course: "CMSC131",
    text: "did everyone see Priya Raman try to answer in lecture today, she's so dumb it's embarrassing, how did she even get into CS",
    expect: "hold",
    why: "Names and mocks another student.",
  },
  {
    id: "chat-cheating-site",
    kind: "chat",
    course: "MATH241",
    text: "just look it up on chegg.com/homework-help, every problem from the worksheet is on there",
    activeAssignments: true,
    expect: "hold",
    rules: "hold",
    why: "Points to an answer-sharing site for graded work.",
  },
  {
    id: "chat-self-harm",
    kind: "chat",
    course: "CHEM231",
    text: "honestly I don't see the point of anything anymore, I've been thinking about ending it after finals",
    expect: "hold",
    why: "Possible self-harm: a person should see it quickly.",
  },

  // ---------- chat that should be removed ----------
  {
    id: "chat-spam",
    kind: "chat",
    course: "CMSC351",
    text: "💰 Make $500/day from your dorm!! Crypto signals group, 100% guaranteed returns, join now at cryptoprofitz.xyz/join 💰",
    expect: "remove",
    accept: ["hold"],
    why: "A scam ad.",
  },

  // ---------- chat about a named person, with no word the rules flag ----------
  // Added with the always-on chat policy read (docs/MODERATION.md §9).
  {
    id: "chat-mocks-student-no-insult",
    kind: "chat",
    course: "CMSC131",
    text: "did anyone else hear Marcus Oyelaran ask the TA if Java and JavaScript are the same thing lmao, how is he a CS major",
    expect: "hold",
    why: "Mocks a named student without any flagged word.",
  },
  {
    id: "chat-thanks-student",
    kind: "chat",
    course: "MATH241",
    text: "shoutout to Aisha Karimi for the review session notes, they saved me on the quiz",
    expect: "publish",
    why: "Names a student kindly.",
  },

  // ---------- held out ----------
  // Written after the prompt and thresholds were tuned on the cases above,
  // and never tuned against, so a run shows how the setup does on text it
  // hasn't seen. Add new cases above; keep these as they are.
  {
    id: "heldout-review-ta-conduct",
    kind: "review",
    course: "CMSC250",
    text: "The professor was great, but the TA for my discussion section was condescending every week and made people feel stupid for asking questions.",
    expect: "publish",
    accept: ["hold"],
    why: "About a TA's conduct in class, without naming them.",
  },
  {
    id: "heldout-review-age",
    kind: "review",
    course: "GVPT170",
    text: "He is clearly too old to be teaching anymore. He forgets what he said five minutes earlier and mumbles through the whole lecture.",
    expect: "hold",
    why: "About age, not teaching.",
  },
  {
    id: "heldout-review-favorites",
    kind: "review",
    course: "BIOE120",
    text: "She plays favorites with the students in her research lab and gives them the exam questions ahead of time. Everyone else is on their own.",
    expect: "hold",
    why: "A misconduct claim stated as fact.",
  },
  {
    id: "heldout-review-youtube",
    kind: "review",
    course: "CMSC320",
    text: "Take this class, it's the best elective in the department! I review every CS course on my channel at youtube.com/@terpreviews if you want more.",
    expect: "hold",
    accept: ["remove"],
    why: "Self-promotion with an outside link.",
  },
  {
    id: "heldout-chat-segfault",
    kind: "chat",
    course: "CMSC216",
    text: "is anyone else getting a segfault on the last public test for project 3? no code please, just hints on where to look",
    activeAssignments: true,
    expect: "publish",
    why: "Asks for hints, explicitly not code.",
  },
  {
    id: "heldout-chat-send-code",
    kind: "chat",
    course: "CMSC131",
    text: "can someone just send me their lab 4 code, I'll change the variable names so it doesn't look copied",
    activeAssignments: true,
    expect: "hold",
    why: "Asks for code to copy while the lab is open.",
  },
  {
    id: "heldout-chat-collab",
    kind: "chat",
    course: "MATH246",
    text: "the TA said we can work on the worksheet together as long as we each write up our own answers, right?",
    activeAssignments: true,
    expect: "publish",
    why: "A question about the collaboration policy.",
  },
  {
    id: "heldout-chat-kill-exam",
    kind: "chat",
    course: "PHYS260",
    text: "we're going to kill this exam tomorrow, let's go 💪",
    expect: "publish",
    why: "Hyperbole.",
  },
  {
    id: "heldout-chat-textbook",
    kind: "chat",
    course: "CMSC351",
    text: "selling my used CLRS textbook for $30 if anyone in this class needs it, message me",
    expect: "publish",
    accept: ["hold"],
    why: "A classmate selling a course book. Borderline under 'no selling'.",
  },
  {
    id: "heldout-chat-lounge",
    kind: "chat",
    course: "CMSC330",
    text: "whoever keeps leaving their trash in the IRB lounge after office hours, please stop, it's gross",
    expect: "publish",
    why: "A complaint about unnamed people's behavior.",
  },
];
