// The route's own stylesheet: linked in the server-rendered head of `/` only,
// so the page is styled (and the hero moves) before any script runs, and
// the other pages don't carry it.
import "./marketing.css";
import { lazy, Suspense } from "react";
import { Logo } from "~/app/logo";
import { WithTooltip } from "~/ui/tooltip";
import { Hero, SIGN_IN_PITCH } from "./hero";

// `/` for first visits (docs/V2.md §2), from Fable's "Detangle" prototype:
// the semester's mess straightening into Terpsicle's five parts, then a
// block per product hanging from its rail, each with a live sample. Returning
// visitors never see it (returning.ts), except at `/?stay`.
//
// Server-rendered and light (scripts/check-bundle.ts): no scheduler state,
// no Dexie, no account button (sign-in is a plain link to /signin), plain
// links rather than the router's Link (a first visit loads the scheduler
// whole anyway). The header and hero hydrate first; the rest of the page,
// already in the HTML, hydrates as its code arrives (below.tsx), and the
// samples load as they near the viewport. No opaque page fill, so the paper
// grain shows (styles.css).

const below = () => import("./below");
const BelowTheHero = lazy(() =>
  below().then((m) => ({ default: m.BelowTheHero })),
);
const MarketingFooter = lazy(() =>
  below().then((m) => ({ default: m.MarketingFooter })),
);

export function MarketingPage() {
  return (
    <div data-marketing className="mk-page min-h-dvh text-fg">
      <header className="border-b">
        <div className="mk-wrap flex h-14 items-center justify-between gap-4">
          <Logo />
          <WithTooltip label={SIGN_IN_PITCH}>
            <a href="/signin" className="mk-link font-semibold text-base">
              Sign in
            </a>
          </WithTooltip>
        </div>
      </header>
      <main>
        <Hero />
        <Suspense fallback={null}>
          <BelowTheHero />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <MarketingFooter />
      </Suspense>
    </div>
  );
}
