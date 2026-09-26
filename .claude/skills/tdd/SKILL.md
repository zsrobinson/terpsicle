---
name: tdd
description: Test-first work in Terpsicle, red then green. Use when building a feature or fixing a bug test-first, writing tests for src/core, adding golden or property tests, or deciding where a test belongs.
---

# Test-driven development

Adapted from Matt Pocock's [tdd](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd).

The loop is **red, then green**: one failing test, then just enough code to pass it, one slice at a time. A bug fix starts with a test that's red on the bug.

## Where tests go

Test at a **seam**, the public boundary where behavior shows:

| Seam | Test |
|---|---|
| An exported function in `src/core` | Vitest next to it (`project: core`), with `fast-check` properties where an invariant holds for any input |
| A parser in `src/ingest` or `src/core` | Golden tests on saved real pages or pastes |
| An API route, cron job or Durable Object | The `worker` project, against real D1 and R2 bindings, with the `AI` binding mocked |
| A component | The `ui` project with Testing Library, through what the person sees and clicks |
| A flow across screens | One Playwright spec against `pnpm dev:mock`, signed in through test mode when needed |

Push logic down into `src/core` so most tests are the fast, pure kind. Take time as an argument; build data with the `src/fixtures` builders (`aCourse`, `aSection`, `aPlan`, …).

## Tests worth keeping

- **Behavior, not internals.** A test that breaks on a refactor that didn't change behavior is coupled to the implementation. Mock only the edges: the network, bindings, the clock.
- **Independent expected values.** Take them from the spec, a worked example or a known-good literal, never recomputed the way the code does it.
- **Vertical slices.** Write one test, make it pass, then the next. Writing all the tests up front tests imagined behavior.

Run only the files you touched, with `--maxWorkers=1` (the load rule). A test that's hard to make green gets fixed, never skipped or loosened.
