// PROTOTYPE review: the open questions. Each renders the app with one design field changed.
import { DEFAULT_SCHEDULE } from "../data";
import type { State } from "../store";
import type { Design } from "./design";

export type Option = { value: string; label: string; desc: string };
export type Question = {
  id: string;
  group: string;
  title: string;
  why: string;
  kind: "app" | "mobile" | "quick" | "text";
  field?: keyof Design;
  options: Option[];
  rec?: string;
  recWhy?: string;
  tryThis?: string;
  initial?: Partial<State>;
  initialFor?: Record<string, Partial<State>>;
  extra?: Partial<Design>;
};

const course = (code: string): Partial<State> => ({ detail: { kind: "course", code } });
const LEG = "CMSC330-0101:0:0>ENGL393-0101:0:0";
const planA = (extra: string[] = []) => ({ id: "a", name: "Plan A", sections: [...DEFAULT_SCHEDULE.sections, ...extra], blocks: DEFAULT_SCHEDULE.blocks });
const planB = { id: "b", name: "Plan B", sections: ["CMSC351-0301", "CMSC330-0201", "STAT400-0101", "ENGL393-0404", "ECON200-0101"], blocks: DEFAULT_SCHEDULE.blocks };

export const QUESTIONS: Question[] = [
  // ---------------- Plans & navigation ----------------
  {
    id: "planNav", group: "Plans & navigation", kind: "app", field: "planNav",
    title: "Where do plans live?",
    why: "Plans are the top-level thing you switch between. Most people keep 2–4, but some will make many while they experiment.",
    options: [
      { value: "tabs", label: "Tabs in the top bar", desc: "Every plan visible; one click to switch. Gets crowded past ~5." },
      { value: "dropdown", label: "One dropdown", desc: "Shows the current plan; switch and manage from one menu. Scales to many plans." },
      { value: "panel", label: "In the first sidebar tab", desc: "Top bar just names the plan; the list lives above your courses." },
    ],
    rec: "tabs", recWhy: "Plans are Terpsicle's core idea, so keep them visible. Tabs can fall back to a dropdown once there are more than 5.",
    tryThis: "Switch plans, open the menu next to the active plan, double-click to rename.",
  },
  {
    id: "newPlan", group: "Plans & navigation", kind: "app", field: "newPlan",
    title: "What does “+ new plan” create?",
    why: "The most common reason to make a new plan is “what if I swap one class?”, which is a copy, not a blank slate.",
    options: [
      { value: "empty", label: "Empty plan", desc: "Clean start every time." },
      { value: "copy", label: "Copy of the current plan", desc: "Fast for “what if” plans; delete what you don't want." },
      { value: "ask", label: "Ask: empty or copy", desc: "A tiny menu with both." },
    ],
    rec: "ask", recWhy: "It costs one extra click and covers both intents without guessing.",
    tryThis: "Click + next to the plan tabs.",
  },
  {
    id: "compare", group: "Plans & navigation", kind: "app", field: "compare", extra: { _startCompare: true },
    title: "Comparing two plans",
    why: "Deciding between Plan A and Plan B is a real moment, especially on registration day.",
    options: [
      { value: "none", label: "No compare", desc: "Flip between plan tabs." },
      { value: "overlay", label: "Overlay on the calendar", desc: "The other plan's differing classes appear as gray outlines on this one." },
      { value: "split", label: "Side by side", desc: "Two mini weeks plus a list of what's different." },
    ],
    rec: "overlay", recWhy: "It stays in the calendar you already understand and shows only what's different.",
    tryThis: "It opens already comparing Plan A with Plan B. Also try Plan options → Compare with…",
  },
  {
    id: "firstTab", group: "Plans & navigation", kind: "app", field: "firstTab",
    title: "Name of the first sidebar tab",
    why: "Right now it's “Plan”, which clashes with Plan A / Plan B in the top bar. It lists the courses in the current plan plus saved courses.",
    options: [
      { value: "Plan", label: "Plan", desc: "Matches the concept, but overloaded." },
      { value: "Courses", label: "Courses", desc: "Says exactly what's in the list." },
      { value: "Overview", label: "Overview", desc: "Broader; implies a summary." },
    ],
    rec: "Courses", recWhy: "It says what's in the list, and “plan” keeps a single meaning.",
  },
  {
    id: "rail", group: "Plans & navigation", kind: "app", field: "rail",
    title: "How the sidebar tabs look",
    why: "Round 2 used icons with labels. Occasional users need labels, but they take space.",
    options: [
      { value: "labeled", label: "Icon + label rail", desc: "What you've seen so far." },
      { value: "top", label: "Text tabs across the top of the sidebar", desc: "No rail at all; more room for the calendar." },
      { value: "icons", label: "Icons only", desc: "Most compact; labels only in tooltips." },
    ],
    rec: "labeled", recWhy: "People visit a few times a semester, so labels beat saving 10 pixels.",
  },
  {
    id: "drillHeader", group: "Plans & navigation", kind: "app", field: "drillHeader", initial: course("CMSC351"),
    title: "Header when you drill into a course",
    why: "Drill-in replaces the list with details. The header is how you get back, and could also move between courses.",
    options: [
      { value: "back", label: "Back button", desc: "“← Plan”. Simple." },
      { value: "breadcrumb", label: "Breadcrumb", desc: "“Plan › CMSC351”. Shows where you are." },
      { value: "backNav", label: "Back + next/previous course", desc: "Flip through the courses in your plan without going back." },
    ],
    rec: "backNav", recWhy: "Reviewing each course in turn is common before registration, and the arrows make it one click each.",
    tryThis: "Use the ‹ › arrows at the top right of the sidebar.",
  },
  {
    id: "collapsible", group: "Plans & navigation", kind: "app", field: "collapsible",
    title: "Can you hide the sidebar?",
    why: "Sometimes you just want to look at your week, bigger.",
    options: [
      { value: "false", label: "Always open", desc: "Simpler; nothing to lose." },
      { value: "true", label: "Collapsible", desc: "A button at the bottom of the rail, or the [ key." },
    ],
    rec: "true", recWhy: "It's cheap and helps on laptops, and it's the same control as Linear's sidebar.",
    tryThis: "Use the button at the bottom of the rail, or press [.",
  },

  // ---------------- Calendar ----------------
  {
    id: "blockContent", group: "Calendar", kind: "app", field: "blockContent",
    title: "What each class block shows",
    why: "More text makes blocks scannable on their own; less keeps the week calm.",
    options: [
      { value: "compact", label: "Code only", desc: "CMSC351. Details on hover and click." },
      { value: "standard", label: "Code, time, room", desc: "What you've seen so far." },
      { value: "detailed", label: "Plus title and instructor", desc: "Everything, when there's room." },
    ],
    rec: "standard", recWhy: "Time and room are what you check in the moment; the title is already obvious to you.",
  },
  {
    id: "colors", group: "Calendar", kind: "app", field: "colors",
    title: "Course colors",
    why: "Color is how you find a course on the calendar at a glance.",
    options: [
      { value: "pastel", label: "Soft tints", desc: "Light fill, darker text. Current." },
      { value: "solid", label: "Solid", desc: "Bold fills with white text. Louder, very scannable." },
      { value: "mono", label: "Neutral with a dot", desc: "Calm and Linear-like; color only on a small dot." },
    ],
    rec: "pastel", recWhy: "It's easy to scan without shouting, and red/amber problem colors still stand out on top.",
  },
  {
    id: "ghosts", group: "Calendar", kind: "app", field: "ghosts", initial: course("CMSC351"),
    title: "How other sections appear when you open a course",
    why: "This is the feature you liked most. The question is how loud the alternatives should be.",
    options: [
      { value: "dashed", label: "Dashed outlines", desc: "Every section at once, clearly “not yours yet”. Current." },
      { value: "faded", label: "Faded blocks with a label", desc: "Softer; reads more like real classes." },
      { value: "hoverOnly", label: "Only on hover (Jupiterp-style)", desc: "Calendar stays clean; hover each row to preview." },
    ],
    rec: "dashed", recWhy: "Seeing every option at once is the point, and dashed borders make clear they aren't yours yet.",
    tryThis: "Hover sections in the sidebar, use ↑↓, click a ghost to switch.",
  },
  {
    id: "pills", group: "Calendar", kind: "app", field: "pills",
    title: "Travel time on the calendar",
    why: "Showing travel between every pair of classes is thorough, but it's noise when there's plenty of time.",
    options: [
      { value: "all", label: "Every connection", desc: "Small gray pill when fine, amber/red when not." },
      { value: "problems", label: "Only tight or short ones", desc: "Silence means you're fine." },
      { value: "edge", label: "A thin bar on the side", desc: "A colored line spans the gap, with minutes." },
    ],
    rec: "problems", recWhy: "Anyone who wants every number can open the Travel tab. The calendar should flag problems.",
  },
  {
    id: "timeRange", group: "Calendar", kind: "app", field: "timeRange",
    title: "Hours shown",
    why: "Fitting the hours to your classes keeps blocks big; a fixed range keeps positions stable as you add classes.",
    options: [
      { value: "fit", label: "Fit to your classes", desc: "8am–5pm here; grows if needed." },
      { value: "fixed", label: "Always 7am–10pm", desc: "Stable, but scrolls and shrinks blocks." },
    ],
    rec: "fit", recWhy: "Fitting keeps blocks readable. It only expands for ghosts, so switching sections doesn't jump around much.",
  },
  {
    id: "overlap", group: "Calendar", kind: "app", field: "overlap", initial: { plans: [planA(["PHIL140-0101"]), planB] },
    title: "How overlapping classes look",
    why: "Overlaps are the most serious problem. PHIL140 was added here and overlaps the Wednesday CMSC351 discussion.",
    options: [
      { value: "columns", label: "Side by side, outlined red", desc: "Both fully readable." },
      { value: "stacked", label: "Stacked with a hatched overlap", desc: "Shows exactly which minutes collide." },
    ],
    rec: "columns", recWhy: "Both stay readable, and the red ring plus the Problems entry already say which minutes collide.",
    tryThis: "Look at Monday and Wednesday morning.",
  },
  {
    id: "finals", group: "Calendar", kind: "app", field: "finals", extra: { _startFinals: true },
    title: "Where final exams show up",
    why: "Finals are known early for common exams. A clash (like CMSC351 and STAT400 here) is worth seeing.",
    options: [
      { value: "toggle", label: "A Finals view on the calendar", desc: "A small “Finals” switch above the time column." },
      { value: "about", label: "Only in Problems and course details", desc: "No extra view." },
    ],
    rec: "toggle", recWhy: "Finals week is a different week, and seeing it as a calendar makes clashes and 3-in-a-day obvious.",
    tryThis: "Toggle between Finals and classes with the button at the top left of the calendar.",
  },

  // ---------------- Course details ----------------
  {
    id: "sectionLayout", group: "Course details", kind: "app", field: "sectionLayout", initial: course("CMSC131"),
    title: "How a course's sections are listed",
    why: "Big intro courses have many sections and a few instructors. Many students pick the instructor first, then the time.",
    options: [
      { value: "rows", label: "One row per section", desc: "Current." },
      { value: "byInstructor", label: "Grouped by instructor", desc: "Instructor, rating and GPA once, then their sections." },
      { value: "table", label: "Compact table", desc: "Denser; fit shown as a colored dot." },
    ],
    rec: "byInstructor", recWhy: "It matches how people choose, removes repeated names, and works fine for single-instructor courses.",
  },
  {
    id: "fitMode", group: "Course details", kind: "app", field: "fitMode", initial: course("CMSC131"),
    title: "Sections that don't fit",
    why: "Every section says whether it fits. The question is whether non-fitting ones should step aside.",
    options: [
      { value: "words", label: "Label only", desc: "Original order, each with its fit label." },
      { value: "sorted", label: "Fitting first", desc: "Sections that don't fit move below a divider." },
      { value: "filter", label: "Hide what doesn't fit", desc: "With a “show N more” link." },
    ],
    rec: "sorted", recWhy: "It puts useful options first without hiding anything. You might still switch into a clash and move the other class.",
  },
  {
    id: "instructors", group: "Course details", kind: "app", field: "instructors", initial: course("CMSC131"),
    title: "Instructor information",
    why: "Instructor quality drives many choices. It should be easy to compare, not buried.",
    options: [
      { value: "cards", label: "Cards in an Instructors tab", desc: "Rating, summary and tags per instructor. Current." },
      { value: "inline", label: "Expand under each section", desc: "Click the instructor's name in a row." },
      { value: "compare", label: "Comparison table", desc: "Rating, average GPA and % A/B in this course; click for the summary." },
    ],
    rec: "compare", recWhy: "Choosing between instructors is a comparison, and this shows it in four columns.",
    tryThis: "Instructors tab below the sections.",
  },
  {
    id: "grades", group: "Course details", kind: "app", field: "grades", initial: { ...course("CMSC351") },
    title: "Grade distribution",
    why: "Keep it clear. The sentence carries the meaning; the chart is supporting detail.",
    options: [
      { value: "bars", label: "Sentence + five bars", desc: "Current." },
      { value: "stacked", label: "Sentence + one stacked bar", desc: "More compact." },
      { value: "sentence", label: "Sentence + per-instructor lines", desc: "No chart at all." },
    ],
    rec: "sentence", recWhy: "The per-instructor numbers are the actionable part, and the sentence already describes the course.",
    tryThis: "Open the Grades tab under the sections.",
  },
  {
    id: "seats", group: "Course details", kind: "app", field: "seats", initial: course("CMSC131"),
    title: "Seats",
    why: "Seats matter a lot near registration and little otherwise.",
    options: [
      { value: "text", label: "Words", desc: "“12 of 36 open”, “2 left”, “Full · 9 waitlisted”." },
      { value: "meter", label: "Words + a small fill bar", desc: "Glanceable fullness." },
      { value: "lowOnly", label: "Only when low or full", desc: "Quiet until it matters." },
    ],
    rec: "text", recWhy: "Words are unambiguous, and a bar adds little over “2 left”.",
  },

  // ---------------- Search ----------------
  {
    id: "searchResults", group: "Search", kind: "app", field: "searchResults", initial: { tab: "search" },
    title: "Search results",
    why: "Search can open the course (drill in) or let you peek at sections right in the list.",
    options: [
      { value: "courses", label: "Courses; click to open", desc: "Current. Says how many sections fit." },
      { value: "expand", label: "Courses that expand to sections", desc: "Chevron shows sections inline with fit and Add." },
      { value: "sections", label: "Every section listed", desc: "Grouped under course headers." },
    ],
    rec: "courses", recWhy: "It keeps one path to sections (open the course), which is the consistency round 1 lacked.",
  },
  {
    id: "filters", group: "Search", kind: "app", field: "filters", initial: { tab: "search" },
    title: "Search filters",
    why: "Gen-eds matter to everyone. “Fits my plan” and “has open seats” are the next most useful filters.",
    options: [
      { value: "chips", label: "Gen-ed buttons only", desc: "Current." },
      { value: "popover", label: "A Filters button", desc: "Gen-eds, fit, open seats, credits in one popover." },
      { value: "inline", label: "Gen-eds + two toggles", desc: "“Fits my plan” and “Has open seats” always visible." },
    ],
    rec: "inline", recWhy: "Both toggles are one click away with no hidden state. Credits can wait for the popover version.",
  },
  {
    id: "searchHover", group: "Search", kind: "app", field: "searchHover", initial: { tab: "search" },
    title: "Hovering a search result",
    why: "Seeing where a course could go before opening it could speed up browsing, or be distracting.",
    options: [
      { value: "off", label: "Nothing on hover", desc: "Click to see sections on the calendar." },
      { value: "on", label: "Ghost its sections", desc: "Hover a result to see all its sections on the calendar." },
    ],
    rec: "on", recWhy: "It's the same show-every-section idea, one step earlier, and great for gen-ed hunting.",
    tryThis: "Move the mouse down the search results.",
  },

  // ---------------- Problems ----------------
  {
    id: "problems", group: "Problems", kind: "app", field: "problems",
    title: "Where problems live",
    why: "Problems are the app's safety net. They need a home without being a separate place people forget to check.",
    options: [
      { value: "tab", label: "Problems tab + count in top bar", desc: "Current." },
      { value: "banner", label: "Tab + banner in the course list", desc: "A red summary where you already look." },
      { value: "inline", label: "No tab; listed above your courses", desc: "One less tab; problems sit with the plan." },
    ],
    rec: "banner", recWhy: "It keeps the complete list in one home, and the banner puts the summary where you already look.",
  },
  {
    id: "problemGroup", group: "Problems", kind: "app", field: "problemGroup", initial: { tab: "problems" },
    title: "Ordering problems",
    why: "With a messy plan there can be many problems.",
    options: [
      { value: "severity", label: "Most serious first", desc: "Current." },
      { value: "course", label: "By course", desc: "Everything about CMSC330 together." },
      { value: "day", label: "By day", desc: "Monday's issues, Tuesday's issues…" },
    ],
    rec: "severity", recWhy: "Fixing the worst first is the right habit, and each item already names its course and days.",
  },

  // ---------------- Travel ----------------
  {
    id: "travelSettings", group: "Travel", kind: "app", field: "travelSettings", initial: { tab: "travel" },
    title: "Where travel settings live",
    why: "Pace, step-free routes and extra time are set once and rarely changed.",
    options: [
      { value: "tab", label: "In the Travel tab", desc: "Current." },
      { value: "header", label: "A control above the calendar", desc: "“Travel: Typical pace ▾”. Always shows your setting." },
    ],
    rec: "tab", recWhy: "It's set once. The Travel tab explains it, and every connection links there.",
  },
  {
    id: "explain", group: "Travel", kind: "app", field: "explain", initial: { tab: "travel" },
    title: "How much we explain the estimates",
    why: "You asked for transparency. The question is how much to show by default.",
    options: [
      { value: "full", label: "Always shown", desc: "“How we estimate” box with the math. Current." },
      { value: "disclosure", label: "One line + “How?”", desc: "Details on demand." },
      { value: "tooltip", label: "Only in tooltips", desc: "Hover a connection for the math." },
    ],
    rec: "disclosure", recWhy: "It's honest without a wall of text. The per-connection math stays in connection details.",
  },
  {
    id: "legViz", group: "Travel", kind: "app", field: "legViz", initial: { tab: "travel", detail: { kind: "leg", key: LEG } },
    title: "Connection details",
    why: "When a connection is tight, the question is “do I have enough time?”",
    options: [
      { value: "numbers", label: "Numbers", desc: "Leave, arrive, distance, estimate. Current." },
      { value: "bars", label: "Two bars: time you have vs time you need", desc: "The answer at a glance." },
      { value: "map", label: "A small map of the walk", desc: "Where the two buildings are." },
    ],
    rec: "bars", recWhy: "The bars answer the question directly; the numbers stay underneath.",
  },

  // ---------------- Blocks ----------------
  {
    id: "blockCreate", group: "Blocks", kind: "app", field: "blockCreate", initial: { tab: "blocks" },
    title: "Adding a block of time",
    why: "Work, lunch, practice, commute. Blocks keep the generator and travel time honest.",
    options: [
      { value: "drag", label: "Drag on the calendar", desc: "Direct; label it in a small popup." },
      { value: "form", label: "A form in the Blocks tab", desc: "Days, times, place. Precise." },
      { value: "both", label: "Both", desc: "Drag for speed, form for repeating blocks and places." },
    ],
    rec: "both", recWhy: "Dragging is the fast path, and the form handles repeat days and a place.",
    tryThis: "Drag on an empty part of the calendar (Tuesday morning is free).",
  },

  // ---------------- Generate ----------------
  {
    id: "generate", group: "Generate", kind: "app", field: "generate", initialFor: { tab: { tab: "generate" as never }, fromProblems: { tab: "problems" }, none: { tab: "problems" } },
    title: "Automatic schedule suggestions",
    why: "The generator is planned but hasn't been in a prototype since round 1. Where it lives changes how central it feels.",
    options: [
      { value: "tab", label: "A Generate tab", desc: "Pick required/optional courses and must-haves; browse ranked plans." },
      { value: "fromProblems", label: "Only from Problems", desc: "“Suggest better plans” when you're stuck." },
      { value: "none", label: "Leave it out of v1", desc: "Manual building only." },
    ],
    rec: "tab", recWhy: "It's a real feature for people with lots of options, but it works on your plan instead of replacing it.",
    tryThis: "Open Generate (or Suggest better plans), click a result, then save it as a new plan.",
  },

  // ---------------- Registration & seats ----------------
  {
    id: "freshness", group: "Registration & seats", kind: "app", field: "freshness", initial: course("CMSC131"),
    title: "Showing how fresh seat counts are",
    why: "During registration, “is this number current?” matters. The rest of the time it's clutter.",
    options: [
      { value: "topbar", label: "In the top bar", desc: "“Seats as of 2 min ago” with a live dot." },
      { value: "details", label: "Only above section lists", desc: "Where you read seats." },
      { value: "none", label: "Nowhere", desc: "Trust the number." },
    ],
    rec: "details", recWhy: "It sits next to the numbers it describes. The top bar version could appear only during registration.",
  },
  {
    id: "alerts", group: "Registration & seats", kind: "app", field: "alerts", initial: course("CMSC131"),
    title: "Seat alerts without an account",
    why: "“Tell me when a seat opens” is the one feature that needs something like auth. Keep it as light as possible.",
    options: [
      { value: "email", label: "Email link", desc: "Enter an email, click one confirmation link. Works everywhere." },
      { value: "push", label: "Browser notification", desc: "No email; only works while notifications are allowed." },
      { value: "either", label: "Either", desc: "Offer both." },
    ],
    rec: "email", recWhy: "It's reliable across devices and needs no install. Push on iPhone requires adding the site to the home screen.",
    tryThis: "Click the bell on section 0101 (full) or 0301 (2 left).",
  },
  {
    id: "regHelper", group: "Registration & seats", kind: "app", field: "regHelper", initial: { tab: "export" },
    title: "Help on registration day",
    why: "At registration time you want codes in the right order and a backup ready.",
    options: [
      { value: "codes", label: "List of codes", desc: "Copy and paste. Current." },
      { value: "checklist", label: "Registration checklist", desc: "Register the sections most likely to fill first; a backup section for each." },
    ],
    rec: "checklist", recWhy: "It's the registration-day plan B from the original plan, built from data we already have.",
  },

  // ---------------- Sharing ----------------
  {
    id: "shared", group: "Sharing", kind: "app", field: "shared", extra: { _sharedMode: true },
    title: "Opening a friend's shared link",
    why: "Links carry the plan in the URL. What should happen when you open one?",
    options: [
      { value: "readonly", label: "View it, then choose", desc: "Read-only, with “Save a copy” and “Overlay on my plan”." },
      { value: "newPlan", label: "Add it to your plans", desc: "Becomes “Alex's plan” next to yours." },
      { value: "overlay", label: "Overlay on your plan", desc: "Their classes as outlines, with time you're both free." },
    ],
    rec: "readonly", recWhy: "It never changes your data without asking, and both other behaviors are one click away.",
  },

  // ---------------- Look & feel ----------------
  {
    id: "accent", group: "Look & feel", kind: "app", field: "accent", initial: course("CMSC351"),
    title: "Primary accent color",
    why: "Used for primary buttons, selection and “current”. Problems already use red.",
    options: [
      { value: "red", label: "UMD red", desc: "On brand; competes with error red." },
      { value: "black", label: "Black / white", desc: "Vercel-style neutral; red stays for the logo and errors." },
      { value: "blue", label: "Blue", desc: "Conventional and calm." },
    ],
    rec: "black", recWhy: "It avoids confusing “selected” with “error”, it's the Vercel/Linear look you like, and the logo still carries UMD red.",
  },
  {
    id: "density", group: "Look & feel", kind: "app", field: "density", initial: course("CMSC351"),
    title: "Density",
    why: "Dense UIs feel pro; people who visit twice a semester may prefer more air.",
    options: [
      { value: "compact", label: "Compact", desc: "Current (13px base)." },
      { value: "comfortable", label: "Comfortable", desc: "About 10% larger everything." },
    ],
    rec: "comfortable", recWhy: "It's easier to read for occasional use, and laptops still fit the week.",
  },
  {
    id: "firstRun", group: "Look & feel", kind: "app", field: "firstRun", initial: { plans: [{ id: "a", name: "Plan A", sections: [], blocks: [] }], shortlist: [] },
    title: "Your very first visit",
    why: "An empty app is the worst first impression. What should a new student see?",
    options: [
      { value: "guide", label: "Short guide + search button", desc: "Four steps, one primary action." },
      { value: "search", label: "Straight into search", desc: "Search tab open with popular courses." },
      { value: "sample", label: "An example plan to explore", desc: "Everything filled in; start your own when ready." },
    ],
    rec: "guide", recWhy: "It teaches the one unusual idea (sections appear on the calendar) in four lines, and leads straight into search.",
  },
  {
    id: "mobile", group: "Look & feel", kind: "mobile", options: [
      { value: "today", label: "Today", desc: "Next class, when to leave, today's list." },
      { value: "week", label: "Tiny week grid", desc: "The desktop calendar, shrunk." },
      { value: "list", label: "Agenda list", desc: "Each day's classes in order." },
    ],
    title: "What the phone version opens to",
    why: "Phones are for checking your schedule and seat alerts, not building one.",
    rec: "today", recWhy: "“Where do I go next, and when do I leave?” is the question on a phone.",
  },

  // ---------------- Quick calls ----------------
  {
    id: "quick", group: "Quick calls", kind: "quick", title: "Quick calls",
    why: "Smaller decisions I'd otherwise make silently. Checked means yes. They start checked where I recommend yes.",
    options: [
      { value: "saturday", label: "Show a Saturday column only when a plan has a Saturday class", desc: "" },
      { value: "fullShown", label: "Show full sections (labeled Full) rather than hiding them", desc: "" },
      { value: "restricted", label: "Show restricted sections, with the restriction spelled out", desc: "" },
      { value: "creditWarn", label: "Warn when credits go over the registration limit", desc: "" },
      { value: "remember", label: "Remember the open tab and course between visits", desc: "" },
      { value: "stableColors", label: "Keep a course's color the same in every plan", desc: "" },
      { value: "undo", label: "Use Undo instead of “are you sure?” dialogs everywhere", desc: "" },
      { value: "hideCourse", label: "Let people hide a course from search (“not interested”)", desc: "" },
      { value: "tba", label: "Show sections with instructor TBA", desc: "" },
      { value: "exportPng", label: "Keep “Save as image” in Export", desc: "" },
    ],
    rec: "saturday,fullShown,restricted,creditWarn,remember,stableColors,undo,tba,exportPng",
  },
  {
    id: "anything", group: "Quick calls", kind: "text", title: "Anything else?", options: [],
    why: "Anything this review missed: features to add or cut, naming, priorities for the first release.",
  },
];

export const GROUPS = [...new Set(QUESTIONS.map((q) => q.group))];
