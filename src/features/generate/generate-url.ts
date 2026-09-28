import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { currentView, goTo } from "~/app/schedule-nav";
import { routeAt } from "~/app/schedule-view";
import {
  chipsFromParams,
  type GenerateChips,
  sameChips,
} from "~/core/generate/url";
import { TAB_PATHS } from "~/core/routing/schedule-location";
import type { Plan, TermId } from "~/core/schema";
import {
  GenerateTabSearchSchema,
  ScheduleSearchSchema,
} from "~/core/schema/schedule-url";
import { draftFor, useGenerateDrafts } from "~/state/generate-drafts";
import { readActiveTermId } from "~/state/hooks";

// Generate's chips in its URL (`/schedule/generate?prefer=later-starts&off=F`),
// as Search keeps its chips in its own: a chip pushes an entry, so Back
// undoes it, and a reload or a copied link keeps them (src/app/README.md,
// "URL state"). The draft store is where they live; the URL mirrors it
// while Generate is on screen.

/** A filter or preference chip changed: a place Back returns from. */
export function pickChips(
  termId: TermId,
  plan: Plan | null,
  chips: GenerateChips,
): void {
  const { drafts, setDraft } = useGenerateDrafts.getState();
  const draft = draftFor(drafts, termId, plan);
  if (sameChips(draft, chips)) return;
  setDraft(termId, { ...draft, ...chips });
  const here = currentView();
  if (here.tab !== "generate" || here.drill || termId !== readActiveTermId())
    return;
  goTo({ tab: "generate", drill: null });
}

const CHIP_KEYS = Object.keys(GenerateTabSearchSchema.shape).filter(
  (k) => k !== "view",
);

/**
 * Puts the chips where the URL says: when Generate opens on a URL that
 * names some (a reload, a link), and on Back and Forward. A URL that names
 * none on arrival (an old bookmark) leaves the form's own; the app's own
 * moves already say the same thing as the store.
 */
export function useGenerateFromUrl(termId: TermId | null, plan: Plan | null) {
  const router = useRouter();
  useEffect(() => {
    const adopt = (arriving: boolean) => {
      const { pathname, search } = router.history.location;
      if (routeAt(router, pathname).id !== TAB_PATHS.generate) return;
      const raw = router.options.parseSearch(search) as Record<string, unknown>;
      const term = ScheduleSearchSchema.parse(raw).term ?? termId;
      if (!term) return;
      if (arriving && !CHIP_KEYS.some((k) => raw[k] !== undefined)) return;
      const chips = chipsFromParams(GenerateTabSearchSchema.parse(raw));
      const { drafts, setDraft } = useGenerateDrafts.getState();
      const draft = draftFor(drafts, term, plan);
      if (!sameChips(draft, chips)) setDraft(term, { ...draft, ...chips });
    };
    adopt(true);
    return router.history.subscribe(
      ({ action }: { action: { type: string } }) => {
        if (action.type !== "PUSH" && action.type !== "REPLACE") adopt(false);
      },
    );
  }, [router, termId, plan]);
}
