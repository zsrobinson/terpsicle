---
name: framework-first
description: Check what TanStack Start and Router, Cloudflare and our libraries already do before building infrastructure. Use when adding a route, page, tab or drill-in, putting state in the URL, lazy loading, caching, retrying, scheduling work, storing data, or building a form.
---

# Framework first

We build on TanStack Start (`@tanstack/react-start` 1.168) and Router (`@tanstack/react-router` 1.170) on Cloudflare Workers. The scheduler's homemade panel registry, `lazyPanel` wrapper, bundle police and URL sync all rebuilt things the router gives for free. This skill keeps that from happening again.

## The checklist

Before writing any of these, find the platform's version:

| You're about to build | Reach for |
|---|---|
| A new view, tab, drill-in or page | A route (nested under its product's route) |
| State that Back should undo, or a link should carry | Search params with `validateSearch` |
| Fetching data a view needs | A route `loader` (with `loaderDeps` for search params) |
| Lazy loading or code splitting | A route: Start splits route components automatically |
| Prefetching on hover | `Link`; the router already has `defaultPreload: "intent"` |
| Back, Forward, "go back to where I was" | `useNavigate`, `navigate({ replace: true })`, the router's history |
| A scheduled job | A Cron Trigger and an entry in `CRON_JOBS` |
| Shared live state, sockets | A Durable Object (see below) |
| A component (dialog, menu, tooltip, tabs) | Radix through `src/components/ui` (shadcn/ui) |
| Validation | zod schemas in `src/core/schema` |
| Browser storage | Dexie (`src/state/db.ts`) |
| App state that isn't URL state | zustand |

If the platform can't do it, or doing it the platform's way costs more than it saves, hand-roll it and say why in the PR body. Reshaping the feature to fit the platform usually wins.

## How-tos

Read the real docs when a detail matters; they're at `https://tanstack.com/router/latest/docs/framework/react/` (append `.md` to a page's path for plain text). Where this skill is unsure, it says "check the docs": don't guess an API.

**Add a route.** Files in `src/routes` use flat dot names: `reviews.index.tsx` is `/reviews`, and `schedule.search.tsx` would be a child of `schedule.tsx`, which renders `<Outlet />` where its children go. `$param` is a path param, a `_` prefix is a pathless layout, and a `-` prefix keeps a file out of the tree. The plugin regenerates `src/routeTree.gen.ts`; commit it (CI checks it's current). Keep route files thin: the component comes from `src/features/<feature>`.

**Put state in search params.** Give the route `validateSearch` a zod schema from `src/core/schema`; zod 4 is a Standard Schema, so no adapter is needed (`src/routes/schedule.tsx` does this today). Make bad values drop out with `.optional().catch(undefined)` so the rest of a link still works. Read with `Route.useSearch()`; write with `<Link search={...}>` or `navigate({ search: (prev) => ({ ...prev, tab }) })`. Push for things Back should undo; pass `replace: true` for typing and other transient changes (`docs/decisions.md`, "Back and Forward undo navigation"). Search params are inherited by child routes. For params that should survive or disappear across links, look at `retainSearchParams` and `stripSearchParams` (check the docs). The `v2/navigation` branch's `src/core/schema/schedule-url.ts` is a worked example once it lands.

**Load data.** A `loader` runs before the route renders and on preload; `loaderDeps: ({ search }) => ({ … })` names the search params it depends on. Read it with `Route.useLoaderData()`. Stale times and caching are the router's (`staleTime`, `defaultPreloadStaleTime`; check the docs before changing them). Scheduler data that lives in IndexedDB or a web worker keeps its own stores; a loader can await them.

**Lazy route components.** Start turns on the router plugin's automatic code splitting, so a route's `component` is its own chunk with nothing to write. Don't export route properties from a route file, or splitting can't move them out. `pendingComponent` and `errorComponent` cover loading and failure; `defaultPreload: "intent"` fetches the chunk on hover or focus.

**Links and preload.** Use `Link` (or `navigate`) for every in-app move, never `window.location` or a plain `<a>`, so preloading and history work. `preload={false}` on a link turns it off for one link.

**Durable Objects, D1 or R2.** D1 is the default for anything per user or queryable (accounts, sync docs, reviews, watches). R2 holds files: the catalog, reference data and user uploads. A Durable Object is for live, shared state with sockets; `CourseChat` is our only one, and a second class needs a decision entry.

**Crons.** Add the schedule to `triggers.crons` in `wrangler.jsonc` and the job to `CRON_JOBS` in `src/jobs/index.ts` (a test fails if they drift). Jobs take `now` from the controller, never `Date.now()`. Crons don't run on previews.

**Server calls.** The JSON API is plain Worker routes in `src/server/api/router.ts` rather than `createServerFn`, on purpose (the file's header says why); add endpoints to that table with their `auth` field and schemas.
