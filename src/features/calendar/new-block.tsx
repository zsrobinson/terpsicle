import { cn } from "cn";
import { type CSSProperties, useState } from "react";
import { addBlock } from "~/app/actions";
import { DAYS, type Day } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTimeRange } from "~/core/time";
import { Button } from "~/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// Drag to block time (SPEC §3.3, §3.8): the outline while dragging, then a
// small popup asking for a label. A block is labeled time and nothing else:
// no place, no notes (DESIGN §5: don't over-model).

/**
 * Blocks snap to 15 minutes. Classes sit on 5-minute marks, but a block is
 * rough personal time ("lunch around noon"), and 15-minute steps are easy to
 * hit with a pointer and read cleanly ("12:15pm", not "12:05pm").
 */
export const BLOCK_SNAP = 15;

export const BLOCK_PRESETS = ["Lunch", "Work", "Gym", "Club"] as const;

export interface BlockDraft {
  days: readonly Day[];
  start: number;
  end: number;
}

/** The time under the pointer, snapped, inside the grid's hours. */
export function snapMinute(
  minute: number,
  bounds: { start: number; end: number },
): number {
  const snapped = Math.round(minute / BLOCK_SNAP) * BLOCK_SNAP;
  return Math.min(bounds.end, Math.max(bounds.start, snapped));
}

/** Days between two columns, in week order, whichever way the drag went. */
export function daysBetween(
  columns: readonly Day[],
  a: number,
  b: number,
): Day[] {
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(columns.length - 1, Math.max(a, b));
  return columns.slice(lo, hi + 1);
}

export function draftLabel(draft: BlockDraft): string {
  const days = DAYS.filter((d) => draft.days.includes(d))
    .map((d) => DAY_SHORT_NAMES[d])
    .join(", ");
  return `${days} · ${formatTimeRange(draft.start, draft.end)}`;
}

/** The outline of the time being blocked, in one day column. */
export function DraftOutline({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-30 rounded-md border-[1.5px] border-fg/60 bg-accent-soft"
      style={style}
    />
  );
}

/** The popup for a finished drag, anchored at the outline. */
export function NewBlockPopover({
  draft,
  anchorStyle,
  onDone,
}: {
  draft: BlockDraft;
  anchorStyle: CSSProperties;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const save = (text: string) => {
    const clean = text.trim().slice(0, 40);
    if (!clean) return;
    addBlock(
      {
        label: clean,
        days: [...draft.days],
        start: draft.start,
        end: draft.end,
      },
      "drag",
    );
    onDone();
  };
  return (
    <Popover open onOpenChange={(open) => !open && onDone()}>
      <PopoverAnchor asChild>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={anchorStyle}
        />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        className="w-60"
        aria-label="New block"
        onOpenAutoFocus={(event) => {
          // Focus the label field rather than the first preset.
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLInputElement>("input")
            ?.focus();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(label);
          }}
        >
          <div className="tnum text-muted text-sm">{draftLabel(draft)}</div>
          {/* No tooltip: the field is focused on open, and a focus tooltip
              would cover the time above it. The placeholder says it. */}
          <input
            aria-label="Block label"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What's this time for?"
            className="mt-1.5 h-8 w-full rounded-md border border-hairline bg-bg px-2 text-base outline-none placeholder:text-faint focus:border-hairline-strong"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {BLOCK_PRESETS.map((preset) => (
              <WithTooltip key={preset} label={`Block this time for ${preset}`}>
                <button
                  type="button"
                  onClick={() => save(preset)}
                  className="h-6 rounded-md border border-hairline px-1.5 text-muted text-sm transition-colors hover:bg-hover hover:text-fg"
                >
                  {preset}
                </button>
              </WithTooltip>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-1">
            <WithTooltip label="Don't add a block" shortcut="Esc">
              <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                Cancel
              </Button>
            </WithTooltip>
            <WithTooltip label="Add this block" shortcut="↵">
              <Button
                type="submit"
                size="sm"
                disabled={!label.trim()}
                className={cn(!label.trim() && "opacity-50")}
              >
                Add block
              </Button>
            </WithTooltip>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
