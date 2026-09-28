import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { Drawer } from "vaul";

// The phone sheet (docs/COHESION.md §1.5): what a desktop popover becomes
// on a phone, a vaul drawer from the bottom edge with a grab handle, a
// keyline and the drawer's offset along its top, square like the rest of
// the Ink brand. A swipe down, a tap above it or Esc closes it. Its
// heading is the caller's, wrapped in `SheetTitle` so the sheet is named
// by it: `<PageHeader size="panel" title={<SheetTitle asChild><span>…`.

/** The sheet's name for assistive tech: wrap the visible heading in it. */
function SheetTitle(props: ComponentProps<typeof Drawer.Title>) {
  return <Drawer.Title {...props} />;
}

function Sheet({
  open,
  onOpenChange,
  children,
  className,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
} & Omit<ComponentProps<typeof Drawer.Content>, "children">) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-fg/20" />
        <Drawer.Content
          data-slot="sheet"
          aria-describedby={undefined}
          {...props}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col border-keyline border-t bg-bg text-fg shadow-drawer outline-none",
            className,
          )}
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-hairline-strong"
          />
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export { Sheet, SheetTitle };
