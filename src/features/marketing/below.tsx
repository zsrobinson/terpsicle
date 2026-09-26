import { useEffect, useRef } from "react";
import { ProductBlocks } from "./blocks";
import { armReveals, useReducedMotion } from "./motion";
import { PromisesSection } from "./tail";

// Everything under the hero. The server renders it with the rest of the
// page, so all of its words are in the HTML from the first byte; only its
// code loads after the hero's (marketing-page.tsx imports this lazily), and
// React hydrates it when that arrives. The live samples inside load later
// still, as each nears the viewport.

export { MarketingFooter } from "./tail";

export function BelowTheHero() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Hidden until they scroll in: only what starts below the fold.
  useEffect(() => {
    if (!root.current) return;
    return armReveals(root.current, reduced);
  }, [reduced]);
  return (
    <div ref={root}>
      <ProductBlocks />
      <PromisesSection />
    </div>
  );
}
