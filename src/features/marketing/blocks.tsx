import {
  type ComponentType,
  type CSSProperties,
  type LazyExoticComponent,
  lazy,
  Suspense,
  useRef,
} from "react";
import { Mark } from "~/app/brand/mark";
import { WithTooltip } from "~/ui/tooltip";
import { Misprint } from "./misprint";
import { useNear, useReducedMotion } from "./motion";
import { CheckIcon } from "./previews/icons";
import type { PreviewProps } from "./previews/preview";
import {
  COMING,
  type MarketingProduct,
  NAME,
  PAINT,
  PRODUCT_ORDER,
  VIEW,
} from "./products";

// The five products, each a block hanging from its rail, alternating sides.
// The words are eager (server-rendered, and what search engines read); each
// live preview loads as it nears the viewport, so `/` stays light.

const named =
  <K extends string>(key: K) =>
  (m: Record<K, ComponentType<PreviewProps>>) => ({ default: m[key] });

const PREVIEWS: Record<
  MarketingProduct,
  LazyExoticComponent<ComponentType<PreviewProps>>
> = {
  schedule: lazy(() =>
    import("./previews/schedule-preview").then(named("SchedulePreview")),
  ),
  reviews: lazy(() =>
    import("./previews/reviews-preview").then(named("ReviewsPreview")),
  ),
  chat: lazy(() =>
    import("./previews/chat-preview").then(named("ChatPreview")),
  ),
  plan: lazy(() =>
    import("./previews/plan-preview").then(named("PlanPreview")),
  ),
  todo: lazy(() =>
    import("./previews/todo-preview").then(named("TodoPreview")),
  ),
};

interface Block {
  head: string;
  body: string;
  facts: string[];
  hint?: string;
  /** Roughly the preview's height, held while it loads, so nothing jumps. */
  height: number;
}

const BLOCKS: Record<MarketingProduct, Block> = {
  schedule: {
    head: "Build the week. We'll check it.",
    body: "Search every section on Testudo, build the week, and catch conflicts, tight walks and full sections before registration opens.",
    facts: [
      "Walking time between buildings, with Accessible routes.",
      "Full sections stay in the plan; a seat watch tells you when one opens.",
      "Generate every schedule that fits, then export it as .ics or share a link.",
    ],
    hint: "Try it: add STAT400, then use the fix. Add ECON200 and watch for a seat.",
    height: 560,
  },
  reviews: {
    head: "Decide with the grades and the reviews side by side.",
    body: "Read what students wrote about a course and its professors, next to the grade distribution. It's anonymous to readers and written only by verified UMD accounts.",
    facts: [
      "Grade distributions with plus, minus and W, by instructor.",
      "A generated summary, marked with sparkles, so you know what's a model and what's a person.",
      "The scheduler links here from every course.",
    ],
    hint: "Try it: switch instructors.",
    height: 440,
  },
  chat: {
    head: "Your classes already have a chat. Say something.",
    body: "A chat for every course and section already exists. Add a section to your plan and you're in, with real names.",
    facts: [
      "A room per course, per professor when there's more than one, and per section.",
      "Real names and Google photos. No pseudonyms.",
      "Answers to graded work are held. Everything else is yours to say.",
    ],
    hint: "Try it: send a message. It stays on this page.",
    height: 400,
  },
  plan: {
    head: "Four years on one board. Drag a course and see what it counts for.",
    body: "Paste your unofficial transcript and Plan fills in what you've done. Drag courses between semesters, leave a CMSC4XX placeholder where you haven't decided, and watch your GenEd progress update as you go.",
    facts: [
      "Transcript import that's read in your browser.",
      "Wildcards like CMSC4XX, or any DSHS, until you've decided.",
      "Prerequisites checked against Testudo's own sentence. It informs, it never blocks.",
    ],
    hint: "Try it: drag ARTT100 into Spring 2028 (or use Move), and watch DSSP fill in.",
    height: 470,
  },
  todo: {
    head: "Everything that's due, in one lane.",
    body: "Connect your ELMS calendar feed once and every deadline lands in a Due lane over your week. Tick things off as you go. We'll never ask for your password.",
    facts: [
      "Grouped by day or by course.",
      "Gradescope work that's linked in ELMS comes through too, tagged.",
      "A push at 6pm the day before something's due, if you turn it on.",
    ],
    hint: "Try it: tick off the lab report.",
    height: 500,
  },
};

export function ProductBlocks() {
  return (
    <div>
      {PRODUCT_ORDER.map((p, i) => (
        <ProductBlock key={p} product={p} alt={i % 2 === 1} />
      ))}
    </div>
  );
}

const st = (i: number) => ({ "--i": i }) as CSSProperties;

function ProductBlock({
  product: p,
  alt,
}: {
  product: MarketingProduct;
  alt: boolean;
}) {
  const block = BLOCKS[p];
  const view = VIEW[p];
  const paint = PAINT[p];
  return (
    <section
      id={p}
      aria-labelledby={`${p}-title`}
      data-reveal
      data-alt={alt ? "" : undefined}
      className={`mk-block mk-grain mk-soft border-t ${paint}`}
    >
      <div className="mk-wrap mk-block-grid">
        <div
          aria-hidden="true"
          className="mk-block-rail flex flex-col items-center gap-2"
        >
          <Mark id={p} size={18} />
          <div className="mk-rail-track relative flex-1 overflow-hidden bg-hairline">
            <div className="mk-rail-line mk-rail-fill absolute inset-0" />
          </div>
        </div>
        <div className="mk-block-text flex flex-col gap-4">
          <div
            className="mk-st flex flex-wrap items-center gap-3 font-semibold text-lg"
            style={st(0)}
          >
            <Mark id={p} size={24} />
            {NAME[p]}
            {view ? null : (
              <span className="border border-hairline-strong px-1.5 font-semibold text-muted text-xs">
                {COMING}
              </span>
            )}
          </div>
          <h2
            id={`${p}-title`}
            className="mk-st mk-display mk-h2"
            style={st(1)}
          >
            <Misprint className="mk-mis-color">{block.head}</Misprint>
          </h2>
          <p className="mk-st mk-pretty mk-body" style={st(2)}>
            {block.body}
          </p>
          <ul className="mk-st flex flex-col gap-2 text-base" style={st(3)}>
            {block.facts.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <CheckIcon className="mk-text mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {view ? (
            <div className="mk-st" style={st(4)}>
              <WithTooltip label={`Open Terpsicle ${NAME[p]}`}>
                <a href={view.to} className={"mk-link mk-text font-semibold"}>
                  {view.label}
                </a>
              </WithTooltip>
            </div>
          ) : null}
        </div>
        <div className="mk-block-vis flex min-w-0 flex-col items-center gap-2">
          <LazyPreview product={p} height={block.height} />
          {block.hint ? (
            <p className="text-center text-muted text-sm">{block.hint}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Loads a preview when it's within a screen or so of the viewport, and
 * starts it once it's actually on screen. Until then, a quiet box of about
 * its size holds the place.
 */
function LazyPreview({
  product,
  height,
}: {
  product: MarketingProduct;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref, { margin: "600px 0px" });
  const seen = useNear(ref, { threshold: 0.25 });
  const reduced = useReducedMotion();
  const Preview = PREVIEWS[product];
  const placeholder = (
    <div
      aria-hidden="true"
      className="w-full border border-hairline bg-raised"
      style={{ height }}
    />
  );
  return (
    <div
      ref={ref}
      data-preview={product}
      className="flex w-full justify-center"
      style={{ minHeight: height }}
    >
      {near ? (
        <Suspense fallback={placeholder}>
          <Preview
            active={seen}
            reduced={reduced}
            mark={<Mark id={product} size={22} />}
          />
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  );
}
