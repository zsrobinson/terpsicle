import { Check } from "lucide-react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Mark } from "~/app/brand/mark";
import { useMediaQuery } from "~/app/use-media-query";
import { WithTooltip } from "~/ui/tooltip";
import { Misprint } from "./misprint";
import {
  COMING,
  LAUNCHED,
  type MarketingProduct,
  NAME,
  PAINT,
  PRODUCT_ORDER,
  VIEW,
} from "./products";
import { ChatSample } from "./samples/chat-sample";
import { PlanSample } from "./samples/plan-sample";
import { ReviewsSample } from "./samples/reviews-sample";
import type { SampleProps } from "./samples/sample";
import { ScheduleSample } from "./samples/schedule-sample";
import { TodoSample } from "./samples/todo-sample";

// The five products, one block each in color order on its soft fill, words
// on one side and a live sample on the other, sides alternating. Everything
// here is server-rendered, so search engines read the words and the samples
// stand before the app's code arrives; the samples come alive on hydration.

const SAMPLES: Record<MarketingProduct, ComponentType<SampleProps>> = {
  schedule: ScheduleSample,
  reviews: ReviewsSample,
  chat: ChatSample,
  plan: PlanSample,
  todo: TodoSample,
};

interface Block {
  head: string;
  body: string;
  facts: string[];
  hint: string;
}

const BLOCKS: Record<MarketingProduct, Block> = {
  schedule: {
    head: "Build the week. We'll check it.",
    body: "Search every section on Testudo and drop them onto the week. Overlaps, tight walks between buildings and full sections show up as you go, before registration opens.",
    facts: [
      "Travel time between buildings, with Accessible routes.",
      "Full sections stay in the plan; a seat watch tells you when one opens.",
      "Generate every schedule that fits, wildcards like CMSC4XX included.",
    ],
    hint: "Try it: add STAT400 and ENGL393, then use the fix.",
  },
  reviews: {
    head: "The grades next to the words.",
    body: "Read what UMD students wrote about a course and its instructors, beside the grade distribution. One rating combines Terpsicle's reviews with PlanetTerp's, and the scheduler links here from every course.",
    facts: [
      "Ratings from Terpsicle and PlanetTerp, combined, with the counts.",
      "Grade distributions with plus, minus and W, by instructor.",
      "Anonymous to readers, written from verified UMD accounts.",
    ],
    hint: "Try it: switch instructors.",
  },
  chat: {
    head: "Your classes already have a chat.",
    body: "Every course and every section gets a group chat on its own. Add a section to your plan and you're in, with the name on your UMD account. Nothing to set up, nobody to invite.",
    facts: [
      "A room per course and one per section.",
      "UMD sign-in only, and moderated.",
      "Find the room that moved, swap notes, set up a study group.",
    ],
    hint: "Try it: send a message. It stays on this page.",
  },
  plan: {
    head: "Four years on one board.",
    body: "Paste your unofficial transcript and Plan fills in what you've done. Lay out the semesters ahead, leave a CMSC4XX placeholder where you haven't decided, and watch your GenEd progress fill in.",
    facts: [
      "Transcript import, read in your browser.",
      "GenEd progress, category by category.",
      "Prerequisites checked against Testudo's own wording. It informs, it never blocks.",
    ],
    hint: "Try it: place ECON200 in a semester.",
  },
  todo: {
    head: "Everything that's due, on a calendar.",
    body: "Connect your ELMS calendar feed once and every assignment lands on its due date. Add your own tasks the way you'd say them: \"PS3 due fri 11:59pm\". We'll never ask for your password.",
    facts: [
      "By week, by month, or as a list.",
      "Each course's week, done and still to do.",
      "A push the evening before something's due, if you turn it on.",
    ],
    hint: "Try it: tick something off.",
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

/**
 * Whether `ref`'s element has been on screen (a quarter of it) yet: true
 * once, then it stays true. Without IntersectionObserver, true straight
 * away.
 */
function useSeen(ref: React.RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

function ProductBlock({
  product: p,
  alt,
}: {
  product: MarketingProduct;
  alt: boolean;
}) {
  const block = BLOCKS[p];
  const paint = PAINT[p];
  const Sample = SAMPLES[p];
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <section
      id={p}
      aria-labelledby={`${p}-title`}
      className={`mk-grain mk-section scroll-mt-4 border-hairline border-t ${paint.soft}`}
    >
      <div className="mk-wrap mk-block-grid">
        <div className={`flex flex-col gap-6 ${alt ? "lg:order-2" : ""}`}>
          <div className="flex flex-wrap items-center gap-3 font-semibold text-lg">
            <Mark id={p} size={24} />
            {NAME[p]}
            {LAUNCHED[p] ? null : (
              <span className="border border-hairline-strong px-1.5 font-semibold text-muted text-xs">
                {COMING}
              </span>
            )}
          </div>
          <h2 id={`${p}-title`} className="mk-display mk-h2">
            <Misprint className={paint.text}>{block.head}</Misprint>
          </h2>
          <p className="mk-body">{block.body}</p>
          <ul className="flex flex-col gap-2 text-base">
            {block.facts.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check
                  aria-hidden="true"
                  className={`mt-1 size-3.5 shrink-0 ${paint.text}`}
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {LAUNCHED[p] ? (
            <div>
              <WithTooltip label={`Open Terpsicle ${NAME[p]}`}>
                <a
                  href={VIEW[p].to}
                  className={`mk-link font-semibold text-base ${paint.text}`}
                >
                  {VIEW[p].label}
                </a>
              </WithTooltip>
            </div>
          ) : null}
        </div>
        <div
          ref={ref}
          className={`flex min-w-0 flex-col items-center gap-2 ${alt ? "lg:order-1" : ""}`}
        >
          <Sample active={seen} reduced={reduced} />
          <p className="text-center text-muted text-sm">{block.hint}</p>
        </div>
      </div>
    </section>
  );
}
