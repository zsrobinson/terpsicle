import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

// shadcn/ui button in the Ink brand (docs/DESIGN.md §7): square, with a hard
// offset shadow on the filled and outline variants. A press shifts the button
// into its shadow, the way a key goes down. Ghost and link buttons stay flat,
// so a row of icon buttons doesn't turn into a row of boxes.
const PRESS =
  "active:translate-x-(--offset) active:translate-y-(--offset) active:shadow-none";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Ink-filled: its offset is gray, never ink on ink.
        default: `bg-accent text-accent-fg shadow-offset-filled hover:bg-accent/85 ${PRESS}`,
        outline: `border border-fg bg-raised text-fg shadow-offset hover:bg-hover ${PRESS}`,
        ghost: "text-muted hover:bg-hover hover:text-fg",
        link: "text-fg underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5",
        // The one size for actions inside list rows ("Switch", "Stop watching").
        row: "h-6 px-2 text-sm",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
