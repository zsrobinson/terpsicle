import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import {
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useState,
} from "react";
import { HapticTap } from "./haptic";
import { WithTooltip } from "./tooltip";

// The phone sheet (docs/COHESION.md §1.5): what a desktop popover becomes
// on a phone, a Base UI Drawer from the bottom edge with a grabber, a
// keyline and the drawer's offset along its top, square like the rest of
// the Ink brand. A swipe down (a quick flick is enough), a tap above it or
// Esc closes it, and the page behind scales back (./sheet-indent.tsx). Its
// heading is the caller's, wrapped in `SheetTitle` so the sheet is named by
// it: `<PageHeader size="panel" title={<SheetTitle asChild><span>…`.
//
// Detents, as iOS names them: by default the sheet is as tall as what's in
// it (up to the screen, less the gap at the top). With
// `detents={["medium", "large"]}` it opens at half the screen, and a drag or
// a tap on the grabber takes it to full and back.
//
// Motion is the drawer docs': 450ms on cubic-bezier(.32,.72,0,1), and a
// release as quick as the fling. Reduce Motion: no slide and no scale-back,
// the sheet fades.

/** The sheet's name for assistive tech: wrap the visible heading in it. */
function SheetTitle({
  asChild,
  children,
  ...props
}: ComponentProps<typeof Drawer.Title> & {
  /** Names the sheet by the child element instead of an `<h2>` of its own. */
  asChild?: boolean;
}) {
  if (asChild && isValidElement<{ id?: string }>(children))
    // The child's own id, if it has one, is the one the sheet points at.
    return <Drawer.Title render={children} id={children.props.id} {...props} />;
  return <Drawer.Title {...props}>{children}</Drawer.Title>;
}

type Detent = "medium" | "large";

// Base UI's snap points: a fraction of the viewport. The large sheet is the
// screen less its top gap, so 1 lands it there (and marks `data-expanded`).
const SNAP: Record<Detent, number> = { medium: 0.5, large: 1 };

/** A field the software keyboard comes up for. */
function isTextEntry(el: EventTarget | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement)
    return !/^(button|checkbox|color|file|image|radio|range|reset|submit)$/.test(
      el.type,
    );
  return el instanceof HTMLElement && el.isContentEditable;
}

function Sheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  detents,
  children,
  className,
  onFocus,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the sheet has finished sliding in or away. */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Medium and large, or leave it out to fit what's in it. */
  detents?: readonly Detent[];
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<typeof Drawer.Popup>, "children" | "className">) {
  const steps = detents && detents.length > 1 ? detents : null;
  const first = steps ? SNAP[steps[0] ?? "medium"] : null;
  const [snap, setSnap] = useState<number | string | null>(first);
  // Every opening starts at the first detent, wherever the last one ended.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSnap(first);
  }
  const large = snap === SNAP.large;
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
      {...(steps
        ? {
            snapPoints: steps.map((d) => SNAP[d]),
            snapPoint: snap,
            onSnapPointChange: setSnap,
          }
        : {})}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop
            className={cn(
              "fixed inset-0 z-40 min-h-dvh bg-fg/20",
              // Fades as the sheet is dragged away. With detents, Base UI's
              // progress runs from large to medium (the undimmed detent of
              // Maps), but a modal sheet dims the page at both, as iOS does.
              !steps && "opacity-[calc(1-var(--drawer-swipe-progress,0))]",
              "transition-opacity duration-450 ease-sheet data-swiping:duration-0",
              "data-ending-style:opacity-0 data-starting-style:opacity-0",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]",
              // iOS 26 draws the page under Safari's bars; an absolute
              // backdrop reaches under them where a fixed one stops short.
              "supports-[-webkit-touch-callout:none]:absolute",
              "motion-reduce:transition-opacity! motion-reduce:duration-200!",
            )}
          />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
            <Drawer.Popup
              data-slot="sheet"
              data-detent={steps ? (large ? "large" : "medium") : undefined}
              {...props}
              onFocus={(event) => {
                onFocus?.(event);
                // The keyboard would cover half a medium sheet: a field
                // taking focus takes the sheet to large first.
                if (steps && !large && isTextEntry(event.target))
                  setSnap(SNAP.large);
              }}
              className={cn(
                "relative flex w-full flex-col border-keyline border-t bg-bg text-fg shadow-drawer outline-none",
                "[--sheet-gap:calc(max(env(safe-area-inset-top,0px),1.25rem)+0.5rem)]",
                steps
                  ? "h-[calc(100dvh-var(--sheet-gap))]"
                  : "max-h-[calc(100dvh-var(--sheet-gap))]",
                // Under the finger, then back on the sheet's curve.
                "[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]",
                "transition-transform duration-450 ease-sheet data-swiping:select-none",
                "data-starting-style:[transform:translateY(calc(100%+2px))] data-ending-style:[transform:translateY(calc(100%+2px))]",
                "data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]",
                // What's below the screen's edge at medium becomes padding, so
                // the list inside ends where the screen does and scrolls to
                // its last row; then the home indicator's inset and the
                // keyboard's.
                steps
                  ? "pb-[calc(max(0px,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))+env(safe-area-inset-bottom,0px)+var(--drawer-keyboard-inset,0px))]"
                  : "pb-[calc(env(safe-area-inset-bottom,0px)+var(--drawer-keyboard-inset,0px))]",
                // Paper under the sheet when a drag lifts it past the top.
                "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-bg",
                // Reduce Motion: it fades in and out where it rests.
                "motion-reduce:data-starting-style:[transform:translateY(var(--drawer-snap-point-offset,0px))] motion-reduce:data-starting-style:opacity-0",
                "motion-reduce:data-ending-style:opacity-0",
                "motion-reduce:transition-opacity! motion-reduce:duration-200!",
                className,
              )}
            >
              <Grabber
                steps={steps !== null}
                large={large}
                onStep={() => setSnap(large ? first : SNAP.large)}
              />
              <Drawer.Content className="flex min-h-0 flex-1 flex-col">
                {children}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

/**
 * The bar at the top. On a sheet with detents it's a button too: a tap steps
 * medium ↔ large (a drag anywhere on the sheet does the same). On one that
 * fits its content it's only a sign that the sheet drags.
 */
function Grabber({
  steps,
  large,
  onStep,
}: {
  steps: boolean;
  large: boolean;
  onStep: () => void;
}) {
  const bar = (
    <span className="h-1 w-9 shrink-0 rounded-full bg-hairline-strong" />
  );
  if (!steps)
    return (
      <div
        aria-hidden="true"
        className="flex h-4 shrink-0 items-center justify-center pt-1"
      >
        {bar}
      </div>
    );
  const label = large ? "Lower the sheet" : "Raise the sheet";
  return (
    <WithTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        data-slot="sheet-grabber"
        onClick={onStep}
        className="relative mx-auto flex h-6 w-16 shrink-0 items-center justify-center rounded-full"
      >
        {bar}
        {/* A tap that steps a detent ticks; the drag that ends on one can't. */}
        <HapticTap />
      </button>
    </WithTooltip>
  );
}

export { Sheet, SheetTitle };
