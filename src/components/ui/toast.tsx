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

/** How long a note with nothing to press stays on screen. */
export const NOTE_MS = 6_000;

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
  // Settled once: Undo pressed, or the toast left without it.
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    onDone?.();
  };
  const show = (duration: number) =>
    toast(message, {
      id,
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
            onUndo();
            toast.dismiss(id);
          }}
          // A settled toast is on its way out: never bring it back.
          onFocus={() => settled || show(Number.POSITIVE_INFINITY)}
          onBlur={() => settled || show(UNDO_MS)}
        />
      ),
      onAutoClose: done,
      onDismiss: done,
    });
  show(UNDO_MS);
}

/**
 * A quiet line: something didn't go through, or needs no action. With
 * `retry`, it offers "Try again" where trying again can help.
 */
export function noteToast(
  message: string,
  options: { id?: string; description?: string; retry?: () => void } = {},
): void {
  const { id, description, retry } = options;
  toast(message, {
    id,
    description,
    duration: retry ? UNDO_MS : NOTE_MS,
    action: retry ? (
      <ToastAction
        label="Try again"
        icon={null}
        onClick={() => {
          if (id) toast.dismiss(id);
          retry();
        }}
      />
    ) : undefined,
  });
}
