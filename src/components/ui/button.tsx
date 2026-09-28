import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";
import { HapticTap } from "./haptic";

// shadcn/ui button in the Ink brand (docs/DESIGN.md §7): square, with a hard
// offset shadow on the filled and outline variants. A press shifts the button
// into its shadow, the way a key goes down. Ghost and link buttons stay flat,
// so a row of icon buttons doesn't turn into a row of boxes.
const PRESS =
  "active:translate-x-(--ink-offset) active:translate-y-(--ink-offset) active:shadow-none";

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
      // Every size is 44px tall on phones (below md), where a finger, not a
      // pointer, presses it (docs/ACCESSIBILITY.md, "Touch targets"). Pages
      // never add their own phone heights.
      size: {
        default: "h-8 px-3 max-md:h-11",
        // A first visit's actions (EmptyState): 36px on a desktop.
        lg: "h-9 px-4 max-md:h-11",
        sm: "h-7 px-2.5 max-md:h-11",
        // The one size for actions inside list rows ("Switch", "Stop watching").
        row: "h-6 px-2 text-sm max-md:h-11",
        icon: "size-8 max-md:size-11",
        "icon-sm": "size-7 max-md:size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /**
     * Another element to draw as the button, such as a link: Base UI's
     * `render` (`render={<Link to="/plan" />}`), with the button's classes
     * and the children given here.
     */
    render?: React.ReactElement<Record<string, unknown>>;
    /**
     * Draws the only child as the button instead (the Radix way). Kept for
     * one wave while features move to `render`.
     */
    asChild?: boolean;
    /**
     * A tick on iPhone when a finger presses it (`./haptic`). Off by
     * default: turn it on for a commit that changes the plan ("Add 0101",
     * "Switch"), never on ghost or link buttons.
     */
    haptic?: boolean;
  };

function Button({
  className,
  variant,
  size,
  render,
  asChild = false,
  haptic = false,
  children,
  ref,
  ...props
}: ButtonProps) {
  // `asChild` is `render` with the child's own children.
  const child =
    asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
      ? children
      : undefined;
  const content = child ? child.props.children : children;
  const inner = haptic ? (
    <>
      {content}
      <HapticTap />
    </>
  ) : (
    content
  );
  // The element's own children would win the merge, so they're swapped for
  // the ones with the overlay.
  const element =
    child && haptic ? React.cloneElement(child, {}, inner) : child;
  return useRender({
    defaultTagName: "button",
    render: element ?? render,
    ref,
    props: {
      "data-slot": "button",
      // Base UI would make a bare <button> type="button"; ours stay plain,
      // so one in a form still submits it, as before.
      type: undefined,
      className: cn(
        buttonVariants({ variant, size }),
        haptic && "relative",
        className,
      ),
      ...props,
      children: inner,
    },
  });
}

export { Button, buttonVariants };
