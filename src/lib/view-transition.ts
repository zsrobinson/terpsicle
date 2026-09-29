import type { AnyRouter, ParsedLocation } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import {
  type NavigationPlace,
  screenOf,
  type ViewTransitionType,
  viewTransitionType,
} from "~/core/routing/view-transition";

// Navigations animate through TanStack Router's view transitions
// (`defaultViewTransition` in src/router.tsx; docs/decisions.md, "Motion
// through view transitions"). ~/core/routing/view-transition picks the type;
// this is the browser's side of it:
//
// - Safari animates its own edge swipe Back and says so on the popstate
//   (`hasUAVisualTransition`), so that navigation gets none of ours: the
//   page moves once.
// - A course row grows into its details' header (and back on pop). Each
//   carries `data-vt-course`; the one pressed, and the header it opens, get
//   the one shared name for the length of the transition, so no two
//   elements ever carry it at once.
// - The scheduler's sidebar follows the history itself, a frame after the
//   URL moves rather than once the router has loaded the route
//   (`historyFollower`), so its moves start their transition there.
// - `<html data-vt-type>` names the running type, for tests.
//
// Browsers without transition types (Safari before 18.2) get no transitions
// at all: the router would otherwise run an untyped one on every navigation,
// search typing included, and the scheduler's drill-ins keep their own
// small slide there.

/** The shared element's name (src/styles/transitions.css). */
const SHARED_NAME = "course";

/** How long a press or an edge swipe stays the reason for a navigation. */
const PRESS_WINDOW_MS = 3000;
const SWIPE_WINDOW_MS = 1000;

/** History entries a follower claimed; more than this are long settled. */
const CLAIMS_KEPT = 16;

type StartViewTransition = Document["startViewTransition"];
/** Older engines lack the method; `activeViewTransition` is newer still. */
type DocumentWithTransitions = Omit<Document, "startViewTransition"> & {
  startViewTransition?: StartViewTransition;
  activeViewTransition?: ViewTransition | null;
};

let installed = false;
let swipedAt = Number.NEGATIVE_INFINITY;
let pressed: { code: string; el: HTMLElement; at: number } | null = null;
/** The course each push shared, by the history index it pushed to. */
const sharedAt = new Map<number, string>();
/** The transition running now; a newer one takes over its cleanup. */
let running = 0;
/** Elements carrying the shared name now, whichever transition named them. */
const named = new Set<HTMLElement>();
/** What the router's running transition does once its page is rendered. */
let afterRender: (() => void) | null = null;
/**
 * History entries a view following the history decided itself (animated,
 * or kept still); the router's own transition leaves them alone.
 */
const claimed = new Set<string>();

export function supportsTypedViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as DocumentWithTransitions).startViewTransition ===
      "function" &&
    typeof CSS !== "undefined" &&
    CSS.supports("selector(:active-view-transition-type(a))")
  );
}

function install(): void {
  if (installed) return;
  installed = true;
  // Capture, so it's known before the router's own popstate listener acts.
  window.addEventListener(
    "popstate",
    (event) => {
      if (
        (event as PopStateEvent & { hasUAVisualTransition?: boolean })
          .hasUAVisualTransition
      )
        swipedAt = performance.now();
    },
    { capture: true },
  );
  document.addEventListener(
    "click",
    (event) => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-vt-course]")
          : null;
      const code = row?.dataset.vtCourse;
      pressed = row && code ? { code, el: row, at: performance.now() } : null;
    },
    { capture: true },
  );
}

function placeOf(location: ParsedLocation): NavigationPlace {
  const index = (location.state as { __TSR_index?: unknown }).__TSR_index;
  return {
    pathname: location.pathname,
    search: location.search as Record<string, unknown>,
    index: typeof index === "number" ? index : 0,
  };
}

function keyOf(location: { state: unknown; href: string }): string {
  const key = (location.state as { __TSR_key?: unknown } | null)?.__TSR_key;
  return typeof key === "string" ? key : location.href;
}

function claim(key: string): void {
  claimed.add(key);
  if (claimed.size > CLAIMS_KEPT) {
    const oldest = claimed.values().next().value;
    if (oldest !== undefined) claimed.delete(oldest);
  }
}

function typeFor(
  from: NavigationPlace | undefined,
  to: NavigationPlace,
): ViewTransitionType | null {
  return viewTransitionType({
    from,
    to,
    reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    uaAnimated: performance.now() - swipedAt < SWIPE_WINDOW_MS,
  });
}

/** Whether a person can see `el` (on screen, when that's asked too). */
function isShown(el: HTMLElement, onScreen: boolean): boolean {
  if (!el.isConnected) return false;
  // The scheduler's hidden layers are inert; hidden panes are [hidden].
  if (el.closest("[inert], [hidden], [aria-hidden='true']")) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return !onScreen || (r.bottom > 0 && r.top < window.innerHeight);
}

/**
 * The element for `code` on the page, other than `except`, preferring one
 * on screen. The new half is looked for before the router puts the scroll
 * where it belongs, so it may be off screen for now.
 */
function shownCourse(
  code: string,
  { except, onScreen }: { except?: Element; onScreen: boolean },
): HTMLElement | null {
  const all = [
    ...document.querySelectorAll<HTMLElement>(
      `[data-vt-course="${CSS.escape(code)}"]`,
    ),
  ].filter((el) => el !== except);
  return (
    all.find((el) => isShown(el, true)) ??
    (onScreen ? null : (all.find((el) => isShown(el, false)) ?? null))
  );
}

function name(el: HTMLElement | null): void {
  if (!el) return;
  el.style.viewTransitionName = SHARED_NAME;
  named.add(el);
}

function unnameAll(): void {
  for (const el of named)
    if (el.style.viewTransitionName === SHARED_NAME)
      el.style.viewTransitionName = "";
  named.clear();
}

/**
 * The transition the router is about to start: it calls
 * `document.startViewTransition` as soon as `types` returns. Where the
 * browser doesn't expose `document.activeViewTransition` yet, the next call
 * is caught once and handed on untouched.
 */
function nextTransition(): Promise<ViewTransition | null> {
  const doc = document as DocumentWithTransitions;
  // null between transitions where it's supported, undefined where it isn't.
  if (doc.activeViewTransition !== undefined)
    return Promise.resolve().then(() => doc.activeViewTransition ?? null);
  const start = doc.startViewTransition;
  if (!start) return Promise.resolve(null);
  const own = Object.hasOwn(doc, "startViewTransition");
  return new Promise((resolve) => {
    const once: StartViewTransition = (arg) => {
      restore();
      const transition = start.call(doc, arg);
      resolve(transition);
      return transition;
    };
    const restore = () => {
      if (doc.startViewTransition !== once) return;
      // Back to what was there: usually the prototype's own.
      if (own) doc.startViewTransition = start;
      else
        delete (doc as { startViewTransition?: unknown }).startViewTransition;
    };
    doc.startViewTransition = once;
    queueMicrotask(() => {
      restore();
      resolve(null);
    });
  });
}

interface Begun {
  /** Whether a course row and its header share a name in this one. */
  shared: boolean;
  /** Call once the new page is rendered, before it's captured. */
  rendered(): void;
  /** The transition this set up, or null when none started after all. */
  attach(transition: ViewTransition | null): void;
}

/** Sets up the transition about to start: its type, and a shared course. */
function begin(
  type: ViewTransitionType,
  from: NavigationPlace,
  to: NavigationPlace,
): Begun {
  const id = ++running;
  const root = document.documentElement;
  root.dataset.vtType = type;
  // Whatever an earlier transition left named would share the name with
  // this one's, and a duplicate name aborts a transition.
  unnameAll();

  let code: string | null = null;
  let old: HTMLElement | null = null;
  if (type === "push") {
    const press =
      pressed && performance.now() - pressed.at < PRESS_WINDOW_MS
        ? pressed
        : null;
    code = press?.code ?? null;
    if (code) sharedAt.set(to.index, code);
    else sharedAt.delete(to.index);
    // The row that was pressed: the same course can be listed twice.
    if (press && isShown(press.el, true)) old = press.el;
  } else if (type === "pop") {
    code = sharedAt.get(from.index) ?? null;
    old = code ? shownCourse(code, { onScreen: true }) : null;
  }
  pressed = null;
  name(old);

  let done = false;
  const finish = () => {
    done = true;
    // A newer transition owns the names and the type by now.
    if (running !== id) return;
    unnameAll();
    delete root.dataset.vtType;
  };

  return {
    shared: old !== null,
    // Inside the transition's update the old page is captured and the new
    // one not yet: only the new element may carry the name now.
    rendered() {
      if (done) return;
      done = true;
      unnameAll();
      if (code && old)
        name(shownCourse(code, { except: old, onScreen: false }));
    },
    attach(transition) {
      if (!transition) return finish();
      transition.finished.catch(() => undefined).then(finish);
    },
  };
}

/**
 * `types` for the router's `defaultViewTransition`: the type for this
 * navigation, or false for none.
 */
export function viewTransitionTypes({
  fromLocation,
  toLocation,
}: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
}): string[] | false {
  install();
  // A newer navigation: whatever the last one meant to do after its render
  // is moot.
  afterRender = null;
  const key = keyOf(toLocation);
  if (claimed.has(key)) {
    claimed.delete(key);
    return false;
  }
  const from = fromLocation ? placeOf(fromLocation) : undefined;
  const to = placeOf(toLocation);
  const type = typeFor(from, to);
  // One swipe, one navigation.
  swipedAt = Number.NEGATIVE_INFINITY;
  if (!type || !from) return false;
  const begun = begin(type, from, to);
  afterRender = () => begun.rendered();
  void nextTransition().then((transition) => begun.attach(transition));
  return [type];
}

/**
 * The router's `defaultViewTransition`: typed transitions where the browser
 * has them, none elsewhere (and none on the server, which never navigates).
 */
export function defaultViewTransition():
  | false
  | { types: typeof viewTransitionTypes } {
  if (!supportsTypedViewTransitions()) return false;
  install();
  return { types: viewTransitionTypes };
}

/**
 * Finishes each of the router's transitions once it has rendered the new
 * page: it tells `onResolved` inside the transition's update, after its
 * render and before the new page is captured.
 */
export function settleViewTransitions(router: AnyRouter): void {
  if (!supportsTypedViewTransitions()) return;
  router.subscribe("onResolved", () => {
    const finish = afterRender;
    afterRender = null;
    finish?.();
  });
}

// ---------- views that follow the history itself ----------

type HistoryLocation = AnyRouter["history"]["location"];

export interface HistoryFollower {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): HistoryLocation;
}

const followers = new WeakMap<AnyRouter, HistoryFollower>();

/**
 * The history's location for a view that follows it directly rather than
 * through the router's matches (the scheduler's sidebar, so a click answers
 * before a route's chunk arrives). For `useSyncExternalStore`.
 *
 * A move inside one product that animates is shown by a transition started
 * here, in whose update the view renders its new place: the router loads
 * the route afterwards, so waiting for its transition would capture the
 * new place as the old page too. The router's own transition leaves every
 * move inside the product to this one. A move that arrives while an
 * earlier one is still waiting to render skips it, and goes from where
 * the view still is. Leaving for another product, the view holds its
 * place: the router's cross-fade captures it, and then it's gone.
 */
export function historyFollower(router: AnyRouter): HistoryFollower {
  const known = followers.get(router);
  if (known) return known;
  const listeners = new Set<() => void>();
  let shown = router.history.location;
  /** Skips the transition started here whose update hasn't run yet. */
  let pending: (() => void) | null = null;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const productOf = (place: NavigationPlace) =>
    screenOf(place.pathname, place.search).product;

  router.history.subscribe(() => {
    const next = router.history.location;
    if (listeners.size === 0) {
      shown = next;
      return;
    }
    pending?.();
    pending = null;
    const from = placeOf(router.parseLocation(shown));
    const to = placeOf(router.parseLocation(next));
    if (productOf(from) !== productOf(to)) return;
    claim(keyOf(next));
    const undone = keyOf(next) === keyOf(shown);
    const type =
      !undone && supportsTypedViewTransitions() ? typeFor(from, to) : null;
    // One swipe, one navigation.
    swipedAt = Number.NEGATIVE_INFINITY;
    if (undone) {
      // Back to where the view still is (a move undone before it showed).
      shown = next;
      return;
    }
    if (!type) {
      shown = next;
      notify();
      return;
    }
    install();
    const begun = begin(type, from, to);
    let skipped = false;
    // Nothing waits for the router: once a view's chunk is here the new
    // place renders whole (a course's header grows from its row); the first
    // time, its skeleton pushes in and the row fades with its page.
    const transition = (
      document as DocumentWithTransitions
    ).startViewTransition?.({
      update: () => {
        if (skipped) return;
        pending = null;
        shown = router.history.location;
        flushSync(notify);
        begun.rendered();
      },
      types: [type],
    });
    begun.attach(transition ?? null);
    pending = () => {
      skipped = true;
      transition?.skipTransition();
    };
  });

  const follower: HistoryFollower = {
    subscribe(onChange) {
      // A view mounting again starts from where the history is now.
      if (listeners.size === 0) shown = router.history.location;
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => (listeners.size === 0 ? router.history.location : shown),
  };
  followers.set(router, follower);
  return follower;
}
