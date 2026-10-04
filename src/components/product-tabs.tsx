import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { type FocusEvent, useEffect, useRef, useState } from "react";
import { useAccount } from "~/features/auth/account-store";
import { listedProducts, type ProductId } from "~/lib/products";
import { WithTooltip } from "~/ui/tooltip";
import { Mark } from "./brand/mark";

// The family bar's product tabs (docs/COHESION.md §4; the owner, 2026-09-29):
// the product you're on shows its mark and name, the others just their
// marks, and Home and Settings show only marks. Hovering a tab, or tabbing
// to it, opens that one tab's name. A tab grows only to its right, so the
// tab under the pointer never moves out from under it: the tabs after it
// shift instead. That rule also decides when a tab closes again: a tab to
// the right of the pointer closes at once, one to its left only once the
// pointer leaves the tabs, since closing it would slide the rest under the
// pointer.

/** How long the pointer rests on a tab before its name opens. */
const INTENT_MS = 120;
/** How long after the pointer leaves the tabs before they close. */
const LINGER_MS = 200;

/**
 * The last bar's open tabs and the tab under its pointer, so the next bar
 * (another product's page) starts from them and animates to its own. Null
 * until a bar has drawn (the server, a fresh load), which draw as they are.
 */
let lastBar: { open: ProductId[]; pointer: ProductId | null } | null = null;

/**
 * Where the pointer last moved on the tabs. The browser sends moves that
 * aren't (a new page's layout, a view transition's snapshot), and those
 * mustn't close the tabs under a pointer that stayed put.
 */
let lastPoint = { x: Number.NaN, y: Number.NaN };

/** The product you're on wears its soft color, as in the product menu. */
const CURRENT: Record<ProductId, string> = {
  schedule: "aria-[current=page]:bg-product-schedule-soft",
  reviews: "aria-[current=page]:bg-product-reviews-soft",
  chat: "aria-[current=page]:bg-product-chat-soft",
  plan: "aria-[current=page]:bg-product-plan-soft",
  todo: "aria-[current=page]:bg-product-todo-soft",
};

/** The five products as tabs; each a link, the current one tinted. */
export function ProductTabs({ current }: { current: ProductId | null }) {
  const flags = useAccount((s) => s.flags);
  const products = listedProducts(flags, current);
  const ids = products.map((p) => p.id);
  const nav = useRef<HTMLElement>(null);
  // Coming from another product's bar: its tabs as they were, until the
  // first frames have painted, then this bar's.
  const [carried, setCarried] = useState(() => lastBar?.open ?? null);
  const [pointer, setPointer] = useState(() => lastBar?.pointer ?? null);
  // Opened by the pointer and kept open while it's on the tabs. From a
  // carried bar: those at or left of its pointer, which mustn't close yet.
  const [hovered, setHovered] = useState<ReadonlySet<ProductId>>(() => {
    const at = lastBar?.pointer;
    if (!lastBar || !at) return new Set();
    const index = ids.indexOf(at);
    return new Set(lastBar.open.filter((id) => ids.indexOf(id) <= index));
  });
  const [focused, setFocused] = useState<ProductId | null>(null);
  // Another product on the same bar (the site's pages share one): the one
  // you were on stays open while the pointer's on a tab to its right, as a
  // tab opened by the pointer does.
  const [was, setWas] = useState(current);
  if (was !== current) {
    setWas(current);
    if (was && pointer && ids.indexOf(was) < ids.indexOf(pointer))
      setHovered((h) => new Set(h).add(was));
  }
  const timers = useRef({ intent: 0, linger: 0 });

  const open = (id: ProductId) =>
    carried
      ? carried.includes(id)
      : id === current || id === focused || hovered.has(id);

  useEffect(() => {
    if (!carried) return;
    // Two frames: the first paint keeps the last bar, so the change animates.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setCarried(null));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [carried]);

  // For the next bar: what this one shows now.
  useEffect(() => {
    lastBar = {
      open: ids.filter(
        (id) => id === current || id === focused || hovered.has(id),
      ),
      pointer,
    };
  });

  const leave = () => {
    clearTimeout(timers.current.intent);
    // Already on its way: moving on doesn't put it off.
    if (timers.current.linger) return;
    timers.current.linger = window.setTimeout(() => {
      timers.current.linger = 0;
      setPointer(null);
      setHovered(new Set());
    }, LINGER_MS);
  };

  // A bar drawn under the pointer never sees it enter, so while any tab is
  // held open, a move anywhere else on the page closes them too.
  const holding = pointer !== null || hovered.size > 0;
  useEffect(() => {
    if (!holding) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.clientX === lastPoint.x && e.clientY === lastPoint.y) return;
      if (!(e.target instanceof Node) || !nav.current?.contains(e.target))
        leave();
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  });

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.intent);
      clearTimeout(t.linger);
    };
  }, []);

  const point = (id: ProductId) => {
    clearTimeout(timers.current.linger);
    timers.current.linger = 0;
    if (id === pointer) return;
    const index = ids.indexOf(id);
    setPointer(id);
    // Tabs to its right close now: nothing under the pointer moves.
    setHovered((was) => keep(was, (t) => ids.indexOf(t) < index));
    clearTimeout(timers.current.intent);
    timers.current.intent = window.setTimeout(
      () => setHovered((was) => new Set(was).add(id)),
      INTENT_MS,
    );
  };

  const onFocus = (id: ProductId, e: FocusEvent<HTMLAnchorElement>) => {
    // Keyboard focus only: a click's focus has the pointer's own reveal.
    if (e.currentTarget.matches(":focus-visible")) setFocused(id);
  };

  return (
    <nav
      ref={nav}
      aria-label="Products"
      className="ml-1 flex items-center gap-0.5"
      onPointerMove={(e) => {
        lastPoint = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={(e) => {
        if (e.clientX === lastPoint.x && e.clientY === lastPoint.y) return;
        if (e.pointerType !== "touch") leave();
      }}
    >
      {products.map((p) => {
        const shown = open(p.id);
        return (
          <WithTooltip key={p.id} label={p.view} side="bottom">
            <Link
              to={p.to}
              aria-current={p.id === current ? "page" : undefined}
              data-product-tab={p.id}
              data-open={shown ? "" : undefined}
              onPointerMove={(e) => {
                if (e.pointerType !== "touch") point(p.id);
              }}
              onFocus={(e) => onFocus(p.id, e)}
              onBlur={() => setFocused((f) => (f === p.id ? null : f))}
              className={cn(
                "flex h-8 items-center rounded-md px-1.5 font-medium text-base text-muted transition-colors hover:bg-hover hover:text-fg aria-[current=page]:text-fg",
                CURRENT[p.id],
              )}
            >
              <Mark id={p.id} size={20} />
              {/* The name's width animates as a grid track, from 0fr to
                  1fr, with its gap from the mark inside the clip, so the gap
                  folds too. Clipped, never hidden: it's still the link's
                  name to a screen reader. */}
              <span
                data-tab-name=""
                className={cn(
                  "grid transition-[grid-template-columns,opacity] duration-(--dur-reveal) ease-(--ease-sheet)",
                  shown
                    ? "grid-cols-[1fr] opacity-100"
                    : "grid-cols-[0fr] opacity-0",
                )}
              >
                <span className="overflow-hidden">
                  <span className="block whitespace-nowrap pr-0.5 pl-1.5">
                    {p.label}
                  </span>
                </span>
              </span>
            </Link>
          </WithTooltip>
        );
      })}
    </nav>
  );
}

function keep<T>(set: ReadonlySet<T>, test: (item: T) => boolean) {
  const next = new Set([...set].filter(test));
  return next.size === set.size ? set : next;
}
