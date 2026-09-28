import { track } from "~/app/analytics";
import type { CourseCode, CourseColor } from "~/core/schema";
import { sharePayloadFromPlan, shareUrl } from "~/core/share";
import { useCurrentPlan } from "~/state/hooks";
import { ShareButton } from "./share-button";

// Schedule's Share button (DATA.md §8): the plan on screen as a share link,
// with its term's blocks and its courses' colors. A shared plan open
// read-only shares the same way, so a link can be passed on.

export function ScheduleShare({ shrink = false }: { shrink?: boolean }) {
  const current = useCurrentPlan();
  if (!current) return null;
  const { plan, blocks, colors } = current;
  return (
    <ShareButton
      shrink={shrink}
      title={`Share ${plan.name}`}
      link={() => {
        const planColors: Record<CourseCode, CourseColor> = {};
        for (const [code, color] of Object.entries(colors))
          if (color) planColors[code] = color;
        return shareUrl(
          window.location.origin,
          sharePayloadFromPlan(plan, blocks, planColors),
        );
      }}
      note="The link holds a copy of this plan in the URL itself, so it won't change when you edit the plan later."
      onCopied={() => track("share_link_copied", { product: "schedule" })}
    />
  );
}
