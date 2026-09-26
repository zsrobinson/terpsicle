// The route's own stylesheet: linked in the server-rendered head of `/` only,
// so the page is styled (and the hero moves) before any script runs, and
// the other pages don't carry it.
import "./marketing.css";
import { useEffect, useRef } from "react";
import { Logo } from "~/app/logo";
import { WithTooltip } from "~/ui/tooltip";
import { ProductBlocks } from "./blocks";
import { Hero, SIGN_IN_PITCH } from "./hero";
import { armReveals, useReducedMotion } from "./motion";
import { InstallSection, MarketingFooter, PromisesSection } from "./tail";

// `/` for first visits (docs/V2.md §2), from Fable's "Detangle" prototype:
// the semester's mess straightening into Terpsicle's five parts, then a
// block per product hanging from its rail, each with a live sample. Returning
// visitors never see it (returning.ts), except at `/?stay`.
//
// Server-rendered and light (scripts/check-bundle.ts): no scheduler state,
// no Dexie, no account button (sign-in is a plain link to /signin), plain
// links rather than the router's Link (a first visit loads the scheduler
// whole anyway), and the previews load as they near the viewport. No
// opaque page fill, so the paper grain shows (styles.css).

export function MarketingPage() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!root.current) return;
    return armReveals(root.current, reduced);
  }, [reduced]);

  return (
    <div ref={root} data-marketing className="mk-page min-h-dvh text-fg">
      <header className="border-b">
        <div className="mk-wrap flex h-14 items-center justify-between gap-4">
          <Logo />
          <WithTooltip label={SIGN_IN_PITCH}>
            <a
              href="/signin"
              className="font-semibold text-base underline decoration-hairline-strong underline-offset-4 hover:decoration-current"
            >
              Sign in
            </a>
          </WithTooltip>
        </div>
      </header>
      <main>
        <Hero />
        <ProductBlocks />
        <InstallSection />
        <PromisesSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
