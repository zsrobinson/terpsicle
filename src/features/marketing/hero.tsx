import { RotateCcw } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { Mark } from "~/app/brand/mark";
import { InlineScript } from "~/app/inline-script";
import { SCHEDULE_PATH } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { Misprint } from "./misprint";
import {
  COMING,
  LAUNCHED,
  NAME,
  PAINT,
  PRODUCT_ORDER,
  TAGLINE,
} from "./products";
import {
  lineEnds,
  railPath,
  SOURCES,
  TANGLE_SIZE,
  type TangleLayout,
  tanglePath,
} from "./tangle";
import { playTangleNow, REPLAY_EVENT, TANGLE_ATTR } from "./tangle-script";

// The hero: the headline, the way in, and five tangled lines, one per tab
// or file a student juggles today, that straighten into five rails ending
// in the products' marks. The server renders the straight end state; the
// inline script right after the drawing tangles it and plays the detangle
// from first paint (tangle-script.ts). Two drawings, wide and tall, are
// switched by CSS so the server never guesses the screen.

export const HEADLINE =
  "Your semester's a tangle of tabs. Let's straighten it out.";

const LEAD =
  "Five tools for your semester at Maryland: build the schedule, read the reviews, talk to your sections, plan your four years and see what's due. Sign in once with your UMD account, or don't: the scheduler works either way.";

const FIGURE_LABEL =
  "Five tangled lines, from a Testudo tab, RateMyProfessors, the group chat, a four-year plan PDF and the ELMS calendar, straighten into five rails: Schedule, Reviews, Chat, Plan and Todo.";

/** CSS custom properties, which React's style type doesn't list. */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Both drawings' paths, worked out once for server and browser alike. */
const LINES = {
  wide: PRODUCT_ORDER.map((product, i) => ({
    product,
    rail: railPath("wide", i),
    tangle: tanglePath("wide", i),
    start: lineEnds("wide", i).start,
  })),
  tall: PRODUCT_ORDER.map((product, i) => ({
    product,
    rail: railPath("tall", i),
    tangle: tanglePath("tall", i),
    start: lineEnds("tall", i).start,
  })),
};

export function Hero() {
  const figure = useRef<HTMLDivElement>(null);
  // Reached by a router navigation (from /privacy, say), no inline script
  // ran: play it from here. On a full load the script has already claimed
  // the drawing and this is a no-op.
  useEffect(() => {
    playTangleNow();
  }, []);
  const replay = () => figure.current?.dispatchEvent(new Event(REPLAY_EVENT));
  return (
    <section aria-labelledby="hero-title" className="mk-wrap mk-hero">
      <div className="mk-hero-grid">
        <div className="flex max-w-[600px] flex-col gap-6">
          <h1 id="hero-title" className="mk-display mk-h1">
            <Misprint className={PAINT.schedule.text}>{HEADLINE}</Misprint>
          </h1>
          <p className="mk-lead">{LEAD}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <WithTooltip label="No account needed">
              <Button asChild className="mk-cta">
                <a href={SCHEDULE_PATH}>Open the scheduler</a>
              </Button>
            </WithTooltip>
            <WithTooltip label="UMD accounts only: umd.edu or terpmail.umd.edu">
              <a href="/signin" className="mk-link font-semibold text-base">
                Sign in with your UMD account
              </a>
            </WithTooltip>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div ref={figure} {...{ [TANGLE_ATTR]: "" }} suppressHydrationWarning>
            <Figure layout="wide" />
            <Figure layout="tall" />
          </div>
          {/* Right after the drawing, so it plays before anything else loads. */}
          <InlineScript name="tangle" />
          <div className="mk-replay flex justify-end">
            <WithTooltip label="Play the detangle again">
              <Button variant="ghost" size="sm" onClick={replay}>
                <RotateCcw aria-hidden="true" />
                Replay
              </Button>
            </WithTooltip>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The wide drawing's marks column: one row per rail, 72px each. */
const RAIL_ROW = TANGLE_SIZE.wide.height / PRODUCT_ORDER.length;

function Figure({ layout }: { layout: TangleLayout }) {
  const { width, height } = TANGLE_SIZE[layout];
  const lines = LINES[layout];
  const wide = layout === "wide";
  return (
    <div className={wide ? "mk-figure-wide" : "mk-figure-tall"}>
      {wide ? null : (
        <p className="mb-3 text-center text-muted text-sm">
          Testudo, RateMyProfessors, the group chat, a PDF from your advisor and
          ELMS.
        </p>
      )}
      <div
        className="mk-canvas"
        style={{ height: wide ? height : 230 }}
        role="img"
        aria-label={FIGURE_LABEL}
      >
        <svg
          data-layout={layout}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {lines.map((l) => (
            <path key={`g-${l.product}`} className="mk-ghost" d={l.tangle} />
          ))}
          {lines.map((l, i) => (
            <path
              key={`r-${l.product}`}
              data-line={i}
              className={PAINT[l.product].line}
              d={l.rail}
              suppressHydrationWarning
            />
          ))}
        </svg>
        {wide
          ? lines.map((l) => (
              <span
                key={`l-${l.product}`}
                aria-hidden="true"
                className="mk-label font-semibold text-muted text-xs"
                style={{ top: l.start[1] - 22 }}
              >
                {SOURCES[l.product]}
              </span>
            ))
          : null}
      </div>
      <ul
        aria-label="The five parts of Terpsicle"
        className={
          wide
            ? "grid grid-rows-[repeat(5,var(--row))]"
            : "mt-3 grid grid-cols-5"
        }
        style={vars({ "--row": `${RAIL_ROW}px` })}
      >
        {PRODUCT_ORDER.map((p, i) => (
          <li key={p} className="mk-end flex" style={vars({ "--i": i })}>
            <WithTooltip label={`Read about ${NAME[p]}`}>
              <a
                href={`#${p}`}
                className={
                  wide
                    ? "flex items-center gap-3 self-center whitespace-nowrap hover:underline"
                    : "flex w-full flex-col items-center gap-1.5 text-center hover:underline"
                }
              >
                <Mark id={p} size={wide ? 28 : 26} />
                <span className="flex flex-col">
                  <span
                    className={
                      wide ? "font-semibold text-lg" : "font-semibold text-xs"
                    }
                  >
                    {NAME[p]}
                  </span>
                  {wide ? (
                    <span className="text-muted text-xs">
                      {LAUNCHED[p] ? TAGLINE[p] : COMING.toLowerCase()}
                    </span>
                  ) : LAUNCHED[p] ? null : (
                    <span className="text-2xs text-muted">Soon</span>
                  )}
                </span>
              </a>
            </WithTooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}
