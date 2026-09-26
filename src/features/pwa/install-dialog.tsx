import { Bell, Maximize2, Smartphone } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { INSTALL_BENEFITS, type InstallMethod } from "~/core/pwa";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/ui/dialog";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { dismissInstallPrompt, promptInstall } from "./install-store";
import { IosSteps, IosStepsIllustration } from "./ios-steps";

// What installing gives you, then either the browser's own install prompt
// (Install) or, on iOS, the steps (V2 §3.4). Loaded only when it opens
// (install-host.tsx). Closing it any way but installing is a dismissal.

const ICONS = [Bell, Smartphone, Maximize2];

export function InstallDialog({ method }: { method: InstallMethod }) {
  const ios = method === "ios-steps";
  const primary = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissInstallPrompt();
      }}
    >
      <DialogContent
        // Focus starts on the main action, without popping its tooltip unasked.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          quietTooltips();
          primary.current?.focus();
        }}
      >
        <DialogTitle>Put Terpsicle on your home screen</DialogTitle>
        {/* What installing gives you is what the dialog is about. */}
        <DialogDescription asChild>
          <ul className="mt-3 space-y-2 text-fg">
            {INSTALL_BENEFITS.map((text, i) => {
              const Icon = ICONS[i] ?? Bell;
              return (
                <Benefit
                  key={text}
                  icon={<Icon size={15} aria-hidden="true" />}
                  text={text}
                />
              );
            })}
          </ul>
        </DialogDescription>

        {ios ? (
          <div className="mt-4 space-y-3 border-hairline border-t pt-4">
            <IosStepsIllustration />
            <IosSteps />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          {ios ? (
            <WithTooltip label="Close" shortcut="Esc">
              <Button ref={primary} onClick={() => dismissInstallPrompt()}>
                Got it
              </Button>
            </WithTooltip>
          ) : (
            <>
              <WithTooltip label="Close for now" shortcut="Esc">
                <Button
                  variant="outline"
                  onClick={() => dismissInstallPrompt()}
                >
                  Not now
                </Button>
              </WithTooltip>
              <WithTooltip label="Your browser asks you to confirm">
                <Button ref={primary} onClick={() => void promptInstall()}>
                  Install
                </Button>
              </WithTooltip>
            </>
          )}
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
