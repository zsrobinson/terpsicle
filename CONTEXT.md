# Terpsicle

The words we use for Terpsicle's five products and what's in them, in copy, code, docs and PRs. It's a glossary and nothing else: how things work lives in `docs/`. When a word here and a word in older docs disagree, this one wins for new work. Add a term in the same PR that introduces it (the `glossary` skill).

## Products

**Terpsicle**:
The suite of UMD academic planning tools at terpsicle.com, and the name of its brand.
_Avoid_: Planet Terpsicle, anything borrowing PlanetTerp's name

**Schedule**:
The class scheduler at `/schedule`, red, first in the product order. Older docs call it "the scheduler" or plain "Terpsicle".

**Reviews**:
Terpsicle Reviews, course and professor reviews at `/reviews`, purple.

**Chat**:
Terpsicle Chat, class chat rooms at `/chat`, blue.

**Plan**:
Terpsicle Plan, the four-year planner at `/plan`, green. In code it's `FourYear`, because a scheduler **plan** is something else.
_Avoid_: degree audit

**Todo**:
Terpsicle Todo, deadlines from ELMS at `/todo`, yellow.

**Color order**:
Schedule, Reviews, Chat, Plan, Todo (red, purple, blue, green, yellow). Menus, marketing and docs list the products in this order.

**Product menu**:
The small menu for moving between products. The owner sometimes says "app switcher".

**View link**:
A link from one product into another, worded "View schedule", "View reviews", "View chat" or "View plan".
_Avoid_: Open in Reviews, Go to Chat

## Shared

**Term**:
A semester Testudo lists (fall, spring, summer or winter). A term is **active** while Testudo lists it and **archived** after, shown under "Past terms".

**Course**:
A catalog course, named by its code (`CMSC351`).

**Section**:
One offering of a course, named by a four-character code (`0101`). You add a section to a plan, never a course.

**Meeting**:
One weekly time and place of a section: its kind (Lec, Dis, Lab), days, times, building and room. A meeting with no set time is "No set time".

**Professor**:
Whoever teaches a section, or "TBA" when Testudo hasn't named one. Copy says "instructor" on the Instructors tab and its cards, and "professor" for groups and rooms.

**GenEd**:
A UMD General Education code (DSHS, DSNL, FSAW, …). A course can count for one of several ("DSHS or DSHU"). The search chip reads "Gen-eds".

**Wildcard**:
A stand-in for any course matching a pattern (`CMSC4XX`, `CMSC42X`, `ARTTXXX`) or a GenEd ("Any DSHS course"). One matcher serves Generate and Plan.

**Seat watch**:
Watching a full or nearly full section for an opening, signed in, by push and email. The action is "Watch for a seat" (bell) and the state is "Watching" (filled bell).
_Avoid_: seat alert, opening alert (in UI; older code and docs say "seat alert")

**Bookmark**:
A course you're considering but haven't placed a section of. "Bookmark" and "Bookmarked", with the bookmark icon.
_Avoid_: save, save for later

**Sign in**:
Google sign-in with a UMD account. Schedule never needs it; it adds plan sync, Chat, writing reviews, seat watches and Todo.
_Avoid_: log in, magic link

**Directory ID**:
The part of a UMD email before the @. It's who a person is to Terpsicle: `x@umd.edu` and `x@terpmail.umd.edu` are one account.

**Sync**:
Keeping a signed-in person's plans the same on every device. On a conflict, nothing merges: the server's copy stays and the local one is kept as "<name> (copy)".

**Sparkles**:
The icon that marks LLM output, and only LLM output. Generate's results are algorithms and never get it.

**Feedback**:
What someone sends from the feedback sheet: "Report a bug" or "Suggest a feature". The owner's own notes on a page are **pinned notes**.
_Avoid_: report (that's moderation's word)

## Schedule

**Plan**:
A named set of sections, blocks and bookmarks for one term, kept in the browser (Plan A, Plan B). In copy, "plan" alone means this, never the four-year kind.

**Plan tab**:
A plan's tab in the top bar, with Rename, Duplicate and Delete in its ▾ menu.

**Rail tab**:
One of the seven sidebar tabs: Courses, Search, Problems, Travel, Blocks, Generate, Export (`1` to `7`).

**Panel**:
What the sidebar shows for the open rail tab.

**Drill-in**:
A details view opened over the current tab (course details, connection details, a Generate result). It has one "Back" that returns to where you came from.
_Avoid_: breadcrumb

**Course details**:
The one view of a course, the same from everywhere: header, section list, and the Instructors, Grades and About tabs.

**Professor group**:
A course's sections grouped by who teaches them, the only grouping there is, shown only when there's more than one professor.
_Avoid_: lecture group

**Lecture group**:
Retired. Section codes already say which sections share a lecture, so there's no lecture layer in course details or Chat.

**Section row**:
One section in a list: its code, every meeting, a fit label, seats, and one add, switch or remove button.

**Fit**:
Whether a section works with the plan: no overlap, enough time to get there, and clear of blocks. Fit labels are words ("Fits", "Overlaps ENGL393", "Not enough time after CMSC330").

**Ghost**:
A dashed preview of another section on the calendar while a course is open. Sections at identical times share one ghost ("0101–0106 · 6 sections").

**Block**:
Busy time you add, with a label (Lunch, Work, Gym, Club) and no place. It counts for fit, Problems and Generate, and never for travel.

**Connection**:
Two back-to-back classes in different buildings, and the walk between them. Its **travel pill** ("6 min") sits between them on the calendar.

**Accessible routes**:
The travel setting for routes without stairs.
_Avoid_: step-free

**Problem**:
Something about a plan worth knowing: an error (not enough time, a cancelled or changed section), a warning (overlap, tight connection, full, few seats, restricted) or info (no set time, TBA). Listed in the Problems tab, never in a banner.

**Fix**:
The one-click remedy a problem offers: "Switch to 0205" when a section solves it without new problems, or "Watch for a seat" for a full section. The owner calls this **auto-resolution**.

**Generate**:
Making new plans from the courses you need, must-haves and a ranking. It creates plans; it never edits one.
_Avoid_: AI (it's an algorithm)

**Generate result**:
One ranked candidate plan from Generate, with a mini week and plain stats. "Save as new plan" makes it a plan.

**Must-have**:
A rule every Generate result follows (earliest start, days off, open seats only, …). A **relaxation** loosens one when nothing fits.

**Share link**:
A URL that carries a whole plan. It opens read-only as a **shared plan** with "Save a copy".

## Reviews

**Review**:
A signed-in student's rating and text for a course and professor. Readers, moderation and the admin never see who wrote it.

**Review summary**:
The LLM summary of a professor's reviews, with theme chips. It carries the sparkles.

**PlanetTerp**:
The outside site whose ratings and grade data we show, with credit and a link.

## Chat

**Room**:
A chat for part of a course, derived from the catalog. Nobody creates one, and nothing's stored for it until its first message.

**Course room**:
The room for everyone in a course ("CMSC131 · everyone"), open to anyone signed in.

**Professor room**:
The room for one professor's sections, only when a course has more than one professor ("Sadeghian's sections").

**Section room**:
The room for one section, named by its meetings. Only courses with two or more sections have them.
_Avoid_: lecture room

**Chat plan**:
The synced plan a term's rooms come from ("Rooms from Plan A ▾").

## Moderation

**Moderation**:
Screening reviews and chat messages, model first, so only unclear cases reach a person.

**Visible**:
Everyone who can read the room or page sees it.

**Checking**:
Being screened. Only its author sees it, with "Checking before classmates see it…".

**Held**:
Waiting for a person. Only its author sees it, with a plain note saying why, never in red.

**Removed**:
Taken down. Nobody sees the text; its author is told.

**Report**:
A signed-in person flagging a review or message, with a reason. Enough reports hide it until a person decides.
_Avoid_: feedback (that's the feedback sheet's)

**Moderation queue**:
Held and reported items waiting for the owner in `/admin`. It's meant to stay small.

**Admin**:
The owner, the only admin and moderator. Contact is admin [at] terpsicle.com.

## Plan

**Four-year plan**:
One person's courses laid out term by term through graduation, with a "Before" column for AP and transfer credit. Copy says "Plan"; people may keep a few.

**Term status**:
Where a term in a four-year plan stands: done, in progress or planned, worked out from the academic calendar. Not the catalog's active or archived.

**Placeholder**:
A wildcard in a four-year plan ("CMSC4XX", "Any DSHS course"), dashed, counting 3 credits by default until you pick a real course.

**Transcript import**:
Pasting Testudo's unofficial transcript into Plan: Paste, Check, Import. The paste never leaves the browser, and grades stay private.

**Template**:
A hand-made starting four-year plan for a major, credited to its source.

## Todo

**ELMS feed**:
A student's ELMS calendar link (an `.ics` URL). It's a secret: stored encrypted, never shown back, never logged.
_Avoid_: ELMS password, access token

**Item**:
One assignment, quiz or event from the feed, with a due time and a done mark.

**Exam**:
An item whose title reads like one. It's a guess, shown as a hint.

**Gradescope tag**:
The "Gradescope" tag on an item whose ELMS entry links to Gradescope. Terpsicle never signs in to or fetches Gradescope.

**File import**:
"Add a calendar file": an `.ics` the student exported, read in the browser. Its items say "From a file" and don't update.

**Due tomorrow**:
Todo's one notification.

## Working on Terpsicle

**Owner**:
The person who decides what Terpsicle is. Owner decisions in `docs/decisions.md` are principles; agent ones are defaults.

**Preview**:
A PR's own deployment at `pr-<n>-terpsicle.zsrobinson.workers.dev`, with its own database, production data files, no crons, and sign-in through test mode.

**Test mode**:
Sign-in with fixture people (Test Student, Test Classmate, Test Admin) instead of Google, only on previews and localhost.

**Flag**:
A product's on switch in production (`REVIEWS_ENABLED`, `CHAT_ENABLED`, `TODO_ENABLED`).

**Load rule**:
How much an agent may run locally: `tsc` once, biome on changed files, the relevant tests with one worker. CI is the verdict.
