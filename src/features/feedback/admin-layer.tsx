import { Undo2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ToastAction } from "~/app/toast-action";
import { elementCrop } from "~/core/feedback/redact";
import type { FeedbackProduct, Pin } from "~/core/schema/feedback";
import { feedbackApi } from "~/server/fns/feedback-api";
import { Button } from "~/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { quietTooltips, WithTooltip } from "~/ui/tooltip";
import { describeElement } from "./element";
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

function PinDots() {
  const pins = usePins((s) => s.pins);
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
  product,
  onDone,
}: {
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
  element,
  at,
  product,
  onCancel,
  onPinned,
}: {
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
      const result = await feedbackApi.pin({
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
      });
      const pathname = window.location.pathname;
      void usePins.getState().load(pathname);
      const toastId = `feedback-pin-${result.id}`;
      toast("Pinned.", {
        id: toastId,
        duration: 10_000,
        action: (
          <ToastAction
            label="Undo"
            icon={<Undo2 size={14} aria-hidden="true" />}
            onClick={() => {
              toast.dismiss(toastId);
              void feedbackApi
                .undo({ id: result.id, undoToken: result.undoToken })
                .then(({ status }) => {
                  if (status !== "undone")
                    toast("Too late to undo: the note's already in the inbox.");
                  return usePins.getState().load(pathname);
                })
                .catch(() =>
                  toast("Couldn't undo. Check your connection and try again."),
                );
            }}
          />
        ),
      });
      onPinned();
    } catch (e) {
      setError(sendFailure(e, false));
      setSaving(false);
    }
  };

  return (
    <Popover open onOpenChange={(open) => (open ? null : onCancel())}>
      <PopoverAnchor asChild>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
        />
      </PopoverAnchor>
      <PopoverContent
        data-feedback-ui=""
        side="bottom"
        align="start"
        className="w-[300px]"
        onInteractOutside={(e) => e.preventDefault()}
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
          {error ? (
            <p role="alert" className="text-sm">
              {error}
            </p>
          ) : null}
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

/**
 * Everything admin-only on a page: the dots, and the picker while "Pin a
 * note" is on. Loads its route's pins, again whenever the route changes.
 */
export function AdminLayer({
  pathname,
  product,
}: {
  pathname: string;
  product: FeedbackProduct;
}) {
  const picking = usePins((s) => s.picking);
  const stop = useCallback(() => usePins.getState().setPicking(false), []);
  useEffect(() => {
    void usePins.getState().load(pathname);
  }, [pathname]);
  // Leaving the page stops picking.
  useEffect(() => () => usePins.getState().setPicking(false), []);
  return (
    <>
      <PinDots />
      {picking ? <Picker product={product} onDone={stop} /> : null}
    </>
  );
}
