import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { track } from "~/app/analytics";
import { GEN_ED_LABELS, type GenEdCode } from "~/core/schema";
import {
  CREDIT_OPTIONS,
  LEVEL_OPTIONS,
  type SearchFilters,
} from "~/core/search";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { WithTooltip } from "~/ui/tooltip";

// One line of chips under the search box (SPEC §3.5): dropdowns and toggles
// that fill in black (or white) while they're narrowing the results.

export type FilterName =
  | "gen-eds"
  | "credits"
  | "fits"
  | "open-seats"
  | "level";

const GEN_EDS = Object.keys(GEN_ED_LABELS) as GenEdCode[];

const chipClass = (active: boolean) =>
  cn(
    "flex h-6 shrink-0 items-center gap-px rounded-md border px-1.5 text-xs transition-colors",
    active
      ? "border-fg bg-fg text-bg hover:bg-fg/85"
      : "border-hairline text-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg",
  );

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/** "Gen-eds", "DSHU", "Gen-eds · 3": short, so the chips stay on one line. */
function summary(label: string, picked: readonly string[]): string {
  if (picked.length === 0) return label;
  if (picked.length === 1) return picked[0] ?? label;
  return `${label} · ${picked.length}`;
}

export function FilterChips({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
}) {
  const change = (name: FilterName, next: SearchFilters) => {
    track("search_filter_changed", { filter: name });
    onChange(next);
  };
  return (
    <div className="scroll-thin flex items-center gap-1 overflow-x-auto">
      <MultiChip
        label="Gen-eds"
        tooltip="Only courses that count for these gen-eds"
        picked={filters.genEds}
        options={GEN_EDS.map((code) => ({
          value: code,
          label: (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="ident text-sm">{code}</span>
              <span className="truncate text-muted">{GEN_ED_LABELS[code]}</span>
            </span>
          ),
        }))}
        onToggle={(code) =>
          change("gen-eds", {
            ...filters,
            genEds: toggle(filters.genEds, code),
          })
        }
        heading="Counts for all of"
      />
      <MultiChip
        label="Credits"
        tooltip="Only courses worth these credits"
        picked={filters.credits}
        format={(n) => (n === CREDIT_OPTIONS.at(-1) ? `${n}+` : String(n))}
        options={CREDIT_OPTIONS.map((n) => ({
          value: n,
          label:
            n === CREDIT_OPTIONS.at(-1)
              ? `${n} or more credits`
              : `${n} credit${n === 1 ? "" : "s"}`,
        }))}
        onToggle={(n) =>
          change("credits", { ...filters, credits: toggle(filters.credits, n) })
        }
      />
      <ToggleChip
        label="Fits my plan"
        tooltip="Only courses with a section that fits your classes, blocks and travel time"
        on={filters.fitsMyPlan}
        onToggle={() =>
          change("fits", { ...filters, fitsMyPlan: !filters.fitsMyPlan })
        }
      />
      <ToggleChip
        label="Open seats"
        tooltip="Only courses with a section that has a seat open"
        on={filters.openSeats}
        onToggle={() =>
          change("open-seats", { ...filters, openSeats: !filters.openSeats })
        }
      />
      <MultiChip
        label="Level"
        tooltip="Only courses at these levels"
        picked={filters.levels}
        options={LEVEL_OPTIONS.map((n) => ({ value: n, label: `${n}-level` }))}
        onToggle={(n) =>
          change("level", { ...filters, levels: toggle(filters.levels, n) })
        }
      />
    </div>
  );
}

function ToggleChip({
  label,
  tooltip,
  on,
  onToggle,
}: {
  label: string;
  tooltip: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <WithTooltip label={tooltip}>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={chipClass(on)}
      >
        {label}
      </button>
    </WithTooltip>
  );
}

function MultiChip<T extends string | number>({
  label,
  tooltip,
  picked,
  options,
  onToggle,
  format = String,
  heading,
}: {
  label: string;
  tooltip: string;
  picked: readonly T[];
  options: readonly { value: T; label: ReactNode }[];
  onToggle: (value: T) => void;
  format?: (value: T) => string;
  heading?: string;
}) {
  const active = picked.length > 0;
  const ordered = options
    .map((o) => o.value)
    .filter((v) => picked.includes(v))
    .map(format);
  return (
    <DropdownMenu>
      <WithTooltip label={tooltip}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={active ? `${label}: ${ordered.join(", ")}` : label}
            className={chipClass(active)}
          >
            <span className={cn(active && label === "Gen-eds" && "ident")}>
              {summary(label, ordered)}
            </span>
            <ChevronDown size={10} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent className="max-h-80 min-w-[200px]">
        {heading ? <DropdownMenuLabel>{heading}</DropdownMenuLabel> : null}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={String(o.value)}
            checked={picked.includes(o.value)}
            onCheckedChange={() => onToggle(o.value)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
