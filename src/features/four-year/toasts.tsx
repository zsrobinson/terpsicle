import { Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { modKey } from "~/app/shortcuts";
import { WithTooltip } from "~/ui/tooltip";
import { useFourYear } from "./store";

// Every change says what it did, with Undo (SPEC §3.1): Plan's way of never
// asking "Are you sure?". One toast at a time; each change replaces the last.

const TOAST_ID = "four-year-change";

/** Long enough to read and reach Undo (WCAG 2.2.1); ⌘Z still works after. */
export const PLAN_TOAST_MS = 10_000;

function ToastAction({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: string;
  shortcut: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        className="ml-auto flex h-11 shrink-0 items-center gap-1.5 border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover md:h-7"
      >
        {icon}
        {label}
      </button>
    </WithTooltip>
  );
}

export function PlanToasts() {
  const notice = useFourYear((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const { undo, redo } = useFourYear.getState();
    if (notice.kind === "undo")
      toast("Undone", {
        id: TOAST_ID,
        duration: PLAN_TOAST_MS,
        description: notice.label,
        action: (
          <ToastAction
            label="Redo"
            shortcut={modKey("Z", { shift: true })}
            icon={<Redo2 size={13} aria-hidden="true" />}
            onClick={redo}
          />
        ),
      });
    else
      toast(notice.label, {
        id: TOAST_ID,
        duration: PLAN_TOAST_MS,
        description: undefined,
        action: (
          <ToastAction
            label="Undo"
            shortcut={modKey("Z")}
            icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={undo}
          />
        ),
      });
  }, [notice]);
  return null;
}
