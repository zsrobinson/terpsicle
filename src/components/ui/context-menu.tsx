import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import * as React from "react";
import {
  MENU_ITEM,
  MENU_POPUP,
  MENU_SEPARATOR,
  POPUP_LAYER,
  POPUP_POSITION,
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

// The kit's context menu (a right click, or a long press on a phone), on
// Base UI, drawn like our dropdown menu so a row's right-click menu and its
// ⋯ menu look the same.

const ContextMenuOpen = React.createContext(false);

function ContextMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: ContextMenuPrimitive.Root.Props) {
  const [isOpen, handleOpenChange] = useWatchedOpen(
    open,
    defaultOpen,
    onOpenChange,
  );
  return (
    <ContextMenuOpen.Provider value={isOpen}>
      <ContextMenuPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        loopFocus={false}
        {...props}
      />
    </ContextMenuOpen.Provider>
  );
}

function ContextMenuTrigger({
  asChild,
  children,
  ...props
}: ContextMenuPrimitive.Trigger.Props & AsChild) {
  const open = React.useContext(ContextMenuOpen);
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      {...props}
      {...triggerState(open)}
      {...asChildRender(asChild, children)}
    />
  );
}

function ContextMenuContent({
  className,
  collisionPadding = 8,
  onCloseAutoFocus,
  ...props
}: Omit<ContextMenuPrimitive.Popup.Props, "finalFocus"> &
  Pick<ContextMenuPrimitive.Positioner.Props, "collisionPadding"> & {
    onCloseAutoFocus?: (event: CompatEvent) => void;
  }) {
  const popup = React.useRef<HTMLDivElement>(null);
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        // Where Radix put it: its top-left corner just right of the pointer,
        // not Base UI's default of 5px above it.
        side="right"
        align="start"
        sideOffset={2}
        collisionPadding={collisionPadding}
        positionMethod={POPUP_POSITION}
        className={POPUP_LAYER}
        {...radixPositionerProps}
      >
        <ContextMenuPrimitive.Popup
          ref={popup}
          data-slot="context-menu-content"
          finalFocus={focusProp(onCloseAutoFocus, popup, quietTooltips)}
          className={cn(MENU_POPUP, className)}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  onSelect,
  onClick,
  ...props
}: Omit<ContextMenuPrimitive.Item.Props, "onSelect"> & {
  /** Radix's: runs on a pick; prevent it to keep the menu open. */
  onSelect?: (event: CompatEvent) => void;
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(MENU_ITEM, className)}
      onClick={selectAsClick(onSelect, onClick)}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
};
