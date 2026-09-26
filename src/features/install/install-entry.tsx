import { Download } from "lucide-react";
import { Button } from "~/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import { isStandalone, openInstall, useInstallMethod } from "./install-store";

// The permanent "Install app" entry, so the app can always be installed
// after the prompt was dismissed or never offered. Each renders nothing
// where installing doesn't work or the app already is installed.

const HINT = "Install Terpsicle as an app";

/** An icon button: the foot of the rail. */
export function InstallAppButton({ side }: { side: "right" | "bottom" }) {
  const method = useInstallMethod();
  if (method === null) return null;
  return (
    <WithTooltip label={HINT} side={side}>
      <button
        type="button"
        aria-label="Install app"
        onClick={openInstall}
        className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg max-[380px]:size-7"
      >
        <Download size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </WithTooltip>
  );
}

/** A menu item, after a separator: the theme menu on phones. */
export function InstallAppMenuItem() {
  const method = useInstallMethod();
  if (method === null) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={openInstall}>
        <Download className="text-muted" aria-hidden="true" />
        Install app
      </DropdownMenuItem>
    </>
  );
}

/**
 * A settings row that's always there, and says why when installing isn't
 * possible (for the settings page).
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
              : "Open Terpsicle from your home screen, in its own window, and get notified when something needs you."}
        </p>
      </div>
      {method === null ? null : (
        <WithTooltip label={HINT}>
          <Button variant="outline" size="sm" onClick={openInstall}>
            Install
          </Button>
        </WithTooltip>
      )}
    </div>
  );
}
