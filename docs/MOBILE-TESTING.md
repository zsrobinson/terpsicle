# Mobile testing on real engines

`e2e/` checks the phone layout in headless desktop Chromium with emulated touch and a faked keyboard. That can't show what a phone's own browser does: its on-screen keyboard panning the page, its toolbar collapsing, pull-to-refresh, Safari's zoom on focus. The **mobile lab** (`scripts/mobile-lab/`) runs a scripted set of phone scenarios against a deployed Terpsicle on real mobile browser engines, and records what happened at every step.

| Engine | What it is | Touch and keyboard | Where it runs | Time |
|---|---|---|---|---|
| `webkit` | Playwright WebKit with an iPhone 15's viewport, touch and user agent | Emulated taps; drags are mouse drags and scrolls are script scrolls (Playwright can't send WebKit a touch drag), so `grabber-drag` is skipped; no on-screen keyboard or toolbar | Ubuntu runner, on every PR that touches the shell | ~3 min |
| `android` | Chrome on an Android 14 emulator (Pixel 7 profile, Google APIs image, which ships Chrome 113) | Real: `adb shell input` taps, swipes and typing through the IME, so Android's pull-to-refresh, keyboard and dynamic toolbar are the real ones | Ubuntu runner with KVM | ~6 min |
| `ios` | Safari on an iPhone 16 in the iOS Simulator | Real: XCUITest touches and taps on the software keyboard (the Simulator's hardware keyboard is disconnected), so Safari's panning, zoom on focus, rubber-banding and toolbars are the real ones | macOS runner, Appium's XCUITest driver (prebuilt WebDriverAgent) | ~14 min |
| `chromium` | Playwright Chromium with the same phone viewport and CDP touch | Emulated | Local only (agent sandboxes have Chromium and no WebKit) | ~3 min |

Times are a whole CI job, setup included (the scenarios themselves: about 2, 5 and 11 minutes).

Page scripts (the probe) go over each browser's debugging protocol; every touch goes through the platform's own input on `android` and `ios`. Both map page coordinates to the screen with a calibration tap at the start of each scenario and after a rotation, because the page's origin moves with the toolbars.

## Running it

**In CI** (`.github/workflows/mobile-lab.yml`):

- **Any URL, any engines:** Actions → *Mobile lab* → *Run workflow*. Inputs: `url` (default production), `engines` (`webkit,android,ios`), `scenarios` (ids, comma-separated; empty for all).
- **Nightly:** every engine against https://terpsicle.com.
- **PRs:** `ci.yml` runs WebKit against the PR's preview after it deploys, when the PR touches `src/app/`, `src/styles.css`, anything named `*drawer*` or the lab itself. Add the **`mobile-lab`** label to a PR to run Android and iOS as well: adding it runs all three at once against the current preview, and later pushes include them.

A run fails when a `fail` check fails (below); results are published either way.

**Locally:**

```sh
pnpm tsx scripts/mobile-lab/run.ts --engine chromium --url https://terpsicle.com
pnpm tsx scripts/mobile-lab/run.ts --engine webkit --url http://localhost:3000 --only keyboard-at-half,rotate
```

`--out <dir>` picks the results folder (default `mobile-lab-results/<time>-<engine>`, git-ignored); `--no-video` skips recordings. `android` needs `adb` with one emulator or phone attached (with USB debugging, Chrome installed, and for an emulator a Google APIs image so Chrome reads its command-line file). `ios` needs a Mac with Xcode, an Appium 3 server with the XCUITest driver (`APPIUM_URL`, default `http://127.0.0.1:4723`) and optionally `IOS_DEVICE`, `IOS_VERSION` or `IOS_UDID`. Don't run `playwright install` in an agent sandbox; use `chromium` there.

## Reading results

Every CI run is published to the **`mobile-runs` branch**, under `runs/<UTC time>-<engine>-<workflow run id>/`, and uploaded as the workflow run's artifact (`mobile-lab-<engine>`, kept 14 days). The branch's `README.md` lists the newest 40 runs with their results. It's a single orphan commit, rewritten on each publish, so old runs drop out and nothing reaches `main`.

- **On GitHub:** open `https://github.com/zsrobinson/terpsicle/blob/mobile-runs/README.md` and follow a run. Its `README.md` shows each scenario's steps as screenshots next to what the step measured, with failed checks in bold, and links each scenario's recording.
- **From a checkout (agents):** `git fetch origin mobile-runs && git worktree add /tmp/mobile-runs origin/mobile-runs`, then read `runs/<run>/README.md`, look at the screenshots, and query `summary.json`.

A run folder holds:

- `README.md`: the report.
- `summary.json`: everything. Per scenario, per step: the actions since the last step (with the points touched), the checks, and the **probe**:
  - `innerWidth`/`innerHeight`, `visualViewport` (`height`, `offsetTop`, `scale`), `scrollX`/`scrollY`, the document's scroll size;
  - the drawer's `data-snap`, its rect and the height of its inside;
  - `activeElement`, its rect and what's on top of it (`hit: "self"` when nothing covers it);
  - the open panel's heading and scroll positions, the search results' and the calendar's;
  - `events` since the last step: `resize`, `vv-resize`/`vv-scroll`, window `scroll`, `focusin`/`focusout`, `visibility`, `pagehide`, `beforeunload`, `pointercancel`, `touchstart`/`touchend` (with the point the page felt), errors;
  - `frames`: a per-animation-frame trace of whatever moved, as `[ms, drawerTop, snap, innerHeight, vvHeight, vvOffsetTop, vvScale, scrollY, focusedTop]`. This is how a drawer that jumps or a field that slides out of view mid-animation shows up, even between screenshots.
- `<scenario>/NN-<step>.jpg`: the whole screen, browser toolbar and keyboard included on `android` and `ios`.
- `<scenario>/video.mp4` (`.webm` on `webkit`): the scenario's screen recording.
- `RESULT`: three lines for the index.

`jq` gets the numbers fast, e.g. every failed check:

```sh
jq -r '.scenarios[] | .id as $s | .steps[] | .name as $n | .checks[] | select(.ok|not) | "\($s) / \($n): \(.severity) \(.id): \(.detail)"' summary.json
```

## Checks

Every step checks (`scripts/mobile-lab/checks.ts`):

| Check | Severity | Fails when |
|---|---|---|
| `no-reload` | fail | The page reloaded or navigated (the recorder the scenario installed in the page is gone): pull-to-refresh, a history swipe, a crash. |
| `no-page-errors` | fail | An uncaught error or rejection. |
| `focused-field-visible` | fail | A focused text field isn't wholly inside the visible band (`visualViewport.offsetTop` to `offsetTop + height`), or something covers it: the keyboard, or a pan that moved it out of view. |
| `drawer-on-screen` | fail | The drawer's top is off the screen. |
| `page-not-scrolled` | warn | The window scrolled: the page itself moved. |
| `not-zoomed` | warn | The visual viewport's scale isn't 1 (Safari zooms into small text fields). |
| `no-horizontal-overflow` | warn | The document is wider than the screen. |
| `drawer-rests-at-snap` | warn | At rest, the drawer's top isn't where its snap puts it. |
| `drawer-moves-one-way` | warn | Within one step the drawer reversed direction more than once (a flash or jump). |
| `focused-field-never-above-view` | warn | In any frame the focused field was above the visible band. |

Scenarios add their own (`results-visible`, `list-bottom-on-screen`, `drawer-follows-finger`, …). A `fail` fails the run; a `warn` shows in the report.

## Scenarios

In order (`scripts/mobile-lab/scenarios.ts`). Each starts with a fresh load.

| Id | What it does |
|---|---|
| `keyboard-at-half`, `keyboard-at-full`, `keyboard-at-peek` | Search tab at that snap; tap the search box and watch the next two seconds (steps at +150, +500, +1000 and +2000 ms); type "cmsc" on the keyboard; scroll the results; put the keyboard away; open a result. |
| `first-load` | The first screen, then after it settles. |
| `tabs` | Tap each drawer tab, then the open one again (which lowers the drawer). |
| `grabber-drag` | Drag the grabber peek → half → full → peek; the frame trace shows whether the drawer followed the finger. |
| `pull-lists` | Pull down on the search results at their top at full, half and peek, then on the Courses panel at half. On Android this is where pull-to-refresh would fire. |
| `open-results` | Six times: back in the search box, scroll the results, put the keyboard away, tap a result. Each must open on the first tap. |
| `calendar-pull` | Scroll the calendar, then pull down twice at its top. |
| `rotate` | Landscape (where half is full) and back. |
| `url-bar` | Scroll the calendar and a list up and down, logging whether the browser's toolbar hides (`innerHeight` and the page's origin change). |
| `long-course` | Search "engl101", open ENGL101 (90+ sections), raise the drawer and scroll to the bottom; the list's end must be on screen. |

To add one, append to `SCENARIOS`: use `lab.tap`, `lab.swipe`, `lab.type`, `lab.hideKeyboard` and `lab.rotate` on `Target`s (a selector, optionally a label), and `lab.step(name, { expect })` after each action.

## What it can't tell

- The Simulator and emulator run on a Mac's and a Linux VM's GPU and CPU: frame timing and jank aren't a phone's.
- The Android image's Chrome is the one it shipped with, which may trail the Play Store's.
- iOS in the Simulator is close to a phone but not the same: no real finger pressure or velocity, and Safari's toolbar-collapse heuristics can differ.
- Gestures are straight lines at a fixed speed; a real flick varies.
- On `android` and `ios` one browser profile serves every scenario, so only the first scenario of a run is a true first visit; the rest start from what the app restored (the open tab, a course left open). On `webkit` and `chromium` every scenario is a first visit.
- The Android emulator's Chrome can be slow enough on a CI runner to answer input late; the device turns off Android's "isn't responding" box so it can't eat taps.
