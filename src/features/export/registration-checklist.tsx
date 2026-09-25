import { cn } from "cn";
import { track } from "~/app/analytics";
import type { SectionRef } from "~/core/catalog";
import type { FitContext } from "~/core/fit";
import { backupSection, registrationOrder, type SeatsMap } from "~/core/seats";
import { SeatMeter } from "~/features/courses/seat-meter";
import { instructorsLabel } from "~/features/courses/section-words";
import { WithTooltip } from "~/ui/tooltip";
import { useCheckedSections, useChecklist } from "./checklist";

// SPEC §3.10: the plan's sections in the order to register, the one most
// likely to fill first, each with a backup section that also fits.

export function RegistrationChecklist({
  planId,
  sections,
  seats,
  fit,
  readOnly,
}: {
  planId: string;
  sections: readonly SectionRef[];
  seats: SeatsMap | null;
  fit: FitContext | null;
  readOnly: boolean;
}) {
  const checked = useCheckedSections(planId);
  const toggle = useChecklist((s) => s.toggle);
  const ordered = registrationOrder(sections, seats);

  return (
    <ol
      aria-label="Registration checklist"
      className="mx-4 overflow-hidden rounded-lg border border-hairline"
    >
      {ordered.map((ref, i) => {
        const backup = fit
          ? backupSection(fit, ref.course, ref.section, seats)
          : null;
        const done = checked.includes(ref.key);
        const id = `reg-${planId}-${ref.key}`;
        return (
          <li
            key={ref.key}
            className="flex items-start gap-3 border-hairline border-b px-3 py-2.5 last:border-b-0"
            data-testid={`checklist-${ref.key}`}
          >
            {readOnly ? null : (
              <WithTooltip
                label={done ? "Mark as not registered" : "Mark as registered"}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={done}
                  onChange={(e) => {
                    toggle(planId, ref.key, e.target.checked);
                    if (e.target.checked)
                      track("registration_item_checked", {});
                  }}
                  className="mt-0.5 size-3.5 shrink-0 accent-accent"
                />
              </WithTooltip>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="tnum w-4 text-[11px] text-faint">{i + 1}</span>
                <label
                  htmlFor={readOnly ? undefined : id}
                  className={cn(
                    "font-mono font-semibold text-[12.5px]",
                    done && "text-muted line-through decoration-faint",
                  )}
                >
                  {ref.course.code} {ref.section.code}
                </label>
                <SeatMeter
                  seats={seats}
                  sectionKey={ref.key}
                  meter={false}
                  className="ml-auto"
                />
              </div>
              <div className="truncate pl-6 text-[11.5px] text-muted">
                {backup ? (
                  <>
                    Backup: <span className="font-mono">{backup.code}</span> (
                    {backup.instructors.length > 1
                      ? `${backup.instructors[0]} +${backup.instructors.length - 1}`
                      : instructorsLabel(backup)}
                    , also fits)
                  </>
                ) : fit ? (
                  "No backup fits"
                ) : (
                  " "
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
