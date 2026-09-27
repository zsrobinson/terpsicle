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
- [x] Prototype two or three shell directions, plus a page-anatomy kit, in all five products and Settings, at desktop and phone, in both themes. Pick one, and record it in `docs/decisions.md` and §4 below.

### Phase 2: build the system
- [x] `AppBar` (the family bar): products, account, feedback, and a slot for the product's own context. `SiteHeader` and the scheduler's `TopBar` are thin callers of it.
- [x] Page primitives in `src/components/ui`: `PageHeader`, the named `Page` layouts, `SubNav` (one pattern, on routes), `EmptyState`, `ListRow`, `Card`, `Loading` and `ErrorNote`. Each gets tests and a story in a `/admin/kit` page, so they can be reviewed side by side in both themes. (`v3/page-kit`: `PageHeader`, `ProductPage`, `ViewSwitch`, `EmptyState`, `ListRow` and `GroupHeader`, `Card`, `RowSkeleton` and `PageSkeleton`, `InlineError`. The panel's one-line note is now `PanelNote`.)
- [ ] Controls the inventory found hand-rolled five times over (§6):
  - [x] `Input` and `SearchField`: one height, one border, one focus rule.
  - [ ] `Select`: Radix everywhere; no native `<select>`.
  - [x] `Switch`.
  - [x] `SegmentedControl`: one selected look.
  - [x] `BackLink`: one back affordance.
  - [x] `Section`: one heading under a page title. (It's `PageSection`: a section is a course's offering.)
- [x] One `undoToast()` helper (`src/components/ui/toast.tsx`): one action button, one icon, one 10-second window (`UNDO_MS`), focus holds it open, and the shortcut sits in its tooltip. It replaces the seven toast-action copies. Failures go through `noteToast()`, which is never red and offers Try again where retrying can help. The scheduler and Plan keep their Undo/Redo pair on the shared `ToastAction`.
- [ ] Touch targets come from `Button` sizes, never per-product `h-11 md:h-8` overrides. The sign-in button is a `Button`.
- [ ] Routes get a shared `pendingComponent` and `errorComponent`. No page says "reload the page".
- [ ] Guardrails:
  - The design-tokens test also fails on raw `max-w-*` page containers (done, with an allowlist of today's pages) and on `h1` elements outside `PageHeader` (not yet).
  - The `reviewer` agent checks for use of the kit.
  - A `scripts/shots.ts` takes the side-by-side grid of every product, so any PR can show the whole family.

### Phase 3: move every product onto it
Easiest to hardest, so the kit is tested before the scheduler takes it on:
- [ ] Settings and notifications.
- [ ] Todo.
- [x] Reviews. (`v3/cohesion-reviews`: `PageHeader` and `ProductPage` on every page, `PageSection`s of `ListRow`s, a `ViewSwitch` of an instructor's courses, `Card`s for the composer, the report form, sign-in and the AI summary, the kit's `Select`, `SearchField` and a new `Textarea`, `InlineError` with Try again, `RowSkeleton`, and `EmptyState` on `/reviews/mine`.)
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

**The frame: the family bar** (2026-09-27; prototypes: https://claude.ai/artifact/AbCSuunT8MQBgjmn6Rq3o9).
- **Tabs.** One 48px bar on every page (`AppBar`, `src/app/app-bar.tsx`). From 1100px it holds:
  - the wordmark;
  - the five products as labeled tabs, in color order, the one you're in tinted;
  - a divider, then the product's context (the term and plan, a course, "Settings");
  - its status (credits, problems);
  - Feedback;
  - the account.
- **Menu.** Below 1100px the tabs fold into the product menu, whose trigger names the product you're in. The scheduler's phone bar keeps the umbrella alone, since the plan's name needs the room.
- **Account menu.** It's one menu at every size: the account or Sign in, then the theme, then Install. On phones it also holds "Send feedback". The theme has no other home, except a small toggle where sign-in is off.
- **Why the tabs and not the menu alone ("Crumb", the designer's pick).** Cohesion is the goal, and five labeled tabs say "one suite of five tools" at a glance. They also serve people who arrive cold (principle 3) and show the family on every public Reviews page. The menu still does the job wherever the tabs don't fit.
- **The page kit follows the prototype's `kit.html`:**
  - one page header;
  - four page kinds (note 560, reading 720, app 1120, full);
  - one view switch, where each view is a URL;
  - one empty and first-visit template;
  - one list row;
  - card versus section;
  - one inline error with Try again;
  - a footer only on note and reading pages.
- **Plan moves onto the scheduler's workbench** (rail, sidebar, canvas; the same drawer on phones). All three directions shared this.

## 5. How we work on this
- **Cross-cutting work stays with the orchestrator.** The frame, the kit and the scheduler's move onto them are done in the orchestrator's own session, not handed off. At most two other sessions run at once, on parts of the code that don't overlap.
- **"As built" notes go in the PR body.** Shared docs (`DATA.md`, `STATUS.md`, `V2.md`, `V3.md`) change only when a contract changes: a schema, storage, an API or a flag. This keeps parallel PRs from colliding in the same doc files.
- **Every UI PR shows the family, not just itself.** Its screenshots include the grid from `scripts/shots.ts` once that exists.

## 6. Interface inventory
The full code audit is `docs/cohesion-inventory.md` (2026-09-27), with file and line references for every pattern. Phase 3 works from it, and a PR that fixes an entry deletes it there.

The most visible items:
1. **Account and theme.** Plan and Todo have no account entry. Chat shows its avatar only when you're signed in. The theme can only be changed inside Schedule. There are four different account entries.
2. **Titles.** Titles follow no pattern:
   - an `h1` at `text-xl` (where the type scale reserves `text-xl` for the first-visit headline);
   - Plan's plan-name dropdown;
   - no `h1` at all in Chat;
   - the product menu as Schedule's `h1`.
3. **First visits.** They look like four different products: three keylined cards, two hairline cards, a 440px column with a mark, a 560px column without one.
4. **Chrome.** SiteHeader's border and the footer appear on some pages only. Admin and marketing each have their own header.
5. **Selected states.** Nine selected-state looks across sub-navigation and chips.
6. **Cards.** Cards are keylined, hairlined or hairline-strong on the same kind of surface.
7. **List rows.** Only Schedule uses `ListRow`. Chat retypes it, Todo and Reviews hand-roll theirs, and Plan boxes every block.
8. **Widths.** Page widths: 440, 560, 720, 1040, 1120, 1600 and full bleed.
9. ~~**Undo toasts.**~~ Fixed: one `undoToast()`, one 10-second window.
10. **Errors.** Error handling differs everywhere: red toasts in Schedule, plain ones in Chat, and "reload the page" with no button in Reviews and Settings. No route has an `errorComponent`.
11. **Back.** Six back affordances.
12. **Section headings.** Five section-heading styles.
13. **Loading.** Three copies of `ListSkeleton`, one lone spinner, and pulsing in two places only.
14. **Form controls.** No shared form controls:
    - four search boxes and five text inputs;
    - native and Radix selects;
    - two switch knobs;
    - a sign-in button that isn't a `Button`.
15. **Small drift.** Plan uses raw `font-mono` instead of `ident`, and links use two different underline offsets.
