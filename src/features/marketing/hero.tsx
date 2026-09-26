import { type CSSProperties, useState } from "react";
import { Mark } from "~/app/brand/mark";
import { SCHEDULE_PATH } from "~/core/routing";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { Misprint } from "./misprint";
import { BECOMES, COMING, NAME, PAINT, PRODUCT_ORDER, VIEW } from "./products";
import {
  DETANGLE_DELAY_MS,
  DETANGLE_MS,
  poseTransform,
  railPath,
  segments,
  sourceLabels,
  TANGLE_SIZE,
  type TangleLayout,
  tanglePath,
} from "./tangle";

// The hero (Fable's "Detangle"): the headline, the two ways in, and five
// tangled lines, one per source of semester mess, that straighten into five
// rails ending in the products' marks. It plays on first paint with CSS
// alone (marketing.css), so the server-rendered page moves before any script
// loads; reduced motion shows the straight rails over a faint ghost of the
// tangle. Two drawings, wide and tall, switched by CSS, so the server never
// guesses the screen.

export const HEADLINE =
  "Your semester's a tangle of tabs. Let's straighten it out.";

const LEAD =
  "Terpsicle's a set of planning tools for your semester at Maryland. Build the schedule, choose with the reviews, talk to your sections, plan the four years, and see what's due. One address, one UMD sign-in, and the scheduler doesn't even need that.";

export const SIGN_IN_PITCH =
  "Sign in to join your class chats. Your plans sync too.";

const FIGURE_LABEL =
  "Five tangled lines, from a Testudo tab, RateMyProfessors, the group chat, a four-year plan PDF and the ELMS calendar, straighten into five rails: Schedule, Reviews, Chat, Plan and Todo.";

/** CSS custom properties, which React's style type doesn't list. */
const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Everything each drawing needs, worked out once for server and browser. */
const FIGURES = {
  wide: figure("wide"),
  tall: figure("tall"),
};

function figure(layout: TangleLayout) {
  return {
    lines: PRODUCT_ORDER.map((product, i) => ({
      product,
      rail: railPath(layout, i),
      tangle: tanglePath(layout, i),
      segments: segments(layout, i).map((s) => ({
        length: s.length,
        style: vars({
          "--to": poseTransform(s.to),
          "--from": poseTransform(s.from),
          "--delay": `${Math.round(DETANGLE_DELAY_MS + s.delayMs)}ms`,
          "--dur": `${Math.round(s.durationMs)}ms`,
        }),
      })),
    })),
    labels: sourceLabels(layout),
  };
}

export function Hero() {
  // Replay remounts the drawing, which starts its animations over.
  const [run, setRun] = useState(0);
  return (
    <section aria-labelledby="hero-title" className="mk-hero">
      <div className="mk-wrap flex flex-col gap-6">
        <div className="mk-hero-text flex flex-col gap-4">
          <h1
            id="hero-title"
            className="mk-display mk-h1 mk-rise"
            style={vars({ "--i": 0 })}
          >
            <Misprint className="mk-schedule mk-mis-color">{HEADLINE}</Misprint>
          </h1>
          <p className="mk-lead mk-rise mk-pretty" style={vars({ "--i": 1 })}>
            {LEAD}
          </p>
          <div
            className="mk-rise flex flex-wrap items-center gap-3"
            style={vars({ "--i": 2 })}
          >
            <WithTooltip label="No account needed">
              <Button asChild className="mk-cta">
                <a href={SCHEDULE_PATH}>Open the scheduler</a>
              </Button>
            </WithTooltip>
            <WithTooltip label={SIGN_IN_PITCH}>
              <Button asChild variant="outline" className="mk-cta">
                <a href="/signin">Sign in with Google</a>
              </Button>
            </WithTooltip>
          </div>
          <p className="mk-rise text-muted text-sm" style={vars({ "--i": 3 })}>
            {SIGN_IN_PITCH} UMD accounts only: terpmail.umd.edu or umd.edu.
          </p>
        </div>
        <div className="mk-rise flex flex-col gap-2" style={vars({ "--i": 4 })}>
          <div
            key={run}
            className="mk-tangle"
            data-tangle
            style={vars({
              "--mk-start": `${DETANGLE_DELAY_MS}ms`,
              "--mk-end": `${DETANGLE_DELAY_MS + DETANGLE_MS}ms`,
            })}
          >
            <TangleFigure layout="wide" />
            <TangleFigure layout="tall" />
          </div>
          <div className="mk-replay">
            <WithTooltip label="Play the detangle again">
              <button
                type="button"
                onClick={() => setRun((n) => n + 1)}
                className="text-muted text-sm underline underline-offset-4 hover:text-fg"
              >
                Replay
              </button>
            </WithTooltip>
          </div>
        </div>
      </div>
    </section>
  );
}

function TangleFigure({ layout }: { layout: TangleLayout }) {
  const { width, height } = TANGLE_SIZE[layout];
  const { lines, labels } = FIGURES[layout];
  const wide = layout === "wide";
  return (
    <div
      data-layout={layout}
      className={wide ? "mk-figure-wide" : "mk-figure-tall"}
    >
      <div
        className="mk-canvas"
        style={{ height }}
        role="img"
        aria-label={FIGURE_LABEL}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {lines.map((l) => (
            <path key={`g-${l.product}`} className="mk-ghost" d={l.tangle} />
          ))}
          {lines.map((l) => (
            <path
              key={`m-${l.product}`}
              className={`mk-mis-line mk-mis-stroke ${PAINT[l.product]}`}
              d={l.tangle}
            />
          ))}
          {lines.map((l) => (
            <g
              key={`s-${l.product}`}
              className={`mk-stroke ${PAINT[l.product]}`}
            >
              {l.segments.map((s, k) => (
                <line
                  // A line's segments never reorder.
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  key={k}
                  className="mk-seg"
                  x1={-s.length / 2}
                  x2={s.length / 2}
                  y1={0}
                  y2={0}
                  style={s.style}
                />
              ))}
            </g>
          ))}
          {lines.map((l) => (
            <path
              key={`r-${l.product}`}
              className={`mk-rail mk-stroke ${PAINT[l.product]}`}
              d={l.rail}
              data-rail={l.product}
            />
          ))}
        </svg>
        {labels.map((label) => (
          <span
            key={label.text}
            aria-hidden="true"
            data-anchor={label.anchor}
            data-gone={label.becomesLine ? undefined : ""}
            className={`mk-label font-semibold text-muted ${wide ? "text-sm" : "text-xs"}`}
            style={vars({
              left: `${(label.x / width) * 100}%`,
              top: `${label.y}px`,
              "--dx": ((label.dx / width) * 100).toFixed(2),
              "--dy": label.dy.toFixed(1),
            })}
          >
            {label.text}
          </span>
        ))}
      </div>
      <Ends layout={layout} />
    </div>
  );
}

function Ends({ layout }: { layout: TangleLayout }) {
  const wide = layout === "wide";
  return (
    <ul
      aria-label="The five parts of Terpsicle"
      className={wide ? "mk-ends-wide" : "mk-ends-tall"}
    >
      {PRODUCT_ORDER.map((p, i) => (
        <li
          key={p}
          className="mk-end flex"
          style={vars(
            wide
              ? { "--i": i }
              : { "--i": i, "--end-x": "0", "--end-y": "-6px" },
          )}
        >
          <WithTooltip label={`Read about ${NAME[p]}`}>
            <a
              href={`#${p}`}
              className={
                wide
                  ? "flex items-center gap-3 self-center whitespace-nowrap hover:underline"
                  : "flex w-full flex-col items-center gap-1 text-center hover:underline"
              }
            >
              <Mark id={p} size={28} />
              <span className="flex flex-col">
                <span
                  className={
                    wide ? "font-semibold text-lg" : "font-semibold text-xs"
                  }
                >
                  {NAME[p]}
                </span>
                {wide ? (
                  <span className="text-muted text-sm">
                    {VIEW[p] ? BECOMES[p] : COMING}
                  </span>
                ) : VIEW[p] ? null : (
                  <span className="text-2xs text-muted">Soon</span>
                )}
              </span>
            </a>
          </WithTooltip>
        </li>
      ))}
    </ul>
  );
}
