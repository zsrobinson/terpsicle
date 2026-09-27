import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Drawer } from "vaul";
import type { DrawerSnap } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { PEEK_HEIGHT, snapHeights, TOP_BAR_HEIGHT } from "../drawer-heights";

// A workbench on a phone (SPEC §2): the same sidebar, in a bottom drawer
// that rests at peek, half or full height, with the rail as its strip of
// tabs. No bespoke mobile screens, so a product's views only have to work
// in the sidebar. This file loads only on phones (vaul is its own chunk);
// each product wraps it with its tabs and what moves the drawer.

function useViewportHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerHeight,
    () => 800,
  );
}

/**
 * How much of the screen's bottom the on-screen keyboard covers. Phones
 * shrink the visual viewport for it and leave the layout (`innerHeight`,
 * `dvh`) alone, so the drawer, sized to the layout, runs on under it.
 * Small differences are the browser's toolbars, not a keyboard.
 */
function useKeyboardInset(): number {
  return useSyncExternalStore(
    (onChange) => {
      const vv = window.visualViewport;
      vv?.addEventListener("resize", onChange);
      vv?.addEventListener("scroll", onChange);
      return () => {
        vv?.removeEventListener("resize", onChange);
        vv?.removeEventListener("scroll", onChange);
      };
    },
    () => {
      const vv = window.visualViewport;
      if (!vv) return 0;
      const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      return inset > 80 ? inset : 0;
    },
    () => 0,
  );
}

/** Fields that bring up the on-screen keyboard. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isTextEntry(el: EventTarget | null): boolean {
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return (
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/**
 * Puts the drawer at full now, skipping vaul's half-second slide, then
 * records the snap. Reading the layout commits the jump before vaul sets its
 * transition, so vaul's own move to the same place has nothing to animate.
 * The transform is vaul's for a snap point `innerHeight - TOP_BAR_HEIGHT`
 * tall: its offset from the top.
 */
function raiseAtOnce(
  inside: HTMLElement,
  snap: DrawerSnap,
  setSnap: (snap: DrawerSnap) => void,
) {
  if (snap === "full") return;
  const drawer = inside.closest<HTMLElement>("[data-vaul-drawer]");
  if (drawer) {
    drawer.style.transition = "none";
    drawer.style.transform = `translate3d(0, ${TOP_BAR_HEIGHT}px, 0)`;
    drawer.getBoundingClientRect();
  }
  setSnap("full");
}

export function WorkbenchDrawer({
  snap,
  getSnap,
  onSnap: setSnap,
  title,
  tabs,
  children,
}: {
  snap: DrawerSnap;
  /** The snap now, for events between renders. */
  getSnap: () => DrawerSnap;
  onSnap: (snap: DrawerSnap) => void;
  /** The drawer's name for a screen reader ("Sidebar"). */
  title: string;
  /** The rail's views, as a `DrawerTabs` strip. */
  tabs: ReactNode;
  /** The sidebar's content. */
  children: ReactNode;
}) {
  const viewport = useViewportHeight();
  const heights = snapHeights(viewport);
  const keyboard = useKeyboardInset();
  usePageStaysPut();
  const points = [
    `${heights.peek}px`,
    `${heights.half}px`,
    `${heights.full}px`,
  ];
  const snapOf = (point: string | number | null): DrawerSnap =>
    point === points[2] ? "full" : point === points[1] ? "half" : "peek";

  // At peek only the panel's header shows: typing in a search box there put
  // the results below the screen's edge. Anything focused inside raises a
  // resting drawer. A field a finger taps goes all the way up at once, with
  // no slide: the keyboard is coming, and phones pan the page to bring a
  // field the keyboard would cover into view, measuring where it is when
  // the keyboard opens. Mid-slide, that was still low on the screen; the
  // drawer then carried the field up and out of the panned view, so what
  // was typed couldn't be seen (docs/MOBILE-TESTING.md, keyboard-at-half).
  const raiseOnFocus = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const raise = (event: FocusEvent) => {
        if (
          isTextEntry(event.target) &&
          matchMedia("(pointer: coarse)").matches
        )
          raiseAtOnce(el, getSnap(), setSnap);
        else if (getSnap() === "peek") setSnap("half");
      };
      // A tap on a field: raise first, then focus. iOS Safari measures the
      // field for the keyboard as it takes focus, before focusin, so raised
      // there it still panned the page to the field's old place for a
      // moment. Cancelling the tap's end keeps the browser from focusing
      // it; focusing it here, in the tap, still brings up the keyboard.
      let tap: { field: HTMLElement; x: number; y: number } | null = null;
      const touchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        tap =
          touch &&
          event.touches.length === 1 &&
          isTextEntry(event.target) &&
          event.target instanceof HTMLElement &&
          event.target !== document.activeElement &&
          getSnap() !== "full"
            ? { field: event.target, x: touch.clientX, y: touch.clientY }
            : null;
      };
      const touchEnd = (event: TouchEvent) => {
        const start = tap;
        tap = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || !event.cancelable) return;
        // A drag that started on the field isn't a tap.
        if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10)
          return;
        event.preventDefault();
        raiseAtOnce(el, getSnap(), setSnap);
        start.field.focus({ preventScroll: true });
      };
      el.addEventListener("focusin", raise);
      el.addEventListener("touchstart", touchStart, { passive: true });
      el.addEventListener("touchend", touchEnd, { passive: false });
      return () => {
        el.removeEventListener("focusin", raise);
        el.removeEventListener("touchstart", touchStart);
        el.removeEventListener("touchend", touchEnd);
      };
    },
    [getSnap, setSnap],
  );

  // Typing with the keyboard up: at half, the keyboard covered all but the
  // drawer's header, so what was typed (search results) had nowhere to show.
  // Raise it all the way, as a phone's own search sheets do; it stays there
  // when the keyboard goes, with the results now the screen.
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    if (
      keyboard > 0 &&
      isTextEntry(focused) &&
      content.current?.contains(focused)
    )
      raiseAtOnce(content.current, getSnap(), setSnap);
  }, [keyboard, getSnap, setSnap]);

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={points}
      // vaul takes a drag down from the point just below `fadeFromIndex`
      // (by default, half) as fading its overlay out, and when the drawer
      // can't be dismissed it then doesn't follow the finger at all, only
      // snapping once it lifts. There's no overlay (the drawer isn't modal),
      // so start the fade at the first point and every drag follows.
      fadeFromIndex={0}
      // vaul's own keyboard handling resizes and lifts the drawer by the
      // keyboard plus the snap's offset, which squeezed ours (full height,
      // slid down) to its header. We size the inside to the keyboard instead.
      repositionInputs={false}
      activeSnapPoint={points[["peek", "half", "full"].indexOf(snap)] ?? null}
      setActiveSnapPoint={(point) => setSnap(snapOf(point))}
    >
      <Drawer.Portal>
        <Drawer.Content
          ref={claimPullDown}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          data-snap={snap}
          // vaul makes the drawer `touch-action: none` so a finger drags it
          // rather than panning the page. That also stopped a pinch zooming
          // the page over it; allow that back. (Safari may not know the
          // value and keep `none`.)
          style={{ touchAction: "pinch-zoom" }}
          className="fixed inset-x-0 bottom-0 z-40 flex h-dvh flex-col border-keyline border-t bg-bg shadow-drawer outline-none"
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div
            ref={content}
            className="flex flex-col"
            // The drawer is full height and slides down; size the inside to
            // what's showing so its scroll area ends at the screen's edge, or
            // at the keyboard's when it's up. Never less than the header.
            style={{
              height: Math.max(
                heights[snap] - keyboard,
                Math.min(heights[snap], PEEK_HEIGHT),
              ),
            }}
          >
            <Grabber snap={snap} onSnap={setSnap} />
            {tabs}
            <div ref={raiseOnFocus} className="flex min-h-0 flex-1 flex-col">
              {children}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * A finger pulling down on a list that's already at its top lowers the
 * drawer, as a mouse drag does. Left to the browser, that pull is a scroll:
 * it cancels vaul's pointer, so the drawer stays put, and with nothing left
 * to scroll it ran on into the page and pulled it to refresh. Cancelling the
 * drag's first move keeps it with the drawer; after that the browser keeps
 * whatever it was given. A drag up, a list scrolled down, a mostly sideways
 * drag and a second finger (pinch-zoom) all stay the browser's.
 *
 * The other way round: a finger on a list that's scrolled down is the
 * list's, but vaul drags any drawer that isn't at its very top (ours never
 * is: full sits under the top bar). On Android the drawer took the first
 * few moves, the browser then took the scroll, and vaul read the cancel as
 * a release: a quick flick down, so scrolling a long list back up dropped
 * the drawer to half or peek. `data-vaul-no-drag` on the scrolled list,
 * for that gesture, is vaul's own way to leave a pointer alone.
 */
function claimPullDown(drawer: HTMLDivElement | null) {
  if (!drawer) return;
  let start: { x: number; y: number } | null = null;
  let claimed: boolean | null = null;
  let scrolled: Element | null = null;
  const onDown = (event: PointerEvent) => {
    release();
    if (event.pointerType === "mouse") return;
    scrolled = scrolledAncestor(event.target, drawer);
    scrolled?.setAttribute("data-vaul-no-drag", "");
  };
  const release = () => {
    scrolled?.removeAttribute("data-vaul-no-drag");
    scrolled = null;
  };
  // vaul takes the pointerout that follows a cancel for a release too, so
  // the mark stays through a cancelled gesture (until the next finger comes
  // down) and through a lifted one until vaul has seen the pointerup.
  const onUp = () => setTimeout(release, 0);
  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    start =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
    claimed = null;
  };
  const onMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!start || event.touches.length !== 1 || !touch) {
      start = null;
      return;
    }
    if (claimed === null) {
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      if (dy === 0 && dx === 0) return;
      claimed = dy > Math.abs(dx) && pullsDrawer(event.target, drawer);
    }
    if (claimed && event.cancelable) event.preventDefault();
  };
  // Capture: marked before vaul (React, at the root) sees the pointer.
  drawer.addEventListener("pointerdown", onDown, true);
  drawer.addEventListener("pointerup", onUp, true);
  // Non-passive: only a cancelled touchmove keeps the browser from scrolling.
  drawer.addEventListener("touchstart", onStart, { passive: true });
  drawer.addEventListener("touchmove", onMove, { passive: false });
  return () => {
    release();
    drawer.removeEventListener("pointerdown", onDown, true);
    drawer.removeEventListener("pointerup", onUp, true);
    drawer.removeEventListener("touchstart", onStart);
    drawer.removeEventListener("touchmove", onMove);
  };
}

/** The nearest scroller under `target`, inside the drawer, that's scrolled down. */
function scrolledAncestor(
  target: EventTarget | null,
  drawer: HTMLElement,
): Element | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== drawer) {
    if (el.scrollTop > 0) return el;
    el = el.parentElement;
  }
  return null;
}

/** vaul's own rule: a pull drags the drawer unless something is scrolled. */
function pullsDrawer(target: EventTarget | null, drawer: HTMLElement): boolean {
  if (!(target instanceof Element) || target.closest("[data-vaul-no-drag]"))
    return false;
  return scrolledAncestor(target, drawer) === null;
}

const NEXT_SNAP: Record<DrawerSnap, DrawerSnap> = {
  peek: "half",
  half: "full",
  full: "peek",
};

/**
 * The bar at the top: drag the drawer anywhere to resize it, or tap this to
 * step peek → half → full. A real button (vaul's handle isn't focusable).
 */
function Grabber({
  snap,
  onSnap,
}: {
  snap: DrawerSnap;
  onSnap: (snap: DrawerSnap) => void;
}) {
  const next = NEXT_SNAP[snap];
  return (
    <WithTooltip
      label={next === "peek" ? "Lower the panel" : "Raise the panel"}
    >
      <button
        type="button"
        aria-label={next === "peek" ? "Lower the panel" : "Raise the panel"}
        onClick={() => onSnap(next)}
        className="mx-auto flex h-6 w-16 shrink-0 items-center justify-center rounded-full"
      >
        <span className="h-1 w-8 rounded-full bg-hairline-strong" />
      </button>
    </WithTooltip>
  );
}

/**
 * The app fills the screen and never scrolls as a page (styles.css), but
 * iOS Safari scrolls it anyway to bring a focused field above the keyboard,
 * measuring where the field was when it was tapped. A field tapped low in
 * the drawer then rose with it to the top, and the scroll carried it (and
 * the drawer's header) off the top of the screen: "you're no longer able to
 * see where you're typing" (the mobile lab's keyboard-at-half on iOS). The
 * drawer has already put the field where the keyboard can't cover it, so
 * any scroll of the page is undone.
 */
function usePageStaysPut() {
  useEffect(() => {
    const undo = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
    addEventListener("scroll", undo);
    return () => removeEventListener("scroll", undo);
  }, []);
}

/** The rail, as the drawer's strip of tabs. */
export function DrawerTabs({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className="flex shrink-0 justify-around border-hairline border-b px-1 pb-1"
    >
      {children}
    </nav>
  );
}

export function DrawerTab({
  icon: Icon,
  label,
  shortcut,
  selected,
  onClick,
  onPreload,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  selected: boolean;
  onClick: () => void;
  /** A touch fires pointerdown well before the tap's click: load the view's code then. */
  onPreload?: () => void;
  badge?: ReactNode;
}) {
  return (
    <WithTooltip label={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        onPointerDown={onPreload}
        onFocus={onPreload}
        className={cn(
          "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
          // The kit's one selected fill, as on the rail: no ring or shadow.
          selected
            ? "bg-accent-soft text-fg"
            : "text-muted hover:bg-hover/50 hover:text-fg",
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="max-w-full truncate font-medium text-2xs leading-none">
          {label}
        </span>
        {badge}
      </button>
    </WithTooltip>
  );
}
