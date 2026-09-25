import type { Day } from "~/core/schema";
import { WeekFrame } from "./week-frame";

// The calendar's place in the shell. M3 part 2 fills it in: hours fit to the
// plan (at least 8am–5pm), Saturday only when needed, blocks, ghosts and
// travel pills, all through WeekFrame's `children`.

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
const EIGHT_AM = 8 * 60;
const FIVE_PM = 17 * 60;

export function CalendarRegion() {
  return (
    <WeekFrame days={WEEKDAYS} startMinute={EIGHT_AM} endMinute={FIVE_PM} />
  );
}
