import { type DrillTarget, DrillTargetSchema } from "~/core/schema";

/**
 * Every kind of view the sidebar can drill into, and its props. Course and
 * connection details are declared here because they're remembered between
 * visits (`UiPrefs.drill`). Features add their own kinds with module
 * augmentation, without touching this file:
 *
 *   declare module "~/state/drill" {
 *     interface DrillViews { "generated-plan": { resultId: string } }
 *   }
 */
export interface DrillViews {
  course: Omit<Extract<DrillTarget, { kind: "course" }>, "kind">;
  connection: Omit<Extract<DrillTarget, { kind: "connection" }>, "kind">;
}

export type DrillKind = keyof DrillViews;

/** One level of the drill-in stack: `{ kind: "course", courseCode: "CMSC351" }`. */
export type DrillEntry = {
  [K in DrillKind]: { kind: K } & DrillViews[K];
}[DrillKind];

/** The entry to remember between visits, if it's restorable (course or connection). */
export function restorableTarget(
  entry: DrillEntry | undefined,
): DrillTarget | null {
  if (!entry) return null;
  const parsed = DrillTargetSchema.safeParse(entry);
  return parsed.success ? parsed.data : null;
}

/** Two entries show the same thing (ignoring a details sub-tab). */
export function sameDrillSubject(a: DrillEntry, b: DrillEntry): boolean {
  if (a.kind !== b.kind) return false;
  const strip = (e: DrillEntry): string => {
    const { tab: _tab, ...rest } = e as DrillEntry & { tab?: unknown };
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  return strip(a) === strip(b);
}
