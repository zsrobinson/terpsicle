// The scripted scenarios, in the order they run. Each starts from a fresh
// load of the app (a first visit: the plan is empty, so the drawer greets at
// half on the Courses tab). docs/MOBILE-TESTING.md lists what each covers.

import type { Check, Probe } from "./checks";
import { visibleBand } from "./checks";
import type { Engine } from "./device";
import { expectation, type Lab, type Target } from "./lab";

export interface Scenario {
  id: string;
  title: string;
  /** Why this scenario means nothing on an engine, if it doesn't. */
  skip?: (engine: Engine) => string | null;
  run(lab: Lab): Promise<void>;
}

const DRAWER = "[data-vaul-drawer]";
const GRABBER: Target = {
  selector: `${DRAWER} button[aria-label$="the panel"]`,
};
const SEARCH_BOX: Target = { selector: 'input[aria-label="Search courses"]' };
const RESULTS: Target = { selector: "#search-results" };
const PANEL_BODY: Target = {
  selector: "#sidebar-panel > [data-layer][data-active] [data-panel-body]",
};
const CALENDAR: Target = { selector: "[data-calendar-scroll]" };
const tab = (label: string): Target => ({
  selector: `${DRAWER} nav[aria-label="Tabs"] button`,
  text: label,
});
const TABS = [
  "Courses",
  "Search",
  "Problems",
  "Travel",
  "Blocks",
  "Generate",
  "Export",
];

/** vaul's snap animation is 0.5 s. */
const SETTLE = 800;

type Snap = "peek" | "half" | "full";

async function snapOf(lab: Lab): Promise<Snap | null> {
  return lab.device.evaluate<Snap | null>(
    `document.querySelector('${DRAWER}')?.getAttribute('data-snap') ?? null`,
  );
}

/** Taps the grabber (peek → half → full → peek) until the drawer is at `snap`. */
async function snapTo(lab: Lab, snap: Snap): Promise<void> {
  for (let i = 0; i < 3 && (await snapOf(lab)) !== snap; i++) {
    await lab.tap(GRABBER);
    await lab.wait(SETTLE);
  }
}

/** What the scenario started on: loaded, recorder installed. */
async function open(lab: Lab): Promise<void> {
  await lab.ready();
  // The first visit raises the drawer once the plan loads; a drawer still
  // off the screen after that is what the step's checks report.
  await lab.waitFor(
    `(() => { const d = document.querySelector('${DRAWER}'); return d && d.getBoundingClientRect().top < innerHeight - 60; })()`,
    10_000,
    "the drawer on screen",
  );
  await lab.wait(1500);
}

/** Types a search and waits for results. */
async function search(lab: Lab, query: string): Promise<void> {
  await lab.tap(tab("Search"));
  await lab.wait(SETTLE);
  await lab.tap(SEARCH_BOX);
  await lab.wait(SETTLE);
  // Clear anything restored from last time, then type.
  await lab.device.evaluate(
    `(() => { const el = document.querySelector('input[aria-label="Search courses"]'); if (el && el.value) { el.select(); } return true; })()`,
  );
  await lab.type(query);
  await lab.waitFor(
    "document.querySelectorAll('[data-course-result]').length > 0",
    45_000,
    "search results",
  );
  await lab.wait(SETTLE);
}

/** The first search result must be on screen above the keyboard. */
function resultsShow(p: Probe): Check[] {
  const band = visibleBand(p);
  const list = p.searchResults?.rect;
  if (!list || p.resultCount === 0)
    return [expectation("results-visible", false, "no results on the page")];
  // A result row is ~52px: the list must show at least one above the band's end.
  const room = Math.min(list.bottom, band.bottom) - Math.max(list.y, band.top);
  return [
    expectation(
      "results-visible",
      room >= 48,
      `${Math.round(room)}px of the results list is visible (list y ${list.y}–${list.bottom}, visible y ${Math.round(band.top)}–${Math.round(band.bottom)})`,
    ),
  ];
}

/** The keyboard is up (real engines only; others can't tell). */
function keyboardUp(lab: Lab, up: boolean): (p: Probe) => Check[] {
  return () => {
    const last = lab.steps.at(-1);
    const shown = last?.keyboard ?? null;
    if (shown === null) return [];
    return [
      expectation(
        up ? "keyboard-up" : "keyboard-down",
        shown === up,
        `keyboard ${shown ? "up" : "down"}`,
        "warn",
      ),
    ];
  };
}

/** The drawer moved through in-between positions: it followed the finger. */
function followed(from: number, to: number) {
  return (p: Probe): Check[] => {
    const lo = Math.min(from, to) + 20;
    const hi = Math.max(from, to) - 20;
    const between = p.frames.filter((f) => {
      const top = f[1];
      return typeof top === "number" && top > lo && top < hi;
    }).length;
    return [
      expectation(
        "drawer-follows-finger",
        between >= 3,
        `${between} frame(s) with the drawer between ${Math.round(from)} and ${Math.round(to)}`,
        "warn",
      ),
    ];
  };
}

function snapIs(snaps: Snap[]) {
  return (p: Probe): Check[] => [
    expectation(
      "drawer-snap",
      snaps.includes(p.drawer?.snap as Snap),
      `at ${p.drawer?.snap}, expected ${snaps.join(" or ")}`,
      "warn",
    ),
  ];
}

async function drawerTop(lab: Lab): Promise<number> {
  return lab.device.evaluate<number>(
    `document.querySelector('${DRAWER}').getBoundingClientRect().top`,
  );
}

/** Taps a text field, then records the drawer and field as the keyboard comes. */
async function focusAndType(lab: Lab, field: Target, text: string) {
  await lab.tap(field);
  await lab.burst("tapped the search box", [150, 500, 1000, 2000]);
  await lab.type(text);
  await lab.waitFor(
    "document.querySelectorAll('[data-course-result]').length > 0",
    45_000,
    "search results",
  );
  await lab.wait(SETTLE);
  await lab.step(`typed "${text}"`, {
    expect: (p) => [...keyboardUp(lab, true)(p), ...resultsShow(p)],
  });
}

export const SCENARIOS: Scenario[] = [
  ...(["half", "full", "peek"] as const).map(
    (snap): Scenario => ({
      id: `keyboard-at-${snap}`,
      title: `Search with the on-screen keyboard from ${snap}: tap the box, type, scroll, put the keyboard away, open a result`,
      async run(lab) {
        await open(lab);
        await lab.step("loaded", { settled: true });
        await lab.tap(tab("Search"));
        await lab.wait(SETTLE);
        await snapTo(lab, snap);
        await lab.step(`Search tab at ${snap}`, {
          settled: true,
          expect: snapIs([snap]),
        });
        if (!(await lab.exists({ ...SEARCH_BOX, visible: true }))) {
          // At peek the box may sit below the screen's edge: nothing to tap.
          await lab.step("the search box isn't on screen");
          return;
        }
        await focusAndType(lab, SEARCH_BOX, "cmsc");
        await lab.swipe(
          await lab.pointIn(RESULTS, 0.5, 0.8),
          { dy: -200 },
          500,
          "scroll",
        );
        await lab.wait(SETTLE);
        await lab.step("scrolled the results", {
          expect: (p) => [
            expectation(
              "results-scrolled",
              (p.searchResults?.scrollTop ?? 0) > 50,
              `results scrollTop ${p.searchResults?.scrollTop}`,
              "warn",
            ),
          ],
        });
        await lab.hideKeyboard();
        await lab.wait(SETTLE);
        await lab.step("put the keyboard away", {
          settled: true,
          expect: keyboardUp(lab, false),
        });
        await lab.tap({
          selector: "#search-results [data-course-result]",
          visible: true,
        });
        await lab.wait(1500);
        await lab.step("opened a result", {
          settled: true,
          expect: (p) => [
            expectation(
              "course-details-open",
              !!p.panel?.heading && p.panel.heading !== "Search",
              `panel heading "${p.panel?.heading}"`,
            ),
          ],
        });
      },
    }),
  ),
  {
    id: "first-load",
    title: "First load",
    async run(lab) {
      await lab.ready();
      await lab.step("shell up");
      await lab.wait(2500);
      await lab.step("settled", {
        settled: true,
        expect: snapIs(["half", "full"]),
      });
    },
  },
  {
    id: "tabs",
    title: "Tap each drawer tab, then the open one again",
    async run(lab) {
      await open(lab);
      for (const label of [...TABS.slice(1), TABS[0] ?? "Courses"]) {
        await lab.tap(tab(label));
        await lab.wait(label === "Travel" ? 2500 : SETTLE);
        await lab.step(`${label} tab`, {
          settled: true,
          expect: snapIs(["half", "full"]),
        });
      }
      await lab.tap(tab("Courses"));
      await lab.wait(SETTLE);
      await lab.step("tapped the open tab", {
        settled: true,
        expect: snapIs(["peek"]),
      });
    },
  },
  {
    id: "grabber-drag",
    title: "Drag the grabber peek → half → full → peek",
    skip: (engine) =>
      engine === "webkit"
        ? "Playwright can't send WebKit a touch drag, and vaul doesn't follow its mouse drags as a finger's"
        : null,
    async run(lab) {
      await open(lab);
      await snapTo(lab, "peek");
      await lab.step("peek", { settled: true });
      const h = await lab.device.evaluate<number>("innerHeight");
      const legs: { to: Snap; dy: number }[] = [
        { to: "half", dy: -(Math.round(h * 0.5) - 124) },
        { to: "full", dy: -(h - 48 - Math.round(h * 0.5)) },
        { to: "peek", dy: h - 48 - 124 },
      ];
      for (const leg of legs) {
        const from = await drawerTop(lab);
        await lab.swipe(GRABBER, { dy: leg.dy }, 900);
        await lab.wait(SETTLE);
        await lab.step(`dragged to ${leg.to}`, {
          settled: true,
          expect: (p) => [
            ...snapIs([leg.to])(p),
            ...followed(from, from + leg.dy)(p),
          ],
        });
      }
    },
  },
  {
    id: "pull-lists",
    title: "Pull down on a list at its top, at each snap",
    async run(lab) {
      await open(lab);
      await search(lab, "cmsc");
      await lab.hideKeyboard();
      await lab.wait(SETTLE);
      for (const snap of ["full", "half", "peek"] as const) {
        await snapTo(lab, snap);
        await lab.device.evaluate(
          "document.querySelector('#search-results')?.scrollTo(0, 0) ?? true",
        );
        await lab.step(`results at ${snap}`, { settled: true });
        const list = (await lab.exists({ ...RESULTS, visible: true }))
          ? RESULTS
          : GRABBER;
        const start = await lab.pointIn(list, 0.5, list === RESULTS ? 0 : 0.5);
        await lab.swipe({ x: start.x, y: start.y + 20 }, { dy: 300 }, 600);
        await lab.wait(1500);
        await lab.step(`pulled down at ${snap}`, { settled: true });
      }
      // The Courses tab's own list (the first-visit guide) at half.
      await lab.tap(tab("Courses"));
      await lab.wait(SETTLE);
      await snapTo(lab, "half");
      const body = await lab.pointIn(PANEL_BODY, 0.5, 0.1);
      await lab.swipe(body, { dy: 300 }, 600);
      await lab.wait(1500);
      await lab.step("pulled down on Courses at half", { settled: true });
    },
  },
  {
    id: "open-results",
    title: "Open five search results in a row, going back each time",
    async run(lab) {
      await open(lab);
      await search(lab, "cmsc");
      await lab.hideKeyboard();
      await lab.wait(SETTLE);
      for (let i = 0; i < 5; i++) {
        // Opening a course lowers the drawer; back up, where five show.
        await snapTo(lab, "full");
        // One tap each, as a person would; a result that needs a second
        // tap fails here.
        await lab.tap({
          selector: "#search-results [data-course-result]",
          visible: true,
          index: i,
        });
        await lab.wait(1500);
        const step = await lab.step(`tapped result ${i + 1}`, {
          expect: (p) => [
            expectation(
              "result-opens-on-one-tap",
              !!p.panel?.heading && p.panel.heading !== "Search",
              `panel heading "${p.panel?.heading}"`,
            ),
          ],
        });
        if (step.probe?.panel?.heading === "Search") continue;
        await lab.tap({
          selector: 'nav[aria-label="Breadcrumb"] button',
          text: "Search",
        });
        await lab.wait(SETTLE);
      }
    },
  },
  {
    id: "calendar-pull",
    title: "Scroll the calendar, then pull down at its top",
    async run(lab) {
      await open(lab);
      await snapTo(lab, "peek");
      const cal = await lab.pointIn(CALENDAR, 0.5, 0.6);
      await lab.swipe(cal, { dy: -250 }, 500, "scroll");
      await lab.wait(SETTLE);
      await lab.step("scrolled the calendar down", {
        expect: (p) => [
          // (A calendar that fits has nothing to scroll.)
          expectation(
            "calendar-scrolled",
            !p.calendar ||
              p.calendar.scrollHeight <= p.calendar.clientHeight ||
              p.calendar.scrollTop > 0,
            `calendar scrollTop ${p.calendar?.scrollTop} of ${p.calendar?.scrollHeight} (${p.calendar?.clientHeight} tall)`,
            "warn",
          ),
        ],
      });
      const top = await lab.pointIn(CALENDAR, 0.5, 0.15);
      await lab.swipe(top, { dy: 350 }, 500, "scroll");
      await lab.wait(SETTLE);
      await lab.swipe(top, { dy: 350 }, 500, "scroll");
      await lab.wait(1500);
      await lab.step("pulled down at the top", {
        settled: true,
        expect: (p) => [
          expectation(
            "calendar-at-top",
            (p.calendar?.scrollTop ?? 0) === 0,
            `calendar scrollTop ${p.calendar?.scrollTop}`,
            "warn",
          ),
        ],
      });
    },
  },
  {
    id: "rotate",
    title: "Rotate to landscape and back",
    async run(lab) {
      await open(lab);
      await lab.step("portrait", { settled: true });
      await lab.rotate("landscape");
      await lab.wait(2000);
      await lab.step("landscape", { settled: true });
      // A wide phone on its side gets the desktop layout (over 768px), with
      // no drawer.
      if (await lab.exists({ selector: DRAWER })) {
        await snapTo(lab, "half");
        await lab.step("landscape, half", { settled: true });
      }
      await lab.rotate("portrait");
      await lab.wait(2000);
      await lab.step("portrait again", { settled: true });
    },
  },
  {
    id: "url-bar",
    title: "Scroll to collapse and expand the browser's toolbar",
    async run(lab) {
      await open(lab);
      await snapTo(lab, "peek");
      await lab.step("start", { settled: true });
      const cal = await lab.pointIn(CALENDAR, 0.5, 0.7);
      await lab.swipe(cal, { dy: -300 }, 400, "scroll");
      await lab.wait(SETTLE);
      await lab.step("scrolled the calendar up (toolbar may hide)");
      await lab.swipe(cal, { dy: 300 }, 400, "scroll");
      await lab.wait(SETTLE);
      await lab.step("scrolled it back (toolbar may show)");
      await search(lab, "cmsc");
      await lab.hideKeyboard();
      await lab.wait(SETTLE);
      await snapTo(lab, "full");
      const list = await lab.pointIn(RESULTS, 0.5, 0.8);
      await lab.swipe(list, { dy: -400 }, 400, "scroll");
      await lab.wait(SETTLE);
      await lab.step("scrolled the results", {
        settled: true,
        expect: bottomVisible,
      });
      await lab.swipe(list, { dy: 400 }, 400, "scroll");
      await lab.wait(SETTLE);
      await lab.step("scrolled them back", {
        settled: true,
        expect: bottomVisible,
      });
    },
  },
  {
    id: "long-course",
    title: "A long course (ENGL101, 90+ sections) scrolled to the bottom",
    async run(lab) {
      await open(lab);
      await search(lab, "engl101");
      await lab.hideKeyboard();
      await lab.wait(SETTLE);
      await lab.tap({ selector: '[data-course-result="ENGL101"]' });
      await lab.wait(2000);
      await lab.step("ENGL101", { settled: true });
      await snapTo(lab, "full");
      await lab.step("ENGL101 at full", { settled: true });
      for (let i = 0; i < 20; i++) {
        const done = await lab.device.evaluate<boolean>(
          `(() => { const b = document.querySelector('${PANEL_BODY.selector}'); return !b || b.scrollTop + b.clientHeight >= b.scrollHeight - 2; })()`,
        );
        if (done) break;
        const body = await lab.pointIn(PANEL_BODY, 0.5, 0.8);
        await lab.swipe(body, { dy: -450 }, 300, "scroll");
        await lab.wait(400);
      }
      await lab.wait(SETTLE);
      await lab.step("scrolled to the bottom", {
        settled: true,
        expect: (p) => [
          expectation(
            "reached-the-bottom",
            !!p.panel?.body &&
              p.panel.body.scrollTop + p.panel.body.clientHeight >=
                p.panel.body.scrollHeight - 2,
            `panel scrollTop ${p.panel?.body?.scrollTop} of ${p.panel?.body?.scrollHeight} (${p.panel?.body?.clientHeight} tall)`,
            "warn",
          ),
          ...bottomVisible(p),
        ],
      });
    },
  },
];

/** The open panel's list ends on screen, not under a toolbar or the edge. */
function bottomVisible(p: Probe): Check[] {
  const body = p.panel?.body?.rect ?? p.searchResults?.rect;
  const band = visibleBand(p);
  // A list the lowered drawer hides (no height, or below the screen) has no
  // end to see.
  if (!body || body.height < 1 || body.y >= band.bottom) return [];
  return [
    expectation(
      "list-bottom-on-screen",
      body.bottom <= band.bottom + 2,
      `list ends at y ${body.bottom}; the screen shows to y ${Math.round(band.bottom)}`,
    ),
  ];
}
