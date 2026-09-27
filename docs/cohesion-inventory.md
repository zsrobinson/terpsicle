# Interface inventory for the cohesion pass (Terpsicle)

A code audit of how each product builds the same kinds of things, taken on 2026-09-27 for `docs/COHESION.md`. Paths are relative to `src/`. Line numbers are as of that day. When a PR fixes an entry, it deletes that entry here.

Two global facts change how the diffs below should be read:
- **All corners are square.** `styles.css:145-154` sets every radius step to 0, so `rounded-md` and `rounded-lg` make no visible difference. Only `rounded-full` shows. Radius differences listed below are code noise, not visible differences.
- **The type scale is custom** (`styles.css:163-186`): `text-sm` = 12px, `text-base` = 13px, `text-lg` = 15px, `text-xl` = 18px. The comment there says `text-xl` is for "the first-visit headline only", but every non-Schedule page uses it for its h1.

Shared primitives:
- `components/ui/`: `button`, `skeleton`, `popover`, `dialog`, `dropdown-menu`, `context-menu`, `select`, `sonner`, `tooltip`, `kbd`.
- Panel anatomy in `app/panel.tsx`: `PanelHeader` :20, `PanelBody` :44, `SectionHeader` :78, `GroupHeader` :153, `ListRow` :221, `EmptyState` :274, `PanelFooter` :296, `PanelSkeleton` :333. (Fixed in `v3/page-kit`: `ListRow` and `GroupHeader` moved to `components/ui/list-row.tsx`, `PanelHeader` is `PageHeader size="panel"`, `EmptyState` is `PanelNote`.)
- Frame in `features/site/site-page.tsx`: `SitePage`, `SiteHeader`, `ComingSoonPage`. (Fixed in `v3/cohesion-settings-todo`: `SitePage` is the family bar over `ProductPage`, and `ComingSoonPage` uses `PageHeader`.)
- ~~**There is no shared Input, Switch, SegmentedControl, PageHeader or Card.**~~ Fixed in `v3/page-kit`: the page kit in `components/ui` (see `/admin/kit`).

---

## 1. Page and app headers, page titles

| Product | Where | Title markup | Subtitle/status | Right-side actions | Product mark |
|---|---|---|---|---|---|
| Schedule | `app/top-bar.tsx:46-48` | The h1 is the ProductMenu (umbrella mark + wordmark, `app/product-menu.tsx:46-60`). There is no page title. Panels use `PanelHeader` h2 `font-semibold text-base` (`panel.tsx:30-35`). | `PanelHeader` sub: `text-muted text-sm` | Credits, problems, sync and AccountButton in the top bar; panel `right` slot | Umbrella only |
| Marketing | `marketing/frame.tsx:9-27` | Its own **h-14** header (SiteHeader is h-12) with a ghost "Sign in" button to `/signin` | — | — | — |

Frame chrome:
- `SiteHeader` (`site-page.tsx:82-84`) has **no bottom border** on SitePage pages.

## 2. Sub-navigation within a product

| Where | Component | Selected look |
|---|---|---|
| Course details grades (the scheduler's; Reviews shows only the bars) | Radiogroup chips (`course-details/grades.tsx:127-135`, `:184-195`) | `bg-hover font-medium` |
| Travel settings | `travel/travel-settings.tsx:46-72`, `:109-128` (segmented grid, `bg-panel p-0.5`) | `bg-raised ring-1 ring-hairline shadow-xs` |

## 3. Empty states and first visits

- **Shared `EmptyState`** (`panel.tsx:274`, `px-4 py-3 text-muted text-sm` + optional action). It is used only in Schedule panels:
  - Schedule: `courses-panel.tsx:137`, `blocks-panel.tsx:81`, `problems-panel.tsx:63`, `sections.tsx:121,214`, `export-panel.tsx:97`, `travel-panel.tsx:134`, `fix-list.tsx:39`, `search-panel.tsx:475`, `panel-load-boundary.tsx:50`.
- **Schedule "Two ways to start"** (`courses/first-visit.tsx:15-83`):
  - Two stacked `fieldset` cards with `rounded-lg border-hairline bg-raised p-3` (`:76`). **No offset shadow**, and no mark.
  - h4 `text-base`. Default Buttons with a `text-sm` override (buttons are normally `text-base`) and `size-3.5` icons.
- Todo in-list empties:
  - "You're all caught up." `text-fg` (`:422`).
  - "Nothing due" `py-2 text-muted text-sm` (`todo-lists.tsx:113`, `:163`).
- **Settings**: `watching-list.tsx:41` (`text-muted text-sm`); "Signing in isn't available yet." bare `<p>` (`settings-account.tsx:147`, `notifications-page.tsx:55`).

## 4. Cards and boxes

- **Keyline + offset shadow** (`border-keyline … shadow-offset`):
  - Chat message hover toolbar (`message-row.tsx:419`)
  - Marketing `Sample` (`marketing/samples/sample.tsx:40`)
  - Outline and default Buttons (`button.tsx:19-20`)
- **Keyline + `shadow-pop`**: popover, menus, select, context menu (`components/ui/*`), sonner toasts (`sonner.tsx:18`), skip links, and the hand-rolled listboxes (`chat/composer.tsx:137`, `generate/course-field.tsx:213`).
- **Hairline + `shadow-pop` (the odd one)**:
  - `Dialog` (`components/ui/dialog.tsx:34`, `rounded-lg border-hairline`). Every other overlay uses keyline.
  - `course-field.tsx:264` hint popup.
- **Hairline box, no shadow**:
  - Schedule first-visit paths (`first-visit.tsx:76`)
  - Plan's canvas: its semester columns (`board.tsx`), its blocks (`block.tsx`) and the import check beside the paste (`plan-page.tsx`). They stay boxed: things you drag and drop on a canvas, like the calendar's blocks (`v3/cohesion-plan`).
  - Travel (`connection-details.tsx:108`, `route-map.tsx:67`)
  - generate (`course-list.tsx:428`, `nothing-fits.tsx:73`)
- **None, hairline between rows**: Schedule and Reviews `ListRow`, Todo lists.

## 5. List rows

| Product | Row markup | Notes |
|---|---|---|
| Schedule | Shared `ListRow` (`courses-panel.tsx:206`, `:322`; `search-panel.tsx:377`; `sections.tsx:464`; `results.tsx:341`; `blocks-panel.tsx:149`; `travel-panel.tsx:220`; `registration-checklist.tsx:41`; `problems-panel.tsx:140`) | `px-4 py-2`, hairline between rows, lead/trail/action columns |
| Plan | Search, Problems and GenEd rows are `ListRow`s, GenEd's groups `GroupHeader`s (`v3/cohesion-plan`). Blocks on the board stay boxed: canvas items, like calendar blocks | Each view sits in `PanelHeader` and `PanelBody` (`four-year/views.tsx`) |

## 6. Loading states

- **Schedule**:
  - `PanelSkeleton` (`panel.tsx:333`) for every tab chunk. (Courses, Travel and Export use the kit's `RowSkeleton` or `PanelSkeleton` since `v3/behavior`; nothing pulses.)
  - Top bar skeletons (`top-bar.tsx:125`, `term-switcher.tsx:27`, `app-shell.tsx:457`).
  - The drawer placeholder (`app-shell.tsx:173`).
- **Routes**: no `pendingComponent` or `errorComponent` on any route (only `notFoundComponent` in `__root.tsx:62` and the Reviews routes).

## 7. Error states and inline messages

- ~~**Schedule**~~: fixed in `v3/behavior`. `CatalogError`, `PanelLoadBoundary`, Generate's failure, PlanetTerp's and Export's use `InlineError` (with Reload where only a new version helps), and failures are `noteToast`s, never red.
- **Plan**: `InlineError` for Search, the sample plans (with Try again) and the import; "Not saved" is the bar's status (`plan-bar.tsx`).
- **Todo**: form answers `role="status" text-fg text-sm` (`connect-form.tsx`, `file-drop.tsx`), and the feed problem is a `text-fg` paragraph with a link, which `InlineError` can't hold.
- **Settings**:
  - This device's answers mix success and failure in one `role="status" text-fg text-sm` line (`notification-settings.tsx`, `ThisDevice`).
  - Account menu failure `text-muted text-sm` (`account-button.tsx:242-247`).

## 8. Sheets, drawers, popovers, dialogs

- **vaul Drawer**:
  - The workbench's phone sidebar (`app/workbench/drawer.tsx`), for Schedule (`app/mobile-drawer.tsx`) and Plan (`four-year/plan-drawer.tsx`): full `h-dvh`, z-40, no overlay, grabber `h-1 w-8` in an `h-6 w-16` hit area.
  - Chat room info on phones, **built separately** (`chat/chat-page.tsx:322-354`): z-50, `bg-fg/20` overlay, `max-h-[85dvh]`, handle `h-1 w-10 mt-2`, its header the kit's panel `PageHeader`.
  - Todo, Reviews and Settings use no sheets.
- **Radix Popover** (`~/ui/popover`):
  - Account sign-in (`account-button.tsx:73`)
  - seat bell (`course-details/seat-bell.tsx:102`)
  - calendar entries and new block (`calendar/entries.tsx:411`, `calendar/new-block.tsx:101`)
  - color picker (`courses/color-picker.tsx:56`)
  - Chat composer (`composer.tsx:276`) and reaction picker (`message-row.tsx:359`)
- **Radix DropdownMenu**:
  - product, theme, account, term and plan-tab menus (app)
  - Plan doc and block menus (`four-year/plan-bar.tsx`, `block.tsx`)
  - courses row menu + ContextMenu (`courses-panel.tsx:430`, `:451`)
  - grades (`grades.tsx:141`), filter chips (`filter-chips.tsx:198`), chat message menu (`message-row.tsx:460`)
- **Radix Dialog**: used only by the PWA install dialog (`pwa/install-dialog.tsx:32`).
- **Hand-rolled listboxes** (not Popover): Chat @mentions (`chat/composer.tsx:133-137`) and generate course suggestions (`generate/course-field.tsx:209-213`, hint `:264`).
- **Select**:
  - Radix `Select` in Chat ("Rooms from", `room-list.tsx`), generate (`rank-by.tsx:52`, `must-haves.tsx:51`) and blocks (`block-form.tsx:198`).
  - Plan's start semester is the kit's `Select` too (`four-year/first-term-select.tsx`).

## 9. Toasts and undo

Fixed in `v2/kit-toasts`:
- Every toast action is the shared `ToastAction`, and every Undo goes through `undoToast()` (`components/ui/toast.tsx`) with one 10-second window.
- Failures use `noteToast()` and are never red.
- Todo's check-off, Chat's Discard and the admin's pinned note have the same `undoToast` since `v3/behavior-undo`.

## 10. Buttons

Shared `Button` (`components/ui/button.tsx`) in product code (excluding marketing samples): **129 uses**.

- **By variant**: ghost 50, outline 43, default 26, link 6, conditional 3 (`course-details` `kind`, admin `suggestion`, Plan `placed`).
- **By size**: sm 47, default 40, icon-sm 21, row 19, icon 2.
- **Per product**:
  - Schedule (app, blocks, calendar, course-details, courses, generate, problems, travel): default 8, outline 15, ghost 8, link 2.
  - Chat: ghost 14, outline 7, link 4, default 3. Plus `buttonVariants` on an anchor (`chat/course-entry.tsx:52`).
  - Plan: default 7, ghost 8, outline 4, conditional 1.
  - Todo: ghost 5, default 2, outline 2.
  - Settings (auth + notifications): outline 6, ghost 2.
  - PWA: 4. Site: 3. Admin: 13.
- **Height overrides fight the size scale**: `Button`, `SelectTrigger` and menu items are 44px on phones from the kit now (`v3/touch-targets`), so the overrides on them are redundant. What's left, all in files other PRs had open:
  - Todo's refresh icon (`todo/todo-page.tsx`, `max-md:-my-3 max-md:size-11`), Chat's `room-view.tsx` (4) and Reviews' `composer.tsx` `SELECT_TRIGGER`.
  - Overrides on raw elements the kit doesn't size stay: Chat's reaction chips, "N replies", the term menu and row links; `ListRow`/`GroupHeader` links with `max-md:min-h-11`; Plan's semester footer links (`four-year/column-links.tsx`).
- **Hand-rolled `<button>` elements with custom classes** (non-marketing), by folder:
  - app 18: rail and drawer tabs (the workbench's, one each for Schedule and Plan), plan tabs ×4, product menu, theme toggle, top-bar problems ×2, shared pill ×2, drill back, term switcher, toast actions ×2, `GroupHeader`.
  - calendar 9, course-details 8, generate 8, travel 8, chat 7, four-year 6, search 7, courses 5, blocks 4.
  - auth 3 (account triggers), reviews 3, todo 3, notifications 2, problems 2, sync 2, alerts 1, export 1, pwa 1.
  - Notable pseudo-buttons: `DoneFold` (`todo-lists.tsx:44`), Plan doc menu (`plan-bar.tsx`, styled as the scheduler's plan tab), rating stars (`composer.tsx:325`), notification `ChannelSwitch` (`notification-settings.tsx:320`).
- ~~**Anchors styled as buttons**~~: fixed. `GoogleButton` is the kit's `Button` (`v3/signin-button`), and `AccountLink` is gone (the family bar's account menu).

## 11. Page widths and containers

- **SitePage layouts**: fixed in `v3/cohesion-settings-todo`. `SitePage` takes a `ProductPage` width: note (Settings, Notifications, sign-in, not found, coming soon, Todo's front door and connect page), reading (Privacy, Reviews), app (Todo's list). Plan's first visit is a note page, and its board the workbench's canvas; `wide` is gone.
- **Nested widths**:
- **Schedule and Plan**: the full-bleed workbench (`app/workbench/layout.tsx`), sidebar `w-sidebar` 320–480, rail 62px.
- **Others**: marketing uses `mk-wrap`. (Admin is on the kit's app width since `v3/cohesion-admin`.)

## 12. Account/avatar button and theme toggle placement

| Shell | Account entry | Theme toggle |
|---|---|---|
| Schedule, desktop | `AccountButton` dropdown in the top bar (`top-bar.tsx:63`; trigger `account-button.tsx:58-59`, `h-7 text-base`) or a Sign-in popover | Rail foot (`rail.tsx:43`), icon dropdown `size-8` |
| Schedule, phone | `PhoneMenu` with account and theme in one menu (`account-button.tsx:104-134`) | Inside the account menu (`:129`), or a standalone button when sign-in is off (`app-shell.tsx:109`) |
| Reviews, Settings, Notifications | `AccountLink` (`account-link.tsx`): avatar links to /settings, or "Sign in" goes straight to Google. `h-7 text-base`. | **None** |
| Todo | **Nothing** (`todo-page.tsx:61`) | **None** |
| Marketing | Ghost "Sign in" Button to `/signin` (`marketing/frame.tsx:19-23`) | None |

The theme can only be changed inside `/schedule` (the only uses are `ThemeToggle`/`ThemeMenuItems` in `app/` and `account-button.tsx`).

## 13. Duplicate implementations

- ~~**Two `EmptyState`s** with the same name: `app/panel.tsx:274` and `four-year/empty-state.tsx:24`.~~ Fixed in `v3/page-kit`: the panel's is `PanelNote`, and `EmptyState` is the kit's first-visit template. Plan's local one moved onto it in `v3/cohesion-plan` (`four-year/first-visit.tsx`).
- **`Section`**: fixed. Reviews, Todo's connect page, Privacy and Settings use `PageSection`; panels keep `SectionHeader`.
- ~~**One `ListSkeleton`**: `travel-panel.tsx:269`. Also `RowsSkeleton` (`courses-panel.tsx:482`) next to `PanelSkeleton`.~~ Fixed in `v3/behavior`: both are the kit's `RowSkeleton`.
- ~~**Two `ToastAction`s**~~: fixed in `v2/kit-toasts` (§9); Plan's toasts use the kit's.
- **Segmented controls, at least 2**: travel pace and extra-time (`travel-settings.tsx:46`, `:109`), marketing reviews sample (`reviews-sample.tsx:118`).
- ~~**Switch knobs, 2**: `travel-settings.tsx:158` `Toggle` and `notification-settings.tsx:343` `Knob`. Identical markup except `mt-0.5`.~~ Fixed in `v3/page-kit`: both use `components/ui/switch.tsx` (Radix).
- **Toggle chips with different "on" looks**:
  - ink fill: `filter-chips.tsx:32-38`, `sections.tsx:163-172`, `block-form.tsx:89-97` presets
  - accent fill: `must-haves.tsx:161-172`, `block-form.tsx:130-140`, `results.tsx:272-281`
  - bg-hover: `grades.tsx:184-195`
- **Rail vs drawer tab buttons**: `RailButton` and `DrawerTab` (`app/workbench/rail.tsx`, `drawer.tsx`), one each for every workbench.
- **Search boxes, one style left** (Reviews, Chat and Schedule use `SearchField`):
- **Text inputs** (no shared Input):
- **Account entry, 3**: `AccountButton`, `AccountLink`, and the marketing Sign-in.
- ~~**Back affordances**~~: fixed. Reviews, Chat, Todo's connect page and Notifications use `PageHeader`'s Back; Schedule's and Plan's drill-ins use the workbench's `DrillBackBar` with the kit's `BackButton`.
- ~~**Mono text**~~: fixed in `v3/cohesion-plan`. Plan uses the `ident` utility (`styles.css:560`), like every other feature.
- ~~**Link underline offset**: Todo and Settings use `underline-offset-4`.~~ Fixed in `v3/cohesion-settings-todo`: their links use `underline-offset-2`, like everywhere else.

---

## Top 15 inconsistencies, most visible first

1. ~~**Plan and Todo have no account entry at all, and there is no theme control outside Schedule.**~~ Fixed in `v3/app-bar`: every page has the family bar with one account menu, which holds the theme.
2. ~~**Four different account/avatar entries.**~~ Fixed in `v3/app-bar`: one `AccountButton` menu. `AccountLink` and Chat's avatar link are gone. The marketing page's Sign in is still its own.
   - `AccountButton` dropdown (Schedule, `h-7 text-base`)
   - `AccountLink` (Reviews and Settings, `h-7 text-base`, links to /settings)
   - Chat's hand-rolled anchor (`h-8 text-sm`, `max-md:h-11`)
   - Marketing's ghost Button to `/signin`
3. **Page titles don't share a pattern.**
   - `text-xl` h1 on the front doors. (Reviews, Todo, Settings, Notifications, sign-in, Privacy and not found use `PageHeader`.)
   - Schedule's h1 is the product menu.
4. ~~**First visits looked like four different products.**~~ Fixed: Schedule, Todo, Chat and Plan use the kit's `EmptyState`.
5. **Site frame chrome differs.**
   - SiteHeader has no bottom border.
   - Marketing has its own h-14 header.
6. **Selected-state treatments for sub-nav are all different.**
   - Rail `bg-fg/10` + edge bar
   - Todo segmented `bg-accent-soft` in a bordered strip
   - grades chips and plan tabs `bg-hover`
   - travel segmented `ring + shadow-xs`
   - filter chips ink-filled; must-have days accent-filled
7. **Card styles are mixed on the same kind of surface.**
   - Hairline: Schedule start cards, Settings sections, Plan semesters.
   - `Dialog` is the only overlay with a hairline border; popovers and menus use keyline.
8. **List rows are hand-rolled outside Schedule.**
   - Only Schedule uses `ListRow`.
   - (Plan's panels use `ListRow`; its blocks are canvas items, boxed like calendar blocks.)
9. **Page widths jump between products.** Full-bleed (Chat, and the Schedule and Plan workbenches). (Reviews, Todo, Settings, sign-in, Chat's front door, admin and the site's pages take `ProductPage` widths.)
10. ~~**Toast Undo/Redo buttons have seven implementations.**~~ Fixed in `v2/kit-toasts`.
11. ~~**Error handling differs by product.**~~ Fixed in `v3/behavior`: every route shares one error state, every product (the scheduler's catalog and lazy panels included) uses `InlineError` with Try again, or Reload where only a new version helps, and failures in toasts are `noteToast`s. Plan's are on `InlineError` since #144.
12. ~~**Back navigation had several forms.**~~ Fixed: Reviews, Chat, Todo and Notifications use `PageHeader`'s Back; Schedule's and Plan's drill-ins use `BackButton` in the workbench's `DrillBackBar`.
13. **Section headings under a page title differ.**
    - Todo DayList: `text-base`, rule below (the prototype's day list).
    - (Reviews, Todo's connect page, Settings and Privacy use `PageSection`.)
14. ~~**Loading states are inconsistent.**~~ Fixed: every product loads with the kit's skeletons (Plan since #144, the scheduler's copies since `v3/behavior`).
15. **Form controls have no shared primitives.**
    - 1 search-box style besides `SearchField` (`h-9` hairline in Schedule).
    - At least 5 text-input styles.
    - Native `<select>` is left only in the marketing page's plan sample (`marketing/samples/plan-sample.tsx`); the products use Radix Select.
    - Two copies of the switch knob.
    - Touch targets: the kit's controls are 44px on phones (`v3/touch-targets`); a few per-page overrides remain (see "Height overrides fight the size scale" above).
