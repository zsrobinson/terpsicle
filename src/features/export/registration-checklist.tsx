import { cn } from "cn";
import { track } from "~/app/analytics";
import { ListRow, MetaSep } from "~/app/panel";
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
    <ol aria-label="Registration checklist">
      {ordered.map((ref, i) => {
        const backup = fit
          ? backupSection(fit, ref.course, ref.section, seats)
          : null;
        const done = checked.includes(ref.key);
        const id = `reg-${planId}-${ref.key}`;
        return (
          <ListRow
            as="li"
            key={ref.key}
            className="items-start"
            data-testid={`checklist-${ref.key}`}
            lead={
              // Fixed width, so codes line up with or without the checkbox.
              <span className="flex w-9 items-center gap-2 pt-0.5">
                {readOnly ? null : (
                  <WithTooltip
                    label={
                      done ? "Mark as not registered" : "Mark as registered"
                    }
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
                      className="size-3.5 shrink-0 accent-accent"
                    />
                  </WithTooltip>
                )}
                <span className="tnum ml-auto text-faint text-xs">{i + 1}</span>
              </span>
            }
            trail={
              <SeatMeter seats={seats} sectionKey={ref.key} meter={false} />
            }
          >
            <label
              htmlFor={readOnly ? undefined : id}
              className={cn(
                "ident block font-semibold text-base",
                done && "text-muted line-through decoration-faint",
              )}
            >
              {ref.course.code} {ref.section.code}
            </label>
            <div className="truncate text-muted text-sm">
              {ref.course.sections.length === 1 ? (
                // "No backup fits" would read as a scheduling problem.
                "The only section"
              ) : backup ? (
                // "Also fits" is in the intro above, so the row leads with
                // what differs; the instructor gives way when it's narrow.
                <WithTooltip
                  label={`Backup: ${backup.code}, ${instructorsLabel(backup)}. It also fits your plan.`}
                >
                  <span>
                    Backup: <span className="ident">{backup.code}</span>
                    <MetaSep />
                    {backup.instructors.length > 1
                      ? `${backup.instructors[0]} +${backup.instructors.length - 1}`
                      : instructorsLabel(backup)}
                  </span>
                </WithTooltip>
              ) : fit ? (
                "No backup fits"
              ) : (
                " "
              )}
            </div>
          </ListRow>
        );
      })}
    </ol>
  );
}
