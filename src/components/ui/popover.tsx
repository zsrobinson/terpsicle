import { cn } from "cn";
import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { quietTooltips } from "./tooltip";

// shadcn/ui popover, restyled to our tokens: a raised card with a hairline
// and the same quick pop-in as menus.

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor(
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding = 8,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        onCloseAutoFocus={(event) => {
          quietTooltips();
          onCloseAutoFocus?.(event);
        }}
        // Keeps popovers off the screen's edge on phones.
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 rounded-lg border border-hairline bg-raised p-2.5 text-fg shadow-pop outline-none",
          "origin-(--radix-popover-content-transform-origin) data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:animate-in data-[state=open]:duration-150",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
