import { Calendar } from "~/features/calendar/calendar";

// The calendar's place in the shell: always visible on desktop, above the
// drawer on phones. The calendar itself lives in src/features/calendar.
export function CalendarRegion() {
  return <Calendar />;
}
