# Design history and taste

How the design in `SPEC.md` was reached, in the product owner's own words. `SPEC.md` says **what**; this document says **why**, and what the owner likes and dislikes. Read it before making any UI decision the spec doesn't cover.

The clickable reference is `reference/prototype/built/final.html` (open it in a browser, or `cd reference/prototype && npm i && npm run dev:final`). Screenshots are in `reference/prototype/screenshots/`. Its known gaps against the spec are listed in `reference/prototype/README.md`.

---

## 1. Where this came from

Terpsicle started as a Bitcamp hackathon project ([`terpsicle-bitcamp`](https://github.com/zsrobinson/terpsicle-bitcamp)). It was meant to be "a really excellent scheduler", but became a CS degree-planning tool. The original brainstorm (an Excalidraw board, summarized in `PLAN.md` appendix A) wanted:
- Venus-style course recommendations;
- a great sidebar-with-tools UX;
- "an integrated experience, not having a million tabs open";
- walking-time conflicts between buildings;
- blocks for time you can't take classes;
- share links;
- seat-fill notifications;
- review summaries;
- right-click menus and keyboard shortcuts.

The owner's framing for v2:

> "i just want an insanely good scheduling tool with the things i had laid out there, and more."
>
> "when it comes to UIs, i fuck with the design of things like vercel or linear apps. not like it has to be just like that, but shadcn sort of stuff i've found is really nice."

**Hard constraints from the start:**
- No degree audit (UMD already has one) and nothing CS-specific.
- Local-first, free tiers where possible, one language (TypeScript), avoid unnecessary complexity.
- No Jupiterp data; PlanetTerp is fine.
- No accounts at launch; "maybe some very very light auth stuff for those reminder things".

---

## 2. Round 1: four whole-app layouts

The four layouts were:
- **A · Workbench:** three panes (rail + panel, calendar, a right-hand inspector).
- **B · Canvas:** the calendar fills the screen and everything floats over it.
- **C · Catalog:** a dense course list first, with a pinned week.
- **D · Generate:** a natural-language box plus ranked results.

**Verdict: A**, with this feedback (quoted in full because nearly every line became a rule):

> "i definitely prefer the direction of A. the right-hand sidebar always being there is a bit overwhelming for the user, imo, and it replicates some of the data that's already meant for the left sidebar. i'd be curious if we could get away with *only* having a left sidebar, or if that wouldn't be good, then maybe only having an extra right thing when we need to … generally your prototype was very impressive with its features, but i'd say it leant toward being confusing for the user not immediately understanding the one place they should go to look for specific pieces of information."

> "for positive notes, i really liked the ability to visually see all the different sections for a course and click on them to switch them out. that's insanely good, and the only thing that approaches it is in jupiterp moving your mouse down the list of sections and seeing the hover previews in sequence. i like the idea behind the top navbar, though we'll need things to let you duplicate, delete, rename plans and all of that. calling them plans was also neat. blocks, export tabs both great."

> "i know the transit app lets you set a walking speed, maybe some transparency around the time estimates would be good and letting the user adjust that on the walking tab. any ideas for a more accessible-friendly term for this feature than walking? … not a fan of the walking total thing in the top navbar thing, i don't see that as super useful when your actual walking amount depends on a ton of stuff like going to dining halls, where your dorm is, etc."

> "i don't mind the control menu, but i'm not sure exactly how useful it really is, it's not like people are going to become super-users of this, they're just building a schedule once a semester. i'd just focus on making the UX excellent to poke around in, and some light keyboard shortcuts on top. hovering on something should reveal its keyboard shortcut, if applicable."

> "keeping natural language stuff out of this product for now would be good, just keeping AI stuff to generating on the backend rather than in response to user input. also... we likely don't need to create summaries on every professor all at once, maybe that can be more on-demand?"

> "for data visualizations just make sure it's clear and we're not overcomplicating things. make sure the user gets the info they need and are very easily able to glean these things."

**What came out of round 1:**
- One home per kind of information, and one way to open things.
- "Plans" as the top-level concept.
- "Travel time" instead of "walking".
- No ⌘K palette and no natural-language input.
- Model use lazy and on the backend.
- Words before charts.

---

## 3. Round 2: where details open

All four variants used the Workbench layout. They differed only in where course and connection details open: drill in (left sidebar only), side by side, a right panel on demand, or a popover.

**Verdict: drill in** (details replace the sidebar list, with a way back). In the owner's words: "the first prototype is starting to approach the level of excellence i was looking for."

---

## 4. Round 3: final review

39 questions, each with live options. All answers, with the owner's notes verbatim, are in `docs/review-answers.json`. The notes carry the most signal:

| Question | Pick | Owner's note (verbatim) |
|---|---|---|
| Where plans live | Tabs in the top bar | |
| "+ new plan" | Ask: empty or copy | (Later: also "Generate plans…", see Generate.) |
| Comparing plans | None | "note this as a future feature, but i don't feel like it's necessary rn and the UX is a bit tricky." |
| First tab name | **Courses** | |
| Rail | Icon + label | "i definitely prefer this but it kind of reminds me of slack, which isn't good. for some reason apps that have this icon and rail thing with the grounded thing around it alaways seem to suck. maybe ours won't. i think this is *fine* for now. the text labels are very necessary i think, since most users are coming in blind." |
| Drill-in header | **Breadcrumb** | |
| Collapsible sidebar | Yes | "even simplier then an extra collapse button at the bottom, just allow the user to click the same icon again to hide it." |
| Block content | Code, time, room | |
| Colors | Soft tints | "should also allow for the user to change the color of the course just for fun, maybe just as simple as clicking on the color circle icon in the courses views and it having a little tooltip to select from a good amount of predefined colors." |
| Other sections | **Dashed ghosts** | "i'm partial to dashed outlines; though some courses have a *ton* of sections and i'm a bit worried about how this will display." |
| Travel on calendar | Every connection | |
| Hours | Fit to classes | |
| Overlaps | Side by side | "no red outline necessary … say i have two socy 4xx classes at the same time i'm deciding between now … i just want to see that i could do both and not be yelled at. sure, it's a problem to be highlighted, but it's sort of well understood." |
| Finals | **Neither (dropped)** | "final exams can be rescheduled if you have overlapping ones … that's one extra data source to worry about, and final exam times aren't even usually released until a few weeks into a semester. let's not do that." |
| Section list | **Grouped by instructor** | "let's allow the user to collapse these instructor groups, too. i'd want to mostly preserve the number order of the sections though when we group." |
| Sections that don't fit | Label only | "maybe someone prefers to see something overlapping so then they go and pick something else … maybe a little note next to the sections label like "0 fit" or "2 fit"" |
| Instructor info | **Cards** | "there's usually not more than a handful of professors for the class, so it's useful to see all that extra information right at the top" |
| Grades | Bars | "consider that we use +/- grades too. planet terp does combined bars for those with different segments for A-, A, and A+ within the same A bar. i like that. they also have A, B, C, D, F, W, and other." |
| Seats | Words + meter | |
| Search results | Courses (see hover) | Wanted a way to compare sections within a course *and* across courses; then: "ignore that, don't show sections in the main thing. but this hovering is awesome. and fills the need for comparing across upper levels." |
| Filters | **One line of chips** | "i like the UX of something that has one line under the search bar with a chip/dropdown thing for the different things you could filter by. for example, "gen-eds" "credits" "fits my plan" etc. once it's set it changes color to show it's actively applying." |
| Search hover | **On** | (see above) |
| Problems | Tab + count | "don't yell at the user with that extra box. again, problems might show up when the user is still figuring out their schedule. that's okay." |
| Problem order | Most serious first | |
| Travel settings | Travel tab | |
| Explaining estimates | One line + "How?" | |
| Connection details | **Map of the route** | "YES to the map omg that'd look so cool. i'd prefer only doing this if we're able to display the actual route … not a straight line because that makes it seem like our calculation is a straight line … please call it the accessible option, or accessible whatever, and not "step-free"." |
| Adding blocks | Drag + form | "we don't need location, etc. … i just think the blocks would be nice mostly as a thing to see extra stuff you'd have and to restrict the searching." |
| Generate | **First-class** | "generating them would mostly be separate from being inside of any specific plan. maybe it could be another option when you select the plus button for a new plan? it could allow you to add multiple plans. and on a fresh session (i don't want a marketing page or anything; just throw people in), it could just show two options to start from scratch or to generate. make this feature as excellent as the rest of this schedule builder, please. and i'm not sure i wanna use the sparkles anywhere for this since it's just using algorithms and whatnot. sparkles for actual LLM stuff only please." |
| Seat freshness | Above section lists | |
| Seat alerts | Email link | "i'm not sure if this needs to be a day one feature … consider that we might need to check if someone's already signed up for this alert, etc. and undoing the alert should require confirmation." |
| Registration help | Checklist | |
| Shared link | Read-only | "we're not doing overlays, so just a save a copy button. and we won't have names … what if we actually have it replace the list of our own plans at the top? of course with an X to go back and save a copy. i kind of like the current copy, icon, even the light red you're using here, maybe just put that up there in a little rounded sort of thing." |
| Accent | **Black/white** | (UMD red only for the logo.) |
| Density | Compact | "lots of info here, dense is better." |
| First visit | Numbered guide | "i actually really fuck with this numbered overview of how the app works as a good introduction … maybe adding in a callout to the generate thing as an alternate thing" |
| Mobile | Week grid | "i don't want us to have to worry about a specific mobile implementation for every new feature … shadcn [apps] have their sidebar turn into a sort of drawer thing from the bottom that's able to be at halfway or expand up … it sort of just requires working on the shell of the sidebar" |
| Quick calls | Yes: Saturday column only when needed, show full sections, show restricted sections, remember state, stable course colors, undo instead of dialogs, show TBA. **No:** credit-limit warning, hide-a-course, save as image | "on the saturday point, usually this is actually a thing more often for async classes, which can have that same treatment. the registration limit is dependent on your major, so that's not necessary. people just screenshot things rather than save with image, that's not necessary." |

---

## 4b. Late notes (after the review)

> "let's make sure that the calendar stretches to fill the user's screen, and not have that tip at the bottom … the generator thing should be more prominent on startup, consider that starting from scratch and starting from generating are equally valid paths."

> "let's make sure that all of this supports new terms as they come up and are doing things in a way that's generally pretty dynamic, like how i designed the original schedule building thing (sourcing the valid semesters from the SOC). we shouldn't have to babysit this as new semesters come up."

---

## 5. Taste, distilled

Use these when the spec is silent:
- **Clarity over cleverness.** "One place they should go to look for specific pieces of information." If a thing could live in two places, it lives in one.
- **Don't yell.** Problems are information, not alarms. No banners, no red outlines on choices a person is still weighing, no confirmation dialogs (use undo). The one exception is unsubscribing from seat alerts.
- **People arrive cold, a few times a semester.** Text labels on navigation, a numbered first-visit guide, tooltips everywhere, and shortcuts as a bonus rather than a requirement.
- **Dense and precise, like Linear or Vercel.** Compact type, hairline borders, a black/white accent, and Geist. Motion is quick and quiet. A left rail with a boxed active state risks looking "like Slack", so keep it restrained.
- **One system, not per-panel taste.** Six type sizes (`text-2xs`…`text-xl`), a 4px spacing rhythm, color tokens only, and the shared panel pieces in `src/app/panel.tsx` (`docs/UX-REVIEW.md` §2). `src/app/design-tokens.test.ts` holds the line.
- **Design for 1, a few, and many sections.** Upper-level courses often have one section; intro courses have dozens. Every section-bearing surface (course details, search results, calendar ghosts, generate results) must be great at both extremes. In the owner's words: "my socy4xx classes all are just one section, but the intro CS and math courses have like a billion sections. our UI should be great in both scenarios."
- **Don't prefill or over-model.** Blocks are just labeled time. Don't add fields people didn't ask for.
- **Honest numbers.** Show the math behind estimates. Never draw something that implies a simpler calculation than the one we did (a straight route line, for example).
- **Sparkles icon only for LLM output.** Generation is algorithms and gets no sparkles.
- **No marketing page.** People land straight in the app.
- **Nothing to babysit.** Terms, buildings and routes are discovered from the data. A new semester needs no code change.
- **Make each feature excellent rather than adding more.** The owner cut finals, compare, image export and NL input to keep what remains excellent.

---

## 6. Infrastructure decisions (owner's)
- Cloudflare, "relying on the more tried-and-true Cloudflare Workers things", on the **Workers Paid** plan: Workers, static assets, Cron Triggers, R2, D1, and **Workers AI** for the review summaries ("we can use cloudflare ai stuff for that ai stuff … no extra tokens needed").
- The data pipeline runs as Worker **cron triggers**, not GitHub Actions. GitHub Actions is for CI and deploys only.
- TanStack Start, chosen for typed server functions and end-to-end type safety.
- One package at the repo root with unified TypeScript tooling (no monorepo).
- New repo, MIT license, at `terpsicle.com`; the old app stays at `bitcamp.terpsicle.com`.
- Build autonomously with an orchestrator agent managing subagents, rather than a big issue map.
