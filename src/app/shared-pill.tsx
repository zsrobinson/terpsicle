import { Share2, X } from "lucide-react";
import { WithTooltip } from "~/ui/tooltip";

/**
 * Stands in for the plan tabs while a shared link is open (SPEC §3.11): a
 * light-red pill, "Shared plan · Save a copy · ✕". No names: we don't know
 * who shared it.
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
    <div className="flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-shared-soft pr-1 pl-2.5 text-[12.5px] text-shared">
      <Share2 size={13} aria-hidden="true" className="shrink-0" />
      <span className="truncate font-medium">Shared plan</span>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <WithTooltip label="Add this plan to your own plans">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 rounded-full px-1.5 py-0.5 font-medium underline-offset-2 transition-colors hover:bg-shared-soft hover:underline disabled:opacity-60"
        >
          Save a copy
        </button>
      </WithTooltip>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <WithTooltip label="Back to your plans">
        <button
          type="button"
          aria-label="Close shared plan"
          onClick={onClose}
          className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-shared-soft"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </WithTooltip>
    </div>
  );
}
