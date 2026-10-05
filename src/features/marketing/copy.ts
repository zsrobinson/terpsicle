import type { MarketingProduct } from "./products";

// The page's words (docs/DESIGN.md §8, "The marketing page"): the Guide's
// copy from the round-4 prototypes, the owner's pick, checked against what
// each product does today. SPEC §3.13: plain words, active voice,
// contractions, the glossary's terms.

export const HERO = {
  title: "Plan the semester in five steps, in one place.",
  lead: "The scheduler is the first step, and it works with no account. Reviews, Chat, Plan and Todo pick up from there, and each one already knows your courses.",
  /** Under the buttons, signed out. */
  note: "Free. Sign in with UMD later for the rest.",
  /** Under the button, signed in: never ask someone to sign in again. */
  noteSignedIn: "You're signed in, so your plans sync to your account.",
};

export interface Step {
  title: string;
  /** What it does for a UMD student, in one sentence. */
  one: string;
  facts: readonly string[];
  /** What to try on the screen beside it. */
  tryIt: string;
}

export const STEPS: Record<MarketingProduct, Step> = {
  schedule: {
    title: "Build the week, and let it check itself.",
    one: "Build your week from every section on Testudo, and see what breaks before registration opens.",
    facts: [
      "Overlaps and tight walks between buildings show up as you add sections. They're listed under Problems, with a one-click fix when there is one.",
      "A full section stays in the plan. Watch it for a seat and we'll tell you when one opens.",
      "Generate builds every plan that fits from the courses you need, must-haves included. It's an algorithm, not a guess.",
    ],
    tryIt:
      "Try it: switch a section to fix a problem, or watch the full one for a seat.",
  },
  reviews: {
    title: "Pick sections by who's teaching them.",
    one: "Read what UMD students said about a course and whoever's teaching it, next to the grades they got.",
    facts: [
      "One rating that counts Terpsicle's reviews and PlanetTerp's, with the math on hover.",
      "Grade distributions by instructor, plus, minus and W included, from PlanetTerp.",
      "Reviews are anonymous to readers, moderators and the admin, and written from verified UMD accounts.",
    ],
    tryIt: "Try it: hover the 4.4 to see where it comes from.",
  },
  chat: {
    title: "Talk to the people in your section.",
    one: "Every course and every section already has a room. Add the section to your plan and you're in.",
    facts: [
      "A room for everyone in the course, one for each professor's sections, and one per section.",
      "Your UMD name, no invite link, and every message is checked before classmates see it.",
      "Find out where discussion moved before you walk to the wrong building.",
    ],
    tryIt: "Try it: send a message. It stays on this page.",
  },
  plan: {
    title: "See the four years around this one.",
    one: "Lay out every semester to graduation and watch the credits and GenEds add up.",
    facts: [
      "Paste your unofficial transcript and the semesters you've done fill in. The paste never leaves your browser.",
      "Leave a CMSC4XX placeholder where you haven't decided. It counts 3 credits until you pick.",
      "Prerequisites are checked against Testudo's own words. They inform; your degree audit decides.",
    ],
    tryIt:
      "“View schedule” at the foot of the column hands the semester to the scheduler. That's the week beside it.",
  },
  todo: {
    title: "Keep every due date on one calendar.",
    one: "Every due date on ELMS, on a week or a month, with your own tasks beside them.",
    facts: [
      "Paste your ELMS calendar link once. It's kept encrypted, and we never ask for your password.",
      "Add a task the way you'd say it: “PS3 due fri 11:59pm”.",
      "One notification, the evening before something's due, if you turn it on.",
    ],
    tryIt: "Try it: check something off, then undo.",
  },
};

/**
 * Reviews while our pages are off (docs/decisions.md, "Reviews link out to
 * PlanetTerp"): the ratings and reviews are PlanetTerp's, shown where you
 * pick a section, and writing one happens there.
 */
export const REVIEWS_OUTSIDE: Step = {
  title: "Pick sections by who's teaching them.",
  one: "See what UMD students said on PlanetTerp about whoever's teaching a section, right where you pick it.",
  facts: [
    "Each instructor's PlanetTerp rating sits beside their name in the section list.",
    "A preview opens their newest reviews and their grades in the course, without leaving your plan.",
    "Grade distributions by instructor, plus, minus and W included, from PlanetTerp.",
  ],
  tryIt: "Try it: hover the 4.4 to see where it comes from.",
};

/** The Schedule-to-Reviews hand-off while Reviews is PlanetTerp's. */
export const REVIEWS_OUTSIDE_LINK =
  "Every instructor's PlanetTerp rating sits right in the section list, with their newest reviews a click away.";

/** How the products hand off to each other: two products and one sentence. */
export const CONNECT = {
  title: "They're one product, not five tabs.",
  body: "Each one reads the same plan, so nothing gets entered twice.",
  links: [
    {
      from: "plan",
      to: "schedule",
      text: "Plan hands next semester's column to the scheduler with “View schedule”.",
    },
    {
      from: "schedule",
      to: "reviews",
      text: "Every course on the week links to its reviews, and every instructor's rating sits right in the section list.",
    },
    {
      from: "schedule",
      to: "chat",
      text: "Add a section and its room is yours. “Join CMSC351 chat” is one button in course details.",
    },
    {
      from: "schedule",
      to: "todo",
      text: "Type “for cmsc351” in a task and Todo files it under the course, because your plans already have it.",
    },
  ],
} as const satisfies {
  title: string;
  body: string;
  links: readonly {
    from: MarketingProduct;
    to: MarketingProduct;
    text: string;
  }[];
};

export const CLOSING = {
  title: "Step one is free and takes a minute.",
  body: "The scheduler and Plan work without an account. Sign in with UMD when you want sync, Chat, seat watches and Todo.",
  bodySignedIn:
    "You're signed in: your plans sync, and Chat, seat watches and Todo are on.",
};

/** Under the product screen: it's a sample, and nothing leaves the page. */
export const SCREEN_CAPTION =
  "A sample: Plan A for Spring 2027, as the scheduler shows it. Nothing here is saved or sent.";
