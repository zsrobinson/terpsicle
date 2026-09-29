import { cn } from "cn";
import { ArrowDownWideNarrow, ChevronDown, Funnel } from "lucide-react";
import type { ReactNode } from "react";
import {
  nextLevel,
  type PreferenceLevel,
  preferenceLevels,
  rankByFromLevels,
} from "~/core/generate/preferences";
import { RANK_FACTORS } from "~/core/generate/score";
import type {
  Day,
  FilterCount,
  MustHaves,
  RankBy,
  RankFactor,
  Relaxable,
} from "~/core/schema";
import {
  DAY_LONG_NAMES,
  DAY_SHORT_NAMES,
  formatTime,
  sortDays,
} from "~/core/time";
import { track } from "~/lib/analytics";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { chipClass } from "~/ui/filter-chips";
import { Input } from "~/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// Generate's chips (SPEC §3.9). Two kinds that must never be mistaken for
// each other (the owner, 2026-09-28):
// - Filters take plans out. They're Search's filter chips (square, filled
//   while on, one look for "only these" across the app) with a funnel and
//   the number of plans each one took out, and they say "No…" or "Only…".
// - Preferences put plans in order. They're pills that a click cycles
//   off → on (a light fill) → counted double (outlined, with a dark "2×")
//   → off. Black fill stays the filters', here as in Search.

/** Short, so the six fit two lines of the sidebar. The tooltip says more. */
export const PREFERENCE_LABELS: Record<RankFactor, string> = {
  compact: "Compact days",
  "fewer-days": "Fewer days",
  "later-starts": "Later starts",
  "best-rated": "Best-rated",
  "higher-gpa": "Higher GPAs",
  "safest-seats": "Safest seats",
};

const PREFERENCE_TIPS: Record<RankFactor, string> = {
  compact: "Least idle time between classes",
  "fewer-days": "Fewest days you have to come to campus",
  "later-starts": "Latest first class of the day",
  "best-rated": "Highest PlanetTerp instructor ratings",
  "higher-gpa": "Highest average GPA in past sections",
  "safest-seats": "Most open seats in the tightest section",
};

const LEVEL_WORDS: Record<PreferenceLevel, string> = {
  0: "off",
  1: "on",
  2: "counts double",
};

const LEVEL_TIPS: Record<PreferenceLevel, string> = {
  0: "Off. Click to rank by it.",
  1: "On. Click to count it double.",
  2: "Counts double. Click to turn it off.",
};

const preferenceClass = (level: PreferenceLevel) =>
  cn(
    "flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
    level === 0
      ? "border-hairline text-muted hover:bg-hover hover:text-fg"
      : level === 1
        ? "border-hairline-strong bg-accent-soft text-fg hover:bg-hover"
        : "border-fg bg-accent-soft pr-0.5 font-medium text-fg hover:bg-hover",
  );

/** What ranks the plans: a pill per factor, off, on or double. */
export function PreferenceChips({
  rankBy,
  onChange,
}: {
  rankBy: RankBy;
  onChange: (next: RankBy) => void;
}) {
  const levels = preferenceLevels(rankBy);
  return (
    <fieldset
      aria-label="Preferences"
      data-testid="gen-preferences"
      className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
    >
      {RANK_FACTORS.map((f) => {
        const level = levels[f];
        return (
          <WithTooltip
            key={f}
            label={`${PREFERENCE_TIPS[f]}. ${LEVEL_TIPS[level]}`}
          >
            <button
              type="button"
              aria-pressed={level > 0}
              aria-label={`${PREFERENCE_LABELS[f]}: ${LEVEL_WORDS[level]}`}
              data-level={level}
              onClick={() => {
                const next = nextLevel(level);
                onChange(rankByFromLevels({ ...levels, [f]: next }));
                track("generate_preference_changed", {
                  factor: f,
                  level: next,
                });
              }}
              className={preferenceClass(level)}
            >
              {PREFERENCE_LABELS[f]}
              {level === 2 ? (
                <span
                  aria-hidden="true"
                  className="tnum rounded-full bg-fg px-1 text-2xs text-bg leading-4"
                >
                  2×
                </span>
              ) : null}
            </button>
          </WithTooltip>
        );
      })}
    </fieldset>
  );
}

const START_OPTIONS = [8, 9, 10, 11, 12, 13].map((h) => h * 60);
const END_OPTIONS = [14, 15, 16, 17, 18, 19, 20, 21].map((h) => h * 60);
const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
/** Radix values can't be empty, so "Any time" gets its own. */
const ANY = "any";

type Counts = ReadonlyMap<Relaxable, FilterCount> | null;

/** "−38", "−38+": how many plans a filter took out; nothing when none. */
function countText(count: FilterCount | undefined): string | null {
  if (!count || count.removed === 0) return null;
  return `−${count.removed.toLocaleString()}${count.atLeast ? "+" : ""}`;
}

/** The tooltip's first words for a filter that's on. */
function countTip(count: FilterCount | undefined): string {
  if (!count) return "";
  if (count.removed === 0) return "Takes out none of these plans. ";
  const n = count.removed.toLocaleString();
  const plans = count.removed === 1 ? "plan" : "plans";
  return count.atLeast
    ? `Takes out at least ${n} ${plans}. `
    : `Takes out ${n} ${plans}. `;
}

/** A filter chip's face: the funnel while it's on, its words, its count. */
function Face({
  on,
  label,
  count,
  menu = false,
}: {
  on: boolean;
  label: ReactNode;
  count: FilterCount | undefined;
  menu?: boolean;
}) {
  const n = on ? countText(count) : null;
  return (
    <>
      {on ? <Funnel size={10} aria-hidden="true" /> : null}
      <span>{label}</span>
      {n ? <span className="tnum opacity-70">{n}</span> : null}
      {menu ? <ChevronDown size={10} aria-hidden="true" /> : null}
    </>
  );
}

const filterClass = (on: boolean) => cn(chipClass(on), "gap-1 px-1.5");

function ToggleFilter({
  on,
  label,
  tip,
  count,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  label: string;
  tip: string;
  count: FilterCount | undefined;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <WithTooltip label={on ? `${countTip(count)}${tip}` : tip}>
      {/* A disabled button gets no pointer events; the span keeps the tooltip. */}
      <span className="flex">
        <button
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={onToggle}
          className={cn(filterClass(on), "disabled:opacity-50")}
        >
          <Face on={on} label={label} count={count} />
        </button>
      </span>
    </WithTooltip>
  );
}

function TimeFilter({
  name,
  value,
  options,
  offLabel,
  onLabel,
  tip,
  count,
  onChange,
}: {
  name: string;
  value: number | null;
  options: readonly number[];
  offLabel: string;
  onLabel: (time: string) => string;
  tip: string;
  count: FilterCount | undefined;
  onChange: (value: number | null) => void;
}) {
  const on = value !== null;
  const label = on ? onLabel(formatTime(value)) : offLabel;
  return (
    <DropdownMenu>
      <WithTooltip label={on ? `${countTip(count)}${tip}` : tip}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${name}: ${on ? label : "any time"}`}
            className={filterClass(on)}
          >
            <Face on={on} label={label} count={count} menu />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="min-w-[160px]">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value === null ? ANY : String(value)}
          onValueChange={(v) => onChange(v === ANY ? null : Number(v))}
        >
          <DropdownMenuRadioItem value={ANY}>Any time</DropdownMenuRadioItem>
          {options.map((m) => (
            <DropdownMenuRadioItem key={m} value={String(m)} className="tnum">
              {onLabel(formatTime(m))}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "No Fridays", "No Mon, Fri". */
function daysOffLabel(days: readonly Day[]): string {
  const [only] = days;
  if (only && days.length === 1) return `No ${DAY_LONG_NAMES[only]}s`;
  return `No ${sortDays(days)
    .map((d) => DAY_SHORT_NAMES[d])
    .join(", ")}`;
}

function DaysOffFilter({
  days,
  count,
  onChange,
}: {
  days: readonly Day[];
  count: FilterCount | undefined;
  onChange: (days: Day[]) => void;
}) {
  const on = days.length > 0;
  const label = on ? daysOffLabel(days) : "Days off";
  const tip = on
    ? `Only plans with no class on ${sortDays(days)
        .map((d) => `${DAY_LONG_NAMES[d]}s`)
        .join(" or ")}`
    : "Only plans that keep the days you pick free";
  return (
    <DropdownMenu>
      <WithTooltip label={on ? `${countTip(count)}${tip}` : tip}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={on ? `Days off: ${label}` : "Days off"}
            className={filterClass(on)}
          >
            <Face on={on} label={label} count={count} menu />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="min-w-[160px]">
        <DropdownMenuLabel>No classes on</DropdownMenuLabel>
        {WEEKDAYS.map((day) => (
          <DropdownMenuCheckboxItem
            key={day}
            checked={days.includes(day)}
            onCheckedChange={() =>
              onChange(
                days.includes(day)
                  ? days.filter((d) => d !== day)
                  : sortDays([...days, day]),
              )
            }
          >
            {DAY_LONG_NAMES[day]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function creditValue(text: string): number | null {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : null;
}

/** "12–16 credits", "12+ credits", "Up to 16 credits". */
function creditsLabel({ min, max }: MustHaves["credits"]): string | null {
  if (min !== null && max !== null) return `${min}–${max} credits`;
  if (min !== null) return `${min}+ credits`;
  if (max !== null) return `Up to ${max} credits`;
  return null;
}

function CreditsFilter({
  credits,
  count,
  onChange,
}: {
  credits: MustHaves["credits"];
  count: FilterCount | undefined;
  onChange: (credits: MustHaves["credits"]) => void;
}) {
  const label = creditsLabel(credits);
  const on = label !== null;
  const tip = on
    ? `Only plans with ${label}`
    : "Only plans with a number of credits you set";
  return (
    <Popover>
      <WithTooltip label={on ? `${countTip(count)}${tip}` : tip}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={on ? `Credits: ${label}` : "Credits"}
            className={filterClass(on)}
          >
            <Face on={on} label={label ?? "Credits"} count={count} menu />
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent className="w-60">
        <p className="emph-label mb-2 text-sm">Credits</p>
        <div className="flex items-center gap-1.5 text-sm">
          <WithTooltip label="At least this many credits">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={30}
              aria-label="Fewest credits"
              placeholder="Any"
              value={credits.min ?? ""}
              onChange={(e) =>
                onChange({ ...credits, min: creditValue(e.target.value) })
              }
              className="tnum w-0 flex-1 px-2"
            />
          </WithTooltip>
          <span className="text-muted">to</span>
          <WithTooltip label="At most this many credits">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={30}
              aria-label="Most credits"
              placeholder="Any"
              value={credits.max ?? ""}
              onChange={(e) =>
                onChange({ ...credits, max: creditValue(e.target.value) })
              }
              className="tnum w-0 flex-1 px-2"
            />
          </WithTooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** What takes plans out: a chip per must-have, each saying what it took. */
export function FilterChipsForGenerate({
  mustHaves,
  onChange,
  blockCount,
  counts,
}: {
  mustHaves: MustHaves;
  onChange: (next: MustHaves, filter: Relaxable, on: boolean) => void;
  /** The term's blocks, for "Not in my blocks". */
  blockCount: number;
  /** What each filter took out of the results on screen, when they match. */
  counts: Counts;
}) {
  const set = (patch: Partial<MustHaves>, filter: Relaxable, on: boolean) =>
    onChange({ ...mustHaves, ...patch }, filter, on);
  const count = (c: Relaxable) => counts?.get(c);
  return (
    <fieldset
      aria-label="Filters"
      data-testid="gen-filters"
      className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
    >
      <TimeFilter
        name="No classes before"
        value={mustHaves.earliestStart}
        options={START_OPTIONS}
        offLabel="Start time"
        onLabel={(t) => `No classes before ${t}`}
        tip={
          mustHaves.earliestStart === null
            ? "Only plans with no class before a time you pick"
            : `Only plans with no class before ${formatTime(mustHaves.earliestStart)}`
        }
        count={count("earliest-start")}
        onChange={(earliestStart) =>
          set({ earliestStart }, "earliest-start", earliestStart !== null)
        }
      />
      <TimeFilter
        name="No classes after"
        value={mustHaves.latestEnd}
        options={END_OPTIONS}
        offLabel="End time"
        onLabel={(t) => `No classes after ${t}`}
        tip={
          mustHaves.latestEnd === null
            ? "Only plans with no class after a time you pick"
            : `Only plans with no class after ${formatTime(mustHaves.latestEnd)}`
        }
        count={count("latest-end")}
        onChange={(latestEnd) =>
          set({ latestEnd }, "latest-end", latestEnd !== null)
        }
      />
      <DaysOffFilter
        days={mustHaves.daysOff}
        count={count("days-off")}
        onChange={(daysOff) => set({ daysOff }, "days-off", daysOff.length > 0)}
      />
      <ToggleFilter
        on={mustHaves.openSeatsOnly}
        label="Only open seats"
        tip="Only plans where every section has a seat open"
        count={count("open-seats-only")}
        onToggle={() =>
          set(
            { openSeatsOnly: !mustHaves.openSeatsOnly },
            "open-seats-only",
            !mustHaves.openSeatsOnly,
          )
        }
      />
      <ToggleFilter
        on={mustHaves.enoughTravelTime}
        label="Time to walk"
        tip="Only plans with time to get between classes, at your pace in Travel"
        count={count("enough-travel-time")}
        onToggle={() =>
          set(
            { enoughTravelTime: !mustHaves.enoughTravelTime },
            "enough-travel-time",
            !mustHaves.enoughTravelTime,
          )
        }
      />
      <ToggleFilter
        on={mustHaves.respectBlocks && blockCount > 0}
        disabled={blockCount === 0}
        label={
          blockCount > 0
            ? `Not in my blocks (${blockCount})`
            : "Not in my blocks"
        }
        tip={
          blockCount > 0
            ? "Only plans that keep classes out of the time you blocked off"
            : "You have no blocks this term. Add them in Blocks."
        }
        count={count("respect-blocks")}
        onToggle={() =>
          set(
            { respectBlocks: !mustHaves.respectBlocks },
            "respect-blocks",
            !mustHaves.respectBlocks,
          )
        }
      />
      <CreditsFilter
        credits={mustHaves.credits}
        count={count("credits")}
        onChange={(credits) =>
          set(
            { credits },
            "credits",
            credits.min !== null || credits.max !== null,
          )
        }
      />
    </fieldset>
  );
}

/**
 * The two rows of chips over the results, compact, each led by its icon so
 * the list and what shaped it read together.
 */
export function ChipBar({
  filters,
  preferences,
}: {
  filters: ReactNode;
  preferences: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <WithTooltip label="Filters take out plans that don't match">
          <span className="flex h-6 shrink-0 items-center text-faint">
            <Funnel size={12} aria-label="Filters" />
          </span>
        </WithTooltip>
        <div className="min-w-0 flex-1">{filters}</div>
      </div>
      <div className="flex items-start gap-2">
        <WithTooltip label="Preferences put the plans in order">
          <span className="flex h-6 shrink-0 items-center text-faint">
            <ArrowDownWideNarrow size={12} aria-label="Preferences" />
          </span>
        </WithTooltip>
        <div className="min-w-0 flex-1">{preferences}</div>
      </div>
    </div>
  );
}
