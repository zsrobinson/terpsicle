import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

// The tooltips' shared delay, on its own so a page can carry it without the
// tooltip itself: the root layout wraps every page in it, and the marketing
// page loads the tooltip on first use (docs/BUILD.md §5). Also exported
// from ./tooltip, with the rest of the kit's tooltip.

export function TooltipProvider({
  delayDuration = 300,
  ...props
}: Omit<TooltipPrimitive.Provider.Props, "delay"> & {
  /** How long a pointer rests on a control before its tooltip opens. */
  delayDuration?: number;
}) {
  return <TooltipPrimitive.Provider delay={delayDuration} {...props} />;
}
