// Quiet hours (docs/V2.md §6.7): 11pm to 8am in College Park, on by
// default. A push that would land in them waits, and at 8am each group
// that waited arrives as one push. Seat openings come through by default
// (a seat can be gone by morning), with their own switch; the owner's
// urgent moderation alerts have no settings and always come through. Pure:
// the time is an argument.
import type {
  NotificationSettings,
  NotificationType,
} from "../schema/notifications";

export const QUIET_HOURS = {
  /** 11pm, America/New_York. */
  startHour: 23,
  /** 8am: held pushes go then. */
  endHour: 8,
  timeZone: "America/New_York",
} as const;

const HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: QUIET_HOURS.timeZone,
  hour: "numeric",
  hourCycle: "h23",
});

/** The hour (0–23) in College Park at `now`, daylight saving included. */
export function easternHour(now: Date): number {
  const hour = HOUR.formatToParts(now).find((p) => p.type === "hour");
  return Number(hour?.value ?? 0) % 24;
}

/** Whether `now` is between 11pm and 8am in College Park. */
export function inQuietHours(now: Date): boolean {
  const hour = easternHour(now);
  return hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour;
}

/**
 * Whether a push of `type` waits for 8am instead of going now: quiet hours
 * are on and it's night, unless it's a seat opening and seats come through.
 */
export function holdsPush(
  settings: NotificationSettings,
  type: NotificationType | "admin-urgent",
  now: Date,
): boolean {
  if (type === "admin-urgent") return false;
  if (!settings.quietHours.on) return false;
  if (type === "seat-open" && settings.seatThroughQuiet) return false;
  return inQuietHours(now);
}
