import { Bell, Maximize2, Monitor, Smartphone } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { installBenefits, installDevice } from "~/core/install";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/ui/dialog";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import {
  closeInstall,
  currentInstallMethod,
  type InstallOpenedFrom,
  promptInstall,
} from "./install-store";
import { IosSteps, IosStepsIllustration } from "./ios-steps";

// What installing gives you, then either the browser's own install prompt
// or, on iOS, the steps. Loaded only when it opens (install-host.tsx).
// Closing it any way but "Don't ask again" is "Not now": the key moments
// won't offer it again for 30 days either way.

export function InstallDialog({ from }: { from: InstallOpenedFrom }) {
  const method = currentInstallMethod();
  const device = installDevice(
    navigator.userAgent,
    navigator.maxTouchPoints ?? 0,
  );
  const [notify, launch, windowed] = installBenefits(device);
  const LaunchIcon = device === "mobile" ? Smartphone : Monitor;
  const ios = method === "ios-steps";
  const primary = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeInstall("not-now");
      }}
    >
      <DialogContent
        // Focus starts on the main action (Install, or Done), not on
        // "Don't ask again", and without popping its tooltip unasked.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          quietTooltips();
          primary.current?.focus();
        }}
      >
        <DialogTitle>Install Terpsicle</DialogTitle>
        {/* What installing gives you is what the dialog is about. */}
        <DialogDescription asChild>
          <ul className="mt-3 space-y-2 text-fg">
            <Benefit
              icon={<Bell size={15} aria-hidden="true" />}
              text={notify}
            />
            <Benefit
              icon={<LaunchIcon size={15} aria-hidden="true" />}
              text={launch}
            />
            <Benefit
              icon={<Maximize2 size={15} aria-hidden="true" />}
              text={windowed}
            />
          </ul>
        </DialogDescription>

        {ios ? (
          <div className="mt-4 space-y-3 border-hairline border-t pt-4">
            <IosStepsIllustration />
            <IosSteps />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {from === "menu" ? null : (
            <WithTooltip label="Stop offering this. You can still install any time.">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => closeInstall("never")}
              >
                Don't ask again
              </Button>
            </WithTooltip>
          )}
          <div className="ml-auto flex gap-2">
            {ios ? (
              <WithTooltip label="Close" shortcut="Esc">
                <Button ref={primary} onClick={() => closeInstall("done")}>
                  Done
                </Button>
              </WithTooltip>
            ) : (
              <>
                <WithTooltip label="Close for now" shortcut="Esc">
                  <Button
                    variant="outline"
                    onClick={() => closeInstall("not-now")}
                  >
                    Not now
                  </Button>
                </WithTooltip>
                <WithTooltip label="Your browser asks to confirm">
                  <Button
                    ref={primary}
                    // The browser's own prompt: its answer closes this dialog.
                    onClick={() => void promptInstall()}
                    disabled={method !== "prompt"}
                  >
                    Install
                  </Button>
                </WithTooltip>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Benefit({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex shrink-0 text-muted">{icon}</span>
      <span>{text}</span>
    </li>
  );
}
