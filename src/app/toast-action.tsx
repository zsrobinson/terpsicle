import type { ReactNode } from "react";
import { WithTooltip } from "~/ui/tooltip";

/** A toast's button, with its tooltip and shortcut (every control has one). */
export function ToastAction({
  label,
  shortcut,
  icon,
  onClick,
  onFocus,
  onBlur,
}: {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover"
      >
        {icon}
        {label}
      </button>
    </WithTooltip>
  );
}
