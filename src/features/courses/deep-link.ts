import { useEffect, useRef } from "react";
import { z } from "zod";
import { track } from "~/app/analytics";
import { CourseCodeSchema, type Term, TermIdSchema } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";

// `/schedule?term=<id>&course=<code>`: seat-alert emails and the alert pages link
// here (DATA.md §7.1). Switch to that term, open that course's details, then
// drop the params so a reload doesn't do it again.

export const DeepLinkSchema = z.object({
  term: TermIdSchema,
  course: z.string().trim().toUpperCase().pipe(CourseCodeSchema).optional(),
});
export type DeepLink = z.infer<typeof DeepLinkSchema>;

/** The link in a URL's query, or null when there isn't a valid one. */
export function readDeepLink(search: string): DeepLink | null {
  const params = new URLSearchParams(search);
  const term = params.get("term");
  if (term === null) return null;
  const parsed = DeepLinkSchema.safeParse({
    term,
    course: params.get("course") ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}

/** The URL without the deep-link params (everything else kept). */
export function withoutDeepLink(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("term");
  url.searchParams.delete("course");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Follows the link once the workspace has loaded (which restores the last
 * term and drill-in, and would otherwise undo this) and the terms are known.
 */
export function applyDeepLink(
  link: DeepLink,
  terms: readonly Term[],
): "ok" | "unknown-term" {
  const term = terms.find((t) => t.id === link.term);
  if (!term) return "unknown-term";
  const ui = useUi.getState();
  // Switching terms clears the drill-in, so it goes first.
  if (ui.lastTermId !== term.id) ui.setLastTermId(term.id);
  if (link.course) {
    useUi.getState().openTab("courses");
    useUi.getState().drill({ kind: "course", courseCode: link.course });
  }
  return "ok";
}

/** Mounted once by the shell (a feature effect, see `panels.tsx`). */
export function DeepLinkEffect() {
  const hydrated = useWorkspace((s) => s.hydrated);
  const terms = useCatalog((s) => s.terms);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !hydrated || !terms) return;
    done.current = true;
    const link = readDeepLink(window.location.search);
    if (!link) return;
    const outcome = applyDeepLink(link, terms);
    track("deep_link_opened", { outcome });
    window.history.replaceState(
      window.history.state,
      "",
      withoutDeepLink(window.location.href),
    );
  }, [hydrated, terms]);
  return null;
}
