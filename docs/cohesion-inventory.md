# Interface inventory for the cohesion pass (Terpsicle)

A code audit of how each product builds the same kinds of things, taken on 2026-09-27 for `docs/COHESION.md`. Paths are relative to `src/`. Line numbers are as of that day. When a PR fixes an entry, it deletes that entry here.

Two global facts change how the diffs below should be read:
- **All corners are square.** `styles.css:145-154` sets every radius step to 0, so `rounded-md` and `rounded-lg` make no visible difference. Only `rounded-full` shows. Radius differences listed below are code noise, not visible differences.
- **The type scale is custom** (`styles.css:163-186`): `text-sm` = 12px, `text-base` = 13px, `text-lg` = 15px, `text-xl` = 18px. The comment there says `text-xl` is for "the first-visit headline only", but every non-Schedule page uses it for its h1.

Shared primitives:
- `components/ui/`: `button`, `skeleton`, `popover`, `dialog`, `dropdown-menu`, `context-menu`, `select`, `sonner`, `tooltip`, `kbd`.
- Panel anatomy in `app/panel.tsx`: `PanelHeader` :20, `PanelBody` :44, `SectionHeader` :78, `GroupHeader` :153, `ListRow` :221, `EmptyState` :274, `PanelFooter` :296, `PanelSkeleton` :333.
- Frame in `features/site/site-page.tsx`: `SitePage` :39, `SiteHeader` :71, `ComingSoonPage` :133.
- **There is no shared Input, Switch, SegmentedControl, PageHeader or Card.**

---

## 1. Page and app headers, page titles

| Product | Where | Title markup | Subtitle/status | Right-side actions | Product mark |
|---|---|---|---|---|---|
| Schedule | `app/top-bar.tsx:46-48` | The h1 is the ProductMenu (umbrella mark + wordmark, `app/product-menu.tsx:46-60`). There is no page title. Panels use `PanelHeader` h2 `font-semibold text-base` (`panel.tsx:30-35`). | `PanelHeader` sub: `text-muted text-sm` | Credits, problems, sync and AccountButton in the top bar; panel `right` slot | Umbrella only |
| Schedule first visit | `features/courses/first-visit.tsx:22-27` | **h3** `font-semibold text-xl`. It sits inside a panel whose h2 is `text-base`, so the h3 is larger than its parent. | `mt-0.5 text-muted text-sm` "Two ways to start…" | none | none |
| Reviews | `features/reviews/frame.tsx:77-90` (shared `PageTitle`) | h1 `font-semibold text-xl tracking-tight`, `mb-4` | `mt-0.5 text-muted` (13px). Breadcrumbs sit above (`frame.tsx:49-74`, `mb-3 text-sm`). | none (instructor page adds a rating block below, `instructor-page.tsx:230-245`) | none |
| Chat, signed in | `chat/room-list.tsx:42`, `chat/course-space.tsx:57-78`, `chat/room-view.tsx:160-222` | **No h1.** The list uses `PanelHeader` h2 text-base. The room header is a hand-rolled copy of PanelHeader's classes (`min-h-12 … border-b px-4 py-2`, h2 `truncate font-semibold text-base`). | The list sub is two Radix Selects (`room-list.tsx:132-205`) | Join/Leave (`course-space.tsx:223-288`); info/menu icons in the room | none |
| Chat front door | `chat/sign-in-moment.tsx:16-31`, `:38-53` | h1 `text-xl tracking-tight` | `text-fg` tagline | — | `Mark id="chat" size={40}` |
| Plan | `four-year/header.tsx:226-244` | The h1 wraps a **dropdown button** showing the plan's name, `font-semibold text-lg`, `h-11 md:h-8` (`:84-86`). Rename swaps in an input with `border-fg` (`:71`). | Inline "Saved in this browser" `text-muted text-sm` to the right of the title (`:201-223`), or `SyncStatusLabel` | Undo/Redo ghost icon-sm at `size-11 md:size-7` (`:166-196`) | none (the mark shows only on the empty state) |
| Plan empty | `four-year/empty-state.tsx:29-38` | h1 `text-xl tracking-tight` | `max-w-[640px] text-muted` | — | `Mark id="plan" size={40} className="mb-3"` |
| Todo | `todo/todo-page.tsx:362-384` | h1 "Todo" `text-xl tracking-tight` | `text-muted text-sm` status with a ghost icon-sm refresh button inline (`:365-371`) | ViewSwitch plus a hand-rolled "ELMS link" anchor (`:376-378`) | none |
| Todo front door | `todo-page.tsx:132-139` | h1 "Terpsicle Todo" `text-xl` | `text-fg` + `text-muted text-sm` | — | **none** (Chat's and Plan's front doors have one) |
| Todo connect | `todo/connect-page.tsx:207-214` | h1 `text-xl`; a plain "Todo" text link above it (`text-muted text-sm`, no icon) | — | — | none |
| Settings | `auth/settings-account.tsx:52` | h1 `mb-4 text-xl tracking-tight` | none | — | none |
| Notifications | `notifications/notifications-page.tsx:26-37` | A "‹ Settings" back link (ChevronLeft, `hover:underline`) above h1 `text-xl` | none | — | none |
| Privacy / Not found / Coming soon | `site/privacy-page.tsx:24`, `site/not-found-page.tsx:8`, `site-page.tsx:142` | h1 `text-xl tracking-tight` (`mb-1.5`); privacy sets `text-fg` explicitly | `text-muted` / `text-sm` | — | none |
| Admin | `admin/admin-frame.tsx:31-58` | Its own header (h-12, `border-b`, `Logo compact`, "Admin" `font-semibold`). No product nav. | — | Ghost sm nav | none |
| Marketing | `marketing/frame.tsx:9-27` | Its own **h-14** header (SiteHeader is h-12) with a ghost "Sign in" button to `/signin` | — | — | — |

Frame chrome:
- `SiteHeader` (`site-page.tsx:82-84`) has **no bottom border** on SitePage pages. Chat passes `border-hairline border-b` (`chat-page.tsx:49`).
- Chat also has **no footer**. Other SitePage pages get a "Privacy" footer (`site-page.tsx:55-61`).

## 2. Sub-navigation within a product

| Where | Component | Selected look |
|---|---|---|
| Schedule rail | `app/rail.tsx:77-97` (hand-rolled buttons, `aria-pressed`) | `bg-fg/10` plus a 2px edge bar; icon 17 over a `text-2xs` label |
| Schedule phone drawer tabs | `app/mobile-drawer.tsx:473-516` (`DrawerTab`, a second copy of the rail button) | `bg-fg/10`, no edge bar |
| Schedule plan tabs (top bar) | `app/plan-tabs.tsx:113-131` | `bg-hover`, `font-medium` |
| Schedule drill-in back bar | `app/sidebar.tsx:370-399` | ChevronLeft + muted label, then current name `font-medium text-base` |
| Plan side panel tabs | `four-year/side-panel.tsx:110-143` (hand-rolled `aria-current`) | **Underline tabs**: `border-b-2 border-fg`, `h-11 md:h-9`, count `text-xs` |
| Plan phone semester strip | `four-year/board.tsx:288-306` | Bordered pills: `border-fg bg-accent-soft` vs `border-hairline bg-raised` |
| Todo views | `todo/todo-page.tsx:177-213` `ViewSwitch` (fieldset, `border-hairline-strong`) | `bg-accent-soft font-medium`, `h-11 md:h-7` |
| Reviews | No product nav. Breadcrumbs (`frame.tsx:49`), a bottom "More" links row (`home-page.tsx:211-227`), and instructor course chips (`instructor-page.tsx:258-293`) | Chips: `bg-accent-soft font-medium`, no border |
| Reviews / course details grades | Radiogroup chips (`course-details/grades.tsx:127-135`, `:184-195`) | `bg-hover font-medium` |
| Chat room list | `chat/room-list.tsx:84-130` (course group buttons) + `chat/room-row.tsx:81-117` + `GroupHeader` (course space) | Current row `bg-accent-soft`; unread pill `bg-accent` |
| Settings | Rows of `AccountSection`s; one hand-rolled link row to Notifications (`settings-account.tsx:64-72`, ChevronRight) | — |
| Admin | `admin-frame.tsx:40-55` (ghost Button + `bg-hover`); queue view switch `admin/queue-page.tsx:325-336` (**outline when on, ghost when off**) | mixed |
| Travel settings | `travel/travel-settings.tsx:46-72`, `:109-128` (segmented grid, `bg-panel p-0.5`) | `bg-raised ring-1 ring-hairline shadow-xs` |

## 3. Empty states and first visits

- **Shared `EmptyState`** (`panel.tsx:274`, `px-4 py-3 text-muted text-sm` + optional action). It is used only in Schedule panels and Chat:
  - Schedule: `courses-panel.tsx:137`, `blocks-panel.tsx:81`, `problems-panel.tsx:63`, `sections.tsx:121,214`, `export-panel.tsx:97`, `travel-panel.tsx:134`, `fix-list.tsx:39`, `search-panel.tsx:475`, `panel-load-boundary.tsx:50`.
  - Chat: `room-list.tsx:47`.
- **Plan defines its own component, also named `EmptyState`** (`four-year/empty-state.tsx:24`). It is a full-page first visit:
  - Three `section` cards with `border-keyline bg-raised p-4 shadow-offset` (`:43`, `:89`, `:116`), h2 `text-lg`.
  - Full-width default buttons at `h-11 md:h-8`, and a native `<select>` (`:63-67`).
  - `max-w-[1040px] pt-[6vh]` (`:28`), with the Mark.
- **Schedule "Two ways to start"** (`courses/first-visit.tsx:15-83`):
  - Two stacked `fieldset` cards with `rounded-lg border-hairline bg-raised p-3` (`:76`). **No offset shadow**, and no mark.
  - h4 `text-base`. Default Buttons with a `text-sm` override (buttons are normally `text-base`) and `size-3.5` icons.
- **Chat "Pick a room to start talking."** (`chat-page.tsx:197-199`): a bare `main` with centered `text-muted text-sm`. It does not use `EmptyState`.
- Chat's other empties are ad hoc:
  - `NoRooms` (`room-list.tsx:212-229`): paragraph + CourseFinder + outline sm link button.
  - "No messages yet…" (`room-view.tsx:434`): centered `px-4 py-6`.
  - Room-view `<p className="px-4 py-4 text-muted text-sm">` states (`:227`, `:284-296`).
- **Chat front door** (`sign-in-moment.tsx:16-31`): `max-w-[440px] pt-[10vh]`, Mark 40, a bulleted list, `GoogleButton` at full width.
- **Todo front door** (`todo-page.tsx:129-168`):
  - `max-w-[560px] pt-[8vh]`, no Mark.
  - GoogleButton inside a `max-w-[320px]` wrapper.
  - A sample list in a `figure` with `border-hairline bg-raised` (`:144`).
- Todo in-list empties:
  - "You're all caught up." `text-fg` (`:422`).
  - "Nothing due" `py-2 text-muted text-sm` (`todo-lists.tsx:113`, `:163`).
  - InlineConnect h2 `text-lg` section (`todo-page.tsx:242-265`).
- **Reviews**: no first-visit state; the home page is the search. Empties are bare `<p className="text-muted">` at 13px:
  - `course-page.tsx:111,123,156`
  - `instructor-page.tsx:121,230`
  - `mine-page.tsx:58-69`
  - Search "No course matches" rows `px-2.5 py-2 text-muted text-sm` (`home-page.tsx:349`).
- **Settings**: `watching-list.tsx:41` (`text-muted text-sm`); "Signing in isn't available yet." bare `<p>` (`settings-account.tsx:147`, `notifications-page.tsx:55`).
- **ComingSoonPage** (`site-page.tsx:133-147`, used by `TodoOff`): h1 + muted p + `OpenScheduleButton`. No mark, and the column is 560 wide.

## 4. Cards and boxes

- **Keyline + offset shadow** (`border-keyline … shadow-offset`):
  - Plan first-visit cards (`empty-state.tsx:43,89,116`)
  - Reviews composer (`reviews/composer.tsx:153`)
  - Chat "Before you post" card (`room-view.tsx:392`)
  - Chat message hover toolbar (`message-row.tsx:419`)
  - Marketing `Sample` (`marketing/samples/sample.tsx:40`)
  - Outline and default Buttons (`button.tsx:19-20`)
- **Keyline + `shadow-pop`**: popover, menus, select, context menu (`components/ui/*`), sonner toasts (`sonner.tsx:18`), skip links, and the hand-rolled listboxes (`chat/composer.tsx:137`, `generate/course-field.tsx:213`).
- **Hairline + `shadow-pop` (the odd one)**:
  - `Dialog` (`components/ui/dialog.tsx:34`, `rounded-lg border-hairline`). Every other overlay uses keyline.
  - `course-field.tsx:264` hint popup.
- **Hairline box, no shadow**:
  - Schedule first-visit paths (`first-visit.tsx:76`)
  - Settings `AccountSection` (`auth/account-page.tsx:52`)
  - Todo sample figure (`todo-page.tsx:144`)
  - Plan side panel (`side-panel.tsx:99`, `bg-raised`)
  - Plan semester columns (`board.tsx:143`, `:189`, `bg-panel`)
  - Plan template card (`template-panel.tsx:102`)
  - Plan import-check wrapper (`plan-page.tsx:150`)
  - **each Plan block** (`block.tsx:438-447`)
  - Travel (`connection-details.tsx:108`, `route-map.tsx:67`)
  - generate (`course-list.tsx:428`, `nothing-fits.tsx:73`)
  - admin (`health-header.tsx:27`, `queue-page.tsx:406`, `chat-remove.tsx:64`, `decisions-page.tsx:155,270`)
  - Reviews `OwnReviewCard` (`review-card.tsx:124-126`, hairline, or dashed hairline-strong)
- **Hairline-strong box**:
  - Reviews `SignInPrompt` (`sign-in-prompt.tsx:11`)
  - Reviews `ReportForm` (`report-button.tsx:101`)
  - Chat report form (`message-row.tsx:592`, `bg-bg`)
- **None, hairline between rows**: Schedule `ListRow`, Reviews lists, Todo lists, `ReviewCard` (`review-card.tsx:65`).

## 5. List rows

| Product | Row markup | Notes |
|---|---|---|
| Schedule | Shared `ListRow` (`courses-panel.tsx:206`, `:322`; `search-panel.tsx:377`; `sections.tsx:464`; `results.tsx:341`; `blocks-panel.tsx:149`; `travel-panel.tsx:220`; `registration-checklist.tsx:41`; `problems-panel.tsx:140`) | `px-4 py-2`, hairline between rows, lead/trail/action columns |
| Chat | Hand-rolled `RoomRow` button (`room-row.tsx:81-117`) | Same idea as ListRow, re-typed: `min-h-9 px-4 py-1.5 border-b`, current `bg-accent-soft`. Course group header button `h-9 bg-panel` (`room-list.tsx:100`), which is not `GroupHeader` |
| Todo | `TodoItemRow` `li` (`todo-item.tsx:132-134`) | No horizontal padding (flush to the page), checkbox in a 44px/32px label, `py-3 md:py-1.5`, title `text-base`, meta `text-sm`, square outlined tags |
| Reviews | Hand-rolled `li`s: `home-page.tsx:83-86,105-107` (`border-b py-1.5`, no px); `course-page.tsx:242` (`py-2`); `instructor-page.tsx:136`; search results `px-2.5 py-1.5 hover:bg-hover` (`home-page.tsx:359`); `ReviewCard` article `py-3 border-b` | Three different vertical rhythms on one product |
| Plan | Blocks are **individually boxed** `li`s (`block.tsx:438`, border + `bg-raised`, dashed for wildcards, inset warn bar). Side-panel rows are hand-rolled: search `li` `border-b pr-2` + inner `px-4 py-1.5` (`four-year/search-panel.tsx:76`); problems `px-4 py-2 border-b` (`problems-panel.tsx:36`); GenEd `px-4 py-1.5`, no border (`gen-ed-panel.tsx:51`) | Plan imports nothing from `app/panel` |
| Settings | Watch rows `flex py-1.5`, no border (`alerts/watching-list.tsx:70`); device rows `flex gap-3` in `space-y-2` (`notification-settings.tsx:569`); notification type rows `space-y-2` in `space-y-3` (`:240`) | Row actions: hand-rolled "Stop" (`watching-list.tsx:98-110`) vs `Button ghost sm` "Remove" (`notification-settings.tsx:582`), though `Button size="row"` exists for exactly this (`button.tsx:27-28`) |

## 6. Loading states

- **Schedule**:
  - `PanelSkeleton` (`panel.tsx:333`) for every tab chunk.
  - `RowsSkeleton` (`courses-panel.tsx:482`) and travel `ListSkeleton` (`travel-panel.tsx:269`), which re-create near-identical row skeletons.
  - Top bar skeletons (`top-bar.tsx:125`, `term-switcher.tsx:27`, `app-shell.tsx:457`).
  - The drawer placeholder (`app-shell.tsx:173`).
- **Chat**:
  - Line skeletons with `gap-3 px-4`, differing padding (`py-6` in `chat-page.tsx:65,261`; `py-4` in `room-list.tsx:233`, `course-space.tsx:81`, `room-view.tsx:302,429`).
  - Text "Loading courses…" (`course-finder.tsx:106`).
- **Plan**: A block-grid skeleton (`plan-page.tsx:87-96`: `h-8 w-48`, `h-64`, `h-96`); search `h-9` bars (`four-year/search-panel.tsx:333-335`); block title line (`block.tsx:344`).
- **Todo**:
  - `ListSkeleton` (`todo-page.tsx:72-81`: `h-5 w-48` + 4 × `h-10`). It is also reused on the connect page for a status check (`connect-page.tsx:178`, `:216`).
  - **Spinner**: refresh icon `motion-safe:animate-spin` (`todo-page.tsx:230`), the only spinner in the app.
  - Busy text "Checking with ELMS…" and "Reading the file…" (`connect-form.tsx:112`, `file-drop.tsx:106`).
- **Reviews**:
  - Line skeletons (`course-page.tsx:151`, `reviews-section.tsx:117,167`, `instructor-page.tsx:93,228`, `mine-page.tsx:41,56` at `h-16 w-full`).
  - **Only `planetterp-blocks.tsx:59-60` and `course-details/reviews.tsx:196-197` add `animate-pulse`**; all other skeletons are static.
  - Text "Loading courses…" (`home-page.tsx:343`) and "Summarizing reviews…".
- **Settings**:
  - Avatar circle + line (`settings-account.tsx:94-97`).
  - `h-40 w-full` block (`notifications-page.tsx:44`).
  - 3 × `h-10` (`notification-settings.tsx:151-155`).
  - `h-4 w-48` (`alerts/settings-section.tsx:27`).
  - Sign-in page `h-9` (`signin-page.tsx:35`).
- **Routes**: no `pendingComponent` or `errorComponent` on any route (only `notFoundComponent` in `__root.tsx:62` and the Reviews routes).

## 7. Error states and inline messages

- **Schedule**:
  - `CatalogError` (`app/catalog-error.tsx:41-73`): `role="alert"`, centered, `text-base text-fg`, outline sm button with RotateCw.
  - `PanelLoadBoundary` (`panel-load-boundary.tsx:48-66`): PanelHeader + EmptyState + outline sm Reload.
  - **`toast.error`** (red) for storage (`app.tsx:55,104`), clipboard (`export/actions.ts:30`), shared link (`app-shell.tsx:273`) and seat watches (`alerts/seat-watches.tsx:115-167`).
- **Chat**:
  - `EmptyState` + outline sm "Try again" (`room-list.tsx:47-64`); an inline row with outline sm (`course-finder.tsx:88-103`).
  - Muted `text-sm` paragraphs (`room-view.tsx:284-296`, `room-info.tsx:96`).
  - Link-variant "Try again" (`message-row.tsx:246-252`).
  - Failures go to plain (never red) toasts via `showNote` (`chat/undo.tsx:40-43`), which contradicts Schedule's `toast.error`.
- **Plan**:
  - Search error: default `<p>` (`text-fg` 13px) + outline sm "Try again" (`four-year/search-panel.tsx:321-331`).
  - Import `role="alert" text-sm` (`import-panel.tsx:630`).
  - "Not saved" status in the header (`header.tsx:220`).
- **Todo**:
  - `text-fg` paragraph + **outline default-size** "Try again" (`todo-page.tsx:325-339`, `connect-page.tsx:163-176`).
  - Form answers `role="status" text-fg text-sm` (`connect-form.tsx:117`, `file-drop.tsx:112`).
  - Feed problem `text-fg text-sm` (`todo-page.tsx:387`).
  - A toast with no action for a failed check-off (`:316`).
- **Reviews**:
  - `text-muted` paragraphs that say "reload the page", with **no retry button** (`mine-page.tsx:52-54`, `reviews-section.tsx:173-174`).
  - Search error row `text-muted text-sm` (`home-page.tsx:345`).
  - Composer and report answers `role="status" text-fg text-sm` (`composer.tsx:353`, `report-button.tsx:172`).
- **Settings**:
  - `role="status" text-fg` (base) "reload the page" (`notification-settings.tsx:144-147`).
  - `text-fg text-sm` failures (`settings-account.tsx:247-249`, `notification-settings.tsx:289,487`).
  - Account menu failure `text-muted text-sm` (`account-button.tsx:242-247`).

## 8. Sheets, drawers, popovers, dialogs

- **vaul Drawer**:
  - Schedule phone sidebar (`app/mobile-drawer.tsx:256-290`): full `h-dvh`, z-40, no overlay, grabber `h-1 w-8` in an `h-6 w-16` hit area (`:410-416`).
  - Chat room info on phones, **built separately** (`chat/chat-page.tsx:322-354`): z-50, `bg-fg/20` overlay, `max-h-[85dvh]`, handle `h-1 w-10 mt-2`, a visible `Drawer.Title` with a size-11 close button.
  - Plan, Todo, Reviews and Settings use no sheets. Plan's phone layout stacks its panel inline (`plan-page.tsx:157-171`).
- **Desktop side sheet**: Chat room info `aside w-72` with a hand-rolled `h-12` header (`chat-page.tsx:300-320`). This is not `PanelHeader` (`PanelHeader` is `min-h-12 py-2` with truncation).
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
  - Radix `Select` in Chat (`room-list.tsx:152,184`), generate (`rank-by.tsx:52`, `must-haves.tsx:51`) and blocks (`block-form.tsx:198`).
  - **Native `<select>`** in Plan (`empty-state.tsx:63`, `template-panel.tsx:61`), the Reviews composer (`composer.tsx:178,197`, `SELECT_CLASS` `:51-52`) and admin (`decisions-page.tsx:208`).

## 9. Toasts and undo

There is one sonner `Toaster` (`components/ui/sonner.tsx`). Toast action buttons have **7 separate implementations**:

| Site | Implementation | Differences |
|---|---|---|
| Schedule undo/redo | Shared `app/toast-action.tsx:5-34` via `app/undo-toasts.tsx:35-66` | `h-7 border-hairline`, icon 13, shortcut in the tooltip, held while focused, 10s |
| Seat watches | Shared `ToastAction` (`alerts/seat-watches.tsx:91`) | Sonner default 8s |
| App update | Inline copy of the same classes (`app/update-toast.tsx:20-26`) | RotateCw icon, 20s |
| Chat | Inline copy (`chat/undo.tsx:24-30`) | 10s, no shortcut |
| Plan | **Its own local `ToastAction`** (`four-year/toasts.tsx:16-38`) | `h-11 md:h-7`, no `rounded-md`, 10s; note toasts 5s (`:43-48`) |
| Todo disconnect | Its own `UndoButton` (`todo/connect-page.tsx:41-54`) | No `rounded-md`, 8s |
| Reviews delete | Inline (`reviews/delete-review.tsx:46-52`) | **No icon**, 8s |
| Notifications device removal | Inline (`notification-settings.tsx:550-556`) | **No icon**, **6s** |
| Account deletion | Sonner's built-in `action: {label, onClick}` (`settings-account.tsx:186-194`) | Styled by `actionButton: bg-accent` (`sonner.tsx:21`): the **only ink-filled toast action** |
| Admin queue | `Button variant="outline" size="row"` (`admin/queue-page.tsx:142-155`) | Offset-shadow button inside a toast |

Undo windows are 10s in Schedule, Chat, Plan and admin; 8s in Reviews, Todo and seat watches; 6s for notification devices. Todo's check-off has no undo toast. A failed save shows "That didn't save" with no action (`todo-page.tsx:316`).

## 10. Buttons

Shared `Button` (`components/ui/button.tsx`) in product code (excluding marketing samples): **129 uses**.

- **By variant**: ghost 50, outline 43, default 26, link 6, conditional 4 (`course-details` `kind`, admin `on`/`suggestion`, Plan `placed`).
- **By size**: sm 47, default 40, icon-sm 21, row 19, icon 2.
- **Per product**:
  - Schedule (app, blocks, calendar, course-details, courses, generate, problems, travel): default 8, outline 15, ghost 8, link 2.
  - Chat: ghost 14, outline 7, link 4, default 3. Plus `buttonVariants` on an anchor (`chat/course-entry.tsx:52`).
  - Plan: default 7, ghost 8, outline 4, conditional 1.
  - Todo: ghost 5, default 2, outline 2.
  - Reviews: ghost 6, default 2, outline 2.
  - Settings (auth + notifications): outline 6, ghost 2.
  - PWA: 4. Site: 3. Admin: 13.
- **Height overrides fight the size scale**:
  - Plan and Todo use `h-11 md:h-8`, `h-11 md:h-6`, `size-11 md:size-7` (for example `empty-state.tsx:79`, `header.tsx:179`, `four-year/search-panel.tsx`, `problems-panel.tsx:67`, `connect-page.tsx:122,129`, `connect-form.tsx:110`).
  - Chat uses `max-md:h-11` and `max-md:size-11` (about 20 sites).
  - Reviews and Settings use neither.
- **Hand-rolled `<button>` elements with custom classes** (non-marketing), by folder:
  - app 18: rail, drawer tabs, plan tabs ×4, product menu, theme toggle, top-bar problems ×2, shared pill ×2, drill back, term switcher, toast actions ×2, `GroupHeader`.
  - calendar 9, course-details 8, generate 8, travel 8, chat 7, four-year 7, search 7, courses 5, blocks 4.
  - auth 3 (account triggers), reviews 3, todo 3, notifications 2, problems 2, sync 2, alerts 1, export 1, pwa 1.
  - Notable pseudo-buttons: todo `ViewSwitch` (`todo-page.tsx:188`), `DoneFold` (`todo-lists.tsx:44`), Plan side tabs (`side-panel.tsx:117`), Plan doc menu (`header.tsx:84`), watch "Stop" (`watching-list.tsx:98`), report reason chips (`report-button.tsx:122`), rating stars (`composer.tsx:325`), notification `ChannelSwitch` (`notification-settings.tsx:320`).
- **Anchors styled as buttons**:
  - `GoogleButton` (`auth/sign-in-panel.tsx:31-32`): `h-9 border-hairline-strong`, no offset shadow. It is the primary action on every front door but does not look like Button default.
  - Todo "ELMS link" (`todo-page.tsx:376-378`).
  - Chat account link (`chat-page.tsx:55`).
  - `AccountLink` (`account-link.tsx:22-23`).
  - Reviews `CourseChip` (`home-page.tsx:242`).

## 11. Page widths and containers

- **SitePage layouts** (`site-page.tsx:32-37`):
  - `note` 560 `pt-[12vh]`: privacy, not found, coming soon.
  - `reading` 720 `pt-6`: Reviews, Settings, Notifications.
  - `app` 1120 `pt-4`: Todo.
  - `wide` 1600 `pt-2`: Plan.
- **Nested widths**:
  - Todo front door 560 + `pt-[8vh]` inside 1120 (`todo-page.tsx:132`).
  - Todo connect 560 inside 1120 (`connect-page.tsx:206`).
  - Todo InlineConnect 560 (`todo-page.tsx:244`).
  - GoogleButton wrappers 320 (`todo-page.tsx:141`, `connect-page.tsx:222`, `mine-page.tsx:45`).
  - Reviews SignInPrompt 360 (`sign-in-prompt.tsx:11`).
  - Plan empty state 1040 `pt-[6vh]` inside 1600 (`empty-state.tsx:28`).
- **Chat**: full-bleed `h-dvh` with no max width; list `w-80`, info `w-72` (`chat-page.tsx:294,303`); front door 440 `pt-[10vh]` (`sign-in-moment.tsx:18,40`).
- **Schedule**: full-bleed shell, sidebar `w-sidebar` 320–480, rail 62px.
- **Others**: Sign-in `AccountPage` 440 `pt-[12vh]` (`account-page.tsx:18-19`); Admin 720 in its own frame (`admin-frame.tsx:60`); marketing uses `mk-wrap`.

## 12. Account/avatar button and theme toggle placement

| Shell | Account entry | Theme toggle |
|---|---|---|
| Schedule, desktop | `AccountButton` dropdown in the top bar (`top-bar.tsx:63`; trigger `account-button.tsx:58-59`, `h-7 text-base`) or a Sign-in popover | Rail foot (`rail.tsx:43`), icon dropdown `size-8` |
| Schedule, phone | `PhoneMenu` with account and theme in one menu (`account-button.tsx:104-134`) | Inside the account menu (`:129`), or a standalone button when sign-in is off (`app-shell.tsx:109`) |
| Reviews, Settings, Notifications | `AccountLink` (`account-link.tsx`): avatar links to /settings, or "Sign in" goes straight to Google. `h-7 text-base`. | **None** |
| Chat | **Hand-rolled avatar anchor, signed-in only** (`chat-page.tsx:52-58`): `h-8 text-sm`, `max-md:h-11`. No Sign-in link in the header. | **None** |
| Plan | **Nothing** (`SitePage` with no `actions`, `plan-page.tsx:197`) | **None** |
| Todo | **Nothing** (`todo-page.tsx:61`) | **None** |
| Marketing | Ghost "Sign in" Button to `/signin` (`marketing/frame.tsx:19-23`) | None |
| Admin | None | None |

The theme can only be changed inside `/schedule` (the only uses are `ThemeToggle`/`ThemeMenuItems` in `app/` and `account-button.tsx`).

## 13. Duplicate implementations

- **Two `EmptyState`s** with the same name: `app/panel.tsx:274` and `four-year/empty-state.tsx:24`.
- **Three `Section`s**: `reviews/frame.tsx:93` (h2 `text-lg tracking-tight`, `border-b` under, `mt-8`), `todo/connect-page.tsx:32` (h2 `text-lg`, **`border-t` above**, `pt-4`), `site/privacy-page.tsx:10` (no border). There is also `AccountSection` (`account-page.tsx:37`, a boxed h2 `text-base`) and `SectionHeader` (panel).
- **Three `ListSkeleton`s**: `todo-page.tsx:72`, `chat/room-list.tsx:231`, `travel-panel.tsx:269`. Also `RowsSkeleton` (`courses-panel.tsx:482`) next to `PanelSkeleton`.
- **Two `ToastAction`s**: `app/toast-action.tsx:5` and `four-year/toasts.tsx:16`. Four more inline copies are listed in §9.
- **Segmented controls, at least 5**: Todo `ViewSwitch` (`todo-page.tsx:177`), travel pace and extra-time (`travel-settings.tsx:46`, `:109`), admin queue views (`queue-page.tsx:325`), Plan side tabs (underline style, `side-panel.tsx:110`), marketing reviews sample (`reviews-sample.tsx:118`).
- **Switch knobs, 2**: `travel-settings.tsx:158` `Toggle` and `notification-settings.tsx:343` `Knob`. Identical markup except `mt-0.5`.
- **Toggle chips with different "on" looks**:
  - ink fill: `filter-chips.tsx:32-38`, `sections.tsx:163-172`, `block-form.tsx:89-97` presets
  - accent fill: `must-haves.tsx:161-172`, `block-form.tsx:130-140`, `results.tsx:272-281`
  - accent-soft + border: `report-button.tsx:127-132`
  - bg-hover: `grades.tsx:184-195`
- **Rail vs drawer tab buttons**: `rail.tsx:223-268` and `mobile-drawer.tsx:487-516`.
- **PanelHeader re-typed by hand**: `chat/room-view.tsx:160-222`; chat info aside header `chat-page.tsx:305`; Plan course panel back bar `course-panel.tsx:57-67`.
- **Search boxes, 4 styles**:
  - Schedule `h-9 border-hairline`, focus-outline (`search/search-panel.tsx:115`)
  - Reviews `h-9 border-hairline-strong focus-within:border-fg/40` (`home-page.tsx:315`)
  - Chat `h-8 border-hairline-strong focus-within:border-fg max-md:h-11` (`course-finder.tsx:65`)
  - Plan: a bare input `h-11 md:h-8 border-hairline-strong focus-visible:border-fg` (`four-year/search-panel.tsx:256`)
- **Text inputs** (no shared Input):
  - `h-7 border-hairline-strong bg-bg focus:border-fg/40` (Schedule blocks and generate)
  - `h-8 border-hairline` (`new-block.tsx:129`)
  - `h-9 bg-panel` (admin)
  - `h-11 md:h-8 bg-raised focus-visible:outline` (Todo `connect-form.tsx:104`)
  - `h-11 md:h-8 focus-visible:border-fg` (Plan)
- **Report forms, 2**: Reviews chip radiogroup (`report-button.tsx:101-170`) vs Chat native radios (`message-row.tsx:590-640`).
- **Account entry, 4**: `AccountButton`, `AccountLink`, Chat's inline anchor, and the marketing Sign-in.
- **Back affordances, 6**:
  - Schedule `DrillBar` (`sidebar.tsx:370`)
  - Plan ghost sm "← Back" (`course-panel.tsx:59-66`)
  - Chat ghost icon-sm chevron (`course-space.tsx:61`, `room-view.tsx:166`)
  - Todo plain "Todo" link (`connect-page.tsx:209`)
  - Notifications "‹ Settings" (`notifications-page.tsx:27`)
  - Reviews breadcrumbs (`frame.tsx:49`)
- **Mono text**: Plan uses raw `font-mono` everywhere (`block.tsx`, `four-year/search-panel.tsx`, `course-panel.tsx:73`, `import-panel.tsx`, `template-panel.tsx`). Every other feature uses the `ident` utility (`styles.css:560`), which also sets tabular numbers. `sidebar.tsx:383,395` also uses `font-mono`.
- **Link underline offset**: Todo and Settings use `underline-offset-4` (`todo-page.tsx`, `connect-form.tsx`, `settings-account.tsx`, `signin-page.tsx`, `notifications-page.tsx`); everywhere else uses `underline-offset-2` (14 sites).

---

## Top 15 inconsistencies, most visible first

1. ~~**Plan and Todo have no account entry at all, and there is no theme control outside Schedule.**~~ Fixed in `v3/app-bar`: every page has the family bar with one account menu, which holds the theme.
2. ~~**Four different account/avatar entries.**~~ Fixed in `v3/app-bar`: one `AccountButton` menu. `AccountLink` and Chat's avatar link are gone. The marketing page's Sign in is still its own.
   - `AccountButton` dropdown (Schedule, `h-7 text-base`)
   - `AccountLink` (Reviews and Settings, `h-7 text-base`, links to /settings)
   - Chat's hand-rolled anchor (`h-8 text-sm`, `max-md:h-11`)
   - Marketing's ghost Button to `/signin`
3. **Page titles don't share a pattern.**
   - `text-xl` h1 on Reviews, Todo, Settings and the front doors.
   - Plan's h1 is a `text-lg` dropdown button with the plan's name.
   - Chat has no h1 (a `text-base` PanelHeader h2).
   - Schedule's h1 is the product menu.
   - Subtitle/status lines sit under the title (Reviews `text-base`, Todo `text-sm` + refresh icon), inline to the right (Plan "Saved in this browser"), or in PanelHeader `sub` (Chat).
4. **First visits look like four different products.**
   - Plan: three keyline+offset cards, Mark 40, 1040px (`empty-state.tsx`).
   - Schedule: two hairline cards, no mark, an h3 `text-xl` inside the panel (`first-visit.tsx`).
   - Chat: a 440px column, Mark 40, bullet list.
   - Todo: a 560px column, **no mark**, sample list in a hairline figure.
   - Reviews: none.
5. **Site frame chrome differs.**
   - SiteHeader has no bottom border except on Chat (`chat-page.tsx:49`).
   - Chat drops the footer.
   - Admin has its own h-12 header with no product nav.
   - Marketing has its own h-14 header.
6. **Selected-state treatments for sub-nav are all different.**
   - Rail `bg-fg/10` + edge bar
   - Plan side tabs underline `border-b-2`
   - Plan strip `border-fg bg-accent-soft`
   - Todo segmented `bg-accent-soft` in a bordered strip
   - Reviews chips `bg-accent-soft` with no border
   - grades chips and plan tabs `bg-hover`
   - travel segmented `ring + shadow-xs`
   - admin queue outline-vs-ghost
   - filter chips ink-filled; must-have days accent-filled
7. **Card styles are mixed on the same kind of surface.**
   - Keyline + offset: Plan start cards, Reviews composer, Chat rules card.
   - Hairline: Schedule start cards, Settings sections, Plan side panel and semesters.
   - Hairline-strong: Reviews sign-in prompt and report form, Chat report form.
   - `Dialog` is the only overlay with a hairline border; popovers and menus use keyline.
8. **List rows are hand-rolled outside Schedule.**
   - Only Schedule uses `ListRow`.
   - Chat re-types it (`RoomRow`).
   - Todo rows are flush (no px) with 44px checkbox targets.
   - Reviews rows have no px and use `py-1.5` / `py-2` / `py-3` on the same product.
   - Plan boxes every block individually, against ListRow's own rule "hairlines between rows, never boxes".
9. **Page widths jump between products.** 720 (Reviews, Settings), 1120 (Todo, but its content is a nested 560), 1600 (Plan), full-bleed (Chat, Schedule), 440 (sign-in, Chat front door), 720 in a separate frame (Admin).
10. **Toast Undo/Redo buttons have seven implementations.** They differ in icon (none on Reviews delete and notifications), height (`h-11 md:h-7` on Plan), box treatment (Plan and Todo omit `rounded-md`), fill (accent on account deletion), and component (an outline row Button on admin). Undo windows are 10s, 8s or 6s.
11. **Error handling differs by product.**
    - Schedule uses red `toast.error` and a `role=alert` block with a RotateCw retry.
    - Chat never uses red and shows an outline sm "Try again".
    - Todo uses an outline default-size "Try again" with `text-fg` copy.
    - Reviews and Settings say "reload the page" in muted or fg text with no retry button.
    - No route has an `errorComponent`.
12. **Back navigation has six forms.** DrillBar, Plan's "← Back" ghost button, Chat's chevron icon, Todo's plain "Todo" link, Notifications' "‹ Settings", Reviews' breadcrumbs.
13. **Section headings under a page title differ.**
    - Reviews `Section`: `text-lg`, rule below.
    - Todo connect `Section`: `text-lg`, rule above.
    - Todo DayList: `text-base`, rule below.
    - Settings `AccountSection`: boxed `text-base`.
    - Privacy: `text-lg`, no rule.
14. **Loading states are inconsistent.**
    - Skeleton shapes differ, and three `ListSkeleton` copies exist.
    - Only two Reviews blocks pulse.
    - Todo has the app's only spinner.
    - Reviews and Chat show "Loading courses…" text.
    - Plan shows a big grid of block skeletons.
15. **Form controls have no shared primitives.**
    - 4 search-box styles (`h-8`/`h-9`/`h-11`; hairline vs hairline-strong; different focus rules).
    - At least 5 text-input styles.
    - Native `<select>` (Plan, Reviews composer, admin) next to Radix Select (Chat, Schedule).
    - Two copies of the switch knob.
    - `GoogleButton` (the main front-door action) is `h-9` hairline-strong with no offset, unlike `Button` default.
    - Touch targets use `h-11 md:h-8` (Plan, Todo) vs `max-md:h-11` (Chat) vs nothing (Reviews, Settings).
