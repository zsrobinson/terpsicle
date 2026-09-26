// "Install app" as a settings row, in /settings/notifications' "This
// device" (V2 §6.2). Apart from install-entry.tsx, which the scheduler loads.
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import {
  INSTALL_HINT,
  isStandalone,
  openInstallPrompt,
  useInstallMethod,
} from "./install-state";

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
        <WithTooltip label={INSTALL_HINT}>
          <Button variant="outline" size="sm" onClick={openInstallPrompt}>
            Install
          </Button>
        </WithTooltip>
      )}
    </div>
  );
}
