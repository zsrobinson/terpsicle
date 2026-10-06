import { Check } from "lucide-react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Mark } from "~/components/brand/mark";
import { LazyTooltip } from "~/components/lazy-tooltip";
import { useMediaQuery } from "~/hooks/use-media-query";
import { lazyComponent } from "~/lib/lazy-component";
import { OUTSIDE_TAB, OutsideArrow } from "~/ui/outside-link";
import { REVIEWS_OUTSIDE, STEPS } from "../copy";
import { HeroWords } from "../hero";
import { Misprint } from "../misprint";
import {
  NAME,
  PAINT,
  PRODUCT_ORDER,
  useReviewsOutside,
  useView,
} from "../products";
import { type DemoState, START } from "./plan-a";
import { Screen } from "./screen";
import { STEP_PRODUCT, type Stage, toStage } from "./stages";

// The page's story (docs/DESIGN.md §8): the hero's words, then one step per
// product, beside one product screen that stays in view (sticky, never
// pinned: the page scrolls at the browser's own speed). The screen starts as
// the plain week, and each step puts its product's piece on it as the step
// reaches the middle of the window. The same stages are a click away in the
// steps above the screen, and a Tab away: focus inside a step stages it.
// Reduced motion gets each stage's final frame with no transition
// (marketing.css).

// If their code doesn't arrive, the screen stays the plain week, and asks
// again once the browser is back online (~/lib/lazy-component). They show
// nothing while it comes rather than suspend: a render that suspended on a
// chunk that then failed could stay uncommitted, holding back the rest of
// the page's first update (e2e/build).
const Pieces = lazyComponent<ComponentProps<typeof import("./pieces").Pieces>>(
  () => import("./pieces").then((m) => m.Pieces),
  () => null,
  { Loading: null },
);

/** While the page scrolls to a step it was sent to, scrolling doesn't restage. */
const SENT_MS = 1000;

export function Story() {
  const [stage, setStage] = useState<Stage>(0);
  const [state, setState] = useState<DemoState>(START);
  const [wantPieces, setWantPieces] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sentUntil = useRef(0);
  const wide = useMediaQuery("(min-width: 1024px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  // The step in the middle of the window (on a phone, the middle of what
  // the screen leaves uncovered) is the stage.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (performance.now() < sentUntil.current) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const next = toStage((entry.target as HTMLElement).dataset.step);
          if (next !== null) setStage(next);
        }
      },
      {
        rootMargin: wide ? "-45% 0px -45% 0px" : "-55% 0px -35% 0px",
      },
    );
    for (const step of el.querySelectorAll("[data-step]"))
      observer.observe(step);
    return () => observer.disconnect();
  }, [wide]);

  // The pieces' code loads once the steps are near, never before the page
  // is up.
  useEffect(() => {
    const steps = root.current?.querySelector("[data-steps]");
    if (!steps || wantPieces) return;
    if (typeof IntersectionObserver === "undefined") {
      setWantPieces(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setWantPieces(true);
      },
      { rootMargin: "0px 0px 50% 0px" },
    );
    observer.observe(steps);
    return () => observer.disconnect();
  }, [wantPieces]);

  const hold = useCallback(() => {
    sentUntil.current = performance.now() + SENT_MS;
  }, []);

  /** A step button: stage it now, and bring its words into view. */
  const go = useCallback(
    (next: Stage) => {
      setWantPieces(true);
      hold();
      setStage(next);
      root.current?.querySelector(`[data-step="${next}"]`)?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: wide ? "center" : "start",
      });
    },
    [reduced, wide, hold],
  );

  const changed =
    state.ENGL393 !== START.ENGL393 ||
    state.STAT400 !== START.STAT400 ||
    state.watching !== START.watching;

  return (
    <div
      ref={root}
      data-stage={stage}
      className="mk-story mk-grain"
      data-product={stage === 0 ? undefined : STEP_PRODUCT[stage]}
    >
      <div className="mk-wrap mk-story-grid">
        <section
          aria-labelledby="hero-title"
          data-step="0"
          className="mk-hero"
          onFocus={() => {
            hold();
            setStage(0);
          }}
        >
          <HeroWords />
        </section>
        {/* A plain box: on a phone it dissolves (display: contents) so the
            screen sticks through the whole story. */}
        <div className="mk-screen-col">
          <Screen
            stage={stage}
            state={state}
            changed={changed}
            onGo={go}
            onReset={() => setState(START)}
            onIntent={() => setWantPieces(true)}
            pieces={
              wantPieces ? (
                <Pieces stage={stage} state={state} onChange={setState} />
              ) : null
            }
          />
        </div>
        <div data-steps="" className="mk-steps">
          {PRODUCT_ORDER.map((product, i) => (
            <Step
              key={product}
              product={product}
              n={(i + 1) as Exclude<Stage, 0>}
              onFocus={(n) => {
                setWantPieces(true);
                hold();
                setStage(n);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Step({
  product,
  n,
  onFocus,
}: {
  product: (typeof PRODUCT_ORDER)[number];
  n: Exclude<Stage, 0>;
  onFocus: (n: Exclude<Stage, 0>) => void;
}) {
  const outside = useReviewsOutside();
  const step =
    product === "reviews" && outside ? REVIEWS_OUTSIDE : STEPS[product];
  const view = useView(product);
  const paint = PAINT[product];
  return (
    <section
      id={product}
      aria-labelledby={`${product}-title`}
      data-step={n}
      className="mk-step"
      onFocus={() => onFocus(n)}
    >
      <p
        className={`flex items-center gap-2 font-semibold text-lg ${paint.text}`}
      >
        <Mark id={product} size={22} />
        {NAME[product]}
        <span className="ident font-normal text-faint text-sm">{n} of 5</span>
      </p>
      <h2 id={`${product}-title`} className="mk-display mk-h2">
        <Misprint className={paint.text}>{step.title}</Misprint>
      </h2>
      <p className="mk-body">{step.one}</p>
      <ul className="flex flex-col gap-2 text-base">
        {step.facts.map((fact) => (
          <li key={fact} className="flex items-start gap-2">
            <Check
              aria-hidden="true"
              className={`mt-1 size-3.5 shrink-0 ${paint.text}`}
            />
            <span>{fact}</span>
          </li>
        ))}
      </ul>
      <p className="mk-try text-muted text-sm">{step.tryIt}</p>
      <div>
        <LazyTooltip label={view.tooltip}>
          <a
            href={view.to}
            {...(view.outside ? OUTSIDE_TAB : {})}
            className={`mk-link inline-flex items-center gap-0.5 font-semibold text-base ${paint.text}`}
          >
            {view.label}
            {view.outside ? <OutsideArrow /> : null}
          </a>
        </LazyTooltip>
      </div>
    </section>
  );
}
