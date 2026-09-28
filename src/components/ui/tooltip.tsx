import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";
import * as React from "react";
import { Kbd } from "./kbd";
import { POPUP_LAYER } from "./popup";
import {
  type AsChild,
  asChildRender,
  radixPositionerProps,
} from "./radix-compat";

// The kit's tooltip, on Base UI, in Ink: an inverted fg/bg chip that fades
// in. Base UI opens it on hover with a mouse and on keyboard focus, never on
// a finger's touch.

function TooltipProvider({
  delayDuration = 300,
  ...props
}: Omit<TooltipPrimitive.Provider.Props, "delay"> & {
  /** How long a pointer rests on a control before its tooltip opens. */
  delayDuration?: number;
}) {
  return <TooltipPrimitive.Provider delay={delayDuration} {...props} />;
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: TooltipPrimitive.Trigger.Props & AsChild) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      {...asChildRender(asChild, children)}
    />
  );
}

function TooltipContent({
  className,
  side,
  align,
  sideOffset = 6,
  collisionPadding = 8,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "collisionPadding"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          // Base UI leaves a tooltip unnamed; Radix's was a `tooltip` that
          // described its trigger (WithTooltip), and screen readers read it.
          role="tooltip"
          className={cn(
            "flex w-fit items-center gap-1.5 rounded-md bg-fg px-2 py-1 text-bg text-sm",
            // A fade in only (the `--dur-pop` motion token). No exit: a
            // closing tooltip would stay on screen over what comes next.
            "transition-opacity duration-(--dur-pop) ease-(--ease-pop) data-starting-style:opacity-0 data-instant:transition-none",
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
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
// and stayed while you typed (QA S11). Base UI already ignores a finger's
// hover; this ignores its focus.
let touchedAt = Number.NEGATIVE_INFINITY;
// When Tab was last pressed, if it was the last key or press at all. A text
// field opens its tooltip on focus only when the person tabbed to it: when
// the app puts the caret there ("Add a task", a shortcut, a form opening),
// the tooltip covered the heading above it until they typed (QA3).
let tabbedAt = Number.NEGATIVE_INFINITY;
let listening = false;
const TOUCH_FOCUS_MS = 1000;
const TAB_FOCUS_MS = 500;

function listenForInput(): void {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") touchedAt = performance.now();
      tabbedAt = Number.NEGATIVE_INFINITY;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      tabbedAt = e.key === "Tab" ? performance.now() : Number.NEGATIVE_INFINITY;
    },
    { capture: true, passive: true },
  );
}

const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** A field you type into: a textarea, a text-like input, or editable text. */
function isTextEntry(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NOT_TYPED.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
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
  side?: TooltipPrimitive.Positioner.Props["side"];
  children: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  React.useEffect(listenForInput, []);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next, details) => {
        // Esc closes the tooltip and still reaches the page: a field or a
        // list that closes on Esc shouldn't need a second press.
        if (details.reason === "escape-key") details.allowPropagation();
        if (next) {
          const now = performance.now();
          if (now < quietUntil) return;
          if (now - touchedAt < TOUCH_FOCUS_MS) return;
          // A text field the app focused, rather than one tabbed to.
          if (
            details.reason === "trigger-focus" &&
            isTextEntry(details.event.target) &&
            now - tabbedAt > TAB_FOCUS_MS
          )
            return;
        }
        setOpen(next);
      }}
    >
      {/* `data-tooltip`: e2e/tooltips.spec.ts finds controls without one. */}
      <TooltipTrigger
        data-tooltip=""
        // Its words describe the control while they show, as on Radix.
        aria-describedby={open ? id : undefined}
        onKeyDown={(e) => {
          if (isTyping(e)) setOpen(false);
        }}
        render={children}
      />
      <TooltipContent id={id} side={side}>
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
