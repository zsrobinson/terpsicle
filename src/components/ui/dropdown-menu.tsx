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
import { focusBackQuietly } from "./popup-focus";

// The kit's dropdown menu, on Base UI's Menu, in Ink: a raised card with a
// hairline, 13px items and a quick pop-in (reference prototype `Menu`).

function DropdownMenu({ modal = false, ...props }: MenuPrimitive.Root.Props) {
  // Not modal: a modal menu locks the page's scroll and blocks the rest of
  // it. Focus still moves into the menu, arrows and Esc work, and closing
  // returns focus to the trigger.
  return (
    <MenuPrimitive.Root
      modal={modal}
      // The arrows stop at the first and last item.
      loopFocus={false}
      {...props}
    />
  );
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

type ContentProps = MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "collisionPadding"
  >;

function DropdownMenuContent({
  className,
  side,
  sideOffset = 6,
  align = "start",
  alignOffset,
  collisionPadding = 8,
  finalFocus,
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
      >
        <MenuPrimitive.Popup
          ref={popup}
          data-slot="dropdown-menu-content"
          // Focus goes back to the trigger: its tooltip would open over
          // what the person was looking at.
          finalFocus={focusBackQuietly(finalFocus, popup)}
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

type ItemProps = MenuPrimitive.Item.Props & {
  variant?: "default" | "destructive";
};

/**
 * A pick: `onClick` runs on a press, Enter or Space, and the menu closes
 * (`closeOnClick={false}` keeps it open). `render` draws it as a link.
 */
function DropdownMenuItem({
  className,
  variant = "default",
  children,
  ...props
}: ItemProps) {
  const destructive = variant === "destructive";
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(MENU_ITEM, destructive && "text-error", className)}
      {...props}
    >
      {children}
      {/* An iPhone's tick on a tap (./haptic), never on a destructive item. */}
      {destructive ? null : <HapticTap />}
    </MenuPrimitive.Item>
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

/** One choice of several; picking it closes the menu. */
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
 * A heading over the items that follow. A plain line: Base UI's group
 * label only works inside a group, and these head a run of items.
 */
function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-label"
      className={cn("emph-heading px-2 pt-1.5 pb-1 text-xs", className)}
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
