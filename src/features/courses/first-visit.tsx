import { Layers, Search } from "lucide-react";
import { Mark } from "~/components/brand/mark";
import { EmptyState } from "~/ui/empty-state";
import { chooseFirstVisitPath } from "./actions";

// "Build your <term> schedule" (SPEC §3.2): two equally weighted ways in,
// shown on a first visit and whenever a plan is empty. The owner asked for
// starting from scratch and generating to read as "equally valid paths"
// (DESIGN §4b), so this is the kit's first-visit template with two equal
// paths: both filled, the same size, neither the default (docs/COHESION.md
// §1.6, the same template as every product's first visit).

export function FirstVisit({ termName }: { termName: string | undefined }) {
  return (
    <div className="p-4" data-testid="first-visit">
      <EmptyState
        equal
        headingLevel={3}
        mark={<Mark id="schedule" size={40} />}
        title={`Build your ${termName ?? "term"} schedule`}
        line="Two ways to start: pick sections yourself, or tell Generate what you need. You can switch anytime."
        primary={{
          label: "Search for a course",
          icon: <Search aria-hidden="true" />,
          hint: "Open Search",
          shortcut: "/",
          onClick: () => chooseFirstVisitPath("build"),
        }}
        secondary={{
          label: "Generate plans",
          icon: <Layers aria-hidden="true" />,
          hint: "Open Generate",
          shortcut: "6",
          onClick: () => chooseFirstVisitPath("generate"),
        }}
      />
    </div>
  );
}
