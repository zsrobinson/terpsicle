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
| Plan | `four-year/header.tsx:226-244` | The h1 wraps a **dropdown button** showing the plan's name, `font-semibold text-lg`, `h-11 md:h-8` (`:84-86`). Rename swaps in an input with `border-fg` (`:71`). | Inline "Saved in this browser" `text-muted text-sm` to the right of the title (`:201-223`), or `SyncStatusLabel` | Undo/Redo ghost icon-sm at `size-11 md:size-7` (`:166-196`) | none (the mark shows only on the empty state) |
| Plan empty | `four-year/empty-state.tsx:29-38` | h1 `text-xl tracking-tight` | `max-w-[640px] text-muted` | — | `Mark id="plan" size={40} className="mb-3"` |
| Marketing | `marketing/frame.tsx:9-27` | Its own **h-14** header (SiteHeader is h-12) with a ghost "Sign in" button to `/signin` | — | — | — |

Frame chrome:
- `SiteHeader` (`site-page.tsx:82-84`) has **no bottom border** on SitePage pages.

## 2. Sub-navigation within a product

| Where | Component | Selected look |
|---|---|---|
| Plan side panel tabs | `four-year/side-panel.tsx:110-143` (hand-rolled `aria-current`) | **Underline tabs**: `border-b-2 border-fg`, `h-11 md:h-9`, count `text-xs` |
| Plan phone semester strip | `four-year/board.tsx:288-306` | Bordered pills: `border-fg bg-accent-soft` vs `border-hairline bg-raised` |
| Course details grades (the scheduler's; Reviews shows only the bars) | Radiogroup chips (`course-details/grades.tsx:127-135`, `:184-195`) | `bg-hover font-medium` |
| Travel settings | `travel/travel-settings.tsx:46-72`, `:109-128` (segmented grid, `bg-panel p-0.5`) | `bg-raised ring-1 ring-hairline shadow-xs` |

## 3. Empty states and first visits

- **Shared `EmptyState`** (`panel.tsx:274`, `px-4 py-3 text-muted text-sm` + optional action). It is used only in Schedule panels:
  - Schedule: `courses-panel.tsx:137`, `blocks-panel.tsx:81`, `problems-panel.tsx:63`, `sections.tsx:121,214`, `export-panel.tsx:97`, `travel-panel.tsx:134`, `fix-list.tsx:39`, `search-panel.tsx:475`, `panel-load-boundary.tsx:50`.
- **Plan defines its own component, also named `EmptyState`** (`four-year/empty-state.tsx:24`). It is a full-page first visit:
  - Three `section` cards with `border-keyline bg-raised p-4 shadow-offset` (`:43`, `:89`, `:116`), h2 `text-lg`.
  - Full-width default buttons at `h-11 md:h-8`, and a native `<select>` (`:63-67`).
  - `max-w-[1040px] pt-[6vh]` (`:28`), with the Mark.
- **Schedule "Two ways to start"** (`courses/first-visit.tsx:15-83`):
  - Two stacked `fieldset` cards with `rounded-lg border-hairline bg-raised p-3` (`:76`). **No offset shadow**, and no mark.
  - h4 `text-base`. Default Buttons with a `text-sm` override (buttons are normally `text-base`) and `size-3.5` icons.
- Todo in-list empties:
  - "You're all caught up." `text-fg` (`:422`).
  - "Nothing due" `py-2 text-muted text-sm` (`todo-lists.tsx:113`, `:163`).
- **Settings**: `watching-list.tsx:41` (`text-muted text-sm`); "Signing in isn't available yet." bare `<p>` (`settings-account.tsx:147`, `notifications-page.tsx:55`).

## 4. Cards and boxes

- **Keyline + offset shadow** (`border-keyline … shadow-offset`):
  - Plan first-visit cards (`empty-state.tsx:43,89,116`)
  - Chat message hover toolbar (`message-row.tsx:419`)
  - Marketing `Sample` (`marketing/samples/sample.tsx:40`)
  - Outline and default Buttons (`button.tsx:19-20`)
- **Keyline + `shadow-pop`**: popover, menus, select, context menu (`components/ui/*`), sonner toasts (`sonner.tsx:18`), skip links, and the hand-rolled listboxes (`chat/composer.tsx:137`, `generate/course-field.tsx:213`).
- **Hairline + `shadow-pop` (the odd one)**:
  - `Dialog` (`components/ui/dialog.tsx:34`, `rounded-lg border-hairline`). Every other overlay uses keyline.
  - `course-field.tsx:264` hint popup.
- **Hairline box, no shadow**:
  - Schedule first-visit paths (`first-visit.tsx:76`)
  - Plan side panel (`side-panel.tsx:99`, `bg-raised`)
  - Plan semester columns (`board.tsx:143`, `:189`, `bg-panel`)
  - Plan template card (`template-panel.tsx:102`)
  - Plan import-check wrapper (`plan-page.tsx:150`)
  - **each Plan block** (`block.tsx:438-447`)
  - Travel (`connection-details.tsx:108`, `route-map.tsx:67`)
  - generate (`course-list.tsx:428`, `nothing-fits.tsx:73`)
- **None, hairline between rows**: Schedule and Reviews `ListRow`, Todo lists.

## 5. List rows

| Product | Row markup | Notes |
|---|---|---|
| Schedule | Shared `ListRow` (`courses-panel.tsx:206`, `:322`; `search-panel.tsx:377`; `sections.tsx:464`; `results.tsx:341`; `blocks-panel.tsx:149`; `travel-panel.tsx:220`; `registration-checklist.tsx:41`; `problems-panel.tsx:140`) | `px-4 py-2`, hairline between rows, lead/trail/action columns |
| Plan | Blocks are **individually boxed** `li`s (`block.tsx:438`, border + `bg-raised`, dashed for wildcards, inset warn bar). Side-panel rows are hand-rolled: search `li` `border-b pr-2` + inner `px-4 py-1.5` (`four-year/search-panel.tsx:76`); problems `px-4 py-2 border-b` (`problems-panel.tsx:36`); GenEd `px-4 py-1.5`, no border (`gen-ed-panel.tsx:51`) | Plan imports nothing from `app/panel` |

## 6. Loading states

- **Schedule**:
  - `PanelSkeleton` (`panel.tsx:333`) for every tab chunk.
  - `RowsSkeleton` (`courses-panel.tsx:482`) and travel `ListSkeleton` (`travel-panel.tsx:269`), which re-create near-identical row skeletons.
  - Top bar skeletons (`top-bar.tsx:125`, `term-switcher.tsx:27`, `app-shell.tsx:457`).
  - The drawer placeholder (`app-shell.tsx:173`).
  - Course details' review summary (`course-details/reviews.tsx:196-197`) is the only skeleton left that adds `animate-pulse`.
- **Plan**: A block-grid skeleton (`plan-page.tsx:87-96`: `h-8 w-48`, `h-64`, `h-96`); search `h-9` bars (`four-year/search-panel.tsx:333-335`); block title line (`block.tsx:344`).
- **Routes**: no `pendingComponent` or `errorComponent` on any route (only `notFoundComponent` in `__root.tsx:62` and the Reviews routes).

## 7. Error states and inline messages

- **Schedule**:
  - `CatalogError` (`app/catalog-error.tsx:41-73`): `role="alert"`, centered, `text-base text-fg`, outline sm button with RotateCw.
  - `PanelLoadBoundary` (`panel-load-boundary.tsx:48-66`): PanelHeader + EmptyState + outline sm Reload.
  - **`toast.error`** (red) for storage (`app.tsx:55,104`), clipboard (`export/actions.ts:30`), shared link (`app-shell.tsx:273`) and seat watches (`alerts/seat-watches.tsx:115-167`).
- **Plan**:
  - Search error: default `<p>` (`text-fg` 13px) + outline sm "Try again" (`four-year/search-panel.tsx:321-331`).
  - Import `role="alert" text-sm` (`import-panel.tsx:630`).
  - "Not saved" status in the header (`header.tsx:220`).
- **Todo**: form answers `role="status" text-fg text-sm` (`connect-form.tsx`, `file-drop.tsx`), and the feed problem is a `text-fg` paragraph with a link, which `InlineError` can't hold.
- **Settings**:
  - This device's answers mix success and failure in one `role="status" text-fg text-sm` line (`notification-settings.tsx`, `ThisDevice`).
  - Account menu failure `text-muted text-sm` (`account-button.tsx:242-247`).

## 8. Sheets, drawers, popovers, dialogs

- **vaul Drawer**:
  - Schedule phone sidebar (`app/mobile-drawer.tsx:256-290`): full `h-dvh`, z-40, no overlay, grabber `h-1 w-8` in an `h-6 w-16` hit area (`:410-416`).
  - Chat room info on phones, **built separately** (`chat/chat-page.tsx:322-354`): z-50, `bg-fg/20` overlay, `max-h-[85dvh]`, handle `h-1 w-10 mt-2`, its header the kit's panel `PageHeader`.
  - Plan, Todo, Reviews and Settings use no sheets. Plan's phone layout stacks its panel inline (`plan-page.tsx:157-171`).
- **Radix Popover** (`~/ui/popover`):
  - Account sign-in (`account-button.tsx:73`)
  - seat bell (`course-details/seat-bell.tsx:102`)
  - calendar entries and new block (`calendar/entries.tsx:411`, `calendar/new-block.tsx:101`)
  - color picker (`courses/color-picker.tsx:56`)
  - Chat composer (`composer.tsx:276`) and reaction picker (`message-row.tsx:359`)
- **Radix DropdownMenu**:
  - product, theme, account, term and plan-tab menus (app)
  - Plan doc and block menus (`four-year/header.tsx:96`, `block.tsx:159`), with a local `MENU_ITEM = "max-md:min-h-11"` (`block.tsx:58`)
  - courses row menu + ContextMenu (`courses-panel.tsx:430`, `:451`)
  - grades (`grades.tsx:141`), filter chips (`filter-chips.tsx:198`), chat message menu (`message-row.tsx:460`)
- **Radix Dialog**: used only by the PWA install dialog (`pwa/install-dialog.tsx:32`).
- **Hand-rolled listboxes** (not Popover): Chat @mentions (`chat/composer.tsx:133-137`) and generate course suggestions (`generate/course-field.tsx:209-213`, hint `:264`).
- **Select**:
  - Radix `Select` in Chat ("Rooms from", `room-list.tsx`), generate (`rank-by.tsx:52`, `must-haves.tsx:51`) and blocks (`block-form.tsx:198`).
  - **Native `<select>`** in Plan (`empty-state.tsx:63`, `template-panel.tsx:61`).

## 9. Toasts and undo

Fixed in `v2/kit-toasts`:
- Every toast action is the shared `ToastAction`, and every Undo goes through `undoToast()` (`components/ui/toast.tsx`) with one 10-second window.
- Failures use `noteToast()` and are never red.
- Still open: Todo's check-off has no Undo toast.

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
- **Height overrides fight the size scale**:
  - Plan uses `h-11 md:h-8`, `h-11 md:h-6`, `size-11 md:size-7` (for example `empty-state.tsx:79`, `header.tsx:179`, `four-year/search-panel.tsx`, `problems-panel.tsx:67`). Todo keeps `max-md:size-11` on its refresh icon and `max-md:h-11` on Connect ELMS, which sits beside a 44px `Input` on phones, until `Button` has a phone size for them.
  - Chat uses `max-md:h-11` and `max-md:size-11` (about 20 sites).
  - Settings uses neither.
- **Hand-rolled `<button>` elements with custom classes** (non-marketing), by folder:
  - app 18: rail, drawer tabs, plan tabs ×4, product menu, theme toggle, top-bar problems ×2, shared pill ×2, drill back, term switcher, toast actions ×2, `GroupHeader`.
  - calendar 9, course-details 8, generate 8, travel 8, chat 7, four-year 7, search 7, courses 5, blocks 4.
  - auth 3 (account triggers), reviews 3, todo 3, notifications 2, problems 2, sync 2, alerts 1, export 1, pwa 1.
  - Notable pseudo-buttons: `DoneFold` (`todo-lists.tsx:44`), Plan side tabs (`side-panel.tsx:117`), Plan doc menu (`header.tsx:84`), rating stars (`composer.tsx:325`), notification `ChannelSwitch` (`notification-settings.tsx:320`).
- ~~**Anchors styled as buttons**~~: fixed. `GoogleButton` is the kit's `Button` (`v3/signin-button`), and `AccountLink` is gone (the family bar's account menu).

## 11. Page widths and containers

- **SitePage layouts**: fixed in `v3/cohesion-settings-todo`. `SitePage` takes a `ProductPage` width: note (Settings, Notifications, sign-in, not found, coming soon, Todo's front door and connect page), reading (Privacy, Reviews), app (Todo's list). Plan's `wide` is `full` with a gutter until Plan moves onto the workbench.
- **Nested widths**:
  - Plan empty state 1040 `pt-[6vh]` inside 1600 (`empty-state.tsx:28`).
- **Schedule**: full-bleed shell, sidebar `w-sidebar` 320–480, rail 62px.
- **Others**: marketing uses `mk-wrap`. (Admin is on the kit's app width since `v3/cohesion-admin`.)

## 12. Account/avatar button and theme toggle placement

| Shell | Account entry | Theme toggle |
|---|---|---|
| Schedule, desktop | `AccountButton` dropdown in the top bar (`top-bar.tsx:63`; trigger `account-button.tsx:58-59`, `h-7 text-base`) or a Sign-in popover | Rail foot (`rail.tsx:43`), icon dropdown `size-8` |
| Schedule, phone | `PhoneMenu` with account and theme in one menu (`account-button.tsx:104-134`) | Inside the account menu (`:129`), or a standalone button when sign-in is off (`app-shell.tsx:109`) |
| Reviews, Settings, Notifications | `AccountLink` (`account-link.tsx`): avatar links to /settings, or "Sign in" goes straight to Google. `h-7 text-base`. | **None** |
| Plan | **Nothing** (`SitePage` with no `actions`, `plan-page.tsx:197`) | **None** |
| Todo | **Nothing** (`todo-page.tsx:61`) | **None** |
| Marketing | Ghost "Sign in" Button to `/signin` (`marketing/frame.tsx:19-23`) | None |

The theme can only be changed inside `/schedule` (the only uses are `ThemeToggle`/`ThemeMenuItems` in `app/` and `account-button.tsx`).

## 13. Duplicate implementations

- ~~**Two `EmptyState`s** with the same name: `app/panel.tsx:274` and `four-year/empty-state.tsx:24`.~~ Fixed in `v3/page-kit`: the panel's is `PanelNote`, and `EmptyState` is the kit's first-visit template. Plan's local one moves onto it in Plan's Phase 3 PR.
- **`Section`**: fixed. Reviews, Todo's connect page, Privacy and Settings use `PageSection`; panels keep `SectionHeader`.
- **One `ListSkeleton`**: `travel-panel.tsx:269`. Also `RowsSkeleton` (`courses-panel.tsx:482`) next to `PanelSkeleton`. (`v3/page-kit` added the shared shape, `RowSkeleton` and `PageSkeleton`, and `PanelSkeleton` uses it; the copies move over in each product's Phase 3 PR.)
- **Two `ToastAction`s**: `app/toast-action.tsx:5` and `four-year/toasts.tsx:16`. Four more inline copies are listed in §9.
- **Segmented controls, at least 3**: travel pace and extra-time (`travel-settings.tsx:46`, `:109`), Plan side tabs (underline style, `side-panel.tsx:110`), marketing reviews sample (`reviews-sample.tsx:118`).
- ~~**Switch knobs, 2**: `travel-settings.tsx:158` `Toggle` and `notification-settings.tsx:343` `Knob`. Identical markup except `mt-0.5`.~~ Fixed in `v3/page-kit`: both use `components/ui/switch.tsx` (Radix).
- **Toggle chips with different "on" looks**:
  - ink fill: `filter-chips.tsx:32-38`, `sections.tsx:163-172`, `block-form.tsx:89-97` presets
  - accent fill: `must-haves.tsx:161-172`, `block-form.tsx:130-140`, `results.tsx:272-281`
  - bg-hover: `grades.tsx:184-195`
- **Rail vs drawer tab buttons**: `rail.tsx:223-268` and `mobile-drawer.tsx:487-516`.
- **PanelHeader re-typed by hand**: Plan course panel back bar `course-panel.tsx:57-67`.
- **Search boxes, one style left** (Reviews, Chat and Schedule use `SearchField`):
  - Plan: a bare input `h-11 md:h-8 border-hairline-strong focus-visible:border-fg` (`four-year/search-panel.tsx:256`)
- **Text inputs** (no shared Input):
  - `h-11 md:h-8 focus-visible:border-fg` (Plan)
- **Account entry, 3**: `AccountButton`, `AccountLink`, and the marketing Sign-in.
- **Back affordances, one left** (Reviews, Chat, Todo's connect page and Notifications use `PageHeader`'s Back; Schedule's drill-in uses the kit's `BackButton`):
  - Plan ghost sm "← Back" (`course-panel.tsx:59-66`)
- **Mono text**: Plan uses raw `font-mono` everywhere (`block.tsx`, `four-year/search-panel.tsx`, `course-panel.tsx:73`, `import-panel.tsx`, `template-panel.tsx`). Every other feature uses the `ident` utility (`styles.css:560`), which also sets tabular numbers. `sidebar.tsx:383,395` also uses `font-mono`.
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
   - Plan's h1 is a `text-lg` dropdown button with the plan's name.
   - Schedule's h1 is the product menu.
   - Subtitle/status lines sit inline to the right (Plan "Saved in this browser").
4. **First visits looked like four different products.** Schedule, Todo and Chat now use the kit's `EmptyState`; Plan is left:
   - Plan: three keyline+offset cards, Mark 40, 1040px (`empty-state.tsx`).
5. **Site frame chrome differs.**
   - SiteHeader has no bottom border.
   - Marketing has its own h-14 header.
6. **Selected-state treatments for sub-nav are all different.**
   - Rail `bg-fg/10` + edge bar
   - Plan side tabs underline `border-b-2`
   - Plan strip `border-fg bg-accent-soft`
   - Todo segmented `bg-accent-soft` in a bordered strip
   - grades chips and plan tabs `bg-hover`
   - travel segmented `ring + shadow-xs`
   - filter chips ink-filled; must-have days accent-filled
7. **Card styles are mixed on the same kind of surface.**
   - Keyline + offset: Plan start cards.
   - Hairline: Schedule start cards, Settings sections, Plan side panel and semesters.
   - `Dialog` is the only overlay with a hairline border; popovers and menus use keyline.
8. **List rows are hand-rolled outside Schedule.**
   - Only Schedule uses `ListRow`.
   - Plan boxes every block individually, against ListRow's own rule "hairlines between rows, never boxes".
9. **Page widths jump between products.** 1600 (Plan), full-bleed (Chat, Schedule). (Reviews, Todo, Settings, sign-in, Chat's front door, admin and the site's pages take `ProductPage` widths.)
10. ~~**Toast Undo/Redo buttons have seven implementations.**~~ Fixed in `v2/kit-toasts`.
11. **Error handling differs by product.**
    - Schedule uses red `toast.error` and a `role=alert` block with a RotateCw retry.
    - (Every route shares one error state since `v3/route-states`; Reviews, Todo, Settings and Chat use `InlineError` with Try again.)
12. **Back navigation has one other form left:** Plan's "← Back" ghost button. (Reviews, Chat, Todo and Notifications use `PageHeader`'s Back; Schedule's drill-in uses `BackButton`.)
13. **Section headings under a page title differ.**
    - Todo DayList: `text-base`, rule below (the prototype's day list).
    - (Reviews, Todo's connect page, Settings and Privacy use `PageSection`.)
14. **Loading states are inconsistent.**
    - Skeleton shapes differ, and two `ListSkeleton` copies exist.
    - Plan shows a big grid of block skeletons.
15. **Form controls have no shared primitives.**
    - 2 search-box styles besides `SearchField` (`h-9` hairline in Schedule, a bare `h-11 md:h-8` input in Plan).
    - At least 5 text-input styles.
    - Native `<select>` (Plan) next to Radix Select (Chat, Schedule, Reviews, admin).
    - Two copies of the switch knob.
    - Touch targets use `h-11 md:h-8` (Plan, Todo) vs `max-md:h-11` (Chat) vs nothing (Settings).
