import { useEffect, useRef, useSyncExternalStore } from "react";

// Haptics on iPhone, the one file that knows the trick (docs/decisions.md,
// "Haptics live in the kit"). Feature code never imports it: kit controls
// render <HapticTap /> inside themselves, and a `haptic` prop turns it on or
// off for one control. scripts/check-imports.ts holds that rule.
//
// Derived from `attachIOSOverlay` and `isIOS` in @haptics/core 2.1.0
// (https://github.com/howdoiusekeyboard/haptics), MIT License, Copyright (c)
// 2026 Howdoiusekeyboard. Rewritten as a component, iPhone only; the
// package's patterns, Android vibration and audio fallback are left out.
//
// How it works: Safari on iPhone plays the system tick when a finger toggles
// a native `<input type="checkbox" switch>`. Since iOS 26.5 only a trusted
// tap on the switch itself ticks: a script clicking a hidden switch no
// longer does (WebKit bug 309082). So an invisible switch covers the
// control, the finger lands on it, and its click is stopped and sent on to
// the control as a plain click, so the control's own `onClick` runs once.
//
// What can't tick: anything that isn't a tap. A drag and the snap that ends
// it, a long press, pull to refresh, a keyboard press, a timer or a finished
// fetch have no trusted tap on a switch, so don't try. One strength only:
// every tick is the system's switch tick. iPads have no Taptic Engine and
// Android isn't a target, so both get nothing, like a desktop. System
// Haptics off in Settings silences it, and the page can't tell.

/**
 * Whether taps can tick here: an iPhone (or iPod) running Safari's engine.
 * iPadOS says "Macintosh", so iPads are out; Android has `vibrate`.
 */
export function hapticTapSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPod/.test(navigator.userAgent) &&
    typeof navigator.vibrate !== "function" &&
    navigator.maxTouchPoints > 1
  );
}

const never = () => () => {};

/**
 * The invisible native switch that makes a tap on its parent tick, on
 * iPhone; nothing anywhere else (and nothing in the server's HTML, so
 * hydration matches). Render it as the last child of a tap-only control
 * that's `position: relative`, one per control: nesting two would tick
 * twice. Keyboard presses never reach it (`tabIndex -1`), and screen
 * readers never see it (`aria-hidden`).
 */
export function HapticTap() {
  const on = useSyncExternalStore(never, hapticTapSupported, () => false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (!on || !input) return;
    // Set here, not as a prop: React's types don't know `switch` yet.
    input.setAttribute("switch", "");
    const onClick = (event: MouseEvent) => {
      // The switch has toggled and ticked by now (its default action runs
      // regardless). Stopped natively, before React's root listener, so
      // React never sees this click; the control gets one of its own.
      event.stopPropagation();
      const host = input.parentElement;
      if (!host) return;
      // A tap would have focused the control, not the hidden switch.
      host.focus({ preventScroll: true });
      host.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    };
    input.addEventListener("click", onClick);
    return () => input.removeEventListener("click", onClick);
  }, [on]);
  if (!on) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      tabIndex={-1}
      aria-hidden="true"
      data-haptic-tap=""
      className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-auto border-0 p-0 opacity-0"
    />
  );
}
