import { useId } from "react";
import { firstTermChoices, fourYearTermLabel } from "~/core/four-year/terms";
import type { IsoDate, TermId } from "~/core/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { WithTooltip } from "~/ui/tooltip";

// Where a four-year plan starts: its first fall or spring at UMD, from the
// first visit ("I started at UMD in") and the Samples view ("Your plan
// starts in"), which counts a sample's semesters from there. The kit's
// Select, labeled in words beside it.

export function FirstTermSelect({
  label,
  tooltip,
  value,
  today,
  onChange,
}: {
  label: string;
  tooltip: string;
  value: TermId;
  today: IsoDate;
  onChange: (term: TermId) => void;
}) {
  const id = useId();
  const choices = firstTermChoices(today);
  // A plan made elsewhere may start outside today's choices.
  const terms = choices.includes(value) ? choices : [value, ...choices];
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-muted text-sm">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <WithTooltip label={tooltip}>
          <SelectTrigger id={id} className="min-w-32">
            <SelectValue />
          </SelectTrigger>
        </WithTooltip>
        <SelectContent>
          {terms.map((term) => (
            <SelectItem key={term} value={term}>
              {fourYearTermLabel(term)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
