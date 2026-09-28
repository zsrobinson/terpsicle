# Terpsicle

The words we use for Terpsicle's five products and what's in them, in copy, code, docs and PRs. It's a glossary and nothing else: how things work lives in `docs/`. When a word here and a word in older docs disagree, this one wins for new work. Add a term in the same PR that introduces it (the `glossary` skill).

## Products

**Terpsicle**:
The suite of UMD academic planning tools at terpsicle.com, and the name of its brand.
_Avoid_: Planet Terpsicle, anything borrowing PlanetTerp's name

**Schedule**:
The class scheduler at `/schedule`, red, first in the product order. Older docs call it "the scheduler" or plain "Terpsicle"; copy calls it Schedule.

**Reviews**:
Terpsicle Reviews, course and professor reviews at `/reviews`, purple.

**Chat**:
Terpsicle Chat, class chat rooms at `/chat`, blue.

**Plan**:
Terpsicle Plan, the four-year planner at `/plan`, green. In code it's `FourYear`, because a scheduler **plan** is something else.
_Avoid_: degree audit

**Todo**:
Terpsicle Todo, deadlines from ELMS and your own tasks on a calendar at `/todo`, yellow.

**Color order**:
Schedule, Reviews, Chat, Plan, Todo (red, purple, blue, green, yellow). Menus, marketing and docs list the products in this order.

**Product menu**:
The small menu for moving between products. The owner sometimes says "app switcher".

**View link**:
A link from one product into another, worded "View schedule", "View reviews", "View chat", "View four-year plan" or "View todos" (`PRODUCTS`' `view`). Each is counted as `cross_link_clicked`. Plan's says "four-year" because in Schedule "plan" alone is Plan A or B.
_Avoid_: Open in Reviews, Go to Chat, Open the scheduler

## Shared

**Marketing page**:
`/` for a first visit (returning people go to `/schedule`). Its **story** is the hero, then one **step** per product in color order, beside **the screen**: a sample of Schedule with Plan A that stays in view (sticky) while the steps scroll past. Each step's **piece** lands on the screen: the Problems tab, a rating card, a section's room, a semester of Plan, a few of Todo's cards. Everything on the screen is a sample: nothing is saved or sent.
_Avoid_: landing page (in copy), the atom, the tangle or detangle (rejected designs)

**Family bar**:
The one bar on every page: the wordmark, the Early access chip and the five products as tabs (folded into the product menu on narrow screens), the product's context, then the bell (signed in), the coffee button, Feedback and the account. On phones, and on the scheduler's and Plan's bars below 1536px (where the Early access chip also gives its room to the product's context), the coffee button is "Buy me a coffee" in the account menu, and on a phone where the bar carries context (the scheduler, Chat's term), the bell and Feedback move there too. Code says `AppBar`.

**Mark**:
One of the six pixel drawings on a 9×9 tile: the umbrella (Terpsicle itself, black) and one per product, in its color. The app icons and favicon are the umbrella's tile alone. Code says `Mark`, drawn from `src/app/brand/marks.ts`.
_Avoid_: logo (that's the umbrella and the wordmark together), icon (for a product's mark)

**Early access**:
The small chip beside the wordmark saying Terpsicle's still in active development and may change. Phones show it in the product menu instead.
_Avoid_: beta, preview

**Coffee button**:
The cup-with-a-heart button beside Feedback. It opens a short note and a "Buy me a coffee" link to the developer's Buy Me a Coffee page. Nothing opens it but a click.
_Avoid_: donate, tip

**Sheet**:
What a popover becomes on a phone: a panel that slides up from the bottom edge, closed with a swipe down, a tap above it or Esc (Notifications, Send feedback). Code says `Sheet`. Not the scheduler's drawer, which is always there.
_Avoid_: modal, bottom sheet

**Page kind**:
How a page sits under the family bar: note (560px: Settings, sign-in), reading (720px: Reviews, Privacy), app (1120px: admin), or full (a workbench and Todo, or Chat's split).

**Workbench**:
A product laid out like the scheduler: the rail of views, the sidebar and the canvas, with the same drawer on phones. Schedule and Plan are workbenches. Code has it in `src/app/workbench`.

**Term**:
A semester Testudo lists (fall, spring, summer or winter). A term is **active** while Testudo lists it and **archived** after, shown under "Past terms".

**Course**:
A catalog course, named by its code (`CMSC351`).

**Section**:
One offering of a course, named by a four-character code (`0101`). You add a section to a plan, never a course.

**Meeting**:
One weekly time and place of a section: its kind (Lec, Dis, Lab), days, times, building and room. A meeting with no set time is "No set time".

**Professor**:
Whoever teaches a section, or "TBA" when Testudo hasn't named one. Copy says "instructor" on the Instructors tab and its cards and for one section's own teacher (its row, its ghost, its problem: "Instructor TBA"), and "professor" for groups and rooms ("Professor TBA").

**GenEd**:
A UMD General Education code (DSHS, DSNL, FSAW, …). A course can count for one of several ("DSHS or DSHU"). The search chip reads "Gen-eds".

**Wildcard**:
A stand-in for any course matching a pattern (`CMSC4XX`, `CMSC42X`, `ARTTXXX`) or a GenEd ("Any DSHS course"). One matcher serves Generate, Plan and every course search box, where a pattern typed lists its courses.

**Course search**:
The one search box for courses, in Schedule's Search, Plan's Search and Generate's course field: the same words find the same courses, with the same chips, rows and keys. Reviews and Chat's course finders aren't it yet.
_Avoid_: course finder, course picker (for these three)

**Filter token**:
A word typed in a course search that names a filter chip, like "DSNS", "400s" or "3cr". It filters at once, and on space or Enter it becomes its chip; Backspace in the empty box takes it off.
_Avoid_: tag, keyword, smart filter

**Sort**:
The order of Search's results: Best match, Course code, Instructor rating or Open seats.
_Avoid_: relevance (in copy; it's "Best match")

**Seat watch**:
Watching a full or nearly full section for an opening, signed in, by push and email. The action is "Watch for a seat" (bell) and the state is "Watching" (filled bell). Copy promises "we'll let you know", not "we'll email you", since each channel has its own switch.
_Avoid_: seat alert, opening alert (in UI; older code and docs say "seat alert")

**Bookmark**:
A course you're considering but haven't placed a section of. "Bookmark" and "Bookmarked", with the bookmark icon.
_Avoid_: save, save for later

**Sign in**:
Google sign-in with a UMD account. Schedule never needs it; it adds plan sync, Chat, writing reviews, seat watches and Todo.
_Avoid_: log in, magic link

**Directory ID**:
The part of a UMD email before the @. It's who a person is to Terpsicle: `x@umd.edu` and `x@terpmail.umd.edu` are one account.

**Initials**:
The ink circle with someone's initials that stands for them beside their name: the account button, Settings, a chat message, a room's people. Terpsicle has no profile pictures. Code calls it `Avatar`.
_Avoid_: profile picture, photo, avatar (in UI)

**Notification**:
A push on your phone or computer, or an email, for one of the few kinds: seat openings, mentions and replies in Chat, and Todo's Due tomorrow. Each kind has its switches in Settings ("Notification", "Email").
_Avoid_: alert, push (in UI; code says push for the web push channel)

**Notifications (the bell)**:
The list behind the bell in the family bar: every notification, pushed or not, newest first, grouped into Today, Yesterday and Earlier. A popover on a computer, a sheet on a phone. The bell's number and the badge on the app icon count what's unread here. Code calls it the inbox.
_Avoid_: inbox (in UI), activity, alerts

**Quiet hours**:
11pm to 8am, when notifications wait and arrive together at 8am. On by default; seat openings come through unless you turn that off.
_Avoid_: do not disturb, snooze

**Calendar feed**:
Your private link that Apple, Google or Outlook Calendar subscribes to: your classes and Todo deadlines, with your calendar's own alerts. You can make a new link, which stops the old one.
_Avoid_: calendar sync, ICS link (in UI)

**Asking for notifications**:
Turning on notifications is asked at the moment they're worth it, in our words first: after your first post in Chat ("Hear back when someone answers?"), after connecting ELMS ("Remind you the evening before something's due?") and when a seat watch starts ("Hear the moment a seat opens?"). "Turn on" and "Not now"; Not now is remembered. On an iPhone tab the ask is the three steps to the Home Screen. Code calls it the push ask.
_Avoid_: permission prompt, opt-in, enable push (in UI)

**Device**:
A browser with notifications on, listed in Settings by what it is ("iPhone · Safari") and when it was added. "Turn on notifications on this device", "Turn off here", "Remove".

**Sync**:
Keeping a signed-in person's plans and four-year plans the same on every device. On a conflict, nothing merges: the server's copy stays and the local one is kept as "<name> (copy)". Settings follow the account too, each product's (**AI features**, the **room rules** you've closed) beside Schedule's.

**Delete account**:
"Delete account" in `/settings`: no dialog, a week to change your mind (signing in keeps the account), then the **purge** takes everything that names the person. Published reviews stay, with no name on them.
_Avoid_: close account, deactivate

**Sparkles**:
The icon that marks LLM output, and only LLM output. Generate's results are algorithms and never get it. It shows only while **AI features** are on.

**AI features**:
Everything a model wrote that students see, marked with the sparkles: today, the review summary. On by default. "Show AI summaries" in Settings, or "Hide AI summaries" in an AI box's ⋯ menu, turns them all off, everywhere; signed in, the choice follows the account. Every new sparkles feature respects it (`useAiFeatures`).
_Avoid_: AI mode, smart features

**Feedback**:
What someone sends from the feedback sheet: "Report a bug" or "Suggest a feature". The owner's own notes on a page are **pinned notes**.
_Avoid_: report (that's moderation's word)

**Activity log**:
The last ~50 things someone did in the app (pages by route pattern, app events, errors, failed requests), kept in the page's memory and sent only with feedback when "Include what I was doing" is on.
_Avoid_: session recording, replay, telemetry

**Pinned note**:
An admin's note on one element of a page, left with the feedback sheet's "Pin a note" and shown as a numbered dot on that route, to admins only. Stored as feedback of kind `review` (a review of a deployment).
_Avoid_: review note, comment (in the UI: "review" is Reviews' word)

**Feedback inbox**:
`/admin/feedback`, where the owner reads feedback and pinned notes, sets each one's status (New, Planned, Fixed, Won't fix, or Spam) and hands it on: "Copy for an agent" or "Open GitHub issue".
_Avoid_: queue (that's moderation's)

**Feedback group**:
Open feedback items about the same thing, sorted together by "Group similar" (and the daily job) with a one-line summary the model wrote, shown with the sparkles.

**Try again** and **Reload**:
The two ways out of something that didn't load or go through. "Try again" asks once more, in place. "Reload" loads the page again, and only where a newer version of Terpsicle is the fix (a deploy removed a file this tab needs, or the server speaks a newer format); it always sits beside the words that say so. Code: `InlineError`'s `onRetry` and `reload`, `noteToast`'s `retry` and `reload`.
_Avoid_: "reload the page" with no button beside it

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

**Base view**:
The tab's own view, put under a drill-in that was opened straight from a link (an email, a bookmark), so Back from it stays in Schedule.

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
Making new plans from the courses you need, filters and preferences. It creates plans; it never edits one.
_Avoid_: AI (it's an algorithm)

**Generate result**:
One ranked candidate plan from Generate, with a mini week, plain stats and a mark for each preference that's on. Its arrow opens its details, where "Add as Plan C" (the next plan name) makes it a plan.

**Filter** (in Generate):
A chip that takes plans out: every Generate result follows it ("No classes before 10am", "No Fridays", "Only open seats", "Time to walk"). While on, it shows a funnel and how many plans it took out ("−38"). In code and the schema these are still `mustHaves`. A **relaxation** loosens one when nothing fits.
_Avoid_: must-have (in UI copy), constraint

**Preference**:
A chip that ranks Generate's results without taking any out: Compact days, Fewer days, Later starts, Best-rated, Higher GPAs, Safest seats. A click cycles it off → on → 2× (counts double) → off.
_Avoid_: weight, sort, rank by (in UI copy)

**Share link**:
A URL that carries a whole plan. It opens read-only as a **shared plan** with "Save a copy".

## Reviews

**Review**:
A signed-in student's rating and text for a course and professor. Readers, moderation and the admin never see who wrote it.

**Review summary**:
The LLM summary of a professor's reviews, with theme chips. It carries the sparkles.

**PlanetTerp**:
The outside site whose ratings, reviews and grade data we show, with credit and a link.

**PlanetTerp review**:
A review written on PlanetTerp, shown on Reviews' pages among ours, newest first, with a "PlanetTerp" chip whose tooltip says where it's from and which links there. No author, as on PlanetTerp. The nightly PlanetTerp job keeps them current.
_Avoid_: imported review, external review

**Page address**:
Where an instructor's or a course's page lives: one level under `/reviews`, `/reviews/kruskal` or `/reviews/cmsc351`. An instructor's is PlanetTerp's slug with its underscore as a hyphen (`goldman-aaron`); a course's is its code in lowercase.
_Avoid_: slug (in copy), `/reviews/instructors/…` (the old address, which moves)

**Most reviewed**:
The professors with the most PlanetTerp reviews. Listed on `/reviews` beside **most taken**, as equals.
_Avoid_: popular, top-rated

**Review your instructors**:
The quiet list on `/reviews`, signed in, of the instructors of the sections in your schedules for terms that are over (or in their last six weeks), each one tap from the form. Never a banner.

**Most taken**:
The courses offered now that the most students have taken, by PlanetTerp's grade data. Listed on `/reviews`.
_Avoid_: popular, trending

**Recently reviewed**:
The courses and instructors with a new review on Terpsicle, by month. Listed on `/reviews`; it names pairs, never reviews.
_Avoid_: latest reviews

**Grade data**:
The admin page (`/admin/grades`) listing the fall and spring semesters whose grades aren't in PlanetTerp's data yet, with the words of a **grade request** and a place to note when each went out.

**Grade request**:
A Maryland Public Information Act request to the university's Office of General Counsel for a semester's grade distributions, one row per section. How PlanetTerp gets its grades.
_Avoid_: FOIA request (that's federal)

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

**Your rooms**:
The rooms the chat list shows: your chat plan's (each section's course, professor and section rooms; a bookmarked course's course room) and the course rooms you've joined. Other sections' and professors' rooms aren't listed at all. A course whose room you opened without joining sits last until you join or leave it.
_Avoid_: locked rooms, a course's room tree

**Chat plan**:
The synced plan a term's rooms come from ("Rooms from Plan A in Schedule ▾"). Copy names Schedule, since the plan open there may be another; signed out, it says "the classes you add in Schedule", never "sync".

**Join**:
Keeping a course room in your chat list when the course isn't in your chat plan. "Leave" undoes it; "Join CMSC351 chat" in course details does it.
_Avoid_: follow, subscribe (in the UI; the API calls it `chat/follow`)

**Posting here**:
The two plain lines over the composer the first time you open a course's chat (until "Got it" or your first post there), and in room info: your name is on everything you post, so posting answers to graded work is a bad idea; Report is in each message's menu. Neutral, never a lecture, and never "a bot checks your messages". Code calls them the room rules.
_Avoid_: rules, before you post (in UI)

**Mention**:
"@" and a classmate's name in a message ("@Hannah Lee"). Typing "@" offers the room's members; a mention of someone in the room notifies them, even in a room they muted.
_Avoid_: tag, ping

**Reply**:
A message in a thread. The thread's first author hears about it ("Hannah Lee replied in CMSC131 · 0303"), unless they muted the room.

**Chat digest**:
The once-a-day email listing mentions and replies you haven't read ("3 unread in your class chats"). Off until you turn it on.

## Moderation

**Moderation**:
Screening reviews and chat messages, model first, so only unclear cases reach a person.

**Visible**:
Everyone who can read the room or page sees it.

**Checking**:
Being screened. A review's button says "Checking…". A chat message being checked looks sent to its author, with no note; classmates get it once it passes.

**Held**:
Waiting for a person. Only its author sees it: in Chat it's tinted yellow with one plain line ("Held for review. Only you can see it until a person checks it."), never red.

**Removed**:
Taken down. Nobody sees the text; its author is told.

**Report**:
A signed-in person flagging a review or message, with a reason. Enough reports hide it until a person decides. Chat reports are for abuse only: harassment or hate, a threat, sexual content, spam, someone's private info, or something else (with a note).
_Avoid_: feedback (that's the feedback sheet's)

**Spam guard**:
Chat's check across courses: one person posting the same message in 3 or more courses' chats within an hour, or flooding many courses at once, is held for the owner, urgent. One course's rooms count as one course.
_Avoid_: burst (that's Reviews' rule for many reviews of one instructor)

**Moderation queue**:
Held and reported items waiting for the owner in `/admin`. It's meant to stay small.

**Stop (an author)**:
The owner keeping whoever wrote a removed review or message from writing more for a while: reviews for 30 days, Chat for 7. Chosen through the item, so the owner never learns who; the person sees only when they can post again.
_Avoid_: ban, block (a block is the scheduler's)

**Admin**:
The owner, the only admin and moderator. Contact is admin [at] terpsicle.com.

## Plan

**Four-year plan**:
One person's courses laid out term by term through graduation, with a "Before" column for AP and transfer credit. Copy says "Plan"; people may keep a few.

**Term status**:
Where a term in a four-year plan stands: done, in progress or planned, worked out from the academic calendar. Not the catalog's active or archived.

**Placeholder**:
A wildcard in a four-year plan ("CMSC4XX", "Any DSHS course"), dashed, counting 3 credits by default until you pick a real course.

**Linked plan**:
The scheduler plan a four-year plan's semester opens with "View schedule": the term's open plan, else its first tab (`linkedSchedulePlan`). One per term, never a copy; "From Plan A: 4 of 5 placed" counts it.

**Plan view**:
One of Plan's five views on its rail: GenEd, Problems, Search, Samples and Import (`1` to `5`). Each is a route (`/plan`, `/plan/problems`, …), and a course opens over it as a drill-in.

**Before UMD**:
The four-year plan's column before the first semester: AP, exam and transfer credit, however many schools it came from. It always counts as done.
_Avoid_: Transfer column, semester 0

**Transfer credit**:
Credit from another school, AP or another exam (IB, CLEP) that your transcript lists before your UMD semesters. When Testudo names a UMD course it's that course; otherwise it's credit with its own title, credits and GenEds, like "AP CHEMISTRY, CHEM 1XX, 4 credits".
_Avoid_: outside credit, external course

**Counts as**:
The UMD course something Testudo can't match stands for: transfer credit given as "CHEM 1XX", or a code Testudo doesn't list anymore. It then meets prerequisites and repeats like that course, and still shows its own title. (Where Testudo says "or", "Counts as" also names the GenEd a course counts for.)
_Avoid_: mapping, equivalent (in the UI), override

**Course info**:
What you tell Plan about a course Testudo doesn't list anymore (an honors seminar that rotated out, an old topics course): its title, credits, the GenEds it covered and what it counts as, so they count. An import fills it from the GenEds the transcript prints; an honors code whose base course Testudo lists offers "Count it as MATH141". Testudo's own data wins once it lists the code.
_Avoid_: course details (that's the scheduler's course drill-in), override

**Transcript import**:
Pasting Testudo's unofficial transcript into Plan: Paste, Check, Import. The paste never leaves the browser and is never saved; only the courses you import are, and grades stay private.

**Template**:
A hand-made starting four-year plan for a major, credited to its source. Copy calls it a **sample plan**, in Plan's Samples view, and adding one fills only empty semesters.
_Avoid_: roadmap, preset

## Todo

**ELMS feed**:
A student's ELMS calendar link (an `.ics` URL). It's a secret: stored encrypted, never shown back, never logged.
_Avoid_: ELMS password, access token

**Item**:
One assignment, quiz or event from the feed, with a due time and a done mark. Copy calls it a **deadline** ("Added 3 deadlines from the file").
_Avoid_: item (in the UI)

**File import**:
"Add a calendar file": an `.ics` the student exported, read in the browser. Its items say "From a file" and don't update.

**Calendar** (Todo's):
Todo's main area: the **Week** (the default), the **Month** or the **List** of what's due by day, each a URL. Weeks start on Monday, so a Sunday-night deadline ends its week, unless the student sets **Weeks start on** Sunday.
_Avoid_: agenda, planner, schedule (that's the scheduler)

**Side panel** (Todo's):
The column beside Todo's calendar, where the scheduler and Plan keep their sidebars: Add a task, This week, ELMS and Weeks start on. On a phone it sits above the calendar, folded under "Courses and ELMS".

**Composer**:
Todo's "Add a task…" field, which reads the date, time and course from the words ("PS3 due fri 11:59pm cmsc351"), marks them as you type, and shows them as chips before adding. In copy it's just "Add a task".
_Avoid_: quick add, natural-language input (in the UI)

**Hidden course**:
A course the student hid in Todo (the eye on its row in This week, "Hide CMSC216"), for what the feed carries that they don't want, like a club. Its items show nowhere and count in nothing, "Due tomorrow" included. Its row stays, struck through, to show it again.
_Avoid_: muted, archived

**This week**:
Todo's completion chart in the side panel: what's done of what's due in the week shown ("7 of 12 done"), then each course's "3 of 5 done this week" and its last four weeks as small columns.

**Own task**:
A task the student types in Todo's composer, with an optional due date, time and course. It says "Yours" where the feed's items say "From ELMS", is kept on our server, and never goes to ELMS. Copy calls it a **task**.
_Avoid_: custom todo, personal item, reminder

**No date**:
Where own tasks without a due date go: the last group of the List, and under the Week and the Month.

**Due tomorrow**:
Todo's one notification: at 6pm in College Park, one push listing what's due the next day and not done. Connecting ELMS turns it on.

## Working on Terpsicle

**Owner**:
The person who decides what Terpsicle is. Owner decisions in `docs/decisions.md` are principles; agent ones are defaults.

**Preview**:
A PR's own deployment at `pr-<n>-terpsicle.zsrobinson.workers.dev`, with its own database, production data files, no crons, and sign-in through test mode.

**Test mode**:
Sign-in with fixture people (Test Student, Test Classmate, Test Admin) instead of Google, only on previews and localhost.

**Flag**:
A product's on switch in production (`REVIEWS_ENABLED`, `CHAT_ENABLED`, `TODO_ENABLED`, `PLAN_ENABLED`).

**Page kit**:
The shared pieces every product's pages are built from: page header, page widths, view switch, first-visit template, list row, card, page section, loading and error states, and the form controls. Shown in every state at `/admin/kit`.
_Avoid_: design system (that's the whole line from tokens to pages)

**Page width**:
How wide a page's column is, picked by how it's read: **note** (560), **reading** (720), **app** (1120) or **full** (edge to edge). A page picks one and never invents its own.

**First visit**:
What a product shows before there's anything of yours in it: its mark, a headline, one sentence and its actions, the same template in all five.
_Avoid_: onboarding, welcome screen

**Load rule**:
How much an agent may run locally: `tsc` once, biome on changed files, the relevant tests with one worker. CI is the verdict.
