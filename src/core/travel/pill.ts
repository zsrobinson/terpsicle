import type { Connection } from "../schema";

// Which connections get a travel pill on the calendar (SPEC §3.3: pills go
// between back-to-back classes). A connection with a long gap is still a
// connection (the Travel tab lists it), but a pill floating mid-afternoon
// between a 9am class and a 2pm one says nothing, and covers whatever sits
// there. So: back-to-back, or anything that isn't fine, however long the gap.

/** Gaps up to this many minutes count as back-to-back. */
export const PILL_MAX_GAP = 30;

/** Whether the calendar draws a pill for this connection. */
export function shouldShowPill(connection: Connection): boolean {
  return (
    connection.gapMinutes <= PILL_MAX_GAP ||
    connection.verdict === "tight" ||
    connection.verdict === "insufficient"
  );
}
