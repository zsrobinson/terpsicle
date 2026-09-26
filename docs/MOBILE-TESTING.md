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

- **Any URL, any engines:** Actions → *Mobile lab* → *Run workflow*. Inputs: `url` (default production), `engines` (`webkit,android,ios`), `scenarios` (ids, comma-separated; empty for all), `repeat` (each scenario this many times, for an intermittent failure; repeats are `<id>-2`, `<id>-3`, …), `video` (off rules the recorder out when chasing a crash).
- **Nightly:** every engine against https://terpsicle.com.
- **PRs:** `ci.yml` runs WebKit against the PR's preview after it deploys, when the PR touches `src/app/`, `src/styles.css`, anything named `*drawer*` or the lab itself. Add the **`mobile-lab`** label to a PR to run Android and iOS as well: adding it runs all three at once against the current preview, and later pushes include them.

A run fails when a `fail` check fails (below); results are published either way.

**Locally:**

```sh
pnpm tsx scripts/mobile-lab/run.ts --engine chromium --url https://terpsicle.com
pnpm tsx scripts/mobile-lab/run.ts --engine webkit --url http://localhost:3000 --only keyboard-at-half,rotate
```

`--url` names the deployment; the lab opens its scheduler at `/schedule` (a URL with its own path is used as is). `--repeat <n>` runs each scenario n times. `--out <dir>` picks the results folder (default `mobile-lab-results/<time>-<engine>`, git-ignored); `--no-video` skips recordings. `android` needs `adb` with one emulator or phone attached (with USB debugging, Chrome installed, and for an emulator a Google APIs image so Chrome reads its command-line file). `ios` needs a Mac with Xcode, an Appium 3 server with the XCUITest driver (`APPIUM_URL`, default `http://127.0.0.1:4723`) and optionally `IOS_DEVICE`, `IOS_VERSION` or `IOS_UDID`. Don't run `playwright install` in an agent sandbox; use `chromium` there.

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
- `browser-log.txt` (`webkit`): WebKit's own output (`DEBUG=pw:browser`).
- `kernel-log.txt` (`webkit`): the runner's kernel lines about segfaults and OOM kills, and `free -m`: how a crashed page process died.
- `webcontent-log.txt` (`ios`): the Simulator's log lines from Safari's page process about crashes, memory pressure and jetsam.

Each step also records `memory`: the resident size of the engine's page processes, read with `ps` on the runner (WebKit's `WebKitWebProcess`, Chromium's renderers, the Simulator's `com.apple.WebKit.WebContent`; not on Android). It counts every such process on the machine, so it's only meaningful on a CI runner, not a shared sandbox.

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
| `page-process-alive` | fail | The page's process crashed (Playwright's "Target crashed"), with the last actions and page-process memory as evidence. |
| `rail-tabs-reachable` | fail | In the desktop layout (a phone on its side is over 768px wide), a rail tab is past the bottom of the screen and the rail doesn't scroll. |
| `page-not-scrolled` | warn | The window scrolled: the page itself moved. |
| `not-zoomed` | warn | The visual viewport's scale isn't 1 (Safari zooms into small text fields). |
| `no-horizontal-overflow` | warn | The document is wider than the screen. |
| `drawer-rests-at-snap` | warn | At rest, the drawer's top isn't where its snap puts it. |
| `drawer-moves-one-way` | warn | Within one step the drawer reversed direction more than once (a flash or jump). |
| `focused-field-never-above-view` | fail | In any frame the focused field was above the visible band. |

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
| `scroll-list-back` | Scroll the search results down, then drag them back up: the list scrolls and the drawer stays at full. |
| `calendar-pull` | Scroll the calendar, then pull down twice at its top. |
| `rotate` | Landscape (where half is full) and back. |
| `url-bar` | Scroll the calendar and a list up and down, logging whether the browser's toolbar hides (`innerHeight` and the page's origin change). |
| `long-course` | Search "engl101", open ENGL101 (90+ sections), raise the drawer and scroll to the bottom; the list's end must be on screen. |
| `open-results` | Six times: back in the search box, scroll the results, put the keyboard away, tap a result. Each must open on the first tap. |
| `add-sections` | Open CMSC131, tap Add on a section, then Switch three times. Each tap must take effect the first time. |

To add one, append to `SCENARIOS`: use `lab.tap`, `lab.swipe`, `lab.type`, `lab.hideKeyboard` and `lab.rotate` on `Target`s (a selector, optionally a label), and `lab.step(name, { expect })` after each action.

## Known issue: WebKit's compositor crash

Playwright's WebKit on Linux (the WPE port, `webkit-2359`, WebKit 26.6, `libWPEWebKit-2.0.so.1.12.0`) sometimes crashes its page process. Playwright reports "Target crashed", usually while taking a screenshot, and the runner's kernel logs a segfault in WPE's compositor thread at the same instruction every time:

```
eadedCompositor[6411]: segfault at 0 ip …0f8a sp … error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,…]
Code: … 49 89 fe <48> 8b 07 ff 50 40 …   (mov rax,[rdi]; call [rax+0x40]: a virtual call through a null object)
```

**How often.** On 2026-09-26, 10 of 663 runs of `tabs` crashed with the kernel logging this segfault, about 1 in 65. Two earlier crashes have no kernel log. It happened mostly on the tap from Search to Problems, also on Blocks, Generate, Export and Travel, and never in the other scenarios' ~200 runs. It happened with recording and screenshots on, with recording off, and with both off. It hit production and two PR previews alike.

**Why it isn't the page:**
- The page process holds a steady ~570 MB, and the runner has ~14.9 GB free.
- No WebGL is involved: the Travel tab mounts MapLibre only in a connection's details.
- Safari's page process in the iOS Simulator doesn't use this compositor. Ten runs of `tabs` there showed no crash, and its log showed no memory warning or jetsam (Safari holds ~190–220 MB).

**Upstream.**
- A likely match, not confirmed without symbols: [WebKit bug 308242](https://bugs.webkit.org/show_bug.cgi?id=308242), "[GTK][WPE] AcceleratedSurface might segfault when createTarget() fails". Its compositor thread dereferences a null render target when a buffer can't be allocated without a GPU, as on a CI runner. It's open and unassigned.
- Related Playwright reports of random WPE page-process deaths, with different signatures: [microsoft/playwright#42740](https://github.com/microsoft/playwright/issues/42740) (SIGILL) and [#22903](https://github.com/microsoft/playwright/issues/22903) (after screenshots).
- We haven't filed anything upstream.

**What the lab does.** When a WebKit scenario crashes and the kernel log shows this exact segfault (`isWebkitCompositorCrash` in `checks.ts`):
- The crashed attempt is kept as `<id>-webkit-crash-<n>`, marked `webkit-compositor-crash` (a warning) with the kernel's lines.
- The scenario runs again, up to twice. A scenario that crashes a third time fails.
- So does any crash without this signature, and any crash on Android or iOS, as `page-process-alive`.
- Reading the kernel log needs `sudo dmesg`, which GitHub's runners allow. Without it, every crash fails.

## What it can't tell

- The Simulator and emulator run on a Mac's and a Linux VM's GPU and CPU: frame timing and jank aren't a phone's.
- The Android image's Chrome is the one it shipped with, which may trail the Play Store's.
- iOS in the Simulator is close to a phone but not the same: no real finger pressure or velocity, and Safari's toolbar-collapse heuristics can differ.
- Gestures are straight lines at a fixed speed; a real flick varies.
- On `android` and `ios` one browser profile serves every scenario, so only the first scenario of a run is a true first visit; the rest start from what the app restored (the open tab, a course left open). On `webkit` and `chromium` every scenario is a first visit.
- The Android emulator's Chrome can be slow enough on a CI runner to answer input late; the device turns off Android's "isn't responding" box so it can't eat taps.
