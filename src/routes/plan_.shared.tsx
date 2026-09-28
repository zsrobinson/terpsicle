import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { PlanSharedSearchSchema } from "~/core/schema/plan-url";
import { SharedFourYearPage } from "~/features/four-year/shared-page";

// A four-year plan someone shared (docs/V3.md §2.14, DATA.md §8.2): the
// plan is in the URL itself, so it opens read-only without an account, and
// "Save a copy" makes it the reader's own. Not under Plan's workbench
// (`plan_`): it's a page to read, not the reader's plan to edit.
export const Route = createFileRoute("/plan_/shared")({
  ssr: false,
  validateSearch: PlanSharedSearchSchema,
  head: () => ({
    meta: [
      { title: "Shared four-year plan · Terpsicle" },
      {
        name: "description",
        content:
          "A four-year plan made with Terpsicle: semesters, credits and GenEds.",
      },
      // A link holds someone's plan: keep it out of search results.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedRoute,
});

function SharedRoute() {
  const { plan } = Route.useSearch();
  return <SharedFourYearPage param={plan ?? ""} />;
}
