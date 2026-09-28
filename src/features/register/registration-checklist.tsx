import { cn } from "cn";
import { Check } from "lucide-react";
import { MetaSep } from "~/components/panel";
import type { SectionRef } from "~/core/catalog";
import type { FitContext } from "~/core/fit";
import type { LocalId, SectionKey, TermId } from "~/core/schema";
import {
  backupSection,
  canWatchSeats,
  registrationOrder,
  type SeatsMap,
  seatCounts,
} from "~/core/seats";
import { useSeatWatch } from "~/features/alerts/seat-watches";
import { SeatBell } from "~/features/course-details/seat-bell";
import { SeatMeter } from "~/features/courses/seat-meter";
import { instructorsLabel } from "~/features/courses/section-words";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { copyCode, setRegistered } from "./actions";

// SPEC §3.10: what to register for. The plan's sections in the order to
// register, the one most likely to fill first, each with the two codes
// Testudo's Drop/Add asks for (a click copies one), its seats, a seat watch
// when it's low or full, and a backup section that also fits. "Registered"
// is part of the plan: it syncs, and a registered section is no longer a
// problem for being full.

export function RegistrationChecklist({
  planId,
  termId,
  sections,
  registered,
  seats,
  fit,
  readOnly,
}: {
  planId: LocalId;
  termId: TermId;
  sections: readonly SectionRef[];
  /** The plan's Registered marks. */
  registered: ReadonlySet<SectionKey>;
  seats: SeatsMap | null;
  fit: FitContext | null;
  readOnly: boolean;
}) {
  const ordered = registrationOrder(sections, seats);
  return (
    <ol aria-label="Registration checklist">
      {ordered.map((ref, i) => (
        <Row
          key={ref.key}
          index={i}
          section={ref}
          planId={planId}
          termId={termId}
          done={registered.has(ref.key)}
          seats={seats}
          fit={fit}
          readOnly={readOnly}
        />
      ))}
    </ol>
  );
}

function Row({
  index,
  section: ref,
  planId,
  termId,
  done,
  seats,
  fit,
  readOnly,
}: {
  index: number;
  section: SectionRef;
  planId: LocalId;
  termId: TermId;
  done: boolean;
  seats: SeatsMap | null;
  fit: FitContext | null;
  readOnly: boolean;
}) {
  const backup = fit
    ? backupSection(fit, ref.course, ref.section, seats)
    : null;
  const counts = seatCounts(seats, ref.key);
  const watching = useSeatWatch(termId, ref.key).kind === "watching";
  // A section you have doesn't need a seat; one you're watching keeps its
  // bell, so "Watching" stays where it was set.
  const bell = !readOnly && !done && (canWatchSeats(counts) || watching);
  const name = `${ref.course.code} ${ref.section.code}`;
  return (
    <ListRow
      as="li"
      align="start"
      data-testid={`checklist-${ref.key}`}
      data-registered={done ? "" : undefined}
      lead={
        // Fixed width, so codes line up with or without the checkbox.
        <span className="flex w-9 items-center gap-2 pt-1">
          {readOnly ? null : (
            <WithTooltip
              label={done ? "Mark as not registered" : "Mark as registered"}
            >
              <input
                type="checkbox"
                aria-label={`Registered for ${name}`}
                checked={done}
                onChange={(e) =>
                  setRegistered(planId, ref.key, e.target.checked)
                }
                className="size-3.5 shrink-0 accent-accent"
              />
            </WithTooltip>
          )}
          <span className="tnum ml-auto text-faint text-xs">{index + 1}</span>
        </span>
      }
      trail={
        bell ? (
          <span className="flex items-center pt-0.5">
            <SeatBell
              termId={termId}
              sectionKey={ref.key}
              compact
              full={counts?.open === 0}
            />
          </span>
        ) : undefined
      }
    >
      {/* Seats sit on the codes' line, so the backup below gets the row's
          width ("Full · 14 waitlisted" beside it cut the instructor off). */}
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "-ml-1 flex items-baseline font-semibold text-base",
            done && "text-muted",
          )}
        >
          <CopyCode code={ref.course.code} what="course" />
          <CopyCode code={ref.section.code} what="section" />
        </span>
        <span className="ml-auto shrink-0">
          {done ? (
            <span className="flex items-center gap-1 text-muted text-sm">
              <Check size={13} aria-hidden="true" />
              Registered
            </span>
          ) : (
            <SeatMeter seats={seats} sectionKey={ref.key} meter={false} />
          )}
        </span>
      </span>
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
          " "
        )}
      </div>
    </ListRow>
  );
}

/** A code Testudo's Drop/Add asks for; a click copies it. */
function CopyCode({
  code,
  what,
}: {
  code: string;
  what: "course" | "section";
}) {
  return (
    <WithTooltip label={`Copy ${code}, the ${what} for Testudo`}>
      <button
        type="button"
        aria-label={`Copy ${code}`}
        onClick={() => void copyCode(code)}
        className="ident rounded px-1 transition-colors hover:bg-hover"
      >
        {code}
      </button>
    </WithTooltip>
  );
}
