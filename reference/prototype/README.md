# Reference prototype (read-only)

The clickable prototype built with the owner over three review rounds. **It's the visual and interaction reference for v2:** match its look, density, spacing, copy and interactions. **Don't copy its code structure.** It's prototype-grade: one big store, no tests, and inline logic.

- **`built/final.html`:** open it in a browser. It's the Drill-in app with every final-review pick applied (`src/review/design.ts` → `FINAL`). The bottom bar toggles first visit, reset and theme.
- **`built/review.html`:** the final review page itself (39 questions with every option, including the rejected ones). Useful to see what was *not* chosen. The answers are in `docs/review-answers.json`.
- **`screenshots/`:** key states of `final.html`, in light mode, plus one dark.
- **Source:** `src/`. Entry points: `final-main.tsx` (final), `review-main.tsx` (review), `main.tsx` (round-2 variants). Run `npm i` then `npm run dev:final`, `npm run dev:review` or `npm run dev`.
- Excluded from the root build, lint and tests. Never import from here.

## Where the prototype differs from the spec (the spec wins)

| Area | Prototype | Spec |
|---|---|---|
| Calendar height | Fixed hour height; a tip line under the grid | Fills the viewport height; nothing below the grid |
| First visit | One primary path (search) plus a small "or generate" link | Two **equal** paths side by side: build it yourself / generate plans |
| Terms | Hard-coded "Spring 2027" | Terms come from Testudo automatically (`SPEC.md` §3.0) |
| Grades | Five plain bars | PlanetTerp-style bars: A, B, C, D, F, W, Other, with +/plain/− segments |
| Course color | Fixed per course | Click the color dot to pick from a preset palette |
| Search filters | Gen-ed buttons plus two toggles | One line of dropdown/toggle chips (Gen-eds ▾, Credits ▾, Fits my plan, Open seats, Level ▾) that fill when active |
| Instructor groups | Not collapsible | Collapsible, sections kept in section-number order |
| Many sections | Every ghost drawn | Time-identical sections merged into one ghost; capped at ~12 ghosts |
| Blocks | A "place" field and a block with a place | No places; blocks never affect travel time |
| Route map | Straight line on a dot map | The real GIS route geometry on real map tiles; hidden if missing |
| Shared link | A banner with names ("Alex's plan") | A light-red pill replacing the plan tabs: "Shared plan · Save a copy · ✕", no names |
| Mobile | A static mock | Sidebar becomes a bottom drawer (peek/half/full); calendar stays a week grid |
| Seat alerts | An email box | Adds dedupe ("already watching") and confirmation before unsubscribing |
| Generate | Required/optional, 3 must-haves, 3 sorts | Pick-N groups, full must-haves, ranking with custom weights, merged equivalents, save several, relaxations, near-misses |
| Not in the prototype | | Saturday column, TBA instructors, catalog-change problems, freshness from real data, .ics |
| Overlap tooltip | "Overlaps another class" on hover | Fine to keep; still no red outline |

Mock data (`src/data.ts`): course codes, gen-eds and buildings are real UMD ones; instructors, ratings, reviews, seats and grades are invented.
