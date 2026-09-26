import type { FourYearTerm, FourYearTermStatus } from "../schema/four-year";
import type { StatusOf } from "./status";

// Shared by the four-year tests: a fixed status per term, so tests don't
// depend on calendar spans. Terms before `current` are done, after it planned.

export function statusAround(current: FourYearTerm): StatusOf {
  return (term): FourYearTermStatus => {
    if (term === "before") return "done";
    if (current === "before") return "planned";
    if (term < current) return "done";
    return term === current ? "in-progress" : "planned";
  };
}
