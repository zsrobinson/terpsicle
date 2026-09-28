import { noteToast } from "~/ui/toast";

/**
 * Puts `text` on the clipboard. A blocked clipboard says so and what to do,
 * and returns false; the caller says what was copied when it works.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    noteToast(
      "Couldn't copy: this browser blocked the clipboard. Allow it for this site and try again.",
      { id: "clipboard" },
    );
    return false;
  }
}
