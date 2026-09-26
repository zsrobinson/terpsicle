import { Download } from "lucide-react";
import { Button } from "~/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import {
  isStandalone,
  openInstallPrompt,
  useInstallMethod,
} from "./install-store";

// "Install app", always available and quiet (V2 §3.4): it opens the same
// dialog as the key moments, whatever the cooldown. The account menu and
// /settings/notifications are its homes once they exist; until then it sits
// at the foot of the scheduler's rail (the theme menu on phones). Each piece
// renders nothing where installing doesn't work or already happened.

const HINT = "Put Terpsicle on your home screen";

/** An icon button: the foot of the rail. */
export function InstallAppButton({ side }: { side: "right" | "bottom" }) {
  const method = useInstallMethod();
  if (method === null) return null;
  return (
    <WithTooltip label={HINT} side={side}>
      <button
        type="button"
        aria-label="Install app"
        onClick={openInstallPrompt}
        className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg max-[380px]:size-7"
      >
        <Download size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </WithTooltip>
  );
}

/** A menu item after a separator: the account menu, or the theme menu on phones. */
export function InstallAppMenuItem() {
  const method = useInstallMethod();
  if (method === null) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={openInstallPrompt}>
        <Download className="text-muted" aria-hidden="true" />
        Install app
      </DropdownMenuItem>
    </>
  );
}

/**
 * A settings row that's always there and says why when installing isn't
 * possible (for /settings/notifications' "This device").
 */
export function InstallAppSetting() {
  const method = useInstallMethod();
  const installed = typeof window !== "undefined" && isStandalone();
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">Install app</div>
        <p className="text-sm text-muted">
          {installed
            ? "You're using the installed app."
            : method === null
              ? "This browser can't install Terpsicle. Try Chrome or Edge, or Safari on iPhone and iPad."
              : "Get notified when a seat opens or a classmate replies, and open Terpsicle from your home screen."}
        </p>
      </div>
      {method === null ? null : (
        <WithTooltip label={HINT}>
          <Button variant="outline" size="sm" onClick={openInstallPrompt}>
            Install
          </Button>
        </WithTooltip>
      )}
    </div>
  );
}
