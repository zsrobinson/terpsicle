import { Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { useWorkspace } from "~/state/workspace-store";
import { WithTooltip } from "~/ui/tooltip";
import { redo, undo } from "./actions";
import { modKey } from "./shortcuts";

// Every destructive or structural change pops a message with an Undo button
// (SPEC §3.1), which is how the app avoids confirmation dialogs. One toast at
// a time: each change replaces the last.

const TOAST_ID = "workspace-change";

export function UndoToasts() {
  const notice = useWorkspace((s) => s.notice);
  useEffect(() => {
    if (!notice?.toast) return;
    if (notice.kind === "undo") {
      toast("Undone", {
        id: TOAST_ID,
        description: notice.label,
        action: (
          <ToastAction
            label="Redo"
            shortcut={modKey("Z", { shift: true })}
            icon={<Redo2 size={13} aria-hidden="true" />}
            onClick={() => {
              redo();
            }}
          />
        ),
      });
    } else {
      toast(notice.label, {
        id: TOAST_ID,
        description: undefined,
        action: (
          <ToastAction
            label="Undo"
            shortcut={modKey("Z")}
            icon={<Undo2 size={13} aria-hidden="true" />}
            onClick={() => {
              undo("toast");
            }}
          />
        ),
      });
    }
  }, [notice]);
  return null;
}

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
        className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-[12.5px] text-fg transition-colors hover:bg-hover"
      >
        {icon}
        {label}
      </button>
    </WithTooltip>
  );
}
