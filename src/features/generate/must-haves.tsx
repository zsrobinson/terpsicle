import { cn } from "cn";
import type { ReactNode } from "react";
import type { Day, MustHaves } from "~/core/schema";
import { DAY_LONG_NAMES, formatTime, sortDays } from "~/core/time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { WithTooltip } from "~/ui/tooltip";

// Hard limits every generated plan meets (SPEC §3.9). Defaults: enough time
// between classes and respect my blocks on, nothing else.

const START_OPTIONS = [8, 9, 10, 11, 12, 13].map((h) => h * 60);
const END_OPTIONS = [14, 15, 16, 17, 18, 19, 20, 21].map((h) => h * 60);
const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
const DAY_SHORT: Partial<Record<Day, string>> = {
  M: "Mo",
  Tu: "Tu",
  W: "We",
  Th: "Th",
  F: "Fr",
};

const selectClass =
  "h-7 min-w-0 flex-1 rounded-md border border-hairline-strong bg-bg px-1.5 text-[12px] focus:border-fg/40";

/** Radix values can't be empty, so "Any time" gets its own. */
const ANY = "any";

function TimeSelect({
  label,
  tip,
  value,
  options,
  onChange,
}: {
  label: string;
  tip: string;
  value: number | null;
  options: readonly number[];
  onChange: (value: number | null) => void;
}) {
  return (
    <Select
      value={value === null ? ANY : String(value)}
      onValueChange={(v) => onChange(v === ANY ? null : Number(v))}
    >
      <WithTooltip label={tip}>
        <SelectTrigger aria-label={label} className="tnum flex-1">
          <SelectValue />
        </SelectTrigger>
      </WithTooltip>
      <SelectContent>
        <SelectItem value={ANY}>Any time</SelectItem>
        {options.map((m) => (
          <SelectItem key={m} value={String(m)} className="tnum">
            {formatTime(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      {children}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  tip,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  tip: string;
  testId: string;
}) {
  return (
    <WithTooltip label={tip} side="right">
      <label className="flex w-fit items-center gap-2 text-[12.5px]">
        <input
          type="checkbox"
          data-testid={testId}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="size-3.5 accent-accent"
        />
        {label}
      </label>
    </WithTooltip>
  );
}

function creditValue(text: string): number | null {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function MustHaveFields({
  mustHaves,
  onChange,
  blockCount,
}: {
  mustHaves: MustHaves;
  onChange: (next: MustHaves) => void;
  /** The term's blocks, for "Respect my blocks". */
  blockCount: number;
}) {
  const set = (patch: Partial<MustHaves>) =>
    onChange({ ...mustHaves, ...patch });
  const toggleDay = (day: Day) =>
    set({
      daysOff: mustHaves.daysOff.includes(day)
        ? mustHaves.daysOff.filter((d) => d !== day)
        : sortDays([...mustHaves.daysOff, day]),
    });
  return (
    <div className="flex flex-col gap-2 px-4">
      <Row label="Start after">
        <TimeSelect
          label="Start after"
          tip="No class starts before this"
          value={mustHaves.earliestStart}
          options={START_OPTIONS}
          onChange={(earliestStart) => set({ earliestStart })}
        />
      </Row>
      <Row label="Done by">
        <TimeSelect
          label="Done by"
          tip="No class ends after this"
          value={mustHaves.latestEnd}
          options={END_OPTIONS}
          onChange={(latestEnd) => set({ latestEnd })}
        />
      </Row>
      <Row label="Days off">
        <div className="flex flex-1 gap-1">
          {WEEKDAYS.map((day) => {
            const off = mustHaves.daysOff.includes(day);
            return (
              <WithTooltip
                key={day}
                label={
                  off
                    ? `No classes on ${DAY_LONG_NAMES[day]}s`
                    : `Keep ${DAY_LONG_NAMES[day]}s free`
                }
              >
                <button
                  type="button"
                  aria-pressed={off}
                  aria-label={`${DAY_LONG_NAMES[day]} off`}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-7 flex-1 rounded-md border text-[11.5px]",
                    off
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-hairline-strong text-muted hover:bg-hover",
                  )}
                >
                  {DAY_SHORT[day] ?? day}
                </button>
              </WithTooltip>
            );
          })}
        </div>
      </Row>
      <Row label="Credits">
        <div className="flex flex-1 items-center gap-1.5">
          <WithTooltip label="At least this many credits">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={30}
              aria-label="Fewest credits"
              placeholder="Any"
              value={mustHaves.credits.min ?? ""}
              onChange={(e) =>
                set({
                  credits: {
                    ...mustHaves.credits,
                    min: creditValue(e.target.value),
                  },
                })
              }
              className={cn(selectClass, "tnum w-0 px-2")}
            />
          </WithTooltip>
          <span className="text-muted">to</span>
          <WithTooltip label="At most this many credits">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={30}
              aria-label="Most credits"
              placeholder="Any"
              value={mustHaves.credits.max ?? ""}
              onChange={(e) =>
                set({
                  credits: {
                    ...mustHaves.credits,
                    max: creditValue(e.target.value),
                  },
                })
              }
              className={cn(selectClass, "tnum w-0 px-2")}
            />
          </WithTooltip>
        </div>
      </Row>
      <div className="flex flex-col gap-1.5 pt-0.5">
        <Check
          testId="gen-travel"
          checked={mustHaves.enoughTravelTime}
          onChange={(v) => set({ enoughTravelTime: v })}
          label="Enough time to get between classes"
          tip="Skips plans with a walk that takes longer than the break, at your pace in Travel"
        />
        <Check
          testId="gen-open-seats"
          checked={mustHaves.openSeatsOnly}
          onChange={(v) => set({ openSeatsOnly: v })}
          label="Open seats only"
          tip="Skips sections with no open seats"
        />
        <Check
          testId="gen-blocks"
          checked={mustHaves.respectBlocks}
          onChange={(v) => set({ respectBlocks: v })}
          label={
            <>
              Respect my blocks
              {blockCount > 0 ? (
                <span className="tnum text-faint">({blockCount})</span>
              ) : null}
            </>
          }
          tip={
            blockCount > 0
              ? "Keeps classes out of the time you blocked off"
              : "You have no blocks this term. Add them in Blocks."
          }
        />
      </div>
    </div>
  );
}
