import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// The axe scan every e2e spec uses: WCAG 2.2 AA plus best practices, with
// violations attached to the report and asserted softly, so one run lists
// them all.

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

// The route map is a MapLibre <canvas>: axe can't read pixels, and its
// tile labels come from the map style, not our tokens. The map has a text
// alternative (the connection's words above it), so leave the canvas out.
//
// Base UI's focus guards: empty spans around an open popup that hand focus
// straight on (into the popup, or back to its trigger). They're focusable
// on purpose and hidden from screen readers on purpose, which is the pair
// `aria-hidden-focus` reports; there's nothing in them to read or use.
const EXCLUDE = [".maplibregl-canvas", "[data-base-ui-focus-guard]"];

// The `region` rule (all content inside a landmark) only: menus, popovers
// and tooltips are floating layers portaled to the end of <body> so they
// stack above everything. They're reached from their trigger (focus moves
// in, or aria-describedby), never by landmark, so the rule doesn't apply to
// them. Every other rule still checks them.
// The kit marks each with `data-floating`; Base UI portals each one in a
// `data-base-ui-portal` div, which axe otherwise reports in its place.
const FLOATING = ["[data-floating]", "[data-base-ui-portal]"];

export async function scan(page: Page, what: string) {
  // Let entry animations (drill-in slide, popovers, toasts) finish: axe
  // reads colors mid-fade as low contrast. A moment for ones about to
  // start, then every running one that ends (a spinner's never does): the
  // moment alone let a toast that came just before be read mid-fade (the
  // iPhone sheet's scan in pwa.spec.ts).
  await page.waitForTimeout(250);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === "running" &&
            Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity),
        )
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  let everything = new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules("region");
  let region = new AxeBuilder({ page }).withRules("region");
  for (const selector of FLOATING) region = region.exclude(selector);
  for (const selector of EXCLUDE) {
    everything = everything.exclude(selector);
    region = region.exclude(selector);
  }
  const violations = [
    ...(await everything.analyze()).violations,
    ...(await region.analyze()).violations,
  ];
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 6).map((n) => ({
      target: n.target.join(" "),
      summary: n.failureSummary?.split("\n").slice(0, 3).join(" "),
    })),
  }));
  if (summary.length > 0)
    await test.info().attach(`axe: ${what}`, {
      body: JSON.stringify(summary, null, 2),
      contentType: "application/json",
    });
  expect.soft(summary, `axe violations: ${what}`).toEqual([]);
}
