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
// same way (e2e/tooltips.spec.ts). Only for what `/` carries up front (the
// marketing page, and the router's fallbacks for when a chunk doesn't
// arrive): a tooltip is the only popup there, and its code (the positioning,
// the hover and focus logic) is too big for a page whose first load is its
// search ranking (docs/BUILD.md §5). A finger never opens one, so on a phone
// the controls stay as they are (the code still arrives later, with the
// demos and the toasts, which use it too). Every other page carries the kit
// up front and uses `WithTooltip`.
//
// Wrapping a control in its tooltip makes the control anew, so the swap
// waits until no key or pointer is held (a press that started on the old
// control ends on it) and no text is selected across a control, and gives
// focus back to the control that had it, only when focus was lost. The first
// hover after the code arrives may need one more move of the mouse; a
// person's mouse keeps moving, so they don't notice.

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
  if (event instanceof KeyboardEvent) {
    // A Mac sends no keyup for keys pressed while Cmd is down (Cmd+C leaves
    // C "held"), so letting go of Cmd lets go of them all.
    if (event.key === "Meta") keysHeld.clear();
    else keysHeld.delete(event.code);
  } else pointerHeld = false;
  // After the click this release makes, which comes next in the same task.
  trySwapSoon();
}

/** The window lost focus or the tab was hidden: no key or press can end here. */
function onLetGo(): void {
  pointerHeld = false;
  keysHeld.clear();
  trySwapSoon();
}

function onVisibility(): void {
  if (document.visibilityState === "hidden") onLetGo();
}

function trySwapSoon(): void {
  if (loaded && !held()) setTimeout(swap, 0);
}

/** Text is selected across a control: remaking it would lose the selection. */
function selecting(): boolean {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return false;
  return [...document.querySelectorAll(TRIGGERS)].some((el) =>
    selection.containsNode(el, true),
  );
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
  ["selectionchange", trySwapSoon],
  ["visibilitychange", onVisibility],
] as const;

function listen(): void {
  if (listening || kit) return;
  listening = true;
  for (const [type, listener] of LISTENERS)
    document.addEventListener(type, listener, OPTIONS);
  window.addEventListener("blur", onLetGo);
}

function stopListening(): void {
  listening = false;
  for (const [type, listener] of LISTENERS)
    document.removeEventListener(type, listener, OPTIONS);
  window.removeEventListener("blur", onLetGo);
}

function load(): void {
  if (loading) return;
  loading = true;
  import("~/ui/tooltip").then(
    (m) => {
      loaded = m;
      swap();
    },
    // Offline, or a deploy removed the chunk: the next use tries again.
    () => {
      loading = false;
    },
  );
}

function swap(): void {
  if (kit || !loaded || held() || selecting()) return;
  stopListening();
  const before = [...document.querySelectorAll(TRIGGERS)];
  const active = document.activeElement;
  const focused = active ? before.indexOf(active) : -1;
  flushSync(() => {
    kit = loaded;
    for (const subscriber of subscribers) subscriber();
  });
  // The triggers are in the same order before and after. Focus goes back
  // only if it was lost with the old control: moving it again would have a
  // screen reader say the control twice.
  const lost =
    document.activeElement === null || document.activeElement === document.body;
  if (focused >= 0 && !before[focused]?.isConnected && lost)
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
