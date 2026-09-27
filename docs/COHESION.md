# One product: the cohesion plan

The owner, 2026-09-27: the five products "should all *feel* very similar, be built from similar fundamentals, and just generally feel as though they form a cohesive product that's extremely useful for students and yet extremely intuitive to understand through clear design language." They don't all have to link to each other in every way.

This file is the plan, and the checklist agents work from until it's met. It sits on top of `docs/DESIGN.md` (taste and the Ink brand) and `docs/UX-PRINCIPLES.md` (the laws). Where they differ, this file wins for anything about how the products fit together.

## 1. Principles

1. **One frame, five products.**
   - Every page sits in the same frame, with the same global bar in the same place, doing the same things: moving between products, your account, feedback.
   - Only the product's own content and its context (the term and plan, Todo's view, the chat room) change from page to page.
   - Suites that feel like one product do this: Google Workspace, Microsoft 365 and Atlassian's 2024 navigation. Jakob's law says people expect a place to work like the places they already know, and that includes the rest of our own app.
2. **Same job, same look, same place, same word.**
   - A thing that means the same across products looks the same, sits in the same spot and has the same name: a page title, a view switch, an empty state, a list row, a sheet, an undo toast, a loading state, an error.
   - The words come from `CONTEXT.md`. (Nielsen's heuristic 4, *consistency and standards*; Apple HIG, *consistency*.)
3. **See it, don't remember it.**
   - Product navigation is visible, with text labels where there's room, on every page, the scheduler included.
   - People arrive cold a few times a semester, so nothing important hides behind a menu they'd have to remember. (Nielsen's heuristic 6; DESIGN.md §5, "People arrive cold".)
4. **Every page has the same anatomy.**
   - The frame, then a page header (title, one status line, a view switch, actions), then content in one of a few named layouts.
   - A new page picks a layout; it doesn't invent a width. (GitHub Primer's `PageLayout` and `PageHeader`, Shopify Polaris's `Page`.)
5. **One way to do each job.**
   - Shared components for the frame, page header, sub-navigation, empty and first-visit state, list row, card, loading, error, sheet and toast. Products compose them; they don't restyle them.
   - The line from tokens to components to patterns to pages is the design system. Brad Frost's *interface inventory* is how we find the drift.
6. **First visit, first action.**
   - Each product's first screen says in one sentence what it's for, and offers one primary action (plus at most one secondary).
   - Same template in all five.
7. **Quiet, dense, precise.** Everything in DESIGN.md §5 still holds. Hairlines inside, keylines and offsets only on what you press or what floats. Product color is a tint, never an alarm. No banners, no dialogs, and Undo everywhere.
8. **The platform is the navigation.**
   - Every view someone can land on is a route. Its state is the URL, via `validateSearch`.
   - Navigation uses `Link`, with preloading. Nothing hand-syncs the URL (CLAUDE.md, the `framework-first` skill).

## 2. The audit (2026-09-27)

Screenshots of every product, taken while signed in as the test student at desktop and phone widths, are in the orchestrator's scratchpad (`inv/grid-desk.png`, `inv/grid-phone.png`). What they show:

- **Two shells.**
  - The scheduler has its own top bar: the umbrella opens a product menu, then the term and plan, then credits and problems. It adds a left rail of tabs on desktop and a bottom drawer on phones. It has no visible way to reach the other products.
  - Everything else uses `SiteHeader`, which has the logo on the left and the products as flat links on the right.
- **No shared page anatomy.** Titles differ in size and wording ("Terpsicle Reviews", "Todo", "Plan your four years" under a big mark). Container widths differ (720, 1120, 1600 and full bleed), and so does alignment (centered, and left-aligned for Plan).
- **Sub-navigation.**
  - Schedule uses a rail, Todo a segmented control, and Plan a side panel with tabs.
  - Chat uses a room list, and Settings uses list rows.
  - Reviews has none.
- **Empty and first-visit states.**
  - Plan shows three heavy keylined cards, and Schedule shows "Two ways to start" cards.
  - Chat has a mostly blank pane that says "Pick a room to start talking."
  - Todo's front door is different again.
- **Account and chrome.**
  - The avatar is in some headers and not others.
  - A lone "Privacy" footer appears on some pages only.
  - The feedback button is about to land in all of them.
- **Primitives.** `src/components/ui` has ten shared primitives and no tabs, segmented control, page header, empty state or list row, so each product hand-rolled its own. (The code inventory, with file and line references, is in §6 once it's written up.)

## 3. The plan

Each item is one PR unless it says otherwise. Check items off here in the PR that finishes them.

### Phase 0: land what's in flight
- [ ] The feedback sheet and admin inbox (`v2/feedback-ui`, `v2/feedback-admin`).
- [ ] `v3/schedule-handoff`, `v3/cross-links` and `v3/e2e`.
- [x] Marketing scroll prototypes (the owner picks; the port waits until Phase 3, so it uses the new frame).

### Phase 1: decide the frame
- [ ] Prototype two or three shell directions, plus a page-anatomy kit, in all five products and Settings, at desktop and phone, in both themes. Pick one, and record it in `docs/decisions.md` and §4 below.

### Phase 2: build the system
- [ ] `AppFrame`: the global bar (products, account, feedback) with a slot for the product's own context. It replaces both `SiteHeader` and the scheduler's `TopBar` framing.
- [ ] Page primitives in `src/components/ui`: `PageHeader`, the named `Page` layouts, `SubNav` (one pattern, on routes), `EmptyState`, `ListRow`, `Card`, `Loading` and `ErrorNote`. Each gets tests and a story in a `/admin/kit` page, so they can be reviewed side by side in both themes.
- [ ] Guardrails:
  - The design-tokens test also fails on raw `max-w-*` page containers and on `h1` elements outside `PageHeader`.
  - The `reviewer` agent checks for use of the kit.
  - A `scripts/shots.ts` takes the side-by-side grid of every product, so any PR can show the whole family.

### Phase 3: move every product onto it
Easiest to hardest, so the kit is tested before the scheduler takes it on:
- [ ] Settings and notifications.
- [ ] Todo.
- [ ] Reviews.
- [ ] Plan.
- [ ] Chat.
- [ ] Schedule.
- [ ] `/`, `/privacy`, sign-in and not-found, then the marketing page's scroll port.

### Phase 4: shared patterns sweep
- [ ] Words: one glossary pass over every string (titles, buttons, empty states, errors, toasts).
- [ ] Behavior:
  - loading and error states everywhere;
  - Undo on every destructive action;
  - tooltips and shortcuts on every control;
  - focus order and keyboard.

### Phase 5: first-time rounds, until happy
- [ ] A scripted first visit to each product, as a new student with no account, then signed in:
  - at phone and desktop widths, in light and dark;
  - with axe.

  Write down everything that confuses, fix it, and repeat. Done means a full round turns up nothing worth fixing, and the orchestrator is genuinely happy with every screen.

## 4. Decisions made here
(Filled in as Phase 1 lands.)

## 5. How we work on this
- **Cross-cutting work stays with the orchestrator.** The frame, the kit and the scheduler's move onto them are done in the orchestrator's own session, not handed off. At most two other sessions run at once, on parts of the code that don't overlap.
- **"As built" notes go in the PR body.** Shared docs (`DATA.md`, `STATUS.md`, `V2.md`, `V3.md`) change only when a contract changes: a schema, storage, an API or a flag. This keeps parallel PRs from colliding in the same doc files.
- **Every UI PR shows the family, not just itself.** Its screenshots include the grid from `scripts/shots.ts` once that exists.

## 6. Interface inventory
(Filled in from the code audit.)
