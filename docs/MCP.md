# The MCP server

`https://terpsicle.com/mcp` is a public, read-only [Model Context Protocol](https://modelcontextprotocol.io) server. It lets AI agents (Claude, ChatGPT, Cursor, anything that speaks MCP) reason about University of Maryland courses with the data Terpsicle already publishes. It has no sign-in and touches no one's data: every answer comes from the files under `/data` (`docs/DATA.md` §2).

## Connecting

- **Claude Code:** `claude mcp add --transport http terpsicle https://terpsicle.com/mcp`
- **Claude (web, desktop):** Settings → Connectors → Add custom connector, URL `https://terpsicle.com/mcp`.
- **Anything else:** a Streamable HTTP server at `https://terpsicle.com/mcp`, no auth.

`GET /mcp` in a browser explains this in plain text (with a `405`, as the protocol asks). `GET /mcp/server-card` is the server card (SEP-2127) for registries and clients.

## Tools

All are read-only, idempotent and closed-world (`readOnlyHint`, `idempotentHint`, `openWorldHint: false`). Names start with `umd_` so they don't collide with other servers' (a Canvas server has courses too).

| Tool | What it answers | Reads |
|---|---|---|
| `umd_list_terms` | Terms Testudo lists, the default one, each term's calendar, how far the history goes, how current PlanetTerp's grades are | `catalog/terms.json`, `calendar/<term>.json`, history and PlanetTerp manifests |
| `umd_list_departments` | A term's departments, names and course counts | the term's manifest |
| `umd_search_courses` | Courses by words, department, gen-eds, level, credits or open seats; matches the term doesn't have, with when they run (`notOfferedMatches`, as Schedule's search shows them). `fits_with` (section keys) keeps courses with a section that fits around them (`fittingSections`); `days_off` keeps sections that meet on none of those days | course index search rows, the offered file, the term's department chunks and seats |
| `umd_get_course` | One course: text, prerequisites (words and parsed), the term in short, the offering pattern, PlanetTerp grades overall and by instructor | department chunk, course index, history, PlanetTerp |
| `umd_get_sections` | A course's sections: meetings, rooms, instructors with ratings, live seats with the scheduler's status words, dates, restrictions; with `fits_with`, each section's fit ("Fits", "Overlaps CMSC330", "Not enough time after ARTT210") | department chunk, seats, PlanetTerp |
| `umd_check_offerings` | For courses × terms: yes / no (listed terms) or likely / unlikely / unknown (later terms) | history, course index |
| `umd_course_history` | Who taught a course each term on record, newest first | history department file |
| `umd_find_instructors` | Instructors by name, with slugs | PlanetTerp index |
| `umd_get_instructor` | Rating, what they teach now, every course on record, grades by course | PlanetTerp, history |
| `umd_check_schedule` | A set of sections run through the scheduler's Problems (`planProblems`), with the week, fixes and a `shareUrl` | chunks, seats, routes |
| `umd_generate_schedules` | The generator (`generatePlans`) over a list of courses and limits, each schedule with a `shareUrl`; relaxations and near misses when nothing fits | chunks, seats, routes, PlanetTerp |

The core logic is the app's own. Offering patterns are `offeringSummary` read as Plan reads them: history plus the course index, cross-listings merged, and a term no source has counted as unknown (`src/core/mcp/offering.ts`). Problems, the generator, search ranking (`searchCourses`), instructor matching (`matchInstructors`) and grade math (`gradeSummary`) are reused unchanged. `src/core/mcp` shapes their results for agents; `src/server/mcp` reads the files and serves the protocol.

### Answers

- **Compact JSON as text.** Plain words where a person would read them ("MWF 10am–10:50am · IRB 0324", "Fall 2027"), and ids where an agent needs one for the next call (section keys, slugs, term ids). There's no `outputSchema`: eleven schemas would cost more in every `tools/list` than they'd save, and the JSON describes itself.
- **`detail: "concise" | "full"`** on the two big answers (`umd_get_course`, `umd_get_sections`); concise is the default.
- **Paging** with `limit` and `offset`, and `nextOffset` in the answer (search, sections). A search reads at most 40 departments' sections, answers from those, then asks the agent to narrow. `nextOffset` can lead to an empty page when every course left is filtered out: the search stops reading once the page is full.
- **Inputs** are zod schemas in `src/core/schema/mcp.ts`. Codes and terms are plain strings there, so a mistake gets the tool's own error rather than the SDK's validation message.
- **Errors an agent can act on.** A bad course code, term, gen-ed or section comes back as the tool's answer with `isError` and words that say what to try ("Testudo doesn't list sections for Fall 2030. Terms with sections: …. For whether a course is likely to run in a later term, use umd_check_offerings."). Anything else (R2, the SDK) answers one fixed line, "Terpsicle's data didn't load just now. Try again in a minute.", and goes to the logs. Protocol errors are only for protocol problems.
- **Terms** are taken as an id (YYYYMM) or a name ("Fall 2027") and named both ways in answers. Omitted, a tool uses the term students are registering for (`pickTerm`, as the scheduler opens).

### Seats, fit, pace and share links (v1.1)

- **Seat counts** are Testudo's own, as of its "Open Seats as of" stamp. Every answer that carries counts has one `seatCounts: {asOf: "Thu Nov 5, 4:30pm ET", asOfUtc}` (the stamp, else when we fetched them; `campusMoment` in `src/core/time`). The seats job checks every 5 minutes but refreshes only when the stamp moves or an hour has passed, so the same time for up to an hour is normal. Each section's `seats.status` is the scheduler's `seatStatus` words; `waitlist` and `holdfile` are null when Testudo doesn't show them.
- **What fits around classes** is the scheduler's own "Fits my plan" (`buildFitContext`, `sectionFits`, `fitLabel` and `resultFitWords`), built from `fits_with` by `src/server/mcp/fits.ts`: overlaps, and enough time to walk between buildings. A tight walk still fits there, as in the app; only `umd_check_schedule` flags it. The courses in `fits_with` are never results. `days_off` is `meetsOnAny` (`src/core/time/week.ts`), which Generate's "days off" reads too.
- **Pace** is the scheduler's own travel setting: slower 2.5, typical 3.0 (default), faster 3.5 mph. There's no bike mode, and "Not enough time" stays an error, as in the app.
- **Share links** are the scheduler's own (`sharePayloadFromPlan`, `shareUrl`, DATA.md §8) on the request's origin, so a preview links to itself. They open the read-only shared view, with Save a copy.
- **Not here, on purpose:** review text (Reviews pages are off, and reusing PlanetTerp's text is an open owner action) and degree rules (degree audit is out of scope).

The server's `instructions` say how the tools fit together, the formats, and how current the data is.

## How it's served

- **SDK:** the official `@modelcontextprotocol/server` (v2), `createMcpHandler`. It speaks the 2026-07-28 protocol (stateless, no `initialize`, no session id) and answers 2025-era clients statelessly too (its default `legacy: "stateless"`). A fresh `McpServer` per request, so any isolate answers any call. Cloudflare's `agents` package wraps the same handler but needs `nodejs_compat` and a large dependency tree; hand-rolling JSON-RPC would mean owning the protocol's header and version rules.
- **Route:** `src/server/worker.ts` sends `/mcp` and `/mcp/*` to `handleMcp` (`src/server/mcp/handler.ts`), beside `/data` and `/api`. The SDK stays in the server bundle; no client chunk imports it.
- **Origins:** CORS `*`, like `/data`. The spec's Origin check guards local servers against DNS rebinding; a public server that reads no cookies has nothing for it to protect.
- **Limits:** 600 calls a minute per address (generous, since hosted clients such as Claude's connectors call from a few addresses shared by all their users), from Cloudflare's rate-limiting binding (`MCP_RATE_LIMIT` in `wrangler.jsonc`; counted per Cloudflare location). Over it: `429` with `Retry-After`. Previews have no binding and no limit. Request bodies are capped at 64 KB, tool arguments at 400 elements, and the generator at 150,000 search steps (about a second).
- **Reads:** `src/server/mcp/data.ts` reads R2 `DATA` and checks each file against its schema, through a reader made per request: a read in flight is shared only within its request (workerd won't let another request wait on it). Across requests an isolate keeps settled values only: up to 48 hashed department files and, in a pool of their own that a broad search can't empty, the index files (search rows, the offered file, PlanetTerp's index, the routes) and what's derived from them (the search index over ~15,000 courses, the decoded routes). Hashed files never change (`DATA.md` §2.2). Fixed-name files (the term list, manifests) are read fresh each request, since they say which hashed files are current. It keeps checked values rather than reusing `r2PublishedFiles`' raw JSON because checking the big files against their schemas is the cost; the Worker has no TanStack Query.
- **Caching:** answers are `no-store` (they depend on the body). `tools/list` carries a public one-hour cache hint.

## Testing

`src/core/mcp/*.test.ts` cover the views, terms, offering answers and the schedule check. `src/server/mcp/handler.test.ts` runs every tool through the handler over a seeded bucket, as a 2025-era client and as a 2026-07-28 one, plus the card, the browser `GET`, CORS, the rate limit, the 40-department cap and section keys however they're written. `src/server/mcp/data.test.ts` covers what the cache keeps.

To try it by hand against production data, point any MCP client at a preview (`https://pr-<n>-terpsicle.zsrobinson.workers.dev/mcp`) or production, or use the MCP Inspector: `npx @modelcontextprotocol/inspector`, transport Streamable HTTP.

## Later

- List it in the MCP Registry as `com.terpsicle/terpsicle` (`mcp-publisher`, with DNS verification of terpsicle.com: an owner action).
- Course and section resources (`terpsicle://course/CMSC351`) if clients start reading resources well.
- Plan's requirement data, if Plan grows any: degree audit stays out of scope (`docs/decisions.md`).
