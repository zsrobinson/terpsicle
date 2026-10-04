import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { elementCrop } from "~/core/feedback/redact";
import type { FeedbackProduct, Pin } from "~/core/schema/feedback";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { noteToast, undoToast } from "~/ui/toast";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { describeElement } from "./element";
import { pinMutation, pinsQuery, unpin } from "./pin-queries";
import { usePins } from "./pin-store";
import {
  base64Of,
  captureViewport,
  cropToImage,
  encodeCanvas,
  FEEDBACK_UI,
} from "./screenshot";
import { APP_VERSION, currentTheme, sendFailure } from "./send";

// The admin's side of the sheet (docs/FEEDBACK.md "Pinned notes"): the
// numbered dots on this route, and "Pin a note", where hovering outlines
// an element and a click opens a note box beside it. Only admins load this;
// the server checks again on every call.

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

/** Re-reads positions as the page scrolls, resizes or changes. */
function useTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    const timer = window.setInterval(bump, 1_000);
    return () => {
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
      window.clearInterval(timer);
    };
  }, [active]);
  return tick;
}

function findPinned(pin: Pin): Element | null {
  try {
    return document.querySelector(pin.element.selector);
  } catch {
    return null;
  }
}

const STATUS_WORDS: Record<Pin["status"], string> = {
  new: "New",
  planned: "Planned",
  fixed: "Fixed",
  "wont-fix": "Won't fix",
  spam: "Spam",
};

function PinDots({ pins }: { pins: readonly Pin[] }) {
  const visible = usePins((s) => s.visible);
  useTick(visible && pins.length > 0);
  if (!visible) return null;
  return (
    <ul data-feedback-ui="" aria-label="Pinned notes">
      {pins.map((pin) => {
        const el = findPinned(pin);
        const at = el
          ? boxOf(el)
          : {
              ...pin.element.rect,
              x: pin.element.rect.x - window.scrollX,
              y: pin.element.rect.y - window.scrollY,
            };
        const closed = pin.status !== "new" && pin.status !== "planned";
        return (
          <li key={pin.id}>
            <WithTooltip
              label={`${pin.number} · ${STATUS_WORDS[pin.status]}: ${pin.text}`}
            >
              <button
                type="button"
                aria-label={`Note ${pin.number}: ${pin.text}`}
                data-testid="feedback-pin"
                className={`fixed z-40 flex size-5 items-center justify-center rounded-full border border-bg font-semibold text-2xs shadow-pop ${
                  closed ? "bg-muted text-bg" : "bg-accent text-accent-fg"
                }`}
                style={{
                  left: Math.max(0, at.x + at.width - 10),
                  top: Math.max(0, at.y - 10),
                }}
                onClick={() => el?.scrollIntoView({ block: "center" })}
              >
                {pin.number}
              </button>
            </WithTooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** The element under a point, ignoring our own layer. */
function pickable(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y))
    if (!el.closest(FEEDBACK_UI) && el !== document.documentElement)
      return el === document.body ? null : el;
  return null;
}

function Picker({
  pathname,
  product,
  onDone,
}: {
  pathname: string;
  product: FeedbackProduct;
  onDone: () => void;
}) {
  const [hover, setHover] = useState<Box | null>(null);
  const [picked, setPicked] = useState<Element | null>(null);
  const pickedRef = useRef<Element | null>(null);
  pickedRef.current = picked;
  const tick = useTick(picked !== null);

  useEffect(() => {
    const ours = (event: Event) =>
      event.target instanceof Element && event.target.closest(FEEDBACK_UI);
    const onMove = (event: PointerEvent) => {
      if (pickedRef.current || ours(event)) return;
      const el = pickable(event.clientX, event.clientY);
      setHover(el ? boxOf(el) : null);
    };
    // The page underneath never hears the picking clicks.
    const swallow = (event: Event) => {
      if (ours(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      if (ours(event)) return;
      swallow(event);
      if (pickedRef.current) return;
      const el = pickable(event.clientX, event.clientY);
      // The note box's field takes focus: no tooltip over its label.
      if (el) {
        quietTooltips(800);
        setPicked(el);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (pickedRef.current) setPicked(null);
      else onDone();
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", swallow, true);
    window.addEventListener("mousedown", swallow, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", swallow, true);
      window.removeEventListener("mousedown", swallow, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onDone]);

  const outline = picked ? boxOf(picked) : hover;
  void tick;

  return (
    <div data-feedback-ui="">
      {outline ? (
        <div
          aria-hidden="true"
          data-testid="feedback-pick-outline"
          className="pointer-events-none fixed z-40 rounded-sm outline-2 outline-accent outline-offset-2"
          style={{
            left: outline.x,
            top: outline.y,
            width: outline.width,
            height: outline.height,
          }}
        />
      ) : null}
      <div
        role="status"
        className="-translate-x-1/2 fixed bottom-4 left-1/2 z-50 flex items-center gap-2 rounded-md border border-keyline bg-raised py-1 pr-1 pl-3 text-sm shadow-pop"
      >
        {picked ? "Write the note" : "Click anything to pin a note on it"}
        <WithTooltip label="Stop pinning" shortcut="Esc">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Stop pinning"
            onClick={onDone}
          >
            <X aria-hidden="true" />
          </Button>
        </WithTooltip>
      </div>
      {picked && outline ? (
        <NoteBox
          pathname={pathname}
          element={picked}
          at={outline}
          product={product}
          onCancel={() => setPicked(null)}
          onPinned={onDone}
        />
      ) : null}
    </div>
  );
}

function NoteBox({
  pathname,
  element,
  at,
  product,
  onCancel,
  onPinned,
}: {
  /** The route whose pins it joins. */
  pathname: string;
  element: Element;
  at: Box;
  product: FeedbackProduct;
  onCancel: () => void;
  onPinned: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const queryClient = useQueryClient();
  const pinning = useMutation(pinMutation());

  const pin = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const described = describeElement(element);
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      let screenshot:
        | { type: "image/webp" | "image/png"; data: string }
        | undefined;
      let elementShot: Awaited<ReturnType<typeof cropToImage>>;
      try {
        const { canvas, scale } = await captureViewport();
        const encoded = await encodeCanvas(canvas);
        screenshot = {
          type: encoded.type === "image/png" ? "image/png" : "image/webp",
          data: await base64Of(encoded.blob),
        };
        const crop = elementCrop(boxOf(element), viewport, scale);
        elementShot = crop ? await cropToImage(canvas, crop) : undefined;
      } catch (e) {
        // A note without pictures still says where it was.
        console.warn("Pin screenshot failed", e);
      }
      // Its dot shows from here (./pin-queries).
      const result = await pinning.mutateAsync({
        pathname,
        at: new Date(),
        input: {
          product,
          path: window.location.pathname + window.location.search,
          text: text.trim(),
          element: described,
          ...(screenshot ? { screenshot } : {}),
          ...(elementShot ? { elementShot } : {}),
          context: {
            version: APP_VERSION,
            viewport,
            theme: currentTheme(),
          },
        },
      });
      // The kit's Undo, as for sent feedback (send.tsx): one window, and
      // focus on Undo holds it open.
      undoToast({
        id: `feedback-pin-${result.id}`,
        message: "Pinned.",
        tooltip: "Take the note back",
        onUndo: () =>
          void unpin(queryClient, {
            pathname,
            id: result.id,
            undoToken: result.undoToken,
          })
            .then(({ status }) => {
              if (status !== "undone")
                noteToast("Too late to undo: the note's already in the inbox.");
            })
            .catch(() =>
              noteToast("Couldn't undo. Check your connection and try again."),
            ),
      });
      onPinned();
    } catch (e) {
      setError(sendFailure(e, false));
      setSaving(false);
    }
  };

  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        // A press or focus outside leaves the note open; Esc cancels it.
        if (
          details.reason === "outside-press" ||
          details.reason === "focus-out"
        )
          details.cancel();
        else if (!open) onCancel();
      }}
    >
      <PopoverAnchor
        render={
          <div
            aria-hidden="true"
            className="pointer-events-none fixed"
            style={{
              left: at.x,
              top: at.y,
              width: at.width,
              height: at.height,
            }}
          />
        }
      />
      <PopoverContent
        data-feedback-ui=""
        side="bottom"
        align="start"
        className="w-[300px]"
      >
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void pin();
          }}
        >
          <label htmlFor={id} className="font-medium text-sm">
            Note
          </label>
          <WithTooltip label="What should change here">
            <textarea
              id={id}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={4_000}
              // biome-ignore lint/a11y/noAutofocus: the box opens to type in
              autoFocus
              placeholder="This should…"
              className="w-full resize-y rounded-md border border-hairline-strong bg-bg px-2 py-1.5 text-base leading-5 placeholder:text-faint focus:border-fg/40"
            />
          </WithTooltip>
          {/* Pin is the way to try again, right below. */}
          {error ? <InlineError className="py-0" message={error} /> : null}
          <div className="flex justify-end gap-2">
            <WithTooltip label="Pick something else" shortcut="Esc">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </WithTooltip>
            <WithTooltip label="Save the note on this element">
              <Button type="submit" size="sm" disabled={!text.trim() || saving}>
                {saving ? "Pinning…" : "Pin"}
              </Button>
            </WithTooltip>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function onHistory(change: () => void): () => void {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
}

/**
 * The page's own pathname, where its pins are (the server matches it
 * exactly). The bar's can be its product's root: the scheduler's tabs are
 * routes under /schedule. Read on every render, which a new bar pathname
 * or picking brings, and on Back and Forward.
 */
function usePagePathname(): string {
  return useSyncExternalStore(onHistory, () => window.location.pathname);
}

/**
 * Everything admin-only on a page: the dots, and the picker while "Pin a
 * note" is on. Asks for its route's pins on each route; none is fine
 * (they're a convenience, and the inbox has them all).
 */
export function AdminLayer({
  product,
}: {
  /** The bar's pathname: a change draws the page's pins again. */
  pathname: string;
  product: FeedbackProduct;
}) {
  const pathname = usePagePathname();
  const picking = usePins((s) => s.picking);
  const stop = useCallback(() => usePins.getState().setPicking(false), []);
  const pins = useQuery(pinsQuery(pathname));
  // Leaving the page stops picking.
  useEffect(() => () => usePins.getState().setPicking(false), []);
  return (
    <>
      <PinDots pins={pins.data ?? []} />
      {picking ? (
        <Picker pathname={pathname} product={product} onDone={stop} />
      ) : null}
    </>
  );
}
