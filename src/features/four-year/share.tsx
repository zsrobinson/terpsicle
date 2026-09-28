import { track } from "~/app/analytics";
import { fourYearShareUrl } from "~/core/share/four-year-share";
import { ShareButton } from "~/features/share/share-button";
import { useModel } from "./model";

// Plan's Share button (DATA.md §8.2): the open four-year plan as a link an
// advisor can open without an account (/plan/shared). Grades stay behind.

export function PlanShare({ iconOnly = false }: { iconOnly?: boolean }) {
  const { doc } = useModel();
  return (
    <ShareButton
      iconOnly={iconOnly}
      title={`Share ${doc.name}`}
      link={() => fourYearShareUrl(window.location.origin, doc)}
      note="The link holds a copy of this four-year plan in the URL itself, so it won't change when you edit the plan later. Grades from your transcript aren't in it."
      onCopied={() => track("share_link_copied", { product: "plan" })}
    />
  );
}
