import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { POPUP_MOTION } from "./popup";
import { focusQuietly } from "./popup-focus";

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
  initialFocus,
  finalFocus,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-bg/60 transition-opacity duration-(--dur-pop) ease-pop data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        initialFocus={focusQuietly(initialFocus)}
        finalFocus={focusQuietly(finalFocus)}
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
      className={cn("emph-title text-lg", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("emph-secondary", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogDescription, DialogTitle };
