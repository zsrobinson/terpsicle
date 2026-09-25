import { cn } from "cn";
import { type FormEvent, useId, useState } from "react";
import { BlockLabelSchema, type Day } from "~/core/schema";
import { DAY_SHORT_NAMES, formatTime, sortDays } from "~/core/time";
import { Button } from "~/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { WithTooltip } from "~/ui/tooltip";
import type { BlockFields } from "./actions";

// Label (with presets), days, start and end. No place, ever: blocks never
// affect travel time (SPEC §3.7–3.8).

export const BLOCK_PRESETS = ["Lunch", "Work", "Gym", "Club"] as const;
const FORM_DAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
// Every half hour from 7am to 10pm.
const HALF_HOURS = Array.from({ length: 31 }, (_, i) => 7 * 60 + i * 30);

export const NEW_BLOCK: BlockFields = {
  label: "",
  days: ["M", "W"],
  start: 12 * 60,
  end: 13 * 60,
};

/** What's still missing, in words, or null when the block can be saved. */
export function blockProblem(fields: BlockFields): string | null {
  if (!BlockLabelSchema.safeParse(fields.label).success)
    return fields.label.trim() === ""
      ? "Add a label."
      : "Keep the label under 40 characters.";
  if (fields.days.length === 0) return "Pick at least one day.";
  if (fields.end <= fields.start) return "End after it starts.";
  return null;
}

export function BlockForm({
  initial = NEW_BLOCK,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: BlockFields;
  submitLabel: string;
  /** Returns whether it was saved; the form clears after a new block. */
  onSubmit: (fields: BlockFields) => boolean;
  onCancel?: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(initial.label);
  const [days, setDays] = useState<readonly Day[]>(initial.days);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const fields: BlockFields = {
    label: label.trim(),
    days: sortDays(days),
    start,
    end,
  };
  const problem = blockProblem({ ...fields, label });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    if (onSubmit(fields) && !onCancel) setLabel("");
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-2"
      aria-label={submitLabel}
    >
      <fieldset className="flex flex-wrap gap-1" aria-label="Presets">
        {BLOCK_PRESETS.map((preset) => (
          <WithTooltip key={preset} label={`Label it "${preset}"`}>
            <button
              type="button"
              aria-pressed={label === preset}
              onClick={() => setLabel(preset)}
              className={cn(
                "h-6 rounded-md border px-2 text-[11.5px] transition-colors",
                label === preset
                  ? "border-hairline-strong bg-hover text-fg"
                  : "border-hairline text-muted hover:text-fg",
              )}
            >
              {preset}
            </button>
          </WithTooltip>
        ))}
      </fieldset>
      <WithTooltip label="What this time is for">
        <input
          id={`${id}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          aria-label="Label"
          maxLength={40}
          autoComplete="off"
          data-private
          className="h-8 w-full rounded-md border border-hairline bg-bg px-2 text-[12.5px] outline-none placeholder:text-faint focus:border-hairline-strong"
        />
      </WithTooltip>
      <fieldset className="flex gap-1" aria-label="Days">
        {FORM_DAYS.map((day) => {
          const on = days.includes(day);
          return (
            <WithTooltip
              key={day}
              label={
                on
                  ? `Not on ${DAY_SHORT_NAMES[day]}`
                  : `On ${DAY_SHORT_NAMES[day]}`
              }
            >
              <button
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDays(on ? days.filter((d) => d !== day) : [...days, day])
                }
                className={cn(
                  "h-7 flex-1 rounded-md border text-[11.5px] transition-colors",
                  on
                    ? "border-hairline-strong bg-hover font-medium text-fg"
                    : "border-hairline text-muted hover:text-fg",
                )}
              >
                {DAY_SHORT_NAMES[day]}
              </button>
            </WithTooltip>
          );
        })}
      </fieldset>
      <div className="flex items-center gap-2 text-[12px]">
        <TimeSelect label="Starts" value={start} onChange={setStart} />
        <span className="text-muted">to</span>
        <TimeSelect label="Ends" value={end} onChange={setEnd} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <WithTooltip label={problem ?? submitLabel}>
          {/* A disabled button gets no hover, so the tooltip sits on a wrapper. */}
          <span className="flex-1" tabIndex={problem ? 0 : -1}>
            <Button
              type="submit"
              disabled={problem !== null}
              className="w-full text-[12.5px]"
            >
              {submitLabel}
            </Button>
          </span>
        </WithTooltip>
        {onCancel ? (
          <WithTooltip label="Keep it as it was" shortcut="Esc">
            <Button
              type="button"
              variant="ghost"
              className="text-[12.5px]"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </WithTooltip>
        ) : null}
      </div>
      {problem && label.trim() !== "" ? (
        <p className="text-[11.5px] text-muted">{problem}</p>
      ) : null}
    </form>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
}) {
  // A block dragged on the calendar can start off the half hour; keep it.
  const options = HALF_HOURS.includes(value)
    ? HALF_HOURS
    : [...HALF_HOURS, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <WithTooltip label={label}>
        <SelectTrigger
          aria-label={label}
          className="tnum h-8 flex-1 text-[12.5px]"
        >
          <SelectValue />
        </SelectTrigger>
      </WithTooltip>
      <SelectContent className="max-h-72">
        {options.map((m) => (
          <SelectItem key={m} value={String(m)} className="tnum">
            {formatTime(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
