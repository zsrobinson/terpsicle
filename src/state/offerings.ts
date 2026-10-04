import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { DeptCode, TermId } from "~/core/schema";
import type { HistoryDept } from "~/core/schema/history";
import {
  historyDept,
  historyDeptQuery,
  historyManifestQuery,
} from "./query/history";
import { usePublishedSource } from "./query/published";

// What offering patterns read (docs/decisions.md, "Offering patterns from
// the history"): the instructor history's manifest, for the terms on
// record, and the department files of the courses on screen. Patterns are
// information, so anything that fails to load leaves them out quietly.

export type OfferingHistory = {
  /** Every term the history covers; gaps in it are unknown, not "not offered". */
  readonly recorded: ReadonlySet<TermId>;
  /** The departments asked for that the history has. */
  readonly depts: ReadonlyMap<DeptCode, HistoryDept>;
};

/**
 * The history of some departments, once all of them are in; null while
 * any is loading, and when the manifest or a file can't load.
 */
export function useOfferingHistory(
  depts: readonly DeptCode[],
): OfferingHistory | null {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery({
    ...historyManifestQuery(source),
    enabled: depts.length > 0,
  });
  const key = [...new Set(depts)].sort().join(",");
  const wanted = useMemo(() => (key === "" ? [] : key.split(",")), [key]);
  // A department the history doesn't have has nothing on record: no query.
  const entries = useMemo(
    () =>
      wanted
        .map((d) => historyDept(manifest.data, d))
        .filter((e) => e !== undefined),
    [wanted, manifest.data],
  );
  const recorded = useMemo(
    () =>
      manifest.data ? new Set(manifest.data.terms.map((t) => t.termId)) : null,
    [manifest.data],
  );
  // Stable while nothing it reads changes, so the result is the same object
  // between renders and what's worked out from it doesn't recompute.
  const combine = useCallback(
    (files: UseQueryResult<HistoryDept>[]): OfferingHistory | null => {
      if (!recorded) return null;
      const out = new Map<DeptCode, HistoryDept>();
      for (const [i, entry] of entries.entries()) {
        const file = files[i]?.data;
        if (!file) return null;
        out.set(entry.code, file);
      }
      return { recorded, depts: out };
    },
    [entries, recorded],
  );
  return useQueries({
    queries: entries.map((entry) => historyDeptQuery(source, entry)),
    combine,
  });
}
