import { cn } from "cn";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type * as React from "react";
import { quietTooltips } from "./tooltip";

// shadcn/ui select, restyled to our tokens and density: a 28px trigger with a
// hairline, and the same raised card as our dropdown menus for the list.

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue(
  props: React.ComponentProps<typeof SelectPrimitive.Value>,
) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit min-w-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-hairline-strong bg-bg text-fg transition-colors",
        "hover:bg-hover focus-visible:border-fg/40 data-[state=open]:bg-hover disabled:pointer-events-none disabled:opacity-50 data-placeholder:text-muted",
        "data-[size=default]:h-7 data-[size=default]:px-2 data-[size=default]:text-sm data-[size=sm]:h-6 data-[size=sm]:px-1.5 data-[size=sm]:text-sm",
        "*:data-[slot=select-value]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 4,
  collisionPadding = 8,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onCloseAutoFocus={(event) => {
          quietTooltips();
          onCloseAutoFocus?.(event);
        }}
        className={cn(
          "z-50 min-w-(--radix-select-trigger-width) overflow-y-auto overflow-x-hidden border border-keyline bg-raised p-1 text-fg shadow-pop",
          "max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin)",
          "data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:animate-in data-[state=open]:duration-150",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-7 w-full cursor-default select-none items-center gap-2 rounded-md py-1 pr-7 pl-2 text-base outline-none",
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
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-hairline", className)}
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
