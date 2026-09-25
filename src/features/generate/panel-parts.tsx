import { cn } from "cn";
import type { ReactNode } from "react";

// UX-REVIEW §2.3's PanelFooter and SectionHeader ("label" variant), with the
// same props, until the shared ones land in ~/app/panel (WP0). Then this file
// goes and the imports switch.

/** The panel's one primary action, pinned under the scroll area. */
export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 flex shrink-0 items-center gap-2 border-hairline border-t bg-bg px-4 py-2">
      {children}
    </div>
  );
}

/** A quiet section label for forms: "Must have". */
export function SectionHeader({
  title,
  count,
  right,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-4 pt-4 pb-1.5 text-sm",
        className,
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="font-medium text-muted">{title}</span>
        {count !== undefined ? (
          <span className="tnum text-muted text-xs">{count}</span>
        ) : null}
      </span>
      {right}
    </div>
  );
}
