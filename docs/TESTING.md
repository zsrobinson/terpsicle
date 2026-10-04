# Testing and diagnostics

Keep the merge gate small, deterministic and useful. Keep richer inspection
tools available without running them for every commit.

## Required on code changes

- Typecheck, lint, tracked-file hygiene, production build, lazy-module rules,
  committed route tree, and the build-only recovery tests.
- All correctness Vitest projects: core (with its existing coverage threshold),
  ingest, scripts, UI and Worker. Parser goldens, properties, schemas, migration,
  authorization, privacy and sync tests stay in the gate.
- `pnpm test:e2e:ci`: existing journeys tagged `@critical` on desktop Chromium,
  plus `@phone` journeys on phone Chromium and WebKit. The selection covers
  scheduling/search/generation/export, saved and offline data, sync conflicts,
  transcript import, sign-in and authorization, Reviews, Chat, Todo, seat
  alerts, push, calendar feeds, CSP and representative keyboard accessibility.
  Phone checks cover course navigation, drawer interaction, product tabs,
  history and narrow reflow.
- Same-repository PRs deploy the checked build to a preview and run read-only
  live smoke tests. Fork PRs skip the secret-dependent preview. The aggregate
  **Check, build, e2e** requires every applicable job; documentation-only PRs
  skip code jobs, not failed jobs.

Production deploys only after the exact main commit passes that same gate.
Preview and production reuse its build artifact. Production deployments are
serialized, skip a superseded main commit and smoke-test the public pages
after deployment. A scheduled read-only monitor checks pages and active-term
catalog/seats freshness separately from PR validation.

## Explicit investigations

Actions → **Browser diagnostics** → **Run workflow**, on the branch to inspect:

- **regression** runs the complete existing Chromium desktop/phone suite
  (including broad axe, tooltip and presentation checks), with two shards.
- **visual** renders all six main screens at desktop and phone widths in both
  themes. Empty URL uses the signed-in mock app; a URL inspects a deployment
  signed out. Download the `page-renders` artifact and inspect its grids.
- **performance** runs the timing-sensitive Vitest `perf` project. Benchmark
  failures warrant investigation, but shared-runner timings do not block merges.
  Live transfer sizes are reported against guides, not merge-blocking limits.

Actions → **Mobile lab** remains available for any deployment, selected
scenarios and WebKit, Android or iOS engines. Screenshots are on by default;
recordings are opt-in. It is neither a PR dependency nor a nightly matrix.
See [MOBILE-TESTING.md](MOBILE-TESTING.md) for capabilities and limitations.
Playwright WebKit is a useful engine smoke test, not proof of iPhone keyboard,
toolbar or native-browser behavior.

Artifacts expire (7 days for gate reports, 14 for diagnostics); output stays
git-ignored. Preserve valuable evidence outside Git before expiry.

## Local work

Follow CLAUDE.md's shared-machine load rule: one typecheck, lint changed files,
relevant Vitest files with `--maxWorkers=1`, and relevant browser specs with
`--workers=1`. Stop servers you start. CI supplies the full correctness verdict;
dispatch the broad regression suite when changing shared shell, navigation,
browser storage or accessibility behavior.

For visual work, start `pnpm dev:mock`, then:

```sh
pnpm shots --signed-in --only schedule,todo
pnpm shots --url https://terpsicle.com
pnpm tsx scripts/mobile-lab/run.ts --engine chromium --url http://localhost:3000 --only keyboard-at-half,rotate --no-video
```

Use the available Chromium in agent sandboxes rather than installing browsers.
Phone renders are diagnostic evidence to inspect, not baseline snapshots to
approve automatically.

## Adding tests without adding routine work

Put each regression at the cheapest layer that catches it. Pure logic belongs
in core; API permissions, persistence and jobs belong in Worker tests;
component states belong in UI tests. Add a required browser journey only for a
new high-risk user flow or a genuinely browser-specific seam. Do not multiply
the same API/data assertions across viewports. Keep broad presentation and
device probes explicit, and remove obsolete duplicates deliberately rather
than disabling a failing test.

Reuse existing journeys and Playwright tags, fixtures and reports rather than
building another runner. Give mutable browser tests fresh server-side users,
including retries; contexts alone do not isolate D1 data. Shared push capture
lives in `e2e/push-service.ts`.

Watch the gate's critical path and retry failures. Aim for a few minutes of
routine feedback, not a fixed runner-time promise. Revisit the selection when
a production escape exposes a missing seam, or setup/flake costs dominate it.
