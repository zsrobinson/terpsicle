import { cn } from "cn";
import { useId } from "react";
import { PUSH_ASK_WORDS } from "~/core/pwa";
import type { PushAskMoment } from "~/core/schema";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { WithTooltip } from "~/ui/tooltip";
import {
  dismissPushAsk,
  turnOnFromAsk,
  usePushAsk,
  usePushAskCard,
} from "./push-ask";

// The ask in our words, where the moment happened (V2 §6.7; the design's
// "Ask at the moment · first Chat post"): a question, why it's worth it,
// Turn on and Not now. A card, since it floats over what the page is doing
// until it's answered. Each moment's page places one, and it shows only
// once `askForPush` asks there.

export function PushAskCard({
  moment,
  className,
}: {
  moment: Exclude<PushAskMoment, "home-screen">;
  className?: string;
}) {
  const shown = usePushAskCard(moment);
  const working = usePushAsk((s) => s.working);
  const titleId = useId();
  const lineId = useId();
  if (!shown) return null;
  const { title, line } = PUSH_ASK_WORDS[moment];
  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      aria-describedby={lineId}
      data-push-ask={moment}
      className={cn("gap-3 p-4", className)}
    >
      <div className="flex flex-col gap-0.5">
        <p id={titleId} className="font-semibold text-fg">
          {title}
        </p>
        <p id={lineId} className="text-muted text-sm">
          {line}
        </p>
      </div>
      <div className="flex gap-2">
        <WithTooltip label="Your browser asks you to allow them">
          <Button
            // Halves on a phone, as the design; their own width on a desktop.
            className="flex-1 md:flex-none"
            disabled={working}
            onClick={() => void turnOnFromAsk()}
          >
            {working ? "Turning on…" : "Turn on"}
          </Button>
        </WithTooltip>
        <WithTooltip label="Don't ask me for a while">
          <Button
            variant="outline"
            className="flex-1 md:flex-none"
            disabled={working}
            onClick={() => dismissPushAsk()}
          >
            Not now
          </Button>
        </WithTooltip>
      </div>
    </Card>
  );
}
