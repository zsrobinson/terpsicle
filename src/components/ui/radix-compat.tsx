import {
  type CSSProperties,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useState,
} from "react";

// RADIX COMPAT: remove in the final sweep of the Base UI move.
//
// The kit's popups run on Base UI, but keep the props and attributes their
// callers wrote for Radix, so product code didn't change in the same PR.
// Each piece here maps one Radix habit onto Base UI; the sweep moves the
// callers to Base UI's own words and deletes this file:
//
//   asChild                 →  render={<child />}
//   data-state on triggers  →  data-popup-open
//   onSelect                →  onClick (preventBaseUIHandler keeps it open)
//   onOpenAutoFocus         →  initialFocus
//   onCloseAutoFocus        →  finalFocus
//   onInteractOutside       →  onOpenChange's reason "outside-press"
//   Radix's wrapper and CSS variable names (below)

/** Radix's `asChild`: the one child element is what renders. */
export type AsChild = { asChild?: boolean; children?: ReactNode };

/**
 * Radix's `asChild` as Base UI's `render`: with it, the child element is
 * rendered with the part's props merged in; without it, the part renders
 * its own element around `children`.
 */
export function asChildRender(
  asChild: boolean | undefined,
  children: ReactNode,
): { render?: ReactElement<Record<string, unknown>>; children?: ReactNode } {
  if (asChild && isValidElement<Record<string, unknown>>(children))
    return { render: children };
  return { children };
}

/**
 * Radix put `data-state="open"` or `"closed"` on a popup's trigger, and
 * callers style on it (`data-[state=open]:bg-hover`). Base UI marks an open
 * trigger with `data-popup-open`, but a tooltip around the same trigger sets
 * that too, so the kit keeps its own attribute, from the root's open state.
 */
export function triggerState(open: boolean): { "data-state": string } {
  return { "data-state": open ? "open" : "closed" };
}

/**
 * The root's open state, for `triggerState`, whether the caller controls it
 * or not. Base UI stays in charge: this only watches.
 */
export function useWatchedOpen<Details extends { isCanceled: boolean }>(
  open: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean, details: Details) => void) | undefined,
): [boolean, (open: boolean, details: Details) => void] {
  const [watched, setWatched] = useState(defaultOpen ?? false);
  const handle = useCallback(
    (next: boolean, details: Details) => {
      onOpenChange?.(next, details);
      if (!details.isCanceled) setWatched(next);
    },
    [onOpenChange],
  );
  return [open ?? watched, handle];
}

/**
 * On every Positioner: the attribute Radix's floating wrapper carried, which
 * e2e's axe scan and Todo's composer look for, and Radix's name for the
 * space left below a popover.
 */
export const radixPositionerProps = {
  "data-radix-popper-content-wrapper": "",
  style: {
    "--radix-popover-content-available-height": "var(--available-height)",
  } as CSSProperties,
} as const;

/** A Radix-style event a handler can cancel with `preventDefault()`. */
export type CompatEvent = {
  readonly target: EventTarget | null;
  readonly currentTarget: HTMLElement | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
};

/** Calls a Radix-style handler; true when it called `preventDefault()`. */
export function prevented(
  handler: ((event: CompatEvent) => void) | undefined,
  currentTarget: HTMLElement | null,
  target: EventTarget | null = currentTarget,
): boolean {
  if (!handler) return false;
  let defaultPrevented = false;
  handler({
    target,
    currentTarget,
    get defaultPrevented() {
      return defaultPrevented;
    },
    preventDefault() {
      defaultPrevented = true;
    },
  });
  return defaultPrevented;
}

/**
 * Radix's `onOpenAutoFocus` or `onCloseAutoFocus` as Base UI's
 * `initialFocus` or `finalFocus`: `before` runs first (the kit quiets
 * tooltips there), and a handler that prevents the default has moved focus
 * itself, so Base UI leaves it alone.
 */
export function focusProp(
  handler: ((event: CompatEvent) => void) | undefined,
  popup: RefObject<HTMLElement | null>,
  before?: () => void,
): () => boolean {
  return () => {
    before?.();
    return !prevented(handler, popup.current);
  };
}

/**
 * `focusProp` for `finalFocus`, which Base UI calls once the closing
 * animation ends: if focus has gone on to something else meanwhile (the
 * next field, pressed while the list faded), it stays there, as it did on
 * Radix after a press outside. Otherwise focus goes back to the trigger.
 */
export function returnFocusProp(
  handler: ((event: CompatEvent) => void) | undefined,
  popup: RefObject<HTMLElement | null>,
  before?: () => void,
): () => boolean {
  const closing = focusProp(handler, popup, before);
  return () => {
    const active = document.activeElement;
    const movedOn =
      active instanceof HTMLElement &&
      active !== document.body &&
      !popup.current?.contains(active);
    if (movedOn) {
      before?.();
      return false;
    }
    return closing();
  };
}

/** What a Base UI item's click handler gets, as far as `onSelect` needs. */
type ItemClick = {
  readonly currentTarget: HTMLElement;
  readonly target: EventTarget;
  preventBaseUIHandler(): void;
};

/**
 * Radix's `onSelect` on a menu item as Base UI's `onClick` (Base UI turns
 * Enter and Space into a click too). A handler that prevents it keeps the
 * menu open, as it did on Radix.
 */
export function selectAsClick<E extends ItemClick>(
  onSelect: ((event: CompatEvent) => void) | undefined,
  onClick: ((event: E) => void) | undefined,
): ((event: E) => void) | undefined {
  if (!onSelect) return onClick;
  return (event) => {
    onClick?.(event);
    if (prevented(onSelect, event.currentTarget, event.target))
      event.preventBaseUIHandler();
  };
}
