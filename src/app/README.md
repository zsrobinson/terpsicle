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
| `usePlanProblems()`, `useProblemCounts()` | Problems for the plan on screen (core computes them). |

Stores (Zustand) for everything else:

- `useWorkspace` (`~/state/workspace-store`): plans, blocks, course colors, travel settings and the open plan per term. Change the workspace only through `commit(label, recipe, { toast? })` or `dispatch(action, label)`; both keep undo history, and `label` ("Removed CMSC351 from Plan A") becomes the Undo toast. Use `{ toast: false }` for quiet edits (renames). `setTravel` saves settings without history.
- `useUi` (`~/state/ui-store`): `drill(entry)`, `replaceDrill(entry)`, `back()`, `backTo(depth)`, `openTab(tab)`, `requestFocus(tab)`, `toggleGroup(key)`, the drawer's snap.
- `useCatalog` (`~/state/catalog-store`): terms, and per term the manifest, seats and loaded courses. `ensureDepts(termId, depts)` loads departments through the data source (`~/state/data-source`).

User actions that should be counted (creating plans, switching terms, undo) go through `actions.ts`, which records the analytics event (`docs/ANALYTICS.md`). Generate saves its results with `createPlanFrom(termId, courses, { source: "generate", name })`.

## Keyboard

`shortcuts.ts` has `useShortcut(chords, handler)`. Handlers return `true` when they act; that key then stops there. Shortcuts never fire while typing in a field (except chords marked `whileTyping`). Effects run child-first, so a feature's handler gets a key before the shell's.

| Key | Does | Where |
|---|---|---|
| `/` | Search, and focus its field | shell |
| `1`–`7` | Rail tabs | shell |
| `Esc` | Back one drill level; in a field, leave the field | sidebar |
| `⌘Z` / `Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y` | Undo, redo | shell |
| `↑` `↓` `↵` | Reserved: preview and switch sections on the calendar | calendar (M3 part 2) |

Every interactive element gets a tooltip through `WithTooltip` (`~/ui/tooltip`), with its shortcut if it has one.

## The calendar

`calendar/week-frame.tsx` draws the frame: day headers, the hour gutter and lines, and an hour height that fills the space (never under 36px per hour; then it scrolls). Pass `days`, `startMinute`, `endMinute`, and render contents through `children(layout)`, positioning with `layout.yOf(minute)` and `layout.hourHeight`. `calendar-region.tsx` is where the plan's calendar goes (M3 part 2).
