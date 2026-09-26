import { create } from "zustand";
import {
  type LocalSeatAlert,
  LocalSeatAlertSchema,
  type SectionKey,
  type TermId,
  validRows,
} from "~/core/schema";
import type { TerpsicleDb } from "./db";

// This browser's seat alerts (DATA.md §5, the `seatAlerts` settings row): the
// list under Export → Seat alerts, and what the course-details bell reads.
// Writes go straight through to Dexie, so a caller can await them (the alerts
// inbox is cleared only once its entries have landed). Talking to the server
// lives in src/features/alerts.

/** Whether seat alerts are on, as far as the server has told us. */
export type SeatAlertsAvailability = "unknown" | "available" | "unavailable";

export interface SeatAlertsState {
  alerts: readonly LocalSeatAlert[];
  /** False until the table has been read (or storage turned out blocked). */
  loaded: boolean;
  /** "unavailable" (the flag is off) hides every seat-alert control. */
  availability: SeatAlertsAvailability;

  /** Adds or replaces rows, keyed by term and section. */
  put: (rows: readonly LocalSeatAlert[]) => Promise<void>;
  remove: (termId: TermId, sectionKey: SectionKey) => Promise<void>;
  setAvailability: (availability: SeatAlertsAvailability) => void;
}

export const INITIAL_SEAT_ALERTS_STATE = {
  alerts: [],
  loaded: false,
  availability: "unknown",
} satisfies Partial<SeatAlertsState>;

const sameWatch =
  (termId: TermId, sectionKey: SectionKey) => (a: LocalSeatAlert) =>
    a.termId === termId && a.sectionKey === sectionKey;

// The open database, once `startSeatAlerts` has run; null keeps the list in
// memory only (blocked storage, tests).
let database: TerpsicleDb | null = null;

const SEAT_ALERTS_ROW = "seatAlerts";

/** Writes the whole list: a handful of watches in one settings row. */
async function save(): Promise<void> {
  await database?.settings.put({
    key: SEAT_ALERTS_ROW,
    value: [...useSeatAlerts.getState().alerts],
  });
}

export const useSeatAlerts = create<SeatAlertsState>()((set, get) => ({
  ...INITIAL_SEAT_ALERTS_STATE,

  put: async (rows) => {
    if (rows.length === 0) return;
    const rest = get().alerts.filter(
      (a) => !rows.some((r) => sameWatch(r.termId, r.sectionKey)(a)),
    );
    set({ alerts: [...rest, ...rows] });
    await save();
  },

  remove: async (termId, sectionKey) => {
    if (!get().alerts.some(sameWatch(termId, sectionKey))) return;
    set({
      alerts: get().alerts.filter((a) => !sameWatch(termId, sectionKey)(a)),
    });
    await save();
  },

  setAvailability: (availability) => {
    if (get().availability !== availability) set({ availability });
  },
}));

/**
 * Reads the row into the store and keeps writing changes to it. Invalid
 * entries are skipped one by one, never fatal (DATA.md §5).
 */
export async function startSeatAlerts(db: TerpsicleDb): Promise<void> {
  database = db;
  const row: { value?: unknown } | undefined =
    await db.settings.get(SEAT_ALERTS_ROW);
  const rows = validRows(
    "seatAlerts",
    LocalSeatAlertSchema,
    Array.isArray(row?.value) ? row.value : [],
  );
  // A later start (React remounting the app) owns the store now.
  if (database !== db) return;
  useSeatAlerts.setState({ alerts: rows, loaded: true });
}

/** Storage is blocked: keep the list for this tab only. */
export function startSeatAlertsInMemory(): void {
  database = null;
  useSeatAlerts.setState({ loaded: true });
}

/** The watch on one section in this browser, if any. */
export function findSeatAlert(
  alerts: readonly LocalSeatAlert[],
  termId: TermId,
  sectionKey: SectionKey,
): LocalSeatAlert | undefined {
  return alerts.find(sameWatch(termId, sectionKey));
}
