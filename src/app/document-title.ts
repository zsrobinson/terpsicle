import { useEffect } from "react";
import { useActiveTerm, useCurrentPlan } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { planLabel } from "./plan-label";
import { drillViewFor, usePanelRegistry } from "./registry";

// The browser tab's title says where you are (WCAG 2.4.2): a screen reader
// reads it when switching tabs or windows, and a tab bar full of
// "Terpsicle" says nothing.

/**
 * "CMSC351 · Terpsicle" while a drill-in is open, "Plan A · Spring 2027 ·
 * Terpsicle" otherwise, and just "Terpsicle" before anything has loaded.
 */
export function documentTitle({
  drill,
  plan,
  term,
}: {
  /** The open drill-in's name ("CMSC351", "Option 1"). */
  drill?: string | null;
  plan?: string | null;
  term?: string | null;
}): string {
  const parts = drill ? [drill] : [plan, term].filter(Boolean);
  return [...parts, "Terpsicle"].join(" · ");
}

export function useDocumentTitle(): void {
  const registry = usePanelRegistry();
  const top = useUi((s) => s.stack.at(-1));
  const current = useCurrentPlan();
  const { term } = useActiveTerm();
  const drill = top
    ? (drillViewFor(registry, top)?.name(top) ??
      (top.kind === "course" ? top.courseCode : null))
    : null;
  const title = documentTitle({
    drill,
    plan: current ? planLabel(current) : null,
    term: term?.name ?? null,
  });
  useEffect(() => {
    document.title = title;
  }, [title]);
}
