import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import * as React from "react";
import { POPUP_CARD, POPUP_LAYER, POPUP_MOTION } from "./popup";
import {
  type AsChild,
  asChildRender,
  type CompatEvent,
  focusProp,
  prevented,
  radixPositionerProps,
  triggerState,
  useWatchedOpen,
} from "./radix-compat";
import { quietTooltips } from "./tooltip";

// The kit's popover, on Base UI, in Ink: a raised card with a hairline and
// the same quick pop-in as menus.

type Anchor = PopoverPrimitive.Positioner.Props["anchor"];

type Shared = {
  open: boolean;
  anchor: Anchor;
  setAnchor: (anchor: Anchor) => void;
  /** The content's `onInteractOutside`, which the root asks before closing. */
  outside: React.RefObject<((event: CompatEvent) => void) | undefined>;
};

const PopoverShared = React.createContext<Shared | null>(null);

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<Anchor>(undefined);
  const outside = React.useRef<((event: CompatEvent) => void) | undefined>(
    undefined,
  );
  const [isOpen, handleOpenChange] = useWatchedOpen(
    open,
    defaultOpen,
    (next: boolean, details: PopoverPrimitive.Root.ChangeEventDetails) => {
      // A press or focus outside closes it, unless the content's
      // `onInteractOutside` says that one doesn't count (the button that
      // toggles it, say).
      if (
        !next &&
        (details.reason === "outside-press" ||
          details.reason === "focus-out") &&
        prevented(outside.current, null, details.event.target)
      ) {
        details.cancel();
        return;
      }
      onOpenChange?.(next, details);
    },
  );
  const shared = React.useMemo(
    () => ({ open: isOpen, anchor, setAnchor, outside }),
    [isOpen, anchor],
  );
  return (
    <PopoverShared.Provider value={shared}>
      <PopoverPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </PopoverShared.Provider>
  );
}

function PopoverTrigger({
  asChild,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props & AsChild) {
  const open = React.useContext(PopoverShared)?.open ?? false;
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      {...props}
      {...triggerState(open)}
      {...asChildRender(asChild, children)}
    />
  );
}

/**
 * What the popover points at, when that isn't its trigger: an element (its
 * child, with `asChild`) or `virtualRef`, a ref to something already on the
 * page (the button that toggles it).
 */
function PopoverAnchor({
  asChild,
  children,
  virtualRef,
  ...props
}: React.ComponentProps<"div"> &
  AsChild & { virtualRef?: React.RefObject<Element | null> }) {
  const setAnchor = React.useContext(PopoverShared)?.setAnchor;
  React.useLayoutEffect(() => {
    if (!virtualRef || !setAnchor) return;
    setAnchor(virtualRef);
    return () => setAnchor(undefined);
  }, [virtualRef, setAnchor]);
  const child =
    asChild && React.isValidElement<{ ref?: React.Ref<Element> }>(children)
      ? children
      : null;
  const childRef = child?.props.ref;
  // Stable, so a render doesn't detach and reattach it (and set it again).
  const ref = React.useMemo(
    () =>
      mergeRefs<Element>(
        (element) => setAnchor?.(element ?? undefined),
        childRef,
      ),
    [setAnchor, childRef],
  );
  if (virtualRef) return null;
  if (child) return React.cloneElement(child, { ...props, ref });
  return (
    <div data-slot="popover-anchor" ref={ref} {...props}>
      {children}
    </div>
  );
}

function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref) ref.current = value;
    }
  };
}

type ContentProps = Omit<
  PopoverPrimitive.Popup.Props,
  "initialFocus" | "finalFocus"
> &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "collisionPadding"
  > & {
    /** Radix's: prevent it to put focus somewhere yourself. */
    onOpenAutoFocus?: (event: CompatEvent) => void;
    /** Radix's: prevent it to put focus somewhere yourself. */
    onCloseAutoFocus?: (event: CompatEvent) => void;
    /** Radix's: prevent it and that press or focus outside won't close it. */
    onInteractOutside?: (event: CompatEvent) => void;
  };

function PopoverContent({
  className,
  side,
  align = "start",
  sideOffset = 6,
  alignOffset,
  collisionPadding = 8,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onInteractOutside,
  ...props
}: ContentProps) {
  const shared = React.useContext(PopoverShared);
  const popup = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (shared) shared.outside.current = onInteractOutside;
  });
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={shared?.anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        // Keeps popovers off the screen's edge on phones.
        collisionPadding={collisionPadding}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <PopoverPrimitive.Popup
          ref={popup}
          data-slot="popover-content"
          // Opening moves focus inside, and closing moves it back. A tooltip
          // opening on that focus would sit on top and take the first Esc.
          initialFocus={focusProp(onOpenAutoFocus, popup, quietTooltips)}
          finalFocus={focusProp(onCloseAutoFocus, popup, quietTooltips)}
          className={cn(POPUP_CARD, POPUP_MOTION, "p-3", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
