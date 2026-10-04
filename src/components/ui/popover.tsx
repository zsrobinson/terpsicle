import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import * as React from "react";
import { POPUP_CARD, POPUP_LAYER, POPUP_MOTION, POSITIONER } from "./popup";
import { focusBackQuietly, focusQuietly } from "./popup-focus";

// The kit's popover, on Base UI, in Ink: a raised card with a hairline and
// the same quick pop-in as menus. A press outside closes it (`pressedOn`
// for a caller whose own button toggles it).

type Anchor = PopoverPrimitive.Positioner.Props["anchor"];

type Shared = {
  anchor: Anchor;
  setAnchor: (anchor: Anchor) => void;
};

const PopoverShared = React.createContext<Shared | null>(null);

function Popover(props: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<Anchor>(undefined);
  const shared = React.useMemo(() => ({ anchor, setAnchor }), [anchor]);
  return (
    <PopoverShared.Provider value={shared}>
      <PopoverPrimitive.Root {...props} />
    </PopoverShared.Provider>
  );
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * What the popover points at, when that isn't its trigger: an element of
 * its own (a `<div>`, or what `render` gives) or `virtualRef`, a ref to
 * something already on the page (the button that toggles it).
 */
function PopoverAnchor({
  render,
  virtualRef,
  ref,
  ...props
}: useRender.ComponentProps<"div"> & {
  virtualRef?: React.RefObject<Element | null>;
}) {
  const setAnchor = React.useContext(PopoverShared)?.setAnchor;
  React.useLayoutEffect(() => {
    if (!virtualRef || !setAnchor) return;
    setAnchor(virtualRef);
    return () => setAnchor(undefined);
  }, [virtualRef, setAnchor]);
  // Stable, so a render doesn't detach and reattach it (and set it again).
  const anchorRef = React.useCallback(
    (element: Element | null) => setAnchor?.(element ?? undefined),
    [setAnchor],
  );
  const element = useRender({
    defaultTagName: "div",
    render,
    ref: ref ? [anchorRef, ref] : anchorRef,
    props: { "data-slot": "popover-anchor", ...props },
  });
  return virtualRef ? null : element;
}

/**
 * Whether a close is a press (or focus) outside that landed on `toggle`,
 * the caller's own button that opens and closes the popover. Cancel that
 * close (`details.cancel()`): the press would close it, and its click open
 * it again.
 */
function pressedOn(
  toggle: React.RefObject<Element | null>,
  details: PopoverPrimitive.Root.ChangeEventDetails,
): boolean {
  if (details.reason !== "outside-press" && details.reason !== "focus-out")
    return false;
  const target = details.event.target;
  return target instanceof Node && !!toggle.current?.contains(target);
}

type ContentProps = PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "collisionPadding"
  >;

function PopoverContent({
  className,
  side,
  align = "start",
  sideOffset = 6,
  alignOffset,
  collisionPadding = 8,
  initialFocus,
  finalFocus,
  ...props
}: ContentProps) {
  const shared = React.useContext(PopoverShared);
  const popup = React.useRef<HTMLDivElement>(null);
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
        {...POSITIONER}
        className={POPUP_LAYER}
      >
        <PopoverPrimitive.Popup
          ref={popup}
          data-slot="popover-content"
          // Opening moves focus inside, and closing moves it back. A tooltip
          // opening on that focus would sit on top and take the first Esc.
          initialFocus={focusQuietly(initialFocus)}
          finalFocus={focusBackQuietly(finalFocus, popup)}
          className={cn(POPUP_CARD, POPUP_MOTION, "p-3", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger, pressedOn };
