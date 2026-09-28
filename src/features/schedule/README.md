# The scheduler's shell (`src/features/schedule`)

The layout from `SPEC.md` §2: top bar, labeled rail, one sidebar panel with drill-in, and a calendar that fills the rest. On phones (≤ 768px) the same pieces, with the sidebar in a bottom drawer. State lives in `src/state`; this folder puts it on screen.

What every product shares lives outside it (`docs/BUILD.md` §3): views in `src/components` (the family bar, the workbench, the panel pieces), hooks in `src/hooks`, and non-view code in `src/lib` (analytics, theme, shortcuts, config, head scripts). Reviews, Chat, Plan and Todo never import this folder; the scheduler's own features (`courses`, `search`, `calendar`, …) do.

Features (`src/features/<feature>/`) plug into the shell through routes: each tab and drill-in is one (below).

## The workbench (`src/components/workbench`)

The frame the scheduler is laid out in, shared with Plan (`CONTEXT.md`, "Workbench"; `docs/COHESION.md` §4). It knows nothing about either product: each passes its own bar, views and canvas.
- `layout.tsx`: `Workbench` (bar; rail, sidebar and canvas on desktop; canvas and drawer on phones), `WorkbenchSidebar` (the aside and its resize handle) and `lazyDrawer` (a product's phone drawer, in its own chunk).
- `rail.tsx`: `WorkbenchRail`, `RailButton` (with `railHint` for its tooltip) and `CountBadge`.
- `drawer.tsx`: `WorkbenchDrawer` (vaul, its snaps, the keyboard and the pull-down) and its strip, `DrawerTabs` and `DrawerTab`. Phones only.
- `back-bar.tsx`: `DrillBackBar`, a drill-in's one Back.
- `status.tsx`: the bar's `CreditsStatus` and `ProblemsStatus`.
- `sidebar-resize.tsx`: the handle below.

The scheduler's own pieces (`rail.tsx`, `mobile-drawer.tsx`, `sidebar.tsx`, `top-bar.tsx`) wire its stores to these. Plan's are in `src/features/four-year` (`plan-page.tsx`, `plan-drawer.tsx`), and its views are routes too (`src/routes/plan.*.tsx`), shown through an `<Outlet />` in its sidebar: they don't need to stay mounted.

## Add a tab panel or a drill-in view

Each rail tab and each drill-in is a route under `/schedule` (`src/routes/schedule.<tab>.tsx`, `schedule.course.$code.tsx`, …). The route file names the component; its feature folder holds it.

```tsx
// src/routes/schedule.travel.tsx
export const Route = createFileRoute("/schedule/travel")({
  component: TravelPanel,
});
```

- **The router splits and preloads it.** A route's component is its own chunk (TanStack Start's automatic code splitting), so it stays out of the scheduler's first load (`docs/BUILD.md` §5), and hovering or focusing its rail tab (`preloadView` in `schedule-nav.ts`) loads it before the click. The sidebar shows the skeleton while it loads, and a chunk that fails says so in the panel. Don't export anything else from a route file, or splitting can't move the component out.
- **The sidebar renders it, not an `<Outlet />`.** Tab panels once visited and drill-in levels under the top one stay mounted, hidden (see "Build a panel"), which an outlet would unmount. `sidebar.tsx` shows each route's component in its own layer.
- **A drill-in reads its entry with `useDrillEntry(kind)`** (`drill-entry.tsx`), not from the route's params: a level kept mounted under the top one isn't the URL's any more. Add its kind to `DrillEntry` in `~/state/drill`, its path to `~/core/routing/schedule-location`, its URL to `viewAt`/`locationOf` (`schedule-view.ts`, `schedule-nav.ts`) and its short name to `drillName`.
- **Search params** a tab reads are its route's `validateSearch`, a zod schema from `~/core/schema/schedule-url` (`SearchTabSearchSchema`, `GenerateTabSearchSchema`). Read them with `useTabSearch(tab)`, which is null while the tab is hidden, so a hidden panel keeps what it showed.
- **Tabs:** `courses`, `search`, `problems`, `travel`, `blocks`, `generate`, `register` (`export` until 2026-09-28: saved prefs and old links read as `register`, and `/schedule/export` redirects). A route without a component shows a neutral skeleton.
- **Drill kinds:** `course` and `connection` (restored on the next visit, `UiPrefs.drill`) and `generated-plan` (for the session: results aren't saved).
- **App-wide work a feature owns** (the seat-watch sync in `alerts`) is a hook the shell calls in `app-shell.tsx`.

## Build a panel

Use the pieces in `~/components/panel` so every panel matches the prototype:

- `PanelHeader({ title, sub?, right? })`: the 48px header ("Plan A / 5 courses · 16 credits").
- `PanelBody`: the scroll area under the header.
- `PanelLabel`: a small section label ("Bookmarked").
- `PanelNote`: what an empty list says ("No blocks in this plan."), with at most one action.
- `ListRow` and `GroupHeader` come from the page kit in `src/components/ui` (re-exported here), which every product shares; so does `PageHeader`, whose panel size `PanelHeader` is. `/admin/kit` shows the whole kit.
- `useFocusRequest(tab)` (in `focus-request.ts`, so `~/components/panel` stays free of the scheduler's stores): a ref the shell focuses on request; `/` focuses Search's field with `useFocusRequest<HTMLInputElement>("search")`.

Panels and drill levels stay mounted while hidden, so going back (Back, `Esc` or the browser's Back) returns to exactly where the person was: scroll position, typed text, open groups. Don't reset local state on mount.

## Read and change state

Read through the hooks in `~/state/hooks`, never a plan picked by hand, so the shared-link view works everywhere:

| Hook | Returns |
|---|---|
| `useCurrentPlan()` | `{ source: "own" \| "shared", readOnly, termId, plan, blocks, colors }` or `null`. When `readOnly`, offer no edits. |
| `useActiveTerm()` | `{ term, termId, terms }`: the term on screen (the shared plan's while one is open). |
| `useTermPlans(termId)`, `useActivePlanId(termId)` | The person's plan tabs and the open one. |
| `useCreditsLabel()` | "16 credits", or a range. |
| `usePlanProblemsState()`, `usePlanProblems()`, `useProblemCounts()` | Problems for the plan on screen (core's `planProblems`), as soon as the plan's own departments have loaded. `usePlanProblemsState()` also says `checking` while they load: show a neutral state then, never "No problems". |
| `useTermCatalog(termId)` | `{ index, complete, seats, changes, manifest }`: the term's core `CatalogIndex` and published files. |
| `usePlacedSections()` | The plan's sections as core `SectionRef`s, in plan order. |
| `useFitContext()` | Core's `FitContext` for the plan on screen, built once per plan state and shared (fit labels, "Fits my plan"). |
| `usePlanConnections()` | Core `Connection`s between back-to-back classes (travel pills, Travel tab). |
| `useTravel()` | `{ travel, campus }`: travel settings and the campus map (routes load once the plan has a placed section). |

Published data beyond the term catalog, in `~/state/data-hooks`, read through the query cache (`~/state/query/catalog.ts`, below): each hook starts its own load (from the saved copy first, then the server), and a manifest is checked once per page:

| Hook | Returns |
|---|---|
| `useSeatsFreshness(termId)` | `{ state, text, asOf }`. Put `text` above a section list: "Seats as of 2 minutes ago" (`live`, from Testudo's as-of time, in `relativeWords`), "Seats stopped updating when this term was archived." (`archived`), "Offline · showing saved data" (`offline`), "Seats unknown" (`unknown`), or "" while `loading`. It re-renders every 30 s. |
| `useInstructors(dept)` | `{ data, state, source, retry }`: the department's PlanetTerp file (`instructors` by slug, `names` for the Testudo-name join, `grades` per course), or `null` when PlanetTerp has none; `retry` is Try again. |
| `useLoadedPlanetTerp()` | The PlanetTerp files already loaded, by department, without loading more: sorting by rating and a generated plan's details read it. |
| `useAcademicCalendar(termId)` | `{ calendar, state, retry }`: the provost calendar for .ics export. `status: "not-published"`, or `ready` with no calendar (no file yet), means the dates aren't out: say so plainly. Cached, so it works offline. |
| `useCampus(load = true)` | `{ campus, state }`: core's `CampusMap` (routes and off-campus codes), `EMPTY_CAMPUS` until loaded. With `load` false it only reads (`useTravel`); the shell loads it once the plan has a placed section. |
| `useRouteGeometry(from, to, mode)` | `{ geometry, state }`: a connection's walking path for a map. `geometry` stays `null` when there's no file: hide the map, never draw a straight line. |
| `useCatalogPolling(termId)` | The seat poll. The shell runs it for the term on screen, so features don't need to. |
| `useTerpsicleReviews(dept, enabled)` | A department's Terpsicle review numbers, or `null` (loading, nothing published, failed, or `enabled` false). Read through the query cache, below. |

**Server data goes through TanStack Query** (`docs/decisions.md`, "TanStack Query for server data and its caching"). `getRouter()` (`src/router.tsx`) makes one `QueryClient` (`~/lib/query-client.ts`), puts it in router context (loaders read `context.queryClient`), and `@tanstack/react-router-ssr-query` wraps the app in its provider. Each area keeps `queryOptions` factories beside its data: published files in `~/state/query/` (`publishedFile` for hashed files, `publishedPointer` for manifests; review numbers are the first, `review-numbers.ts`), persisted to IndexedDB by `~/state/query/persister.ts` (`DATA.md` §5.5). A component calls `useQuery(factory(...))`; a loader calls `context.queryClient.ensureQueryData(factory(...))`. Don't add a `once`, an in-flight map, a `visibilitychange` refetch or a poll timer: those are the factory's `staleTime`, Query's dedupe, `refetchOnWindowFocus` and `refetchInterval`. `app.tsx` hands published queries their data source (`connectPublished`); every UI test's render sits inside a fresh test client (`src/lib/test-setup.ts`), and a test that checks caching passes its own. Signed-in data works the same way: the bell's count and inbox are `features/notifications/queries.ts`.

Stores (Zustand) for everything else:

- `useWorkspace` (`~/state/workspace-store`): plans, blocks, course colors, travel settings and the open plan per term. Change the workspace only through `commit(label, recipe, { toast? })` or `dispatch(action, label)`; both keep undo history, and `label` ("Removed CMSC351 from Plan A") becomes the Undo toast. Use `{ toast: false }` for quiet edits (renames). `setTravel` saves settings without history.
- `useUi` (`~/state/ui-store`): whether the sidebar shows (`setSidebarOpen`), `requestFocus(tab)`, `toggleGroup(key)`, the drawer's snap, the calendar fields below, and the tab and drill-in last on screen (`lastTab`, `lastDrill`: saved for the next visit, never read for what's on screen). Which tab and drill-in are open is the URL's: read it with `useScheduleView()` (`schedule-view.ts`), and move with the functions in `schedule-nav.ts` (see "URL state").
- `useCatalog` (`~/state/catalog-store`): terms; per term (`byTerm[termId]`) the `manifest`, `seats`, `changes` (the changes file; `usePlanProblems` already feeds it to core) and a core `CatalogIndex`. (PlanetTerp, the campus map and academic calendars are queries now: the hooks above.) `ensureTerm(termId, first?)` loads every department in the background, `first` ones and anything already asked for first (the shell does this for the term on screen, with the plan's departments first), `ensureDepts(termId, depts)` a few, shown as soon as they arrive (course details asks for its course's through `useCourseDept`), `refreshTerm(termId)` revalidates, and `retry()` tries a failed load again.
  - How loading works (`DATA.md` §5.1): everything is read from the IndexedDB cache first, so a repeat visit starts instantly, and then revalidated against the server. The manifest is diffed with core's `diffManifest`, so only departments whose hash changed are fetched, and files the manifest no longer lists are evicted. A file that fails validation keeps the previous one. The same path runs in mock mode (cache keys prefixed `mock:`).
  - `byTerm[termId].manifestSource` is `"cache"` or `"network"`; `checkedAt` is when the server last confirmed it.
  - `network` is `"offline"` when the last request couldn't reach the server. The top bar then says "Offline · showing saved data"; with nothing saved, the calendar's place shows the error and **Try again** (`catalog-error.tsx`).
  - `appStale` is true when the server publishes a newer data format than this tab reads; the page reloads the next time it becomes visible.
  - Archived terms never poll. Active ones poll the manifest every 60 s while the page is visible, and right away when it becomes visible or comes back online; seats are refetched only when their hash changes.

User actions that should be counted go through `actions.ts`, which records the analytics event (`docs/ANALYTICS.md`):
- plans: `createEmptyPlan`, `copyPlan`, `renamePlan`, `deletePlan`, `openPlan`, and `createPlanFrom(termId, courses, { source: "generate", name })` for Generate;
- sections: `switchSection(courseCode, sectionCode, via)` puts a course in a section (switches, places a saved course, or adds a new one), undoable, with `via` = `"list"` from course details;
- `setCourseColor(courseCode, color)` and `addBlock({ label, days, start, end }, via)` (`via` = `"form"` from the Blocks tab);
- `openTab`, `switchTerm`, `setTheme`, `undo`, `redo`.
- `startGenerate()` opens the Generate tab with its course field focused: the first-visit guide's **Generate plans** button calls it (`+` → Generate plans… does too).

## Courses, problems and seat alerts

Open a course the one way: `openCourse(code)` from `~/features/courses/actions` (a `course` drill). The same file has `removeCourse(code, via)` and `bookmarkInstead(code, via)` (take a placed course off the calendar and keep it bookmarked; `via` = `"details"` from course details), each one undoable commit with its toast and event, and `editablePlan()` (the open plan, or null in a shared view). `~/features/problems/actions` has `applyFix(problem, fix)` and `openSubject(subject)`; `LinkedMessage` (`~/features/problems/linked-message`) renders a core `Message` with its courses and blocks as links.

Seat alerts (`~/features/alerts/seat-alerts`, backed by the `useSeatAlerts` store in `~/state/seat-alerts` and Dexie `seatAlerts`):

| Export | For |
|---|---|
| `useSeatAlert(termId, sectionKey)` | The bell's state: `unavailable` (hide the bell), `none`, `pending` (show "Check your email"), `watching`. |
| `subscribeSeatAlert(email, termId, sectionKey)` | Watch: returns an outcome (never throws) and writes a pending row. `subscribeMessage(outcome)` words it, including "You're already watching this." from the local list. |
| `useLastSeatAlertEmail()` | The address used last in this browser, to prefill the field. |
| `useSeatAlertsAvailable()` | False once the server says seat alerts are off. |
| `useSeatAlertList(termId?)`, `stopSeatAlert(termId, sectionKey)` | Register's list and its Stop watching (after the inline confirmation). |

`SeatMeter` (`~/features/courses/seat-meter`) draws seats as a meter plus words for any section key.

## Search and course details

Each is behind a small hook, so where the work happens can change without touching the components:

| Export | For |
|---|---|
| `useCourseResults(termId, query, filters)` (`~/features/search/use-course-search`) | `idle`, `loading` or `ready` with courses. Runs core search on the main thread over an index built once per catalog (`courseSearchFor`); moving it into the web worker changes this file only. MiniSearch loads when Search first opens (`loading` until then). `findCourses` is the pure part. |
| `useTermSearch(termId)`, `useSearchStore` (`~/features/search/search-store`) | The query and filters, remembered per term for the session. |
| `instructorFor(data, name)` (`~/features/course-details/planetterp`) | The PlanetTerp instructor for a Testudo name, from `useInstructors(dept)`'s file. |
| `useReviewSummary(slug, course)` (`~/features/course-details/use-review-summary`) | The LLM summary: `loading`, `shown` or `hidden` (every "unavailable" and every failure hides it; "busy" is asked once more after 4 s). One request per instructor per visit. |
| `SeatBell` (`~/features/course-details/seat-bell`) | The bell for a low or full section, over `useSeatAlert`/`subscribeSeatAlert`. |

Course details is one page (UX review §3.4, option A): header facts, then sections shaped by `sectionCountSize` (one / few / many, `~/core/catalog`), grouped by professor when there's more than one (`groupSectionsByInstructor`), every row showing all of its meetings and one icon button (add, switch, or take it back out), then one course-wide Grades section. A drill's `tab` means "take me there": `grades` scrolls to Grades, `about` opens "More about this course", `instructors` opens the first instructor's Reviews.

## Travel and the route map

`src/features/travel` owns the Travel tab and the `connection` drill (connection details). Open a connection with `openConnection(connection)` (or `openDrill({ kind: "connection", connectionId })`); settings change through `setPace`, `setAccessible` and `setExtraMinutes` in `~/features/travel/actions` (each records `travel_settings_changed`).

The route map draws UMD's path for the pair and mode (`geo/route/<from>-<to>-<mode>.json`), never a straight line; with no geometry it's hidden, with one quiet line. Live data draws it with MapLibre GL on `geo/tiles.pmtiles` (HTTP range reads through `/data`), in its own lazily loaded chunk, restyled from the theme tokens (`map-style.ts`). Mock mode has no tiles, so it draws the same path as an SVG on a plain themed background; so does a browser without WebGL.

## The calendar's store fields

Features talk to the calendar through three `useUi` fields. None is persisted.

| Field | Set by | The calendar |
|---|---|---|
| `hoverCourse` (`setHoverCourse(code \| null)`) | Search, on a result's pointer enter/leave | Shows that course's sections as ghosts, not clickable ("Open it to pick one."). |
| `previewSection` (`setPreviewSection(key \| null)`) | Course details, on a section row's pointer enter/leave; the calendar itself for ghost hover and `↑`/`↓` | Draws that section of the open course solid. `↵` switches to it. Cleared when the open course changes. |
| `previewPlan` (`setPreviewPlan({ plan, label } \| null)`) | Generate, while a result is previewed | Draws that plan instead of the open one, read-only, outlining sections that differ, under "Previewing <label>." |

Ghosts for the course open in the sidebar come from the URL itself (`useOpenCourse()`): opening course details anywhere shows them, and `Esc` hides them. `useGhostCourse()` is the course whose ghosts are drawn (a hover wins).

For the color dot, use `CourseColorPicker` from `~/features/courses/color-picker` (`courseCode`, `color`, `readOnly`); for dots and tints elsewhere, `dotStyle(color)` and `tintStyle(color)` from `~/features/calendar/tint`. Render core `Message`s with `MessageText` (`~/components/message-text`).

## Sidebar width

On desktop the sidebar's right edge drags between 320 and 480px (`SidebarResizeHandle` in `~/components/workbench/sidebar-resize.tsx`):
- Arrow keys move it 16px, Home and End jump to the limits, and a double-click resets it to 360px.
- The width is `useUi`'s `sidebarWidth`, saved in `UiPrefs` once per drag, and applied as `--sidebar-width` on the document root. `w-sidebar` reads it.
- It's one width for every workbench: Plan reads and writes the same `UiPrefs` field without the scheduler's stores (`src/state/sidebar-width-pref.ts`).
- A localStorage mirror and a head script (`~/lib/sidebar-width.ts`) set it before first paint, like the theme.
- Panels shouldn't assume 360px: truncate by content, not by a fixed width.

## URL state

Where you are is the URL, so reload, Back and Forward, and a copied link all land on the same view. Each rail tab is a route (`/schedule/search`), and so is each drill-in, with the tab it's over as `?tab=` (`/schedule/course/CMSC351?tab=search`, `/schedule/connection/<id>`, `/schedule/result/<id>`). `/schedule` itself carries the params every view keeps (`term`, `planId`, `plan`, `demo`), validated by its route's `validateSearch` (`ScheduleSearchSchema` in `~/core/schema/schedule-url`; listed in `DATA.md` §8.1). Back and Forward are the router's history; there's no store mirroring the URL.

- **Read** the view with `useScheduleView()` (`{ tab, drill }`), and the open course or ghost course with `useOpenCourse()`/`useGhostCourse()` (`schedule-view.ts`). They follow the history as soon as it moves, before the route's chunk arrives, so a click answers in the same frame. Outside React, `currentView()` (`schedule-nav.ts`).
- **Move** with `schedule-nav.ts`: `openDrill(entry)` (`openCourse` in `~/features/courses/actions` wraps it), `closeDrill()` and `closeToTab()` (close views: a new place, so they push), `goBack()` (the person's Back), `goTo(view, { replace?, shared? })` for anything else, and `preloadView(view)` on intent. Tabs go through `openTab`/`clickRailTab` in `actions.ts`, for their analytics.
- **Push** when someone went somewhere: a tab, a drill-in, a plan tab, a term, a filter chip, a Generate filter or preference chip, Generate's results or its form. The same URL is never pushed twice (the router's rule).
- **Replace** for everything else: typing in Search, and whatever the app corrects on its own (a plan that was deleted or undone, a term that loaded, a result that's gone after a reload).
- **Back is one thing.** The sidebar's Back, `Esc`, the phone's back gesture and the browser's Back all go to the previous entry (`goBack()` calls the router's `history.back()` when that entry is the app's). Each entry the app pushes stores, in its history state, the short name of the view before it, which labels Back: "‹ Search", "‹ CMSC351", or just "‹ Back" when it's the same view in another plan. Going from course to course pushes each course, so Back retraces them, but there's never a trail to aim at.
- **The first entry is a base view.** A link straight to a drill-in (a seat-alert email's `/schedule/course/CMSC216?term=`, a reload in a new tab) gets its tab's own view put under it, so Back from the course stays in the app.
- **Old-style URLs** (`/schedule?tab=search&q=`, `?term=&course=`, `?connection=`, `?result=`) redirect to their route, replacing the entry (`canonicalScheduleLocation` in `~/core/routing`, run by `schedule.index.tsx`).
- **A plain `/schedule`** opens what was saved (the tab and course, SPEC §3.13) once local state has loaded; a view the person opened meanwhile wins.
- **Two things the stores keep too.** The term and the open plan are saved app state (the open plan per term is part of the workspace, with undo): a move through history puts the stores where the URL says, and an edit that moves them replaces the URL (`useTermAndPlanInUrl`). Search's text and chips are the search box's own state per term (typing never waits on the router): `search-url.ts` writes them to the URL and follows it back on Back, Forward and arrival. Generate's filter and preference chips are its draft's, per term, and `generate-url.ts` does the same for them (arriving on a URL that names none leaves the draft's). Generate remembers whether it last showed its results, for when the tab opens again.
- Views going back stay mounted (scroll, text): Back finds its level in the stack; Forward stacks it again (`drill-stack.ts`). At most `MOUNTED_DRILLS` levels stay mounted.

Every piece of scheduler UI state, and where it lives:

| State | In the URL | History | Why |
|---|---|---|---|
| Term on screen | `term` | push | Switching terms is going somewhere. |
| Open plan tab | `planId` | push; replace when an edit moves it (new, copied, deleted, undo) | A tab is a place; edits are undone with ⌘Z, not Back. |
| Rail tab | the path (`/schedule/<tab>`) | push | |
| Course details | the path (`/schedule/course/<code>?tab=`) | push (opening the open course again: none) | The owner's "back to where I came from". |
| Connection details | the path (`/schedule/connection/<id>?tab=`) | push | |
| A generated plan's details | the path (`/schedule/result/<id>?tab=generate`) | push | Dropped (replace) after a reload: results aren't saved. |
| Generate's results vs its form | `view=results` on `/schedule/generate` | push | A finished run, and Edit, are places. |
| Generate's filter and preference chips | `prefer`, `start`, `end`, `off`, `seats`, `walk`, `blocks`, `minCredits`, `maxCredits` on `/schedule/generate`, each absent at its default | push | Each chip is a choice Back undoes; the results re-rank to match. |
| Search's text | `q` on `/schedule/search` | replace | Back skips every keystroke. |
| Search's filter chips | `gened`, `credits`, `level`, `openSeats`, `fits` on `/schedule/search` | push | Back undoes a chip. |
| Closing a view (the open course's block clicked again, the rail's tab while drilled in, Add as Plan C, a travel fix) | the view under it | push | Back reopens it. |
| Shared plan | `plan` | as opened; ✕ and Save a copy replace it away | DATA.md §8. |
| Demo switch (`pnpm dev:mock`) | `demo` | kept on every entry | |
| A section's details | not yet a view | push, as `section`, once it is one | So Back closes it like any other. |
| Course details' sub-tab jump (`grades`, `about`, `instructors`) | history state (`detailsTab`) | replace | A scroll target on arrival, not a place. |
| Sidebar collapsed, its width, theme, collapsed instructor groups | no | | Layout preferences, saved in `UiPrefs`. |
| Drawer height (phones) | no | | Layout, and the drawer raises itself for a drill-in. |
| Hover ghosts, ↑/↓ section preview, Generate's plan preview | no | | Transient: the previewed result's `result` is the place. |
| Menus, popovers, tooltips, dialogs, the color picker, the new-block popup | no | | |
| Drag to block time | no | | |
| Toasts (Undo) | no | | Undo is ⌘Z, never Back. |
| Disclosures inside a view ("More about this course", reviews, "Only fits", "Show" section numbers) | no | | Kept while the view is mounted. |
| Generate's courses | no | | A draft being filled in: saved per term (`generate` settings row), with its chips. |
| Ticked results ("Save 3 plans") | no | | |
| Register's Registered marks | no (the plan's `registered`, with undo) | | Part of the plan: synced and counted by Problems. |
| The Share popover | no | | |
| Focus | no | | Follows drill-ins (`useDrillFocus`). |

## Keyboard

`~/lib/shortcuts.ts` has `useShortcut(chords, handler)`. Handlers return `true` when they act; that key then stops there. Shortcuts never fire while typing in a field (except chords marked `whileTyping`). Effects run child-first, so a feature's handler gets a key before the shell's.

| Key | Does | Where |
|---|---|---|
| `/` | Search, and focus its field | shell |
| `1`–`7` | Rail tabs | shell |
| `Esc` | Back (the same as the browser's, see "URL state"); in a field, leave the field | sidebar |
| `⌘Z` / `Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y` | Undo, redo | shell |
| `↑` `↓` `↵` | Preview the open course's sections on the calendar, and switch to the preview (focus anywhere but the calendar) | calendar |
| `←` `→` `↑` `↓` `Home` `End` | With focus on the calendar: move between its classes, blocks, ghosts and pills (a roving tabindex, `keyboard.ts`); focusing a ghost previews it | calendar |

Every interactive element gets a tooltip through `WithTooltip` (`~/ui/tooltip`), with its shortcut if it has one.

Accessibility (what's supported, how it's tested, a manual screen-reader script) is in `docs/ACCESSIBILITY.md`. Two rules for new UI:
- A button in a list says which item it's for: `aria-label="Add 0101"` on a button that shows "Add", starting with the visible words.
- Anything drawn with a fill or a box-shadow to show state needs a forced-colors fallback (`styles.css`, "Forced colors"): `forced-fill` for meters and bars; selected states are outlined through `aria-pressed`, `aria-current` or `data-state`.

## The calendar

`~/features/calendar/week-frame.tsx` draws the frame: day headers, the hour gutter and lines, and an hour height that fills the space (never under 36px per hour; then it scrolls). Pass `days`, `startMinute`, `endMinute`, and render contents through `children(layout)`, positioning with `layout.yOf(minute)` and `layout.hourHeight`. `calendar-region.tsx` puts `src/features/calendar` in it: the model is built by the pure `buildCalendarModel` in `layout.ts` (tested and benchmarked there), and drawn by `calendar.tsx`.

Above the grid, the canvas bar (`~/components/workbench/canvas-bar.tsx`, Plan's too) holds Share at its left (`~/features/share/schedule-share`; in a narrow bar the icon alone while a hint shows, by a container query) and the hint of the moment beside it (`strips.tsx`), at one height, so a hint never moves the grid. While a course's details are open, a click or tap on empty time closes them (`closeToTab`, as the open course's block does) and no drag starts a block; blocks are drawn only outside that mode.

In `pnpm dev:mock`, `/schedule?demo=1` loads the fixtures' demo plans (a returning student's Plan A and B, blocks and colors) for e2e and screenshots. Real first visits stay empty, and production builds drop the switch.
