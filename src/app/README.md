# The shell (`src/app`)

The layout from `SPEC.md` §2: top bar, labeled rail, one sidebar panel with drill-in, and a calendar that fills the rest. On phones (≤ 768px) the same pieces, with the sidebar in a bottom drawer. State lives in `src/state`; this folder puts it on screen.

Features (`src/features/<feature>/`) plug into the shell without editing anything here.

## Add a tab panel or a drill-in view

Create `src/features/<feature>/panels.tsx` that exports `panels`. The shell finds every such file at build time (`import.meta.glob` in `registry.tsx`).

```tsx
// src/features/search/panels.tsx
import { definePanels } from "~/app/registry";
import { CourseDetails } from "./course-details";
import { SearchPanel } from "./search-panel";

export const panels = definePanels({
  // The panel shown when the rail's Search tab is open.
  tabs: { search: SearchPanel },
  // Views that drill in over whatever tab is open.
  drills: {
    course: {
      component: CourseDetails, // gets { entry: { kind: "course", courseCode, tab? } }
      crumb: (entry) => entry.courseCode, // "Search › CMSC351"
      monoCrumb: true,
    },
  },
});
```

- **One owner per tab or drill kind.** Registering the same one twice logs a warning.
- **Tabs:** `courses`, `search`, `problems`, `travel`, `blocks`, `generate`, `export`. Until a feature registers one, the tab shows a neutral skeleton.
- **Drill kinds:** `course` and `connection` are declared in `~/state/drill` (they're remembered between visits). Add a new kind with module augmentation in your feature, then register its view:

  ```ts
  declare module "~/state/drill" {
    interface DrillViews {
      "generated-plan": { resultId: string };
    }
  }
  ```

  Only `course` and `connection` are restored on the next visit (`UiPrefs.drill`). Other kinds last for the session.
- **Effects:** `effects: [Component]` mounts components that render nothing, once, for app-wide work a feature owns (the `?term=&course=` deep link in `courses`, the seat-alert sync in `alerts`). `FeatureEffects` in the shell renders them.

## Build a panel

Use the pieces in `panel.tsx` so every panel matches the prototype:

- `PanelHeader({ title, sub?, right? })`: the 48px header ("Plan A / 5 courses · 16 credits").
- `PanelBody`: the scroll area under the header.
- `PanelLabel`: a small section label ("Saved for later").
- `useFocusRequest(tab)`: a ref the shell focuses on request; `/` focuses Search's field with `useFocusRequest<HTMLInputElement>("search")`.

Panels and drill levels stay mounted while hidden, so going back (`Esc` or the breadcrumb) returns to exactly where the person was: scroll position, typed text, open groups. Don't reset local state on mount.

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

Published data beyond the term catalog, in `~/state/data-hooks`. Each hook starts its own load (from the IndexedDB cache first, then the server), once per session:

| Hook | Returns |
|---|---|
| `useSeatsFreshness(termId)` | `{ state, text, asOf }`. Put `text` above a section list: "Seats as of 2 min ago" (`live`, from Testudo's as-of time), "Seats stopped updating when this term was archived." (`archived`), "Offline · showing saved data" (`offline`), "Seats unknown" (`unknown`), or "" while `loading`. It re-renders every 30 s. |
| `useInstructors(dept)` | `{ data, state }`: the department's PlanetTerp file (`instructors` by slug, `names` for the Testudo-name join, `grades` per course), or `null` when PlanetTerp has none. |
| `useAcademicCalendar(termId)` | `{ calendar, state }`: the provost calendar for .ics export. `status: "not-published"`, or `ready` with no calendar (no file yet), means the dates aren't out: say so plainly. Cached, so it works offline. |
| `useCampus()` | `{ campus, state }`: core's `CampusMap` (routes and off-campus codes), `EMPTY_CAMPUS` until loaded. |
| `useRouteGeometry(from, to, mode)` | `{ geometry, state }`: a connection's walking path for a map. `geometry` stays `null` when there's no file: hide the map, never draw a straight line. |
| `useCatalogPolling(termId)` | The seat poll. The shell runs it for the term on screen, so features don't need to. |

Stores (Zustand) for everything else:

- `useWorkspace` (`~/state/workspace-store`): plans, blocks, course colors, travel settings and the open plan per term. Change the workspace only through `commit(label, recipe, { toast? })` or `dispatch(action, label)`; both keep undo history, and `label` ("Removed CMSC351 from Plan A") becomes the Undo toast. Use `{ toast: false }` for quiet edits (renames). `setTravel` saves settings without history.
- `useUi` (`~/state/ui-store`): `drill(entry)`, `replaceDrill(entry)`, `back()`, `backTo(depth)`, `openTab(tab)`, `requestFocus(tab)`, `toggleGroup(key)`, the drawer's snap, and the calendar fields below.
- `useCatalog` (`~/state/catalog-store`): terms; per term (`byTerm[termId]`) the `manifest`, `seats`, `changes` (the changes file; `usePlanProblems` already feeds it to core) and a core `CatalogIndex`; the campus map; `instructors` and `calendars`. `ensureTerm(termId, first?)` loads every department, `first` ones first (the shell does this for the term on screen, with the plan's departments first), `ensureDepts(termId, depts)` a few, `ensureCampus()` the buildings and routes files, `refreshTerm(termId)` revalidates, and `retry()` tries a failed load again.
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

Open a course the one way: `openCourse(code)` from `~/features/courses/actions` (a `course` drill). The same file has `removeCourse(code, via)` and `saveCourseForLater(code, via)` (`via` = `"details"` from course details), each one undoable commit with its toast and event, and `editablePlan()` (the open plan, or null in a shared view). `~/features/problems/actions` has `applyFix(problem, fix)` and `openSubject(subject)`; `LinkedMessage` (`~/features/problems/linked-message`) renders a core `Message` with its courses and blocks as links.

Seat alerts (`~/features/alerts/seat-alerts`, backed by the `useSeatAlerts` store in `~/state/seat-alerts` and Dexie `seatAlerts`):

| Export | For |
|---|---|
| `useSeatAlert(termId, sectionKey)` | The bell's state: `unavailable` (hide the bell), `none`, `pending` (show "Check your email"), `watching`. |
| `subscribeSeatAlert(email, termId, sectionKey)` | Watch: returns an outcome (never throws) and writes a pending row. `subscribeMessage(outcome)` words it, including "You're already watching this." from the local list. |
| `useLastSeatAlertEmail()` | The address used last in this browser, to prefill the field. |
| `useSeatAlertsAvailable()` | False once the server says seat alerts are off. |
| `useSeatAlertList(termId?)`, `stopSeatAlert(termId, sectionKey)` | Export's list and its Stop watching (after the inline confirmation). |

`SeatMeter` (`~/features/courses/seat-meter`) draws seats as a meter plus words for any section key.

## Search and course details

Each is behind a small hook, so where the work happens can change without touching the components:

| Export | For |
|---|---|
| `useCourseResults(termId, query, filters)` (`~/features/search/use-course-search`) | `idle`, `loading` or `ready` with courses. Runs core search on the main thread over an index built once per catalog (`courseSearchFor`); moving it into the web worker changes this file only. `findCourses` is the pure part. |
| `useTermSearch(termId)`, `useSearchStore` (`~/features/search/search-store`) | The query and filters, remembered per term for the session. |
| `instructorFor(data, name)` (`~/features/course-details/planetterp`) | The PlanetTerp instructor for a Testudo name, from `useInstructors(dept)`'s file. |
| `useReviewSummary(slug, course)` (`~/features/course-details/use-review-summary`) | The LLM summary: `loading`, `shown` or `hidden` (every "unavailable" and every failure hides it; "busy" is asked once more after 4 s). One request per instructor per visit. |
| `SeatBell` (`~/features/course-details/seat-bell`) | The bell for a low or full section, over `useSeatAlert`/`subscribeSeatAlert`. |

## Travel and the route map

`src/features/travel` owns the Travel tab and the `connection` drill (connection details). Open a connection with `useUi.getState().drill({ kind: "connection", connectionId })`; settings change through `setPace`, `setAccessible` and `setExtraMinutes` in `~/features/travel/actions` (each records `travel_settings_changed`).

The route map draws UMD's path for the pair and mode (`geo/route/<from>-<to>-<mode>.json`), never a straight line; with no geometry it's hidden, with one quiet line. Live data draws it with MapLibre GL on `geo/tiles.pmtiles` (HTTP range reads through `/data`), in its own lazily loaded chunk, restyled from the theme tokens (`map-style.ts`). Mock mode has no tiles, so it draws the same path as an SVG on a plain themed background; so does a browser without WebGL.

## The calendar's store fields

Features talk to the calendar through three `useUi` fields. None is persisted.

| Field | Set by | The calendar |
|---|---|---|
| `hoverCourse` (`setHoverCourse(code \| null)`) | Search, on a result's pointer enter/leave | Shows that course's sections as ghosts, not clickable ("Open it to pick one."). |
| `previewSection` (`setPreviewSection(key \| null)`) | Course details, on a section row's pointer enter/leave; the calendar itself for ghost hover and `↑`/`↓` | Draws that section of the open course solid. `↵` switches to it. Cleared when the open course changes. |
| `previewPlan` (`setPreviewPlan({ plan, label } \| null)`) | Generate, while a result is previewed | Draws that plan instead of the open one, read-only, outlining sections that differ, under "Previewing <label>." |

Ghosts for the course open in the sidebar come from the drill stack itself (`selectOpenCourse`): opening course details anywhere shows them, and `Esc` hides them. `selectGhostCourse` is the course whose ghosts are drawn (a hover wins).

For the color dot, use `CourseColorPicker` from `~/features/courses/color-picker` (`courseCode`, `color`, `readOnly`); for dots and tints elsewhere, `dotStyle(color)` and `tintStyle(color)` from `~/features/calendar/tint`. Render core `Message`s with `MessageText` (`~/app/message-text`).

## Keyboard

`shortcuts.ts` has `useShortcut(chords, handler)`. Handlers return `true` when they act; that key then stops there. Shortcuts never fire while typing in a field (except chords marked `whileTyping`). Effects run child-first, so a feature's handler gets a key before the shell's.

| Key | Does | Where |
|---|---|---|
| `/` | Search, and focus its field | shell |
| `1`–`7` | Rail tabs | shell |
| `Esc` | Back one drill level; in a field, leave the field | sidebar |
| `⌘Z` / `Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y` | Undo, redo | shell |
| `↑` `↓` `↵` | Preview the open course's sections on the calendar, and switch to the preview | calendar |

Every interactive element gets a tooltip through `WithTooltip` (`~/ui/tooltip`), with its shortcut if it has one.

## The calendar

`calendar/week-frame.tsx` draws the frame: day headers, the hour gutter and lines, and an hour height that fills the space (never under 36px per hour; then it scrolls). Pass `days`, `startMinute`, `endMinute`, and render contents through `children(layout)`, positioning with `layout.yOf(minute)` and `layout.hourHeight`. `calendar-region.tsx` puts `src/features/calendar` in it: the model is built by the pure `buildCalendarModel` in `layout.ts` (tested and benchmarked there), and drawn by `calendar.tsx`.

In `pnpm dev:mock`, `/?demo=1` loads the fixtures' demo plans (a returning student's Plan A and B, blocks and colors) for e2e and screenshots. Real first visits stay empty, and production builds drop the switch.
