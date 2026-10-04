import type { ReactNode } from "react";
import { Sheet, SheetTitle } from "~/ui/sheet";

// A phone's Reviews preview: the same preview in a sheet. Its own chunk, so
// the drawer's code loads with the first press, not with course details
// (scripts/check-bundle.ts).

export function ReviewsPreviewSheet({
  open,
  onOpenChange,
  name,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-y-contain px-4 pt-1 pb-6">
        <SheetTitle className="font-semibold text-lg tracking-tight">
          {name}
        </SheetTitle>
        {children}
      </div>
    </Sheet>
  );
}
