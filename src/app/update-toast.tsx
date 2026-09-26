import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { WithTooltip } from "~/ui/tooltip";

// "Update ready": a new version of the app is installed and waiting. A quiet
// toast, not a banner (DESIGN §5); ignoring it is fine, since the new version
// takes over by itself once every Terpsicle tab is closed.

const TOAST_ID = "app-update";
/** Longer than a normal toast: it's never urgent, but it shouldn't vanish mid-read. */
export const UPDATE_TOAST_MS = 20_000;

export function showUpdateReady(apply: () => void): void {
  toast("Update ready", {
    id: TOAST_ID,
    duration: UPDATE_TOAST_MS,
    description: "Reload to get the new version. Your plans are saved.",
    action: (
      <WithTooltip label="Reload Terpsicle now">
        <button
          type="button"
          onClick={() => {
            toast.dismiss(TOAST_ID);
            apply();
          }}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
        >
          <RotateCw size={13} aria-hidden="true" />
          Reload
        </button>
      </WithTooltip>
    ),
  });
}
