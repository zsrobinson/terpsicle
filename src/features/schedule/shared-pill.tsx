import { Share2, X } from "lucide-react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

/**
 * Stands in for the plan tabs while a shared link is open (SPEC §3.11): the
 * light-red "Shared plan" label says what you're looking at, and the kit's
 * own buttons, neutral like every other action, save it or close it. No
 * names: we don't know who shared it.
 */
export function SharedPill({
  onSave,
  onClose,
  saving = false,
}: {
  onSave: () => void;
  onClose: () => void;
  saving?: boolean;
}) {
  return (
    // The label gives way first on a phone, down to its icon; the actions
    // keep their size.
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex h-7 min-w-0 shrink items-center gap-1.5 bg-shared-soft px-2 font-medium text-base text-shared">
        <Share2 size={13} aria-hidden="true" className="shrink-0" />
        <span className="truncate">Shared plan</span>
      </span>
      <WithTooltip label="Add this plan to your own plans">
        <Button
          size="sm"
          variant="outline"
          onClick={onSave}
          disabled={saving}
          className="shrink-0"
        >
          Save a copy
        </Button>
      </WithTooltip>
      <WithTooltip label="Back to your plans">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close shared plan"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </WithTooltip>
    </div>
  );
}
