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

/** Longest a shared course waits for its details to be ready to capture. */
const SHARED_WAIT_MS = 120;

/** How long a press or an edge swipe stays the reason for a navigation. */
const PRESS_WINDOW_MS = 3000;
const SWIPE_WINDOW_MS = 1000;

type StartViewTransition = Document["startViewTransition"];
/** Older engines lack the method; `activeViewTransition` is newer still. */
type DocumentWithTransitions = Omit<Document, "startViewTransition"> & {
  startViewTransition?: StartViewTransition;
  activeViewTransition?: ViewTransition | null;
};

let installed = false;
let swipedAt = Number.NEGATIVE_INFINITY;
let pressed: { code: string; at: number } | null = null;
/** The course each push shared, by the history index it pushed to. */
const sharedAt = new Map<number, string>();
/** The transition running now; a newer one takes over its cleanup. */
let running = 0;
/** What the router's running transition does once its page is rendered. */
let afterRender: (() => void) | null = null;
/** A history entry a view already animated; the router's own skips it. */
let animatedKey: string | null = null;

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
      pressed = code ? { code, at: performance.now() } : null;
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

/**
 * The element for `code` on the page, other than `except`. The old half
 * must be on screen; the new half is looked for before the router puts the
 * scroll where it belongs, so only its being shown counts.
 */
function shownCourse(
  code: string,
  { except, onScreen }: { except?: Element; onScreen: boolean },
): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(
    `[data-vt-course="${CSS.escape(code)}"]`,
  )) {
    if (el === except) continue;
    // The scheduler's hidden layers are inert; hidden panes are [hidden].
    if (el.closest("[inert], [hidden], [aria-hidden='true']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (onScreen && (r.bottom <= 0 || r.top >= window.innerHeight)) continue;
    return el;
  }
  return null;
}

/**
 * The transition about to start: the caller calls
 * `document.startViewTransition` right after `begin`. Where the browser
 * doesn't expose `document.activeViewTransition` yet, the next call is
 * caught once and handed on untouched.
 */
function nextTransition(): Promise<ViewTransition | null> {
  const doc = document as DocumentWithTransitions;
  // null between transitions where it's supported, undefined where it isn't.
  if (doc.activeViewTransition !== undefined)
    return Promise.resolve().then(() => doc.activeViewTransition ?? null);
  const start = doc.startViewTransition;
  if (!start) return Promise.resolve(null);
  return new Promise((resolve) => {
    const once: StartViewTransition = (arg) => {
      restore();
      const transition = start.call(doc, arg);
      resolve(transition);
      return transition;
    };
    const restore = () => {
      // Back to the prototype's own.
      if (doc.startViewTransition === once)
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

  let code: string | null = null;
  if (type === "push") {
    const press =
      pressed && performance.now() - pressed.at < PRESS_WINDOW_MS
        ? pressed
        : null;
    code = press?.code ?? null;
    if (code) sharedAt.set(to.index, code);
    else sharedAt.delete(to.index);
  } else if (type === "pop") {
    code = sharedAt.get(from.index) ?? null;
  }
  pressed = null;

  const named: HTMLElement[] = [];
  const name = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.viewTransitionName = SHARED_NAME;
    named.push(el);
  };
  const unname = () => {
    for (const el of named.splice(0))
      if (el.style.viewTransitionName === SHARED_NAME)
        el.style.viewTransitionName = "";
  };
  const old = code ? shownCourse(code, { onScreen: true }) : null;
  name(old);
  let done = false;

  void nextTransition().then((transition) => {
    if (!transition) {
      done = true;
      unname();
      if (running === id) delete root.dataset.vtType;
      return;
    }
    transition.updateCallbackDone.catch(() => unname());
    transition.finished
      .catch(() => undefined)
      .then(() => {
        unname();
        if (running === id) delete root.dataset.vtType;
      });
  });

  return {
    shared: old !== null,
    // Inside the transition's update the old page is captured and the new
    // one not yet: only the new element may carry the name now.
    rendered() {
      if (done) return;
      done = true;
      unname();
      if (code && old)
        name(shownCourse(code, { except: old, onScreen: false }));
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
  if (animatedKey !== null && animatedKey === keyOf(toLocation)) {
    animatedKey = null;
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
 * new place as the old page too. The router's own transition skips that
 * navigation. Moves to another product change at once, as before, and the
 * router's cross-fade covers them.
 */
export function historyFollower(router: AnyRouter): HistoryFollower {
  const known = followers.get(router);
  if (known) return known;
  const listeners = new Set<() => void>();
  let shown = router.history.location;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  router.history.subscribe(() => {
    const next = router.history.location;
    if (next === shown) return;
    const from = placeOf(router.parseLocation(shown));
    const to = placeOf(router.parseLocation(next));
    const type =
      supportsTypedViewTransitions() &&
      listeners.size > 0 &&
      screenOf(from.pathname, from.search).product ===
        screenOf(to.pathname, to.search).product
        ? typeFor(from, to)
        : null;
    if (!type) {
      shown = next;
      notify();
      return;
    }
    install();
    swipedAt = Number.NEGATIVE_INFINITY;
    animatedKey = keyOf(next);
    // A course that grows into its header waits a moment for the router,
    // whose details chunk may still be on its way; nothing else waits.
    const loaded = new Promise<void>((resolve) => {
      const stop = router.subscribe("onResolved", () => {
        stop();
        resolve();
      });
      setTimeout(() => {
        stop();
        resolve();
      }, SHARED_WAIT_MS);
    });
    const begun = begin(type, from, to);
    (document as DocumentWithTransitions).startViewTransition?.({
      update: async () => {
        if (begun.shared) await loaded;
        // The latest place, if the URL moved again meanwhile.
        shown = router.history.location;
        flushSync(notify);
        begun.rendered();
      },
      types: [type],
    });
  });
  const follower: HistoryFollower = {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => shown,
  };
  followers.set(router, follower);
  return follower;
}
