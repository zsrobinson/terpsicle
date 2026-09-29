import {
  type ComponentProps,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import type { WithTooltip } from "~/ui/tooltip";

// The kit's tooltip (`WithTooltip`), with its code loaded once someone could
// see one: the first move of a mouse or pen, key press or focus on the page.
// Until then each control renders as it would inside the tooltip, marked the
// same way (e2e/tooltips.spec.ts). Only for the marketing page: a tooltip
// is the only popup there, and its code (the positioning, the hover and
// focus logic) is too big for a page whose first load is its search ranking
// (docs/BUILD.md §5). A finger never opens one, so on a phone the controls
// stay as they are (the code still arrives later, with the demos and the
// toasts, which use it too). Every other page carries the kit up front and
// uses `WithTooltip`.
//
// Wrapping a control in its tooltip makes the control anew, so the swap
// waits until no key or pointer is held (a press that started on the old
// control ends on it), and gives focus back to the control that had it. The
// first hover after the code arrives may need one more move of the mouse;
// a person's mouse keeps moving, so they don't notice.

type Kit = typeof import("~/ui/tooltip");

let kit: Kit | null = null;
let loaded: Kit | null = null;
let loading = false;
let listening = false;
let pointerHeld = false;
const keysHeld = new Set<string>();
const subscribers = new Set<() => void>();

/** How `WithTooltip` marks its trigger, and so how this finds them. */
const TRIGGERS = "[data-tooltip]";
const MARKED: Record<string, string> = { "data-tooltip": "" };
const OPTIONS = { capture: true, passive: true } as const;

const held = () => pointerHeld || keysHeld.size > 0;

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function onFirstUse(event: Event): void {
  // A finger's touch never opens a tooltip.
  if (event instanceof PointerEvent && event.pointerType === "touch") return;
  load();
}

function onPointerDown(): void {
  pointerHeld = true;
}

function onKeyDown(event: Event): void {
  if (event instanceof KeyboardEvent) keysHeld.add(event.code);
}

function onRelease(event: Event): void {
  if (event instanceof KeyboardEvent) keysHeld.delete(event.code);
  else pointerHeld = false;
  // After the click this release makes, which comes next in the same task.
  if (loaded && !held()) setTimeout(swap, 0);
}

function onBlur(): void {
  pointerHeld = false;
  keysHeld.clear();
  if (loaded) setTimeout(swap, 0);
}

const LISTENERS = [
  ["pointermove", onFirstUse],
  ["keydown", onFirstUse],
  ["focusin", onFirstUse],
  ["pointerdown", onPointerDown],
  ["keydown", onKeyDown],
  ["pointerup", onRelease],
  ["pointercancel", onRelease],
  ["keyup", onRelease],
] as const;

function listen(): void {
  if (listening || kit) return;
  listening = true;
  for (const [type, listener] of LISTENERS)
    document.addEventListener(type, listener, OPTIONS);
  window.addEventListener("blur", onBlur);
}

function stopListening(): void {
  listening = false;
  for (const [type, listener] of LISTENERS)
    document.removeEventListener(type, listener, OPTIONS);
  window.removeEventListener("blur", onBlur);
}

function load(): void {
  if (loading) return;
  loading = true;
  import("~/ui/tooltip").then(
    (m) => {
      loaded = m;
      if (!held()) swap();
    },
    // Offline, or a deploy removed the chunk: the next use tries again.
    () => {
      loading = false;
    },
  );
}

function swap(): void {
  if (kit || !loaded || held()) return;
  stopListening();
  const before = [...document.querySelectorAll(TRIGGERS)];
  const active = document.activeElement;
  const focused = active ? before.indexOf(active) : -1;
  flushSync(() => {
    kit = loaded;
    for (const subscriber of subscribers) subscriber();
  });
  // The triggers are in the same order before and after.
  if (focused >= 0 && !before[focused]?.isConnected)
    document
      .querySelectorAll<HTMLElement>(TRIGGERS)
      [focused]?.focus({ preventScroll: true });
}

/** `WithTooltip`, loaded on first use (above). */
export function LazyTooltip({
  label,
  side,
  children,
}: {
  label: ReactNode;
  side?: ComponentProps<typeof WithTooltip>["side"];
  children: ReactElement;
}) {
  const Kit = useSyncExternalStore(
    subscribe,
    () => kit,
    () => null,
  );
  useEffect(listen, []);
  if (Kit)
    return (
      <Kit.WithTooltip label={label} side={side}>
        {children}
      </Kit.WithTooltip>
    );
  return cloneElement(children, MARKED);
}
