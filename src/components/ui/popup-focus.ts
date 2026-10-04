import type { Popover } from "@base-ui/react/popover";
import type { RefObject } from "react";
import { quietTooltips } from "./tooltip";

// Where focus goes as a kit popup opens and closes: Base UI's own
// `initialFocus` and `finalFocus`, which callers pass as Base UI documents
// them, wrapped so tooltips stay quiet while focus moves. A tooltip opening
// on that focus would sit over what the person was looking at and take the
// first Esc.

/** Base UI's `initialFocus` or `finalFocus`: every popup takes the same. */
export type FocusTarget = Popover.Popup.Props["finalFocus"];

type FocusFn = Extract<NonNullable<FocusTarget>, (...args: never[]) => unknown>;
type InteractionType = Parameters<FocusFn>[0];
type Resolved = ReturnType<FocusFn>;

/** What Base UI would make of `target`; nothing given is its default. */
function resolve(target: FocusTarget, type: InteractionType): Resolved {
  if (target === undefined) return true;
  if (typeof target === "boolean") return target;
  if (typeof target === "function") return target(type);
  return target.current;
}

/** `target`, quieting tooltips first. */
export function focusQuietly(
  target: FocusTarget,
): (type: InteractionType) => Resolved {
  return (type) => {
    quietTooltips();
    return resolve(target, type);
  };
}

/**
 * `finalFocus` for a popup that hands focus back, which Base UI asks once
 * the closing animation ends: if focus has gone on to something else
 * meanwhile (the next field, pressed while a select's list faded), it stays
 * there. Otherwise it goes to `target`, or back to the trigger.
 */
export function focusBackQuietly(
  target: FocusTarget,
  popup: RefObject<HTMLElement | null>,
): (type: InteractionType) => Resolved {
  return (type) => {
    const active = document.activeElement;
    const movedOn =
      active instanceof HTMLElement &&
      active !== document.body &&
      !popup.current?.contains(active);
    quietTooltips();
    if (movedOn) return false;
    return resolve(target, type);
  };
}
