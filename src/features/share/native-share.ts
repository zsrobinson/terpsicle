// Share through the system's share sheet (Messages, AirDrop, Mail…) where
// a phone or tablet has one, instead of our popover and "Copy link". A
// desktop keeps the popover: its share menus (macOS, Windows) are a detour
// from copying a link, and the popover shows what the link holds.

/** A finger, not a mouse: phones and tablets. */
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/** Whether `url` should go to the system's share sheet here. */
export function prefersShareSheet(url: string): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  if (!window.matchMedia(TOUCH_QUERY).matches) return false;
  return navigator.canShare ? navigator.canShare({ url }) : true;
}

export type ShareSheetResult = "shared" | "dismissed" | "failed";

/**
 * Opens the share sheet. Must run in the press's own event (the browser
 * allows it only there). "dismissed": the person closed the sheet; "failed":
 * the browser refused, so the caller shows the popover instead.
 */
export async function openShareSheet(url: string): Promise<ShareSheetResult> {
  try {
    await navigator.share({ url });
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? "dismissed"
      : "failed";
  }
}
