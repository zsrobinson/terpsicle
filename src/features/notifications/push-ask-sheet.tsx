import { Bell } from "lucide-react";
import { useId, useRef } from "react";
import { Mark } from "~/components/brand/mark";
import type { PushAskMoment } from "~/core/schema";
import { IosStepRows } from "~/features/pwa/ios-steps";
import type { MarkId } from "~/lib/brand/marks";
import { Button } from "~/ui/button";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { dismissPushAsk, turnOnFromAsk, usePushAsk } from "./push-ask";

// The ask on iPhone (V2 §6.7; the design's "iPhone setup · three steps"). In
// a Safari tab it's the three steps to the Home Screen, since iPhone sends
// web push only to Home Screen apps; there, on the first launch, it's the
// Turn on step by itself, whose tap is the one the prompt needs. The kit's
// sheet (the bell's, on phones), at a phone's width on an iPad. Loaded only
// when it opens (push-ask-host.tsx). Closing it any way is Not now.

/** The product whose moment asked: its mark heads the sheet. */
const MARK: Record<PushAskMoment, MarkId> = {
  "chat-post": "chat",
  "todo-connected": "todo",
  "seat-watch": "schedule",
  "home-screen": "umbrella",
};

const TURN_ON_STEP = [
  {
    words: "Turn on notifications. iPhone asks you to allow them.",
    icon: Bell,
  },
];

export function PushAskSheet({
  moment,
  kind,
}: {
  moment: PushAskMoment;
  kind: "iphone-setup" | "home-screen";
}) {
  const working = usePushAsk((s) => s.working);
  const primary = useRef<HTMLButtonElement>(null);
  const lineId = useId();
  const setup = kind === "iphone-setup";
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) dismissPushAsk();
      }}
      aria-describedby={lineId}
      data-push-ask={kind}
      className="mx-auto w-full max-w-md"
      // Focus starts on the main action, without popping its tooltip unasked.
      initialFocus={() => {
        quietTooltips();
        return primary.current ?? true;
      }}
    >
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
        <div className="flex flex-col gap-2">
          <Mark id={MARK[moment]} size={40} />
          <SheetTitle className="font-semibold text-lg tracking-tight">
            {setup
              ? "Get notifications on your iPhone"
              : "Turn on notifications"}
          </SheetTitle>
          <p id={lineId} className="text-muted">
            {setup
              ? "iPhone only sends notifications to apps on your Home Screen. It takes three taps, once."
              : "Terpsicle is on your Home Screen now. Hear when a seat opens, a classmate replies, or something's due tomorrow."}
          </p>
        </div>
        <IosStepRows {...(setup ? {} : { steps: TURN_ON_STEP })} />
        {setup ? (
          <WithTooltip label="Close" shortcut="Esc">
            <Button
              ref={primary}
              size="lg"
              className="w-full"
              onClick={() => dismissPushAsk()}
            >
              Got it
            </Button>
          </WithTooltip>
        ) : (
          <div className="flex gap-2">
            <WithTooltip label="iPhone asks you to allow them">
              <Button
                ref={primary}
                size="lg"
                className="flex-1"
                disabled={working}
                onClick={() => void turnOnFromAsk()}
              >
                {working ? "Turning on…" : "Turn on"}
              </Button>
            </WithTooltip>
            <WithTooltip
              label="Close. Turn them on in Settings anytime."
              shortcut="Esc"
            >
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={working}
                onClick={() => dismissPushAsk()}
              >
                Not now
              </Button>
            </WithTooltip>
          </div>
        )}
        <p className="text-muted text-sm">
          {setup
            ? "Rather not install? Everything also lands in the bell, and dates can go to your calendar."
            : "You can change them anytime in Settings."}
        </p>
      </div>
    </Sheet>
  );
}
