import { Download } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";
import {
  INSTALL_HINT,
  openInstallPrompt,
  useInstallMethod,
} from "./install-state";

// "Install app", always available and quiet (V2 §3.4): it opens the same
// dialog as the key moments, whatever the cooldown. It's in the account menu
// (the phone menu too), and for people who haven't signed in, at the foot of
// the scheduler's rail (the theme menu on phones). `InstallAppSetting`
// (install-setting.tsx, apart so the scheduler's chunk doesn't split) is for
// /settings#notifications. Each piece renders nothing where installing
// doesn't work or already happened.

/** An icon button: the foot of the rail. */
export function InstallAppButton({ side }: { side: "right" | "bottom" }) {
  const method = useInstallMethod();
  if (method === null) return null;
  return (
    <WithTooltip label={INSTALL_HINT} side={side}>
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
