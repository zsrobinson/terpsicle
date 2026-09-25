import { cn } from "cn";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { Kbd } from "./kbd";

// shadcn/ui tooltip, restyled to our tokens: inverted fg/bg chip, quick fade.

function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex w-fit items-center gap-1.5 rounded-md bg-fg px-2 py-1 text-xs text-bg",
          "fade-in-0 zoom-in-95 animate-in duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * The one way to give a control a tooltip. Every interactive element gets one
 * (CLAUDE.md), and if it has a shortcut, `shortcut` shows it.
 */
function WithTooltip({
  label,
  shortcut,
  side,
  children,
}: {
  label: React.ReactNode;
  shortcut?: string;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WithTooltip,
};
