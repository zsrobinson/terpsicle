import { useEffect, useState } from "react";
import type { AcademicCalendar, TermId } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { DataError } from "~/state/data-source";

// The term's academic calendar (DATA.md §4.5) for .ics export, read through
// the data source when Export opens. A missing file means the provost hasn't
// published the dates yet, which Export says plainly (SPEC §3.0).

export type CalendarState =
  | { kind: "loading" }
  /** `calendar` is null when there's no file for the term yet. */
  | { kind: "ready"; calendar: AcademicCalendar | null }
  | { kind: "error" };

// Per data source, so a new reader (tests, a data-source switch) reads afresh.
const caches = new WeakMap<
  object,
  Map<TermId, Promise<AcademicCalendar | null>>
>();

export function useAcademicCalendar(termId: TermId | null): CalendarState {
  const reader = useCatalog((s) => s.reader);
  const [state, setState] = useState<CalendarState>({ kind: "loading" });
  useEffect(() => {
    if (!termId || !reader) return;
    let cancelled = false;
    setState({ kind: "loading" });
    const cache =
      caches.get(reader) ?? new Map<TermId, Promise<AcademicCalendar | null>>();
    caches.set(reader, cache);
    let pending = cache.get(termId);
    if (!pending) {
      pending = reader.calendar(termId).catch((error: unknown) => {
        if (error instanceof DataError && error.reason === "missing")
          return null;
        // Don't remember a failed read: the next visit tries again.
        cache.delete(termId);
        throw error;
      });
      cache.set(termId, pending);
    }
    pending.then(
      (calendar) => {
        if (!cancelled) setState({ kind: "ready", calendar });
      },
      () => {
        if (!cancelled) setState({ kind: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [termId, reader]);
  return state;
}
