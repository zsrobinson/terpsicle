// The rules as people read them: the "What's allowed" panel next to the
// review form and the chat composer, and the words for each reason a post
// can be held for. SPEC §3.13: plain words, active voice, specific.
import type { ModerationKind, ReasonCode } from "~/core/schema";
import { LENGTH_LIMITS } from "./limits";

export interface PolicySection {
  heading: string;
  items: readonly string[];
}

export interface ModerationPolicyText {
  title: string;
  intro: string;
  sections: readonly PolicySection[];
  /** What happens after you post. */
  process: string;
}

const REVIEW_NOT_ALLOWED = [
  "Answers, solutions or code for graded work that's still open. Ask how to approach a problem instead.",
  "Phone numbers, emails, addresses or ID numbers of anyone else.",
  "Slurs, threats, or attacks on anyone's identity, looks or background.",
  "Naming or mocking another student.",
  "Ads, selling, and links outside UMD that aren't about the class.",
] as const;

export const MODERATION_POLICY: Readonly<
  Record<ModerationKind, ModerationPolicyText>
> = {
  review: {
    title: "What's allowed",
    intro:
      "Reviews help students choose classes. Write about the teaching and the course, as you experienced it.",
    sections: [
      {
        heading: "Good reviews",
        items: [
          "Say how lectures, exams, projects and grading went for you.",
          "Be honest, including about what didn't work. Negative reviews are welcome.",
          "Share opinions as opinions: “the exams felt unfair” rather than claims you can't back up.",
          `Keep it between ${LENGTH_LIMITS.review.min} and ${LENGTH_LIMITS.review.max.toLocaleString("en-US")} characters.`,
        ],
      },
      {
        heading: "Not allowed",
        items: [
          ...REVIEW_NOT_ALLOWED,
          "Comments on an instructor's looks, age, accent or identity.",
          "Accusations of misconduct. Report those to UMD instead; we can't check them.",
          "Links of any kind other than umd.edu.",
        ],
      },
    ],
    process:
      "Most reviews publish right away after an automatic check. A few wait for a person to read them first; that usually takes a day or two. Reviews are anonymous to readers.",
  },
  // Chat is lighter than reviews (the owner, 2026-09-27): only real abuse
  // is stopped, and nothing here says a bot reads every message. Neutral,
  // not a lecture (2026-09-28): your name is on what you post, and that
  // says what needs saying about answers.
  chat: {
    title: "What's allowed",
    intro:
      "Class chats are for the people taking the course. Your name is on everything you post.",
    sections: [
      {
        heading: "Fine here",
        items: [
          "Questions about concepts, deadlines, office hours or anything you're stuck on.",
          "Your number, email or a room, to set up a study group.",
          "Links to notes, videos and anything else useful.",
          "Code, to ask about a bug. Venting about the class.",
        ],
      },
      {
        heading: "A bad idea",
        items: [
          "Answers to graded work. Your name is on them, and everyone in the course can read them.",
        ],
      },
      {
        heading: "Not allowed",
        items: [
          "Slurs, threats, harassment, or attacks on anyone's identity.",
          "Sexual content.",
          "Someone else's private details.",
          "Spam and scams, or one message posted across many courses.",
        ],
      },
    ],
    process:
      "Messages that break these are held or taken down. Report is in each message's menu (…), and a person reads every report.",
  },
};

/** One line for each reason, for the composer and the admin queue. */
export const REASON_WORDS: Readonly<Record<ReasonCode, string>> = {
  empty: "Write something first.",
  "too-short": "Write a little more about the course.",
  "too-long": "Shorten this to fit the limit.",
  link: "Links outside umd.edu",
  "cheating-site": "A link to an answer-sharing site",
  email: "An email address",
  phone: "A phone number",
  address: "A street address",
  uid: "What looks like a UID",
  "asks-for-answers": "Might be asking for answers to graded work",
  "shares-answers": "Might share answers to graded work",
  "code-paste": "Pasted code while assignments are open",
  slur: "A slur",
  "blocked-word": "A word that's often a slur",
  insult: "Might insult someone",
  violence: "Violence or a threat",
  crime: "Talk of a crime",
  "sex-crime": "Sexual crime",
  "child-safety": "Child safety",
  defamation: "Might be defamatory",
  "specialized-advice": "Medical, legal or financial advice",
  privacy: "Private information",
  "intellectual-property": "Copyrighted material",
  weapons: "Weapons",
  hate: "Hate speech",
  "self-harm": "Self-harm",
  sexual: "Sexual content",
  elections: "Election misinformation",
  "code-abuse": "Code meant to cause harm",
  unsafe: "Marked unsafe by the automatic check",
  "academic-integrity": "Academic integrity",
  "targets-person": "Targets a person",
  "personal-info": "Personal information",
  "misconduct-claim": "Accuses someone of misconduct",
  spam: "Spam or an ad",
  "off-topic": "Not about the course",
  "model-unavailable": "The automatic check didn't finish",
  "daily-cap": "The automatic check hit its daily limit",
  burst: "More new reviews of this instructor today than usual",
  reported: "Reported by readers",
  admin: "Decided by a moderator",
  undo: "A moderator's decision was undone",
  "author-stopped": "You stopped its author writing for a while",
};
