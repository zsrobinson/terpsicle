import { cn } from "cn";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
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
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 flex w-fit items-center gap-1.5 rounded-md bg-fg px-2 py-1 text-bg text-sm",
          // No exit animation: a closing tooltip stays mounted until it ends,
          // and while mounted its layer takes the next Esc, so Esc after
          // tabbing away from a control (say, to go back) would do nothing.
          "fade-in-0 zoom-in-95 animate-in duration-100",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

let quietUntil = 0;

/**
 * Keeps tooltips shut for a moment. Menus and popovers call it as they close:
 * they hand focus back to their trigger, and a tooltip opening on that focus
 * would cover what the person was looking at.
 */
function quietTooltips(ms = 400): void {
  quietUntil = performance.now() + ms;
}

// When a finger last came down. A tap focuses what it lands on, and a
// tooltip opening on that focus covered the tabs above a phone's search box
// and stayed while you typed (QA S11). Radix already ignores a finger's
// hover; this ignores its focus.
let touchedAt = Number.NEGATIVE_INFINITY;
let listening = false;
const TOUCH_FOCUS_MS = 1000;

function listenForTouches(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") touchedAt = performance.now();
    },
    { capture: true, passive: true },
  );
}

/** Keys that type into a field: the tooltip's done once you're typing. */
function isTyping(e: React.KeyboardEvent): boolean {
  return (
    !e.metaKey &&
    !e.ctrlKey &&
    (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")
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
  const [open, setOpen] = React.useState(false);
  React.useEffect(listenForTouches, []);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && performance.now() < quietUntil) return;
        if (next && performance.now() - touchedAt < TOUCH_FOCUS_MS) return;
        setOpen(next);
      }}
    >
      {/* `data-tooltip`: e2e/tooltips.spec.ts finds controls without one. */}
      <TooltipTrigger
        asChild
        data-tooltip=""
        onKeyDown={(e) => {
          if (isTyping(e)) setOpen(false);
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  quietTooltips,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WithTooltip,
};
