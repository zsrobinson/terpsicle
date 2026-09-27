import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { termLabel } from "~/core/catalog/terms";
import type { TermId } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { useActiveTerm } from "~/state/hooks";
import { useShare } from "~/state/share-store";
import { useWorkspace } from "~/state/workspace-store";

// `/schedule?term=<id>&from=plan` (docs/V3.md §2.12): once the saved plans
// have loaded and the scheduler shows that term, make or open its linked
// plan, then drop `from` so a reload or Back doesn't do it again.

/**
 * Runs the handoff for `request` (null: nothing asked). Returns true while
 * it's pending, when the shell mustn't make the term's default plan.
 */
export function usePlanHandoff(
  request: { readonly termId: TermId | undefined } | null,
  done: () => void,
): boolean {
  const hydrated = useWorkspace((s) => s.hydrated);
  const sharing = useShare((s) => s.shared !== null);
  const terms = useCatalog((s) => s.terms);
  const termsFailed = useCatalog((s) => s.termsState === "error");
  const { termId } = useActiveTerm();
  const [pending, setPending] = useState(request !== null);
  const started = useRef(false);
  const finish = useRef(done);
  finish.current = done;

  useEffect(() => {
    if (!request || started.current || !hydrated) return;
    const want = request.termId;
    const end = () => {
      setPending(false);
      finish.current();
    };
    // Nothing to hand over: no term list, a term Testudo doesn't list, or a
    // shared plan (read-only, and on its own term).
    if (termsFailed || sharing) {
      started.current = true;
      end();
      return;
    }
    if (!terms) return;
    if (!want || !terms.some((t) => t.id === want)) {
      started.current = true;
      if (want) toast(`${termLabel(want)}'s classes aren't on Testudo yet.`);
      end();
      return;
    }
    // The URL's term becomes the one on screen first (schedule-nav.ts).
    if (termId !== want) return;
    started.current = true;
    // On demand: the shell is in every scheduler entry (a seat-alert email's
    // course link, Search), and only the Courses tab carries this already.
    void import("./handoff")
      .then(({ arriveFromPlan }) => arriveFromPlan(want))
      .catch((error: unknown) => console.warn("View schedule", error))
      .finally(end);
  }, [request, hydrated, sharing, terms, termsFailed, termId]);

  return pending;
}
