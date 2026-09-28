import { FileText, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { Mark } from "~/app/brand/mark";
import { defaultFirstTerm } from "~/core/four-year/terms";
import type { IsoDate } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { EmptyState } from "~/ui/empty-state";
import {
  createDoc,
  createDocForImport,
  createDocForTemplates,
} from "./actions";
import { FirstTermSelect } from "./first-term-select";
import type { PlanNav } from "./model";

// The first visit (V3 §2.13): the kit's first-visit template, with the
// owner's two equal ways in, as the scheduler's (docs/COHESION.md §1.6).
// Importing a transcript opens a plan on the Import view, and the import
// sets the first semester from the transcript. A sample plan opens a plan on
// the Samples view. Adding courses yourself is the quiet third way. The one
// question all of them start from, when you started, sits above them.

export function PlanFirstVisit({
  today,
  nav,
}: {
  today: IsoDate;
  nav: PlanNav;
}) {
  const [first, setFirst] = useState(() => defaultFirstTerm(today));
  // Signed in, the plan syncs (V3 §2.4): "all in this browser" would be wrong.
  const signedIn = useAccount((s) => s.status === "signed-in");
  return (
    <EmptyState
      equal
      headingLevel={1}
      mark={<Mark id="plan" size={40} />}
      title="Plan your four years"
      line={
        signedIn
          ? "Lay out every semester, see your credits add up to 120 and keep track of your GenEds. It's saved to your account, and a transcript you import never leaves your browser."
          : "Lay out every semester, see your credits add up to 120 and keep track of your GenEds. It's all in this browser, with nothing to sign up for, and a transcript you import never leaves it."
      }
      primary={{
        label: "Import your transcript",
        icon: <FileText aria-hidden="true" />,
        hint: "Paste Testudo's Unofficial Transcript page. It's read in your browser and never sent to us.",
        onClick: () => {
          createDocForImport(first);
          nav.go({ tab: "import" });
        },
      }}
      secondary={{
        label: "Start from a sample plan",
        icon: <LayoutGrid aria-hidden="true" />,
        hint: "See a major's courses by semester, then add them",
        onClick: () => {
          createDocForTemplates(first);
          nav.go({ tab: "templates" });
        },
      }}
      quiet={{
        label: "or add courses yourself",
        hint: "Lay out eight semesters from there, with placeholders like CMSC4XX until you know which course",
        onClick: () => createDoc(first),
      }}
    >
      <FirstTermSelect
        label="I started at UMD in"
        tooltip="Your first fall or spring at UMD"
        value={first}
        today={today}
        onChange={setFirst}
      />
    </EmptyState>
  );
}
