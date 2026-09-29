import { cn } from "cn";
import { ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Mark } from "~/components/brand/mark";
import { Wordmark } from "~/components/brand/wordmark";
import { LazyTooltip } from "~/components/lazy-tooltip";
import { TABS } from "~/features/schedule/tabs";
import { TONE_FILL } from "~/lib/emphasis";
import { Button } from "~/ui/button";
import { SCREEN_CAPTION } from "../copy";
import { NAME, PRODUCT_ORDER } from "../products";
import { CREDITS, type DemoState, problemsOf, problemWords } from "./plan-a";
import { STEP_PRODUCT, type Stage } from "./stages";
import { Week } from "./week";

// The one product screen that stays while the page scrolls (story.tsx): the
// scheduler with Plan A, the family bar's context and the rail, then
// whatever the current step puts on it (pieces.tsx). Everything here is
// server-rendered at its final size, so nothing moves when the pieces'
// code arrives, and the pieces only ever move with transforms.

export function Screen({
  stage,
  state,
  changed,
  pieces,
  onGo,
  onReset,
  onIntent,
}: {
  stage: Stage;
  state: DemoState;
  /** The sample differs from how it started: offer to start over. */
  changed: boolean;
  /** The pieces, once their code has loaded. */
  pieces: ReactNode;
  onGo: (stage: Stage) => void;
  onReset: () => void;
  /** A step button is about to be used: load the pieces now. */
  onIntent: () => void;
}) {
  const problems = problemsOf(state).length;
  return (
    <div className="mk-screen" data-stage={stage}>
      {/* The steps beside the screen, a click away: each one moves the
          page to its words, it doesn't leave it. */}
      <nav aria-label="Steps" className="mk-stepper flex gap-1">
        {PRODUCT_ORDER.map((product, i) => {
          const step = (i + 1) as Exclude<Stage, 0>;
          const current = stage === step;
          return (
            <LazyTooltip
              key={product}
              label={`Step ${step} of 5: ${NAME[STEP_PRODUCT[step]]}`}
            >
              <button
                type="button"
                aria-pressed={current}
                onClick={() => onGo(step)}
                onPointerEnter={onIntent}
                onFocus={onIntent}
                className={cn(
                  "mk-step-button flex min-w-0 items-center justify-center gap-1.5 border px-2 font-semibold text-sm transition-colors",
                  current
                    ? "border-keyline bg-raised text-fg shadow-offset"
                    : "border-hairline-strong bg-bg text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <Mark id={product} size={14} />
                <span className="truncate">{NAME[product]}</span>
              </button>
            </LazyTooltip>
          );
        })}
      </nav>
      <div className="mk-stage relative">
        <div className="mk-app relative z-[2] border border-keyline bg-bg text-fg shadow-offset">
          <div className="mk-bar flex items-center gap-2 border-hairline border-b px-3 text-base">
            <span className="flex shrink-0 items-center gap-2">
              <Mark id="umbrella" size={18} />
              <span className="mk-bar-wide">
                <Wordmark />
              </span>
            </span>
            <span className="mk-bar-wide mk-bar-term ml-2 items-center gap-1 whitespace-nowrap text-muted">
              Spring 2027
              <ChevronDown size={13} aria-hidden="true" />
            </span>
            <span aria-hidden="true" className="mk-bar-wide text-faint">
              /
            </span>
            <span className="flex h-7 items-center gap-1 bg-hover px-2 font-medium">
              Plan A
              <ChevronDown size={13} aria-hidden="true" />
            </span>
            <span className="px-1 text-muted">Plan B</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="mk-bar-wide tnum text-muted">
                <span className="font-medium text-fg">{CREDITS}</span> credits
              </span>
              <LazyTooltip label="See what needs attention">
                <button
                  type="button"
                  onClick={() => onGo(1)}
                  onPointerEnter={onIntent}
                  onFocus={onIntent}
                  aria-label={`Plan A has ${problemWords(problems)}`}
                  className={cn(
                    "flex h-7 items-center gap-1.5 px-2 text-base",
                    TONE_FILL.warn,
                  )}
                >
                  <TriangleAlert size={14} aria-hidden="true" />
                  <span className="tnum">
                    {problems}
                    <span className="mk-bar-wide">
                      {" "}
                      {problems === 1 ? "problem" : "problems"}
                    </span>
                  </span>
                </button>
              </LazyTooltip>
            </span>
          </div>
          <div className="flex">
            <Rail problemsOpen={stage === 1} problems={problems} />
            <Week state={state} className="min-w-0 flex-1" />
          </div>
        </div>
        {pieces}
      </div>
      <div className="mk-caption flex items-start gap-3 text-muted text-sm">
        <p className="flex-1">{SCREEN_CAPTION}</p>
        {changed ? (
          <LazyTooltip label="Put Plan A back the way it started">
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RotateCcw aria-hidden="true" />
              Start over
            </Button>
          </LazyTooltip>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The scheduler's rail, as a picture: its tabs, with Problems selected on
 * Schedule's step. It isn't a control here, so it says nothing to a screen
 * reader; the steps above the screen are how to move.
 */
function Rail({
  problemsOpen,
  problems,
}: {
  problemsOpen: boolean;
  problems: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="mk-rail flex shrink-0 flex-col items-center gap-0.5 border-hairline border-r bg-panel py-2"
    >
      {TABS.map((tab) => {
        const selected = tab.id === "problems" && problemsOpen;
        const Icon = tab.icon;
        return (
          <span
            key={tab.id}
            className={cn(
              "relative flex w-full flex-col items-center gap-1 py-2 transition-colors",
              selected
                ? "bg-accent-soft text-fg before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:bg-fg"
                : "text-muted",
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
            <span className="font-medium text-2xs">{tab.label}</span>
            {tab.id === "problems" && problems > 0 ? (
              <span className="tnum absolute top-1 right-2 min-w-4 rounded-full bg-warn px-1 text-center font-mono text-2xs text-bg leading-4">
                {problems}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
