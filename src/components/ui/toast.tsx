import { Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { WithTooltip } from "~/ui/tooltip";

// The one way every product says what just happened (docs/COHESION.md): a
// change with Undo, or a quiet note. Never red: a failure is information,
// not an alarm (DESIGN.md §5).

/**
 * How long an Undo stays on screen, everywhere: long enough to read and
 * reach it (WCAG 2.2.1). Hovering holds a toast (sonner does that).
 */
export const UNDO_MS = 10_000;

/** How long a note stays on screen: long enough to read (WCAG 2.2.1). */
export const NOTE_MS = 8_000;

/**
 * What each live undo toast still owes when it leaves without Undo, by id.
 * A toast that replaces another with the same id settles the old one first,
 * so a replaced delete is still sent.
 */
const pendingDone = new Map<string, () => void>();

function settlePrevious(id: string): void {
  const previous = pendingDone.get(id);
  pendingDone.delete(id);
  previous?.();
}

/**
 * The sonner id on screen for each of our ids. A toast that's still up is
 * replaced in place (the same sonner id). One that has left gets a fresh id:
 * sonner's Toaster merges an update into a toast that's still animating out,
 * and it leaves with it (a Delete right after Undo showed nothing).
 */
const onScreen = new Map<string, string>();
let shown = 0;

function slotFor(id: string): string {
  const current = onScreen.get(id);
  // Sonner's own word on whether it's still up: a toast can also leave
  // without our callbacks (a dismiss-all, the Toaster going away).
  if (current !== undefined && toast.getToasts().some((t) => t.id === current))
    return current;
  const fresh = `${id}#${++shown}`;
  onScreen.set(id, fresh);
  return fresh;
}

/**
 * Takes down the toast shown under our `id` (an undo toast or a note), as
 * `toast.dismiss` would: callers name toasts by our ids, not sonner's.
 */
export function dismissToast(id: string): void {
  const sonnerId = onScreen.get(id);
  if (sonnerId === undefined) return;
  // Vacated now, so a toast shown straight after is a new one.
  onScreen.delete(id);
  toast.dismiss(sonnerId);
}

/** This toast has left (closed, dismissed or undone): the next is new. */
function vacate(id: string, sonnerId: string): void {
  if (onScreen.get(id) === sonnerId) onScreen.delete(id);
}

/** A toast's button, with its tooltip and shortcut (every control has one). */
export function ToastAction({
  label,
  tooltip = label,
  shortcut,
  icon = <Undo2 size={13} aria-hidden="true" />,
  onClick,
  onFocus,
  onBlur,
}: {
  label: string;
  /** What the tooltip says, when the label alone isn't enough ("Put it back"). */
  tooltip?: string;
  shortcut?: string;
  icon?: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <WithTooltip label={tooltip} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        // 44px on phones, where the toast is a thumb's reach from the edge.
        className="ml-auto flex h-11 shrink-0 items-center gap-1.5 border border-hairline bg-raised px-2.5 font-medium text-base text-fg transition-colors hover:bg-hover md:h-7"
      >
        {icon}
        {label}
      </button>
    </WithTooltip>
  );
}

export type UndoToast = {
  /** One toast per id: a new change replaces the last one's toast. */
  id: string;
  /** What happened, in the past tense: "Review deleted". */
  message: string;
  description?: string;
  onUndo: () => void;
  /** The tooltip on Undo when "Undo" alone is vague: "Put it back". */
  tooltip?: string;
  shortcut?: string;
  /** Called when the toast leaves without Undo: its time ran out, or it was dismissed. */
  onDone?: () => void;
};

/**
 * Says what just changed, with Undo for {@link UNDO_MS}. Focus on Undo holds
 * the toast open, so a keyboard user never loses it mid-reach.
 */
export function undoToast({
  id,
  message,
  description,
  onUndo,
  tooltip,
  shortcut,
  onDone,
}: UndoToast): void {
  settlePrevious(id);
  const sonnerId = slotFor(id);
  // Settled once: Undo pressed, or the toast left without it.
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    if (pendingDone.get(id) === done) pendingDone.delete(id);
    onDone?.();
  };
  pendingDone.set(id, done);
  const show = (duration: number) =>
    toast(message, {
      id: sonnerId,
      description,
      duration,
      action: (
        <ToastAction
          label="Undo"
          tooltip={tooltip}
          shortcut={shortcut}
          onClick={() => {
            if (settled) return;
            settled = true;
            if (pendingDone.get(id) === done) pendingDone.delete(id);
            vacate(id, sonnerId);
            onUndo();
            toast.dismiss(sonnerId);
          }}
          // A settled toast is on its way out: never bring it back.
          onFocus={() => settled || show(Number.POSITIVE_INFINITY)}
          onBlur={() => settled || show(UNDO_MS)}
        />
      ),
      // It left: settle it, and the next toast with this id is a new one.
      onAutoClose: () => {
        vacate(id, sonnerId);
        done();
      },
      onDismiss: () => {
        vacate(id, sonnerId);
        done();
      },
    });
  show(UNDO_MS);
}

let notes = 0;

/**
 * A quiet line: something didn't go through, or needs no action. With
 * `retry`, it offers "Try again" where trying again can help.
 */
export function noteToast(
  message: string,
  options: { id?: string; description?: string; retry?: () => void } = {},
): void {
  const { description, retry } = options;
  // A note that takes an undo toast's place settles it, as a new undo would.
  if (options.id) settlePrevious(options.id);
  const slot = options.id;
  const id = slot ? slotFor(slot) : `note-${++notes}`;
  const leave = () => {
    if (slot) vacate(slot, id);
  };
  toast(message, {
    id,
    description,
    duration: retry ? UNDO_MS : NOTE_MS,
    action: retry ? (
      <ToastAction
        label="Try again"
        icon={null}
        onClick={() => {
          leave();
          toast.dismiss(id);
          retry();
        }}
      />
    ) : undefined,
    // Sonner merges an update into a live toast with the same id; a note
    // must not keep the undo toast's callbacks, only its own.
    onAutoClose: leave,
    onDismiss: leave,
  });
}
