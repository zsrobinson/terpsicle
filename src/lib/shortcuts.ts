import { useEffect, useRef } from "react";

// The keyboard layer (SPEC §3.13): `/` search, `1`–`7` tabs, `Esc` back,
// `⌘Z`/`⇧⌘Z` undo/redo, and `↑`/`↓`/`↵` reserved for previewing sections on
// the calendar. Shortcuts never fire while someone is typing.
//
// Each `useShortcut` adds its own listener. A handler that acts calls
// `event.preventDefault()`, and later listeners skip handled events; effects
// run child-first, so a feature's handler (say, Esc to leave a preview) gets
// the key before the shell's.

/** True when the key belongs to a text field, not to us. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
    return true;
  if (target instanceof HTMLInputElement) {
    // Checkboxes and buttons don't take text.
    return ![
      "checkbox",
      "radio",
      "button",
      "submit",
      "reset",
      "range",
      "color",
    ].includes(target.type);
  }
  return false;
}

/** ⌘ on Apple platforms, Ctrl elsewhere. */
export const isApple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** How a shortcut reads in a tooltip: "⌘Z" on a Mac, "Ctrl+Z" elsewhere. */
export function modKey(key: string, { shift = false } = {}): string {
  return isApple
    ? `${shift ? "⇧" : ""}⌘${key}`
    : `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

export interface Chord {
  /** `KeyboardEvent.key`, compared case-insensitively for letters. */
  key: string;
  /** ⌘ on Apple, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  /** Also fire while typing (e.g. Esc). Default false. */
  whileTyping?: boolean;
}

export function matches(event: KeyboardEvent, chord: Chord): boolean {
  if (event.key.toLowerCase() !== chord.key.toLowerCase()) return false;
  const mod = isApple ? event.metaKey : event.ctrlKey;
  const otherMod = isApple ? event.ctrlKey : event.metaKey;
  if (Boolean(chord.mod) !== mod || otherMod || event.altKey) return false;
  // Shift is implied by some keys ("/" on some layouts); only check it when asked.
  if (chord.shift !== undefined && chord.shift !== event.shiftKey) return false;
  if (chord.mod && chord.shift === undefined && event.shiftKey) return false;
  return true;
}

/** Handlers return true when they acted, so the key stops there. */
export type ShortcutHandler = (event: KeyboardEvent) => boolean | undefined;

export function useShortcut(
  chords: Chord | readonly Chord[],
  handler: ShortcutHandler,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const list = Array.isArray(chords) ? chords : [chords];
  const signature = JSON.stringify(list);

  useEffect(() => {
    if (!enabled) return;
    const parsed = JSON.parse(signature) as Chord[];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const chord = parsed.find((c) => matches(event, c));
      if (!chord) return;
      if (!chord.whileTyping && isTypingTarget(event.target)) return;
      if (handlerRef.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [signature, enabled]);
}
