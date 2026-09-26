# UX review and redesign plan (September 2026)

The owner, after using the live app: *"there's a lot of solid stuff there, but i'm not sure it's always laid out in the best way it could … this was really sparked by it being a bit confusing and cramped on the page for a course with the sections list and then the tabs at the bottom."* Later: *"my socy4xx classes all are just one section, but the intro CS and math courses have like a billion sections. our UI should be great in both scenarios."*

## What changed (WP0–WP7, all shipped)

Each pair is the live app before the review (left) and after it (right), on real Spring 2027 data at 1440×900 unless noted. The images are in `docs/ux-review/after/`.

| | Before | After | What changed |
|---|---|---|---|
| **Many sections** (ENGL101, 92) | ![](ux-review/after/01-details-many-engl101-before.jpg) | ![](ux-review/after/01-details-many-engl101-after.jpg) | One page, no tabs under 92 rows. Sections grouped by meeting time, matching the calendar's merged ghosts. One-line rows show the room. "Only fits" and "Grades ↓" sit in the sticky Sections header. |
| **Lecture + discussion** (CMSC330, 14) | ![](ux-review/after/02-details-few-cmsc330-before.jpg) | ![](ux-review/after/02-details-few-cmsc330-after.jpg) | Prerequisite and restriction under the title. The shared lecture is said once ("All meet TuTh 9:30–10:45am"), so each row shows its own Friday discussion untruncated. Rating and GPA are in the instructor header, with Reviews one click away. |
| **A few** (CMSC351, 4) | ![](ux-review/after/03-details-few-cmsc351-before.jpg) | ![](ux-review/after/03-details-few-cmsc351-after.jpg) | The same structure at a small size: no filter, and no chrome that isn't earning its place. |
| **One section** (SOCY411) | ![](ux-review/after/04-details-one-socy411-before.jpg) | ![](ux-review/after/04-details-one-socy411-after.jpg) | Reads as "this is the class": meets, taught by, fit, seats. No group of one, no second "Add" button, no tabs. |
| **Intro course** (MATH140, 12) | ![](ux-review/after/05-details-intro-math140-before.jpg) | ![](ux-review/after/05-details-intro-math140-after.jpg) | Each instructor's lecture is said once. Discussion times and rooms fit whole at the default 360px width. |
| **Search hover** | ![](ux-review/after/06-search-hover-before.jpg) | ![](ux-review/after/06-search-hover-after.jpg) | The hint row is there as soon as Search opens ("Hover a result to see its sections here"), so hovering never moves the grid and the day names stay. A 1-section result shows when it meets. The result count is always shown. |
| **Courses** | ![](ux-review/after/07-courses-before.jpg) | ![](ux-review/after/07-courses-after.jpg) | Hairline rows. Problems in words ("Tight connection to ECON200") instead of a bare ⚠. The top bar and Problems say "2 problems · 1 note". |
| **Travel** | ![](ux-review/after/08-travel-before.jpg) | ![](ux-review/after/08-travel-after.jpg) | Connections first. Settings fold into one summary line. Identical connections merge across days. Long breaks are listed apart and get no pill on the calendar. |
| **Generate** | ![](ux-review/after/09-generate-results-before.jpg) | ![](ux-review/after/09-generate-results-after.jpg) | The request stays summarized above the results ("4 courses · compact days · Edit"). Primary actions sit in the panel footer. Rows are hairline, not cards. |
| **Phone** (390×844) | ![](ux-review/after/10-phone-details-many-before.jpg) | ![](ux-review/after/10-phone-details-many-after.jpg) | Course details keep the calendar above them (the drawer drops to half). The same one-page structure, with the hint over the day names gone. |
| **Dark** (CMSC330) | ![](ux-review/after/11-details-few-cmsc330-dark-before.jpg) | ![](ux-review/after/11-details-few-cmsc330-dark-after.jpg) | Both themes from the same tokens. |

**App-wide:**
- **One design system, enforced by a test.** Six type sizes (`text-2xs`…`text-xl`), a 4px spacing rhythm, and color tokens only. `src/app/design-tokens.test.ts` fails on anything else.
- **One panel anatomy:** `SectionHeader`, `GroupHeader`, `ListRow`, `EmptyState` and `PanelFooter` in `src/app/panel.tsx`, with one row-action button size (`size="row"`).
- **A draggable sidebar** from 320 to 480px, with keyboard control, double-click to reset, and the width remembered.
- **A rail whose selected tab can't be mistaken for a hovered one.**

---

This is the research-backed audit and the plan. The principles it cites are in `UX-PRINCIPLES.md` (numbered P1–P8 below, matching its sections). `DESIGN.md` still wins wherever they disagree.

**How to read it:**
- §1 is the short list: what's **decided** (build it now) and the three **owner decisions** (forks with screenshots).
- §2 is the app-wide system: type, spacing, panel anatomy, rows, color, mono, sticky and dividers.
- §3 covers course details in depth: problems, three alternatives, and the recommended spec at 1, a few, and many sections.
- §4 goes screen by screen, in priority order.
- §5 is the work packages, with file ownership and dependencies.
- §6 lists the evidence: screenshots and the prototype.

---

## 1. Summary

### 1.1 Decided (implement now)

These follow directly from `DESIGN.md`, `SPEC.md` or the principles, so there's no real fork. They're in rough order of impact.

1. **One type scale:** 10/11/12/13/15/18, with weights 400/500/600 (§2.1). This replaces 12 ad-hoc sizes from 9 to 15px in half-pixel steps.
2. **One list-row pattern, and no cards for lists** (§2.4, §2.6). Travel connections, the Export checklist, seat alerts, the "Sections that fix this" list, Generate's "Changes" and the Blocks list become hairline rows, like Courses and Search.
3. **Course details facts come first:** prerequisite and restriction sit under the title, and the description is clamped to 2 lines with "More about this course" (§3). Today the prerequisite is the last thing on the About tab, under every section.
4. **Section rows show what differs.** A lecture every section in a group shares is said once ("All meet TuTh 9:30–10:45am IRB 0324"), and each row shows its discussion or lab. Today the discussion time is exactly the part that gets truncated (§3).
5. **Section count is a first-class axis** for course details, search results and ghosts. One section reads as "this is the class". A few sections get full rows. Many sections get one-line rows, "Only fits", and the plan's own section pinned (§3.5, §4.2).
6. **The calendar never jumps.** The "Showing every section" hint strip overlays the grid instead of pushing it down 35px whenever a search result is hovered (§4.2).
7. **Travel pills only on back-to-back classes** (SPEC §3.3 says "back-to-back"). Show a pill when the gap is under 30 minutes or the verdict is tight or not enough, and hide pills while ghosts are showing, since they sit on ghost labels (QA #1, §4.3).
8. **The problem count matches the list.** The top bar and rail count errors and warnings. The Problems header says "2 problems · 1 note", so the info item isn't a surprise (QA #2, §4.5).
9. **Travel: connections first, settings summarized.** "Typical pace · no extra time · standard routes · Change" is one line that expands, and identical connections merge across days ("Mon, Wed, Fri") (§4.6).
10. **Sticky primary actions at the bottom.** In Generate's form and a result's details, "Generate plans" and "Save as new plan" sit in a panel footer, not a sticky bar that covers the form (§4.8).
11. **Blocks: the list first, then "+ Add a block".** Use the same `Select` and day toggles as Generate (§4.7).
12. **Shared view:** the panel sub reads "Shared plan" rather than the sharer's plan name, which collides with your own "Plan A" (QA #3, §4.10).
13. **Search result rows adapt to section count:** a 1-section course shows its meeting time and fit ("TuTh 12:30–1:45pm · Fits"), not "1 section · 1 fits your plan". The result count is always shown (§4.2).
14. **`DESIGN.md` §5 gets the owner's new rule:** design for 1, a few, and many sections. (Done in this PR.)

### 1.2 Owner decisions

**Decided by owner, 2026-09-25:**
1. **Course details: A, one page.**
2. **Many sections with no instructor grouping: group by meeting time.**
3. **Sidebar width: draggable**, 320–480px ("draggable would be sick"). WP0 adds the `--sidebar-width` variable and the `w-sidebar` utility; WP6 builds the handle and remembers the width.

The options as presented follow. There were only three, each with screenshots from the prototype on this branch (mock data; `pnpm dev:mock`, then `/?demo=1&cd=a|b|c`). Images are in `docs/ux-review/`.

**Decision 1: course details structure** (§3.3). The owner's complaint. *Recommend A.* **Decided: A.**

| Now | A · One page (recommended) | B · Tabs at the top | C · Everything in place |
|---|---|---|---|
| ![](ux-review/now-few-sections.png) | ![](ux-review/a-few-sections.png) | ![](ux-review/b-few-sections.png) | ![](ux-review/c-few-sections.png) |

- **A · One page.** Facts under the title, then sections grouped by instructor, with each instructor's rating, GPA and a "Reviews" disclosure *in the group header*. Grades come last as one course-wide section, reachable from "Grades ↓" in the sticky Sections header. No tabs.
- **B · Tabs at the top.** The smallest change: Sections / Instructors / Grades / About as tabs under the header, with Sections the default. It fixes "tabs at the bottom" but still hides instructor info and prerequisites behind a tab while you choose.
- **C · Everything in place.** Like A, but the course-wide grade sentence joins the facts under the title, and grade bars move inside each instructor's "Reviews" disclosure (per-instructor grades). No sections below the list at all.

**Decision 2: many sections with no instructor grouping** (ENGL101: 92 sections, all "Instructor TBA") (§3.5). *Recommend grouping by time.* **Decided: group by time.** *Superseded 2026-09-26: one list, sorted by section code, with every meeting on each row (SPEC §3.4).*

| Flat, one line per section | Grouped by meeting time (recommended) |
|---|---|
| ![](ux-review/a-many-flat.png) | ![](ux-review/a-many-by-time.png) |

Grouping by time mirrors the calendar's merged ghosts ("0101–0105 · 5 sections" is one group), turns 92 rows into about 17 collapsible groups, and each row then shows only the room. Flat is simpler and fine with "Only fits" on.

**Decision 3: sidebar width** (§3.6). *Recommend 400px at ≥1280px wide, 360px below.* **Decided: draggable, 320–480px.**

| 360px (now) | 440px |
|---|---|
| ![](ux-review/width-360.png) | ![](ux-review/width-440.png) |

The alternatives are (a) keep 360px, (b) 400px on wide screens, or (c) user-resizable from 320–480px, remembered. At 440px nothing in a section row truncates, and the calendar still gets about 940px on a 1440px screen. Resizing is the most flexible, but it adds a control and a preference to babysit ("avoid unnecessary complexity").

---

## 2. App-wide system (do first)

> **Now in the Ink brand** (2026-09-26, `docs/DESIGN.md` §7). The scale, spacing, panel anatomy and row pattern below are unchanged; the brand changed the face (Bricolage Grotesque, codes still Geist Mono), the palette (Flexoki paper and ink), the corners (square), and elevation (hard offsets and ink keylines, §2.9).

### 2.1 Type scale

Today: 12 sizes (`text-[9px]` … `text-[15px]`, most often 12.5, 11.5, 12 and 11), set per component. Replace them with named Tailwind steps defined in `src/styles.css` (`@theme`). Tailwind 4 turns `--text-*` into `text-*` utilities. These override Tailwind's default `xs`/`sm`/`base`/`lg`/`xl`, and no component uses those defaults today.

| Token | px / line-height | Weight | Use |
|---|---|---|---|
| `text-2xs` | 10 / 13 | 500 | Only on the calendar blocks and ghosts, rail labels, badges and counters. |
| `text-xs` | 11 / 14 | 400–500 | Meta: section-header counts, seat freshness, footnotes ("from PlanetTerp"), chips. |
| `text-sm` | 12 / 16 | 400–500 | Secondary lines in rows (title under code, meeting line, fit words, seats), labels, buttons in rows. |
| `text-base` | 13 / 18 | 400–600 | Primary text: row primary line, course and section codes, body copy, panel titles, buttons. |
| `text-lg` | 15 / 20 | 600 | The drill-in title (course title, connection title, "Option 1"). |
| `text-xl` | 18 / 24 | 600 | Only the first-visit headline. |

- **Mapping for the sweep:** 9, 9.5, 10 and 10.5 → `2xs` (calendar/rail/badges) or `xs` (elsewhere); 11 → `xs`; 11.5 and 12 → `sm`; 12.5, 13 and 13.5 → `base`; 14 and 15 → `lg`.
- **Weights:** 400 body, 500 labels/names/active tabs, 600 titles, codes and buttons. 700 only in the wordmark.
- **Face:** Bricolage Grotesque with automatic optical sizing, so small text gets its open text drawing (DESIGN §7.2). Codes are Geist Mono (§2.7).
- **Guard:** once every package has swept its files, add `src/app/design-tokens.test.ts`, which fails on `text-[<n>px]` in `src/**/*.tsx` (outside tests).

### 2.2 Spacing and rhythm

A 4px base, using these steps only: `1` (4), `1.5` (6, inside chips only), `2` (8), `3` (12), `4` (16), `6` (24).
- **Panel gutter:** `px-4`, everywhere. Rows, headers and the breadcrumb share the same left edge (16px), so codes line up down the panel.
- **Rows:** regular `py-2` (about 40px with two lines), compact `py-1` (28px, one line).
- **Between sections:** a section header bar (§2.3), or `pt-6` when there's no bar. Never both.
- **Inline gaps:** `gap-1` inside a chip or icon+label, `gap-2` between inline items, `gap-3` between row columns.

### 2.3 Panel anatomy (new shared pieces in `src/app/panel.tsx`)

```
┌ PanelHeader (exists, 48px) ─────────────────────────┐  title 13/600 · sub 12 muted · right slot
│ or the Breadcrumb (48px) in a drill-in              │
├─────────────────────────────────────────────────────┤
│ PanelBody (the one scroll area)                     │
│  ┌ SectionHeader "bar" (36px, sticky-able) ────────┐│  "Sections  3 of 14 fit   [Only fits]    Grades ↓"
│  │ GroupHeader (36px, bg-panel, sticky under bar)  ││  "▾ Grace Kowalczyk ★4.2 (61) · GPA 3.10   0 of 5 fit  Reviews"
│  │ ListRow …                                       ││
│  └─────────────────────────────────────────────────┘│
│  SectionHeader "label" (quiet, for forms)           │  "Must have" 11/500 muted, pt-4 pb-1.5
├─────────────────────────────────────────────────────┤
│ PanelFooter (optional, sticky bottom)               │  the panel's one primary action
└─────────────────────────────────────────────────────┘
```

Exact APIs, so packages can build against them:

```tsx
// Replaces PanelLabel (keep PanelLabel as an alias until the sweep ends).
export function SectionHeader(props: {
  title: ReactNode;          // "Sections"
  count?: ReactNode;         // "3 of 14 fit" (text-xs muted tnum)
  right?: ReactNode;         // filters, jump links
  variant?: "bar" | "label"; // bar: h-9 border-y bg-bg text-sm/500; label: quiet, no borders
  sticky?: boolean;          // bar only: sticky top-0 z-20
}): JSX.Element;

export function GroupHeader(props: {
  open: boolean; onToggle: () => void; toggleLabel: string; // tooltip
  title: ReactNode; meta?: ReactNode; right?: ReactNode;
  sticky?: boolean;          // sticky top-9 (under a sticky bar) z-10
}): JSX.Element;             // h-9 px-4 bg-panel border-b, chevron -ml-1

export function ListRow(props: {
  lead?: ReactNode;          // fixed-width first column: code, dot, checkbox
  children: ReactNode;       // main column: primary line + up to 2 secondary lines
  trail?: ReactNode;         // right-aligned value or status (seats, "Tight")
  action?: ReactNode;        // fixed-width last column (w-14)
  density?: "regular" | "compact";
  state?: "current" | "previewed" | undefined; // bg-accent-soft / bg-hover
  onPointerEnter?, onPointerLeave?, onClick?, "data-*"?
}): JSX.Element;             // grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-3 px-4 border-b border-hairline

export function EmptyState(props: { children: ReactNode; action?: ReactNode }): JSX.Element;
// one or two lines, text-sm muted, px-4 py-3; an optional button under it. No illustrations.

export function PanelFooter(props: { children: ReactNode }): JSX.Element;
// sticky bottom-0 border-t bg-bg px-4 py-2; the only filled button in the panel lives here.
```

**As built in WP0** (use these; they differ from the sketch above only where noted):
- `~/app/panel`: `PanelHeader`, `PanelBody`, `SectionHeader`, `PanelLabel` (now `SectionHeader variant="label"`, 11/500 muted), `GroupHeader`, `ListRow`, `EmptyState`, `PanelFooter` and `MetaSep` (a faint " · ").
  - `ListRow` is flex, not grid: give `lead` a fixed width per list (`w-10` for section codes) so rows align.
  - `action` is always a `w-14` column. Rest props (`data-*`, pointer handlers, `aria-*`) go to the row, and `as="li"` inside a `ul`.
- `~/app/emphasis`:
  - `TEXT.primary|secondary|tertiary` (`text-fg`/`text-muted`/`text-faint`);
  - `TONE_TEXT[ok|warn|error|plain|muted]` for status words;
  - `TONE_FILL[ok|warn|error]` for soft status fills.
- `~/app/plan-label`: `planLabel(current)` gives "Shared plan" in a shared view, and the plan's name otherwise.
- `~/core/problems`: `problemCountWords(counts)` gives "2 problems · 1 note". Both the top bar and the Problems tab use it.
- **CSS (`src/styles.css`):**
  - the type utilities `text-2xs|xs|sm|base|lg|xl` (§2.1);
  - `ident` (mono with tabular figures, for codes) and `tnum`;
  - `w-sidebar`, which reads `--sidebar-width` (clamped 320–480px).

### 2.4 The list-row pattern

Every list (courses, results, sections, problems, connections, checklist, generate results, fixes) uses `ListRow`:
- **Column 1** is identity: a mono code, a course dot, a rank or a checkbox, at a fixed width per list so rows align.
- **Column 2** is what it is: a primary line (`text-base`), then at most two secondary lines (`text-sm muted`). Front-load the distinguishing words (P3).
- **Column 3** is status: seats, a verdict or a count, right-aligned, tabular. The color is the status color, nothing else.
- **Column 4** is the action: one outline `h-6 w-14` button, or a word ("Current").
- Hover is `bg-hover`. The current item is `bg-accent-soft`. There are no borders around rows, only hairlines between them.
- Truncate column 2's *least* distinguishing part, and give every truncation a tooltip with the full text.

### 2.5 Color and emphasis

- **Text:** `fg` for what the row is, `muted` for supporting facts, `faint` only for footnotes, disabled states and placeholders.
- **Status colors** (`ok`, `warn`, `error`) go only on status words and their meters: fit labels, seats low or full, problem severity, travel verdicts. Never on counts, headings or decoration. "4 fit" in the Sections header stays muted; the green goes on each row's "Fits".
- **One filled (accent) button per view:** the primary action, in ink. Everything else is outline (paper, ink border, offset) or ghost (flat).
- **Product color** (the scheduler red, Reviews purple, Chat blue) goes only on the marks and the product menu. Never on buttons, headings or borders.
- **The selected row** (`accent-soft`) is a neutral a half-step past `hover`, never the error's red.
- **Course colors** only on the course dot and calendar blocks: Flexoki fills, 400-step borders and dots (DESIGN §7.1).
- **Sparkles** only on the LLM review summary (unchanged).

### 2.6 Dividers and grouping

- The weakest grouping that works (P2): spacing, then a hairline, then a fill (`bg-panel` group headers), then a border (cards).
- **Cards** (square, `border`; an ink `border-keyline` with `shadow-offset` when it floats or can be pressed) only for standalone objects: the two first-visit paths, an instructor's review block, the route map and the travel verdict box.
- **Lists are never in cards.** Convert:
  - `travel-panel.tsx` connection items;
  - `fix-list.tsx`;
  - `registration-checklist.tsx` and `seat-alerts-list.tsx`;
  - `result-details.tsx` "Changes from Plan A";
  - `blocks-panel.tsx` block items.

### 2.7 Monospace

- **Mono (Geist Mono)** is for identifiers: course codes, section codes, building codes when shown as codes ("IRB 0324"), gen-ed codes, and the calendar's block text. This is current practice.
- **Tabular sans (`tnum`)** is for times, counts, seats and GPAs in lists.
- **Never set a sentence in mono.** That applies to the travel "Estimate" line in `connection-details.tsx` and to near-miss descriptions in `nothing-fits.tsx`. Codes inside a sentence may stay mono.
- *Spec interpretation:* SPEC §3.13 lists Geist Mono for "codes, times, numbers". The app already sets times in tabular sans in lists and mono on the calendar. This keeps that split and states it.

### 2.8 Sticky behavior

- The panel header or breadcrumb is always outside the scroll (already true).
- At most two sticky levels inside `PanelBody`: a `SectionHeader` bar at `top-0`, and a `GroupHeader` at `top-9`.
- A panel's primary action is in `PanelFooter` (sticky bottom), not a sticky bar in the middle of a form.

### 2.9 Shape, elevation and grain (Ink)

- **Square corners.** Every `rounded-*` step is 0; `rounded-full` is only for round things (dots, the switch knob).
- **Hairlines inside, keylines around.** Rows, headers and panel edges use `hairline`. What floats above the page (menus, popovers, toasts, the phone drawer) has a 1px ink `keyline` and a hard offset: `shadow-pop` (3px), `shadow-drawer` on the drawer's top edge.
- **Buttons** carry the offset (`shadow-offset`, 2px; `shadow-offset-filled`, gray, on the ink button). Hover changes the fill; a press moves the button into its shadow; focus is a 2px ink ring; disabled loses the offset. Ghost and link buttons are flat.
- **No blur anywhere.** Tailwind's `shadow-xs`…`2xl` are offsets too.
- **Grain** is a fixed layer behind the shell's content, so it shows on the page's paper and never under text or on filled surfaces. It turns off for reduced transparency, more contrast, forced colors and print.

---

## 3. Course details (the owner's complaint)

Files: `src/features/course-details/*`. Screens:
- production: `d-07`, `d-09…d-22` and `d-size-*`;
- phone: `m-09`, `m-11…m-18`;
- prototype: `prototype/d-*-{one,cmsc351,cmsc330,engl101}`.

### 3.1 What's wrong today

1. **The tabs are under the list.** With 14 sections (CMSC330) the Instructors/Grades/About tabs start about 1,000px down. With 92 (ENGL101) they're about 3,500px down. Clicking "Grades" changes content below the fold, so it looks like nothing happened (`d-21`, `m-17`). NN/g: tabs away from their content get overlooked, and tabs fail when people compare across them (P3).
2. **Instructor info lives in two places.** The group header shows rating and GPA, and the Instructors tab repeats them with the summary. People choose a section *by choosing an instructor*, so the review summary belongs where the choice is made (P6: recognition over recall; DESIGN: one home).
3. **The prerequisite is the last thing on the page.** It's on the About tab, under every section (`d-17`). It's the one fact that can make the whole course moot.
4. **Rows repeat the shared lecture and truncate the difference.** CMSC330 rows read "TuTh 9:30am–10:45am IRB 0324 · F 9am–9:5…", and the only thing that differs, the Friday discussion, is cut off (`d-14`). MATH140 and CMSC131 are the same (`d-size-many`, `d-size-intro`).
5. **Single-section courses wear list chrome:**
   - a "Sections · 1 fit" label;
   - a collapsible group of one;
   - a row with an "Add" button that duplicates "Add to Plan A";
   - then tabs, then a card repeating the group header (SOCY411, `d-size-one-details`).
6. **Many-section courses are one undifferentiated list.** ENGL101's single group, "Instructor TBA · 92 sections", adds nothing. Compact rows say "Tu 2pm +1" (which meeting is the +1?) and "Too close" (to what?). There are 92 identical "Add" buttons (Hick's law, P5). There's no filter, and the plan's own section can scroll away.
7. **The header row is cramped:** "Sections · 3 fit", "Seats as of 12 min ago" and a row-mode icon, all 11px, in one line. The row-mode toggle is a hidden preference that the section count should decide.
8. **Grades show instructors who aren't teaching this term.** The chips come from PlanetTerp history ("Aaron Bartlett, Aaron Brown, Abb…"), so they overflow sideways. They should be this term's instructors first.

### 3.2 What the view is for

The primary task is to **pick a section of this course that fits, from an instructor you want**. The secondary tasks are to check that you're allowed to take it (prerequisite, restriction) and to judge the course (description, grades). So the eye should land on the title, then the facts that could rule it out, then the sections, grouped the way the choice is made.

### 3.3 Three structures

| | A · One page (recommended) | B · Tabs at the top | C · Everything in place |
|---|---|---|---|
| Facts (prereq, restriction) | Under the title | On the About tab | Under the title, plus the grade sentence |
| Instructor rating/GPA | Group header | Group header + tab | Group header |
| Review summary | "Reviews" disclosure in the group | Instructors tab | "Reviews" disclosure in the group |
| Grade bars | One course-wide section at the end, with "Grades ↓" | Grades tab | Per instructor, inside "Reviews" |
| Tabs | None | 4, at the top | None |
| Hidden while choosing | Only full reviews (one click, in place) | Reviews, grades, prereqs | Reviews and grades (in place) |
| Change size | Medium | Small | Medium |
| Screens | `ux-review/a-*.png` | `ux-review/b-few-sections.png` | `ux-review/c-*.png` |

**Why A:**
- It removes the only structural complaint (tabs under a list) without inventing a new navigation.
- It puts instructor information where the choice happens ("one home"), and shows the prerequisite before anything else.
- It keeps grades as **one course-wide chart**: most instructors in PlanetTerp have few or no per-course grades for this course, so per-instructor bars (C) would often be empty (see `ux-review/c-reviews-open.png`), and a single chart honors "words before charts".
- B is the smallest diff, but it keeps "hide what you need to compare behind a tab" (P3).

### 3.4 Recommended spec (A)

> **Superseded by the owner, 2026-09-26** (SPEC §3.4): one section list for every course (a one-section course gets the same row as any other), one level of grouping, by professor and only when there's more than one, and every row shows all of its meetings. No shared-lecture lines, no grouping by time, and a per-row icon button to add a section; the course-level "save for later" is now **Bookmark**. "Only fits" (from 9) and the pinned "Your section" (many) stay.


```
┌ Breadcrumb: Search › CMSC330 ──────────────────────────────────┐ 48, outside scroll
│ ● CMSC330  3 credits  DSNL                                     │ base/600 mono · sm muted · xs mono chips
│ Organization of Programming Languages                          │ lg/600
│ Prerequisite  Minimum grade of C- in CMSC250 and CMSC216.      │ sm: label fg/500, text muted, clamp 2
│ Restriction   Must be in a major within CMNS-Computer Sci…     │ sm, clamp 2, tooltip full
│ A study of programming languages, including their syntax, …    │ sm muted, clamp 2
│ More about this course                                         │ sm underline → expands About in place
│ [Remove from Plan A] [Save for later]                          │ unchanged actions
├ Sections  0 of 14 fit  [Only fits]                  Grades ↓ ──┤ SectionHeader bar, sticky top-0
│ Your section                            ● Seats as of 2 min ago│ xs; "Your section" only when >20
├ ▾ Grace Kowalczyk ★4.2 (61) · GPA 3.10     0 of 5 fit  Reviews ┤ GroupHeader, sticky top-9
│ All meet TuTh 9:30–10:45am IRB 0324                            │ xs muted, shared lecture
│ 0101  F 9–9:50am CSI 1122            48 open   [Switch]        │ ListRow regular
│       Overlaps ENGL393                                         │ fit words, tone
│ 0103  F 12–12:50pm CSI 1122          12 open    Current        │ bg-accent-soft
│ …                                                              │
├ ▾ Nils Zielinski ★3.8 (35) · GPA 3.54      0 of 9 fit  Reviews ┤
│ All meet TuTh 2–3:15pm CSI 1115                                │ one line per lecture
│ 0201 …                                                         │
│ All meet TuTh 3:30–4:45pm IRB 0324                             │
│ 0302 …                                                         │
├ Grades  every past semester, from PlanetTerp ──────────────────┤ SectionHeader bar, sticky
│ 93% got an A or B · average GPA 3.54                           │ sentence first
│ [All instructors] [Kowalczyk] [Zielinski]  (this term's first) │
│ ▇ ▅ ▂ ▁ ▁ ▁ ▁                                                  │ existing bars
└────────────────────────────────────────────────────────────────┘
```

**Rules:**
- **Header:** identity row, title, then *facts*: prerequisite, corequisite, restriction and permission, each shown only if present and clamped to 2 lines with a tooltip. Then the description clamped to 2 lines, then "More about this course", which expands the remaining About content (gen-ed meanings, cross-listings, grading, other notes) **in place**. The About tab is gone.
- **Sections bar:** "Sections", the count "N of M fit" (muted), and **Only fits** (a toggle chip, from 9 sections up). The plan's section always stays visible even when it doesn't fit. On the right is "Grades ↓", which scrolls to Grades. Seat freshness moves to a slim line under the bar ("Seats as of 2 min ago", right-aligned, `text-xs`). The row-mode toggle goes away: density follows the section count (§3.5).
- **Group header:** instructor name (`base/500`), then ★ rating (review count), then "GPA x.xx" (muted). On the right are "k of n fit" (muted) and **Reviews** (a ghost button), which expands the existing instructor card (summary with sparkles, themes, PlanetTerp link) under the header. The summary loads when the disclosure opens (still lazy, SPEC §4). Groups stay collapsible and remembered.
- **Shared meetings:** within a group, meetings every section shares are one line: "All meet TuTh 9:30–10:45am IRB 0324". If a group's sections split across lectures, add one line per lecture run, in section order. Section order is never changed (SPEC §3.4).
- **Row:** `ListRow` with lead = section code (mono 600) and main line 1 = the non-shared meetings (days, times, room; no "discussion" word when a shared line exists). Main line 2 is the fit words in their tone, then the restriction in amber. Trail is seat words (the meter moves into the tooltip at compact density), and the action is `Switch`/`Add` or "Current". Drop "In your plan" on the current row, since "Current" already says it.
- **Grades:** unchanged content (sentence, then bars). Chips list this term's instructors first, then "Past instructors ▾" for the rest.
- **The Instructors tab is deleted.** Its card becomes the "Reviews" disclosure.
- **Deep links:** `DrillEntry.tab` (`instructors|grades|about`) now means "scroll to": `grades` scrolls to Grades, `about` expands "More about this course", and `instructors` opens the first group's Reviews. Keep the schema for remembered drills.

**Acceptance criteria:**
- [ ] The prerequisite (if any) is visible without scrolling at 1440×900 and at 390×844 (drawer at half).
- [ ] No tabs in course details. Grades are reachable in one click from the sticky Sections bar.
- [ ] CMSC330: every row shows its Friday discussion time untruncated at 360px.
- [ ] No instructor's rating or GPA appears twice.
- [ ] Hover preview, `↑`/`↓`/`↵`, collapse memory and scroll restoration still work (existing tests in `course-details.test.tsx`, `e2e/search.spec.ts`).
- [ ] Both themes, and all text on the §2.1 scale.

### 3.5 At 1, a few, and many sections

> **Superseded by the owner, 2026-09-26** (SPEC §3.4): one section list for every course (a one-section course gets the same row as any other), one level of grouping, by professor and only when there's more than one, and every row shows all of its meetings. No shared-lecture lines, no grouping by time, and a per-row icon button to add a section; the course-level "save for later" is now **Bookmark**. "Only fits" (from 9) and the pinned "Your section" (many) stay.


| | 1 section (SOCY411, CMSC401) | A few, 2–20 (CMSC351, CMSC330, STAT400, MATH140) | Many, over 20 (ENGL101 92; MATH/CMSC intro in fall) |
|---|---|---|---|
| Sections area | **"One section 0101"** block: Meets / Taught by (★, GPA, Reviews) / Fit / Seats / Note, as a definition list. No group, no row button (the header's Add already adds it). | Instructor groups, regular two-line rows, shared-lecture lines. | Instructor groups when there are 2 or more instructors. With one group (all TBA), see Decision 2: group **by meeting time** (recommended) or a flat list. One-line compact rows: code, when, short fit, seats, action. |
| "Only fits" | Hidden | From 9 sections | Shown |
| Plan's own section | It's the block | In place (`bg-accent-soft`) | **Pinned** under the Sections bar ("Your section"), and in place |
| Ghosts on the calendar | One ghost | Every section | Merged by time (existing), capped at 12; the rest listed |
| Screens | `ux-review/a-1-section.png` | `ux-review/a-few-sections*.png` | `ux-review/a-many-*.png` |

**More rules:**
- **Compact fit words must still carry scent** (P3). "Too close" becomes "Too tight" with the full words in the tooltip ("Not enough time after CMSC330"). "In plan" becomes "Current". Compact "when" shows every meeting's days and start–end without rooms ("MWF 9–9:50am"), never "+1".
- **A one-group degenerate list gets no group header.** Instead, a one-line note: "Testudo hasn't named instructors for these sections yet." (or the one instructor's name, rating and GPA).

### 3.6 Width and mobile

- **360px** is the tightest width that works *with* §3.4's factoring: rooms truncate, times don't. See Decision 3 for 400px.
- **Phone:** course details open with the drawer at **half**, so ghosts stay visible above it (the whole point of "see every option"). Today a drill-in can leave it at full, which hides the calendar (`m-11`). The header facts are clamped the same way. Sticky bars work inside the drawer's scroll area. Prototype: `prototype/m-a-*`.

---

## 4. Screen by screen (priority order)

### 4.1 Shell and top bar (`src/app/*`)

- **Primary task:** move between tabs and plans. **Eye path:** logo, then plan tabs, then problems pill. That's fine.
- The rail's active state (raised box, ring and shadow) is the loudest thing in the rail, which DESIGN warns about ("looks like Slack"). Use `bg-hover` with no ring or shadow, and `text-fg` for the label (`rail.tsx`).
- Rail labels (`text-[10px]`) and the badge (`text-[9px]`) become `text-2xs`. The badge stays.
- The logo (`text-[13.5px]`) becomes `text-base/600`.
- **Acceptance:** the rail's active tab is distinguishable in both themes without a shadow, and there's no layout change.

### 4.2 Search (`src/features/search/*`) and hover ghosts (`src/features/calendar/strips.tsx`)

- **Primary task:** find a course and compare by hovering.
- **The hint strip reflows the calendar.** `GhostHint` pushes the grid down 35px on every hover (`d-03` vs `d-04`), so the calendar jumps as the pointer moves down the results. Render the strip as an overlay pinned to the top of the grid area (`absolute inset-x-0 top-0 z-20 bg-panel/95 border-b`), with the week frame's layout ignoring it. **Acceptance:** hovering any result changes no element's position on the calendar.
- **Result rows by section count:**
  - 1 section: "TuTh 12:30–1:45pm · Fits" (or the fit words);
  - 2–20: "4 sections · 2 fit";
  - over 20: "92 sections · 36 fit".
  
  This makes hover-comparing upper-level courses possible without hovering. Line 1 (`code · 3 cr · gen-eds`) and the title are unchanged.
- **The result count is always visible** when there's a query ("45 courses"), with "Clear filters" on the right when filters are on (today the count only appears with filters).
- **Ranking:** a query that is a department prefix ("cmsc3") should rank that department's courses before typo matches from other departments (FMSC374 appears among CMSC3xx, `d-03`). This is a core search change; add a test in `src/core/search`.
- The empty query shows only the chips over blank space (`d-02`). Show recent courses ("Recently opened") as a list, or one quiet line: "Search by code, title or instructor. Hover a result to see its sections on the calendar." (EmptyState). *Pick the line; there's no history store today.*
- **Ghost labels at many sections:** when the ghost label truncates, drop the instructor before the section range.

### 4.3 Calendar (`src/features/calendar/*`)

- **Travel pills** (`calendar.tsx` about line 363, `entries.tsx TravelPill`): show a pill only when the gap is at most 30 minutes, or the verdict is tight or not-enough. Put that in a pure `shouldShowPill(connection)` in `src/core/travel`, with a test. Hide pills while ghosts or a plan preview are showing.
- **Block text** on the calendar uses `text-2xs` (the only non-panel use).
- **Acceptance:** with CMSC351 and STAT400 three hours apart, no pill. With ENGL101 open, no pill sits on a ghost label.

### 4.4 Courses (`src/features/courses/*`)

- **Primary task:** review what's in the plan. The eye lands first on the seat meter at the top right (`d-08`), because it's the only graphic.
- Move to `ListRow`:
  - lead: color dot;
  - main line 1: `CMSC330` (mono 600) plus `0101` (mono muted);
  - main line 2: the title;
  - main line 3: instructor · days;
  - trail: seat words with the meter under them, right-aligned.
- Replace the bare ⚠ after the code with the problem's short words on line 3, in amber ("Tight connection to ECON200"). The icon alone forces recall (P6).
- **"Saved for later" empty state:** one faint line, and only when the plan has courses; otherwise the first-visit guide shows (unchanged).
- **First visit** (`first-visit.tsx`): keep the two equal cards side by side (SPEC). Title `text-xl`, step text `text-sm`. At 360px the cards wrap each step onto 2–3 lines. The width decision helps, and "Set your must-haves (days off, start time, …)" can shorten to "Set must-haves (days off, start time)".

### 4.5 Problems (`src/features/problems/*`)

- Good today (`d-23`). The changes:
  - **count consistency:** the header sub reads "2 problems · 1 note", matching the top bar's "2 problems" (errors + warnings), with the "Good to know" group as notes;
  - fix buttons use the §2.4 action style (outline `h-6`), under the message;
  - the section headers "Worth a look 2" and "Good to know 1" become `SectionHeader` "bar".

### 4.6 Travel and connection details (`src/features/travel/*`)

- **Primary task:** see which connections are tight. Today the settings take the top 40% and connections start at y=390 (`d-24`).
- **Order:** connections first. The settings collapse into one summary line at the top, "Typical pace · no extra time · standard routes · Change", which expands in place to today's controls, plus "How?".
- **Connections:** hairline `ListRow`s, not bordered cards.
  - Merge identical connections across days: "CMSC351 → STAT400 · Mon, Wed, Fri · IRB → ARM · 7 min walk · 10 min gap".
  - Status words on the right in their tone ("Tight", "Not enough time"), with no leading dot. "Plenty of time" is muted.
  - Sort by severity, then day (like Problems).
- **Connection details:**
  - "Sections that fix this" become `ListRow`s;
  - the Estimate line is tabular sans, not mono;
  - the verdict box stays a card (a standalone object).

### 4.7 Blocks (`src/features/blocks/*`)

- **Primary task:** see and add busy time.
- **Order:**
  1. the one-line explanation;
  2. the blocks list (`ListRow`: label, then days · time, then a remove action);
  3. "+ Add a block", which expands the form. Keep it expanded when there are no blocks.
- **The form matches Generate's:**
  - the shared `Select` (not native `<select>`) for times;
  - day toggles in Generate's accent-fill style (today "Mon" and "Wed" selected look almost the same as unselected, `d-27`);
  - presets as chips.

### 4.8 Generate (`src/features/generate/*`)

- **Form:** "Generate plans" moves from the sticky bar at the form's top (which covers fields as you scroll) into `PanelFooter`.
- **Results** (`results.tsx`):
  - after running, keep a one-line summary of the request above the results ("4 courses · no Fridays · compact days · Edit") so the form's context isn't lost;
  - "192 plans / Showing the best 192" becomes "192 plans", with "Showing the best 200" only when capped;
  - rank number and "×24" move to the trail column, in a stacked layout.
- **Result details** (`result-details.tsx`):
  - "Same times, other sections" (a wall of 28 mono codes, `d-31`) becomes "ENGL393: 28 other sections meet at the same times · Show", expanding in place;
  - "Save as new plan" moves to `PanelFooter`.
- **Nothing fits** (`nothing-fits.tsx`):
  - relaxation buttons wrap instead of truncating ("Allow classes on Mondays and Tue…", `d-32`);
  - near-misses list each conflict on one line in sans (codes mono), no more than 2 lines per plan.

### 4.9 Export (`src/features/export/*`)

- **Primary task (at registration time):** follow the checklist. The action rows first is fine (they're short).
- The checklist and seat-alert list become hairline rows, not cards.
- The checklist row trail shows seats, and the backup line stays `text-sm muted`.

### 4.10 Shared link (`src/app/shared-pill.tsx`, panel headers)

- The pill is good.
- Panel subs that show the plan name ("Plan A") say "Shared plan" in the shared view, so it isn't confused with your own Plan A (`d-37`). Panels read `current.source === "shared"`.

### 4.11 Mobile (drawer, `src/app/mobile-drawer.tsx`)

- **Hierarchy:** the drawer tab strip (72px) plus the breadcrumb (48px) take 120px before content. Tighten the strip to 56px (icon plus `text-2xs` label, `py-1.5`).
- Course details and a Generate preview open at **half**, never full, so the calendar stays visible (§3.6).
- QA #5 (first-visit hidden at peek) is being fixed by the a11y/mobile agent; this review only asks that the first visit opens at half.

---

## 5. Work packages

Every package owns its files exclusively. Everything but WP1's structure and WP6's width is decided, so WP0 and WP2–WP5 start now.

| WP | Scope | Owns (exclusive) | Depends on | Blocked by owner? |
|---|---|---|---|---|
| **WP0 · System** | §2: type tokens in `@theme`; `SectionHeader`, `GroupHeader`, `ListRow`, `EmptyState` and `PanelFooter`, with tests; `PanelLabel` becomes an alias; the type-scale sweep of `src/app/**` and `src/components/ui/**`. The rail active state (§4.1). | `src/styles.css`, `src/app/panel.tsx` (+ test), `src/app/rail.tsx`, `src/app/logo.tsx`, `src/app/top-bar.tsx`, `src/app/shared-pill.tsx`, `src/components/ui/**` | — | No. Small; merge first (same day). |
| **WP1 · Course details** | §3 in full. Delete `prototype.tsx` and the `?cd=` hook. Move shared-meeting factoring and `lectureKey` to `src/core/catalog/section-groups.ts`, with tests at 1, few and many sections. Grades chips this term's instructors first. Compact words. | `src/features/course-details/**`, `src/core/catalog/section-groups.ts` (+ test), `e2e/search.spec.ts` (details assertions) | WP0 | No (decided 2026-09-25: A, grouped by time). |
| **WP2 · Search and calendar** | §4.2, §4.3: overlay hint strip, result rows by section count, result count, dept-prefix ranking, pill visibility, hiding pills under ghosts, ghost label truncation, calendar text on `2xs`. | `src/features/search/**`, `src/features/calendar/**`, `src/app/calendar/**`, `src/core/search/**`, `src/core/travel/` (new `pill.ts` + test only) | WP0 | No |
| **WP3 · Plan panels** | §4.4, §4.5, §4.9, §4.10: Courses rows and problem words, first-visit sizes, Problems counts and headers, Export rows, shared-view subs. | `src/features/courses/**`, `src/features/problems/**`, `src/features/export/**`, `src/features/alerts/**` | WP0 | No |
| **WP4 · Travel and Blocks** | §4.6, §4.7: connections first, the settings summary, merged connections, rows, the Estimate in sans; Blocks list-first, the shared Select and toggles. | `src/features/travel/**` (except `src/core/travel/pill.ts`), `src/features/blocks/**` | WP0 | No |
| **WP5 · Generate** | §4.8 | `src/features/generate/**` | WP0 | No |
| **WP6 · Shell width and mobile** | Decision 3 (a drag handle on the sidebar's right edge that sets `--sidebar-width` on `:root`, clamped 320–480px and remembered per browser; `w-sidebar` already reads it); §4.11: drawer strip height, drill snaps at half. | `src/app/app-shell.tsx`, `src/app/sidebar.tsx`, `src/app/mobile-drawer.tsx`, `src/app/use-media-query.ts` | WP0 | No (decided 2026-09-25). |
| **WP7 · Close-out** | `src/app/design-tokens.test.ts` (no `text-[Npx]`, no `rounded-lg border` on list containers), screenshots after, and a `DESIGN.md` §5 note for the type scale. | New test file, `docs/` | WP0–WP6 | — |

**Order:**
- WP0 merges first.
- WP2, WP3, WP4 and WP5 then run in parallel.
- WP1 starts its decided parts in parallel and adds the structure once Decision 1 lands.
- WP6 waits on Decision 3 for width.
- WP7 comes last.

**Conflict notes:**
- `src/app/panel.tsx` is WP0's only. Others import from it.
- Test fixtures stay in `src/fixtures` (builders); nobody hand-rolls.
- `e2e/*.spec.ts`: each WP edits only the spec for its feature (`search.spec.ts` is WP1 for the course-details parts and WP2 for search; coordinate by test name).

---

## 6. Evidence

- **Production audit**, 2026-09-25 (after #15, #18 and #19 deployed): 1440×900 and 390×844, light and dark. The files are in the session scratchpad, `…/scratchpad/ux/before/`:
  - `d-*`/`m-*` walk every screen;
  - `d-size-{one,few,intro,many}-*` cover section counts: SOCY411 (1), STAT400 (12), CMSC131 (9), MATH140 (12, spring). ENGL101 (92) is in `d-19…d-22`.
- **Prototype**, on this branch, in `src/features/course-details/prototype.tsx`. It's mock mode only (`import.meta.env.MODE === "mock"`), switched with `?cd=a|b|c` and `&many=time`, so production never sees it. Screens are in `…/scratchpad/ux/prototype/`, and the curated ones are in `docs/ux-review/`. It's a sketch, not the implementation: WP1 replaces it.
