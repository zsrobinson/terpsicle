import { Drawer } from "@base-ui/react/drawer";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { DrawerSnap } from "~/core/schema";
import { PEEK_HEIGHT, snapHeights } from "~/lib/drawer-heights";
import { WithTooltip } from "~/ui/tooltip";

// A workbench on a phone (SPEC §2): the same sidebar, in a bottom drawer
// that rests at peek, half or full height, with the rail as its strip of
// tabs. No bespoke mobile screens, so a product's views only have to work
// in the sidebar. This file loads only on phones (Base UI's Drawer comes
// with it, in its own chunk); each product wraps it with its tabs and what
// moves the drawer.
//
// It's Base UI's Drawer, as the kit's Sheet is (~/ui/sheet), but never
// modal and never closed: it's part of the page. So it lives in the page,
// inside the sheet indent (~/ui/sheet-indent), and scales back with the
// page when a sheet opens over it; and it has a Drawer.Provider of its own,
// so that being always open doesn't hold the page scaled back.

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
 * Whether the on-screen keyboard is up. Phones shrink the visual viewport
 * for it and leave the layout (`innerHeight`) alone. Small differences are
 * the browser's toolbars, not a keyboard. (How much it covers is Base UI's
 * `--drawer-keyboard-inset`, from `Drawer.VirtualKeyboardProvider`.)
 */
function useKeyboardUp(): boolean {
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
      if (!vv) return false;
      return window.innerHeight - vv.height - vv.offsetTop > 80;
    },
    () => false,
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

/** The drawer's own element: the one that moves. */
const POPUP = "[data-workbench-drawer]";

/**
 * Puts the drawer at full now, with no slide, then records the snap. The
 * inline transform is where full rests (no offset), laid out before the
 * snap's render, so the render's move to the same place has nothing to
 * animate; `useInstantRaiseCleanup` takes it off once that has landed.
 */
function raiseAtOnce(
  inside: HTMLElement,
  snap: DrawerSnap,
  setSnap: (snap: DrawerSnap) => void,
) {
  if (snap === "full") return;
  const drawer = inside.closest<HTMLElement>(POPUP);
  if (drawer) {
    drawer.style.transition = "none";
    drawer.style.transform = "translateY(0px)";
    drawer.getBoundingClientRect();
  }
  setSnap("full");
}

/** Hands the drawer's place back to its classes once full has rendered. */
function useInstantRaiseCleanup(
  popup: RefObject<HTMLDivElement | null>,
  snap: DrawerSnap,
) {
  useLayoutEffect(() => {
    const el = popup.current;
    if (!el || snap !== "full" || !el.style.transform) return;
    // A frame on, so the transition that comes back has nothing to catch.
    const frame = requestAnimationFrame(() => {
      el.style.removeProperty("transform");
      el.style.removeProperty("transition");
    });
    return () => cancelAnimationFrame(frame);
  }, [popup, snap]);
}

/**
 * The snap, on `<html data-drawer-snap>`, for the shell around the drawer
 * (the phone's tab bar steps aside at full). Gone with the drawer.
 */
function useSnapOnRoot(snap: DrawerSnap) {
  useEffect(() => {
    document.documentElement.dataset.drawerSnap = snap;
  }, [snap]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.drawerSnap;
    },
    [],
  );
}

/**
 * Transitions only once the first place has been painted: arriving (the
 * chunk loads after the page), the drawer appears where it rests rather
 * than sliding there.
 */
function usePainted(): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return painted;
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
  const keyboardUp = useKeyboardUp();
  const painted = usePainted();
  const popup = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  usePageStaysPut();
  useSnapOnRoot(snap);
  useInstantRaiseCleanup(popup, snap);

  // Base UI's snap points, as heights: pixels for peek and half, and 1 (all
  // of the viewport under the top bar) for full, which is `data-expanded`.
  // Under 480px half is full's height, and Base UI keeps the one point.
  const points: Record<DrawerSnap, number> = {
    peek: heights.peek,
    half: heights.half,
    full: 1,
  };
  const snapOf = (point: number | string): DrawerSnap =>
    point === points.full ? "full" : point === points.half ? "half" : "peek";
  // Where the drawer's top rests, down from full's.
  const offset = heights.full - heights[snap];

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
      // field for the keyboard as it takes focus, before focusin. This runs
      // on the tap's end before Base UI's keyboard provider (at the root)
      // focuses the field in the same tap, so the field is already where
      // it will stay.
      let tap: { x: number; y: number } | null = null;
      const touchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        tap =
          touch &&
          event.touches.length === 1 &&
          isTextEntry(event.target) &&
          event.target !== document.activeElement &&
          getSnap() !== "full"
            ? { x: touch.clientX, y: touch.clientY }
            : null;
      };
      const touchEnd = (event: TouchEvent) => {
        const start = tap;
        tap = null;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        // A drag that started on the field isn't a tap.
        if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10)
          return;
        raiseAtOnce(el, getSnap(), setSnap);
      };
      el.addEventListener("focusin", raise);
      el.addEventListener("touchstart", touchStart, { passive: true });
      el.addEventListener("touchend", touchEnd, { passive: true });
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
      keyboardUp &&
      isTextEntry(focused) &&
      content.current?.contains(focused)
    )
      raiseAtOnce(content.current, getSnap(), setSnap);
  }, [keyboardUp, getSnap, setSnap]);

  return (
    <div
      ref={inPageOrder}
      // Base UI's focus guards steer Tab into and out of a popup it expects
      // at the end of the page. This one sits in the page's own order, where
      // they sent Shift+Tab from its first control round to its last.
      className="contents [&_[data-base-ui-focus-guard]]:hidden [&>[aria-owns]]:hidden"
    >
      <div ref={setHost} className="contents" />
      {/* Its own provider: the page's (the sheet indent) counts open
          drawers to scale the page back, and this one is always open. */}
      <Drawer.Provider>
        <Drawer.Root
          open
          // Never closed: a flick down past peek, Esc or the Android back
          // gesture are refused. A flick that would close it from higher up
          // rests it at peek. Esc goes on to whatever else wants it.
          onOpenChange={(open, details) => {
            if (open) return;
            details.cancel();
            details.allowPropagation();
          }}
          modal={false}
          disablePointerDismissal
          snapPoints={[points.peek, points.half, points.full]}
          // A flick moves one snap, as iOS's sheets do; a long drag goes
          // where it's let go.
          snapToSequentialPoints
          snapPoint={points[snap]}
          onSnapPointChange={(point, details) => {
            if (point !== null) {
              setSnap(snapOf(point));
              return;
            }
            details.cancel();
            if (getSnap() !== "peek") setSnap("peek");
          }}
        >
          <Drawer.Portal container={host}>
            <Drawer.VirtualKeyboardProvider>
              <Drawer.Viewport
                // Under the top bar: full is all of it. It lets taps through
                // to the calendar; only the drawer itself takes them.
                className="pointer-events-none fixed inset-x-0 top-12 bottom-0 z-40"
              >
                <Drawer.Popup
                  ref={popup}
                  initialFocus={false}
                  data-snap={snap}
                  // styles.css lifts toasts above the strip while this is
                  // on the page.
                  data-workbench-drawer=""
                  className={cn(
                    "pointer-events-auto absolute inset-x-0 top-0 flex h-full flex-col border-keyline border-t bg-bg shadow-drawer outline-none",
                    // Where it rests, plus the finger's drag.
                    "[transform:translateY(calc(var(--workbench-offset)+var(--drawer-swipe-movement-y,0px)))]",
                    painted &&
                      "transition-transform duration-450 ease-sheet motion-reduce:transition-none",
                    "data-swiping:select-none",
                    // Paper under it when a drag lifts it past full.
                    "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-bg",
                  )}
                  style={
                    {
                      "--workbench-offset": `${offset}px`,
                      // A finger's drag moves the drawer, never the page (Base
                      // UI decides drag or scroll); a pinch still zooms the
                      // page. (Safari may not know the value and keep `none`.)
                      touchAction: "pinch-zoom",
                    } as CSSVars
                  }
                >
                  <Drawer.Title className="sr-only">{title}</Drawer.Title>
                  <div
                    ref={content}
                    className="flex flex-col"
                    // The drawer is full height and slides down; size the
                    // inside to what's showing so its scroll area ends at the
                    // screen's edge, or at the keyboard's when it's up. Never
                    // less than the header.
                    style={{
                      height: `max(calc(${heights[snap]}px - var(--drawer-keyboard-inset, 0px)), ${Math.min(heights[snap], PEEK_HEIGHT)}px)`,
                    }}
                  >
                    <Grabber snap={snap} onSnap={setSnap} />
                    {tabs}
                    {/* The panel. A finger drags the drawer from anywhere
                        (from a list, only once it's scrolled to its top); a
                        mouse only from the strip above the panel, beside the
                        grabber and the tabs, so a click on a row that isn't a
                        button isn't taken for a drag, and text can be
                        selected. */}
                    <Drawer.Content
                      ref={raiseOnFocus}
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      {children}
                    </Drawer.Content>
                  </div>
                </Drawer.Popup>
              </Drawer.Viewport>
            </Drawer.VirtualKeyboardProvider>
          </Drawer.Portal>
        </Drawer.Root>
      </Drawer.Provider>
    </div>
  );
}

/**
 * Keeps the drawer in the Tab order. Base UI's portal takes everything in it
 * out of the order (`tabindex="-1"`, the old value in `data-tabindex`) when
 * focus moves to the page, and puts it back when focus comes in through its
 * guards, which this drawer doesn't use (above). Left out, Tab skipped the
 * sidebar, and a list with nothing left to Tab to couldn't be scrolled from
 * the keyboard (axe's scrollable-region-focusable). This runs as focus
 * leaves, after Base UI's own capturing listener has done that.
 */
function inPageOrder(root: HTMLDivElement | null) {
  if (!root) return;
  const restore = () => {
    for (const el of root.querySelectorAll<HTMLElement>("[data-tabindex]")) {
      const was = el.dataset.tabindex;
      delete el.dataset.tabindex;
      if (was) el.setAttribute("tabindex", was);
      else el.removeAttribute("tabindex");
    }
  };
  root.addEventListener("focusout", restore);
  return () => root.removeEventListener("focusout", restore);
}

type CSSVars = CSSProperties & Record<`--${string}`, string>;

const NEXT_SNAP: Record<DrawerSnap, DrawerSnap> = {
  peek: "half",
  half: "full",
  full: "peek",
};

/**
 * The bar at the top: drag the drawer anywhere to resize it, or tap this to
 * step peek → half → full. A real button, so a keyboard and a screen reader
 * can move the drawer too.
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
 * any scroll of the page is undone. (Base UI's keyboard provider does this
 * for modal drawers only.)
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
