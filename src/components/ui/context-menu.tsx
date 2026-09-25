import { cn } from "cn";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type * as React from "react";

// shadcn/ui context menu (right-click), styled like our dropdown menu so a
// row's right-click menu and its ⋯ menu look the same.

function ContextMenu(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Root>,
) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>,
) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  );
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "z-50 min-w-[180px] overflow-y-auto overflow-x-hidden rounded-lg border border-hairline bg-raised p-1 text-fg shadow-pop",
          "max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin)",
          "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:animate-in data-[state=open]:duration-150",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(
        "relative flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-left text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-hover data-disabled:opacity-40 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-hairline", className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
};
