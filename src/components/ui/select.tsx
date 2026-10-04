import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { HapticTap } from "./haptic";
import {
  MENU_SEPARATOR,
  POPUP_CARD,
  POPUP_LAYER,
  POPUP_MOTION,
  POSITIONER,
} from "./popup";
import {
  type CompatEvent,
  radixPositionerProps,
  returnFocusProp,
  triggerState,
  useWatchedOpen,
} from "./radix-compat";
import { quietTooltips } from "./tooltip";

// The kit's select, on Base UI, in Ink: a 28px trigger with a hairline, and
// the same raised card as our dropdown menus for the list, under the trigger.

type ChangeDetails = SelectPrimitive.Root.ChangeEventDetails;

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, details: ChangeDetails) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: ChangeDetails) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  children?: React.ReactNode;
};

const SelectOpen = React.createContext(false);

/**
 * The items' values and labels, read from the `SelectItem`s among the
 * children, so the trigger shows the chosen item's label (as it did on Radix)
 * rather than its value.
 */
function itemsIn(
  node: React.ReactNode,
  items: { value: string; label: React.ReactNode }[] = [],
) {
  React.Children.forEach(node, (child) => {
    if (
      !React.isValidElement<{ children?: React.ReactNode; value?: string }>(
        child,
      )
    )
      return;
    if (child.type === SelectItem && child.props.value !== undefined)
      items.push({ value: child.props.value, label: child.props.children });
    else itemsIn(child.props.children, items);
  });
  return items;
}

function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: SelectProps) {
  const [isOpen, handleOpenChange] = useWatchedOpen(
    open,
    defaultOpen,
    onOpenChange,
  );
  return (
    <SelectOpen.Provider value={isOpen}>
      <SelectPrimitive.Root<string>
        items={itemsIn(children)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next, details) => {
          if (next !== null) onValueChange?.(next, details);
        }}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        // Not modal, as the kit's menus aren't. A modal select keeps
        // blocking the page while its list fades out, so a press on the
        // next field in a form (Ends, right after Starts) went nowhere.
        modal={false}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectOpen.Provider>
  );
}

function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  const open = React.useContext(SelectOpen);
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-hairline-strong bg-bg text-fg transition-colors",
        "hover:bg-hover focus-visible:border-fg/40 data-[state=open]:bg-hover disabled:pointer-events-none disabled:opacity-50 data-placeholder:text-muted",
        // The heights of the Input and Button beside it: 32px, and 28px small.
        "data-[size=default]:h-8 data-[size=default]:px-2 data-[size=default]:text-sm data-[size=sm]:h-7 data-[size=sm]:px-1.5 data-[size=sm]:text-sm",
        // 44px on phones, like every control (Button). Scoped by size like the
        // heights above, so it outranks them.
        "max-md:data-[size=default]:h-11 max-md:data-[size=sm]:h-11",
        "*:data-[slot=select-value]:truncate",
        className,
      )}
      {...props}
      {...triggerState(open)}
    >
      {children}
      <SelectPrimitive.Icon className="flex shrink-0">
        <ChevronDownIcon className="size-3.5 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side,
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  onCloseAutoFocus,
  ...props
}: Omit<SelectPrimitive.Popup.Props, "finalFocus"> &
  Pick<
    SelectPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "collisionPadding"
  > & {
    /** Radix's: prevent it to put focus somewhere yourself. */
    onCloseAutoFocus?: (event: CompatEvent) => void;
  }) {
  const popup = React.useRef<HTMLDivElement>(null);
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        // The list opens under the trigger, not over it (macOS-style).
        alignItemWithTrigger={false}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...POSITIONER}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <SelectPrimitive.Popup
          ref={popup}
          data-slot="select-content"
          finalFocus={returnFocusProp(onCloseAutoFocus, popup, quietTooltips)}
          className={cn(
            POPUP_CARD,
            POPUP_MOTION,
            "min-w-(--anchor-width) max-h-(--available-height) overflow-y-auto overflow-x-hidden p-1",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props & { value: string }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-7 max-md:min-h-11 w-full cursor-default select-none items-center gap-2 rounded-md py-1 pr-7 pl-2 text-base outline-none",
        "data-disabled:pointer-events-none data-highlighted:bg-hover data-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* A tick on an iPhone's tap (./haptic). */}
      <HapticTap />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
