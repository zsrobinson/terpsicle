import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { HapticTap } from "./haptic";
import {
  MENU_ITEM,
  MENU_POPUP,
  MENU_SEPARATOR,
  POPUP_LAYER,
  POSITIONER,
} from "./popup";
import {
  type AsChild,
  asChildRender,
  type CompatEvent,
  focusProp,
  radixPositionerProps,
  selectAsClick,
  triggerState,
  useWatchedOpen,
} from "./radix-compat";
import { quietTooltips } from "./tooltip";

// The kit's dropdown menu, on Base UI's Menu, in Ink: a raised card with a
// hairline, 13px items and a quick pop-in (reference prototype `Menu`).

const MenuOpen = React.createContext(false);

function DropdownMenu({
  modal = false,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: MenuPrimitive.Root.Props) {
  const [isOpen, handleOpenChange] = useWatchedOpen(
    open,
    defaultOpen,
    onOpenChange,
  );
  // Not modal: a modal menu locks the page's scroll and blocks the rest of
  // it. Focus still moves into the menu, arrows and Esc work, and closing
  // returns focus to the trigger.
  return (
    <MenuOpen.Provider value={isOpen}>
      <MenuPrimitive.Root
        modal={modal}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        // As on Radix: the arrows stop at the first and last item.
        loopFocus={false}
        {...props}
      />
    </MenuOpen.Provider>
  );
}

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: MenuPrimitive.Trigger.Props & AsChild) {
  const open = React.useContext(MenuOpen);
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
      {...triggerState(open)}
      {...asChildRender(asChild, children)}
    />
  );
}

type ContentProps = Omit<MenuPrimitive.Popup.Props, "finalFocus"> &
  Pick<
    MenuPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "collisionPadding"
  > & {
    /** Radix's: prevent it to keep focus where the handler put it. */
    onCloseAutoFocus?: (event: CompatEvent) => void;
  };

function DropdownMenuContent({
  className,
  side,
  sideOffset = 6,
  align = "start",
  alignOffset,
  collisionPadding = 8,
  onCloseAutoFocus,
  ...props
}: ContentProps) {
  const popup = React.useRef<HTMLDivElement>(null);
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        // Keeps menus off the screen's edge on phones.
        collisionPadding={collisionPadding}
        {...POSITIONER}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <MenuPrimitive.Popup
          ref={popup}
          data-slot="dropdown-menu-content"
          // Focus goes back to the trigger: its tooltip would open over
          // what the person was looking at.
          finalFocus={focusProp(onCloseAutoFocus, popup, quietTooltips)}
          className={cn(MENU_POPUP, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

type ItemProps = Omit<MenuPrimitive.Item.Props, "onSelect"> &
  AsChild & {
    variant?: "default" | "destructive";
    /** Radix's: runs on a pick; prevent it to keep the menu open. */
    onSelect?: (event: CompatEvent) => void;
  };

function DropdownMenuItem({
  className,
  variant = "default",
  asChild,
  children,
  onSelect,
  onClick,
  ...props
}: ItemProps) {
  const destructive = variant === "destructive";
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        MENU_ITEM,
        variant === "destructive" && "text-error",
        className,
      )}
      onClick={selectAsClick(onSelect, onClick)}
      {...props}
      {...asChildRender(asChild, withTap(asChild, children, !destructive))}
    />
  );
}

/**
 * An item's content with an iPhone's tick on a tap (./haptic) as its last
 * child: inside the item, or inside its asChild link. Never on a
 * destructive item.
 */
function withTap(
  asChild: boolean | undefined,
  children: React.ReactNode,
  tap = true,
): React.ReactNode {
  if (!tap) return children;
  if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children))
    return React.cloneElement(
      children,
      {},
      <>
        {children.props.children}
        <HapticTap />
      </>,
    );
  return (
    <>
      {children}
      <HapticTap />
    </>
  );
}

/** Two-line item: a label and a muted hint below it. */
function DropdownMenuItemText({
  label,
  hint,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{label}</span>
      {hint ? (
        <span className="block truncate text-xs text-muted">{hint}</span>
      ) : null}
    </span>
  );
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

/** A check at the right of a picked item. */
function ItemCheck({ radio }: { radio?: boolean }) {
  const Indicator = radio
    ? MenuPrimitive.RadioItemIndicator
    : MenuPrimitive.CheckboxItemIndicator;
  return (
    <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
      <Indicator>
        <CheckIcon className="size-3.5" />
      </Indicator>
    </span>
  );
}

/** One choice of several; picking it closes the menu, as on Radix. */
function DropdownMenuRadioItem({
  className,
  children,
  closeOnClick = true,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(MENU_ITEM, "pr-7", className)}
      closeOnClick={closeOnClick}
      {...props}
    >
      {children}
      <ItemCheck radio />
      <HapticTap />
    </MenuPrimitive.RadioItem>
  );
}

/** A toggle in a multi-select menu; the menu stays open between picks. */
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(MENU_ITEM, "pr-7", className)}
      {...props}
    >
      {children}
      <ItemCheck />
      <HapticTap />
    </MenuPrimitive.CheckboxItem>
  );
}

/**
 * A heading over the items that follow. A plain line, as Radix's was: Base
 * UI's group label only works inside a group, and these head a run of items.
 */
function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn(
        "px-2 pt-1.5 pb-1 font-medium text-xs text-muted",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto font-mono text-xs text-faint", className)}
      {...props}
    />
  );
}

function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return (
    <MenuPrimitive.SubmenuRoot
      data-slot="dropdown-menu-sub"
      loopFocus={false}
      {...props}
    />
  );
}

/** An item that opens a submenu ("Move to…"), with a chevron. */
function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(MENU_ITEM, "data-popup-open:bg-hover", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto text-muted" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  sideOffset,
  alignOffset,
  collisionPadding = 8,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "sideOffset" | "alignOffset" | "collisionPadding"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        {...POSITIONER}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(MENU_POPUP, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
