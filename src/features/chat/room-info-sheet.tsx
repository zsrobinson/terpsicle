import type { ReactNode } from "react";
import { PageHeader } from "~/ui/page-header";
import { Sheet, SheetTitle } from "~/ui/sheet";

/**
 * Room info on a phone: the kit's sheet, over the room. Its own chunk
 * (./chat-page.tsx loads it on phones only), so Base UI's Drawer stays out
 * of Chat's first load; a desktop shows room info beside the room instead.
 */
export function RoomInfoSheet({
  open,
  onOpenChange,
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The header's Close. */
  actions: ReactNode;
  /** Room info itself. */
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <PageHeader
        size="panel"
        title={
          <SheetTitle asChild>
            <span>Room info</span>
          </SheetTitle>
        }
        actions={actions}
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {children}
      </div>
    </Sheet>
  );
}
