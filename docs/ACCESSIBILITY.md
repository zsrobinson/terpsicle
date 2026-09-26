# Accessibility

Terpsicle targets **WCAG 2.2 AA** on desktop and phone, in both themes. This page says what that means here, how it's tested, what's still missing, and how to check it by hand with a screen reader.

## What we support

### Structure and names
- **Landmarks:** a banner (the top bar), the rail's "Sidebar tabs" navigation, the "Sidebar" (complementary), and `main` (the calendar, a "Week calendar" region). Two skip links come first: "Skip to calendar" and "Skip to sidebar".
- **Headings:** one `h1` (the logo), an `h2` per panel ("Plan A", "Search", a course's title in its details), and an `h3` per section ("Sections", "Grades", "Bookmarked", "Must have").
- **Lists:** courses, search results (a listbox), each group of sections in course details, problems, connections, generated plans and the registration checklist.
- **Names that say which one.** In a list of 92 sections, each button says its section: "Add 0101", "Switch to 0205", "Get an email when a seat opens, ENGL101 0205". Each name starts with the words on screen, so voice control works (WCAG 2.5.3).
- **States:** `aria-pressed` on the rail tabs, filter chips and day toggles; `aria-expanded` on groups and disclosures; `aria-current` on the open plan, the current section and the open drill-in's name beside Back; `aria-selected` on the highlighted search result.
- **Decorative icons are hidden.** The one meaningful icon is the sparkles on an LLM review summary, named "AI summary".
- **The page title says where you are:** "Plan A · Spring 2027 · Terpsicle", or "CMSC351 · Terpsicle" while a drill-in is open (WCAG 2.4.2).
- `lang="en"` on the page.

### The calendar
The week reads as five labeled day groups ("Monday", …). Each class, block, ghost and travel pill is a button named in full: "CMSC351 0301, Monday 11am to 11:50am, CSI 1115", "Switch to 0201, another section of CMSC351: Monday 2pm to 2:50pm, Jada Abernathy, overlaps Work", "8 min walk, tight. ESJ to CSI, 10 minutes between classes." Within a day they're in time order, so a screen reader in browse mode hears the day as it goes.

**Keyboard model: a roving tabindex, not an ARIA grid.** The calendar is one Tab stop. From there:

| Key | Does |
|---|---|
| `↑` `↓` | The previous or next thing in the day, in time order (classes, blocks, ghosts and pills). Stops at the ends. |
| `←` `→` | The nearest thing in time on the previous or next day that has anything (empty days are skipped). |
| `Home` `End` | The day's first or last thing. |
| `Enter` / `Space` | Presses it: a class opens its course (again: closes it), a ghost switches to that section, a merged ghost opens its list of sections, a pill opens the connection, a block opens Blocks. |
| `Tab` | Leaves the calendar. `Shift+Tab` back in returns to the last thing focused. |

- **Ghosts are options.** Focusing one previews it solid on the calendar and highlights its row in the sidebar, exactly like pointing at it. `Enter` switches, and focus moves to the class the ghost became (not to the page).
- While a course's sections show, Tab lands on that course's class, so its ghosts are an arrow away.
- The keys are described to a screen reader once, as focus first arrives, until the arrows have been used.
- **Why not a grid:** the week isn't a table of cells. Things start at any minute, overlap side by side, and most half-hours are empty. A grid would have a screen reader step through empty cells, and would switch it out of browse mode, where the day groups already read well.
- **Resolving the ↑/↓/↵ conflict:** course details' section preview (`↑`/`↓` step through the open course's sections, `↵` switches) still works anywhere *outside* the calendar, the sidebar included. *Inside* the calendar the arrows move focus and `Enter` presses what's focused. Both end the same way: focusing a ghost is previewing it.

### Alternatives to dragging (WCAG 2.5.7)
- **Blocks:** dragging on empty calendar time is a shortcut. The Blocks tab (`5`) has the form, and the calendar's hover hint says so ("Drag to block off time, or add one in Blocks 5"), as does its screen-reader description.
- **Sidebar width:** the handle is a focusable separator: arrows move it 16px, `Home`/`End` jump to 320 and 480px.
- **The phone drawer:** the grabber is a button ("Raise the panel" / "Lower the panel") that steps peek → half → full → peek. Tapping a tab raises it; focusing anything inside raises it.

### Focus
- Every focused control shows a 2px ring.
- **Never hidden (2.4.11):** panel bodies keep `scroll-padding` under their two sticky levels (the Sections bar and a group header), and the calendar under its sticky day names and a phone's drawer, so focus scrolls clear of them.
- Drill-ins take focus as they open and give it back to what opened them on `Esc` or Back (the browser's Back too). Menus and popovers return focus to their trigger, without a tooltip popping up over it.
- No focus traps: there are no modal dialogs.

### Zoom, reflow and text spacing
- At 200% zoom (1280px → 640px) the phone layout takes over; at 400% (320px wide) nothing scrolls sideways. The filter chips wrap on a phone-width screen instead of hiding off the edge.
- On a short screen (under 480px tall, like 320×256), "half" opens the drawer all the way and the whole panel scrolls, so a list under a search box or form keeps a usable height.
- With WCAG 1.4.12 text spacing (letter 0.12em, word 0.16em, line 1.5) nothing overlaps; long lines truncate with an ellipsis, and the full text is in the control's tooltip, including the Add/Switch button's tooltip in a section row.

### Color and forced colors
- **Color is never the only signal (1.4.1):** fit labels are words ("Fits", "Overlaps ENGL393"); seats are words plus a meter ("2 left"); problems have an icon and words; travel pills swap the route icon for a warning triangle (tight) or a crossed circle (not enough time), and say so in their names.
- **Windows High Contrast / forced colors:** pressed and current controls get a `Highlight` outline (rail tabs, plan tabs, chips, day toggles, the current and previewed section rows). The open course's class gets a thicker border in place of its ring (a box-shadow, which forced colors drop). Ghosts keep their dashed border. Tooltips and toasts get a border. Seat meters, grade bars and generate's mini-weeks keep a `CanvasText` fill. Course tints are lost there, but every block carries its course code.

### Motion
`prefers-reduced-motion` turns off every animation and transition (menus, the drawer, drill-ins, toasts) and makes scripted scrolls instant: the ghost auto-scroll and the "Grades ↓" jump.

### Live regions and timing
- **Toasts** (sonner) are a polite live region. An undo toast stays 10 seconds, pauses while hovered or while its button has focus, and `⌘Z`/`Ctrl+Z` undoes after it's gone. Other toasts stay 8 seconds. `Alt+T` moves focus to them.
- **Search** announces the result count once typing settles.
- **Generate** announces "Generating plans…" and then "Found 19 plans." (or "No plans fit."), once each; the running count on screen isn't a live region.
- **Seat alerts:** the bell's popover says the outcome in a status message and moves focus to it. A failure keeps the email field, marks it invalid and ties the message to it with `aria-describedby`. The field has `autocomplete="email"`.

### Phones
- Every target is at least 24×24 CSS px (2.5.8), including calendar blocks, ghosts and travel pills (a 24px hit area around the 20px pill).
- The drawer comes after the calendar in the page, so swiping through with VoiceOver or TalkBack reads the top bar, the calendar, then the drawer's tabs and panel. "Skip to sidebar" jumps straight there.

## How it's tested

| What | Where |
|---|---|
| axe-core, WCAG 2.0–2.2 A/AA + best practices, light and dark, desktop and 390×844 phone: every tab, search, course details at 1 / few / many sections, menus, popovers, connection details, generate, a focused ghost and a merged ghost's popover | `e2e/a11y.spec.ts` |
| Skip links, drill-in focus, menus, the color picker, chips, focus rings | `e2e/keyboard.spec.ts` |
| The calendar's keyboard model; ghosts previewed on focus and switched with Enter; the sidebar's ↑/↓ still previewing; focus never under sticky headers (ENGL101, generate results); forced colors (axe, plus ghosts dashed, the open class's border, outlines on selected states, focus rings, meter fills); reflow at 320×640 and 320×256; the page title; an undo toast held by focus | `e2e/a11y-beyond-axe.spec.ts` |
| Arrow-key rules (`moveFocus`, `tabStop`), accessible names (`labels.ts`), the title (`documentTitle`) | unit tests next to each |

Run them with `pnpm test:e2e` (all) or `pnpm test:e2e e2e/a11y-beyond-axe.spec.ts`.

## Known limitations
- **No manual screen-reader pass has been recorded yet.** The script below is for the first one.
- **Course colors disappear in forced colors.** Codes and borders carry identity there; that's the platform's choice.
- **The plan tab truncates hard at 320px wide** ("P…"). Its full name is its accessible name and tooltip, and the Courses panel's heading repeats it.
- **The drawer's snap on a short screen** is peek or full; there's no useful half at 256px tall.
- **Drag-to-block has no keyboard gesture on the grid itself;** the Blocks form is the way (2.5.7 allows it).
- **The route map** is a MapLibre canvas; its text alternative is the connection's words and numbers above it.

## Manual screen-reader test script

About 15 minutes per reader. Use `?demo=1` on a local `pnpm dev:mock`, or real data on terpsicle.com with a few courses added. Note anything that's silent, doubled, out of order or unclear.

### VoiceOver on macOS (Safari)
1. `⌘F5` to start VoiceOver. Load the page. Expect the title "Plan A · Spring 2027 · Terpsicle".
2. `VO+U` → Landmarks: banner, Sidebar tabs, Sidebar, main. Headings: "Terpsicle" (1), "Plan A" (2), "Bookmarked" (3).
3. `Tab` once: "Skip to calendar, link". `Enter`, then `Tab`: the first class, its full name, then the arrow-key description.
4. `↓` through Monday: each class, then "8 min walk, tight…" between them. `→` to Tuesday. `End`, `Home`.
5. On a class, `Enter`: the course's details open ("CMSC351, region"); the title becomes "CMSC351 · Terpsicle".
6. `Shift+Tab` back to the calendar: it lands on the course's class. `↓` onto a ghost: "Switch to 0201, another section…". `Enter`: expect the toast "Switched CMSC351 to 0201", and focus on the new class.
7. `Esc`: back to where you were. `/` then type "engl 101": the result count is announced once.
8. Open ENGL101. `VO+⌘H` through the headings; in a time group, check the buttons say "Add 0101", not just "Add". Open a bell, submit an address, and hear the outcome.
9. In Courses, remove a course from its menu: the toast is announced. Reach it (`Tab` to the end, or `Alt+T`) and press Undo before it goes.
10. In Generate, add two courses and generate: hear "Generating plans…" then "Found N plans."

### VoiceOver on iOS (Safari)
1. Settings → Accessibility → VoiceOver on. Load the page.
2. Swipe right from the top: "Skip to calendar", "Skip to sidebar", the logo, term, plans, problems, the calendar's days and classes, then the drawer's grabber, tabs and panel.
3. Double-tap "Raise the panel": the drawer rises; swipe into it. Double-tap again for full, again for peek.
4. Double-tap a class: course details open in the drawer. Swipe to a ghost and double-tap: the section switches.
5. Rotor → Headings in course details: the course's title, "Sections", group headers.
6. Remove a course: the toast is read, and Undo is reachable with a swipe before it goes.

### NVDA on Windows (Firefox or Chrome)
1. Start NVDA. Load the page. `D` cycles landmarks; `H` headings (one level 1).
2. `Tab` to the calendar (or the skip link): NVDA switches to focus mode on the class, reads its name and the arrow-key description once.
3. Arrows as in the macOS steps 4–6. Check that `←`/`→` don't read "blank" and never leave the calendar.
4. `Insert+Space` back to browse mode: arrowing down reads "Monday grouping", then each class in time order.
5. Turn on Windows High Contrast (Settings → Accessibility → Contrast themes). Check: the selected rail tab and plan tab are outlined, ghosts are dashed, the open course's class has a thick border, the focus ring shows, seat meters and grade bars are filled, tight pills show the warning icon.
6. Zoom to 400% (`Ctrl +`): nothing scrolls sideways; the drawer's grabber opens the panel fully; search results can be reached.
