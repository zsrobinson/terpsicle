import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import * as React from "react";
import { POPUP_MOTION } from "./popup";
import {
  type AsChild,
  asChildRender,
  type CompatEvent,
  focusProp,
} from "./radix-compat";
import { quietTooltips } from "./tooltip";

// The kit's dialog, on Base UI, in Ink: a raised card over a soft wash of
// the page (never a dark scrim), with the same quick pop-in as popovers.
// For things a person chose to open or a key moment offers; never to
// confirm (DESIGN §5: use undo).

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: Omit<DialogPrimitive.Popup.Props, "initialFocus" | "finalFocus"> & {
  /** Radix's: prevent it to put focus somewhere yourself. */
  onOpenAutoFocus?: (event: CompatEvent) => void;
  /** Radix's: prevent it to put focus somewhere yourself. */
  onCloseAutoFocus?: (event: CompatEvent) => void;
}) {
  const popup = React.useRef<HTMLDivElement>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-bg/60 transition-opacity duration-(--dur-pop) ease-(--ease-pop) data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup
        ref={popup}
        data-slot="dialog-content"
        initialFocus={focusProp(onOpenAutoFocus, popup, quietTooltips)}
        finalFocus={focusProp(onCloseAutoFocus, popup, quietTooltips)}
        className={cn(
          "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[380px] overflow-y-auto rounded-lg border border-hairline bg-raised p-6 text-fg shadow-pop outline-none",
          POPUP_MOTION,
          // Centered, so it grows from its middle, not from a trigger.
          "origin-center",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-semibold text-lg tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  asChild,
  children,
  ...props
}: DialogPrimitive.Description.Props & AsChild) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted", className)}
      {...props}
      {...asChildRender(asChild, children)}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogTitle };
