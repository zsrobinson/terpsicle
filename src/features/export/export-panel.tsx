import { cn } from "cn";
import { CalendarDays, Copy, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { PanelBody, PanelHeader, PanelLabel } from "~/app/panel";
import {
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  usePlacedSections,
  useTermCatalog,
} from "~/state/hooks";
import { WithTooltip } from "~/ui/tooltip";
import { useAcademicCalendar } from "./academic-calendar";
import { copySectionCodes, copyShareLink, downloadIcs } from "./actions";
import { RegistrationChecklist } from "./registration-checklist";
import { SeatAlertsList } from "./seat-alerts-list";

// The Export tab (SPEC §3.10): everything for registration day and after.

export function ExportPanel() {
  const current = useCurrentPlan();
  const { term } = useActiveTerm();
  const catalog = useTermCatalog(current?.termId ?? null);
  const sections = usePlacedSections();
  const fit = useFitContext();
  const calendar = useAcademicCalendar(current?.termId ?? null);

  if (!current) return <PanelHeader title="Export" />;
  const { plan, blocks, colors, termId, readOnly } = current;
  const placed = plan.courses.filter((c) => c.sectionCode !== null).length;
  const termName = term?.name ?? "This term";
  const empty = placed === 0;
  const notPublished =
    calendar.kind === "ready" &&
    (calendar.calendar === null || calendar.calendar.status !== "published");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Export" sub={plan.name} />
      <PanelBody className="pb-4">
        <div className="p-2">
          <ActionRow
            icon={<Copy size={15} />}
            label="Copy course and section codes"
            hint={
              empty
                ? "Add a course first"
                : "Paste them into Testudo when you register"
            }
            tooltip="One per line, like CMSC351 0101"
            disabled={empty}
            onClick={() => void copySectionCodes(plan)}
          />
          <ActionRow
            icon={<Link2 size={15} />}
            label="Copy share link"
            hint="Anyone with the link sees this plan, read-only"
            tooltip="The plan is in the link itself; nothing is uploaded"
            onClick={() => void copyShareLink(plan, blocks, colors)}
          />
          <ActionRow
            icon={<CalendarDays size={15} />}
            label="Add to your calendar (.ics)"
            hint={
              notPublished
                ? `${termName}'s dates aren't published yet. Check back once the provost posts the academic calendar.`
                : calendar.kind === "error"
                  ? "Couldn't load the term's dates. Check your connection and reopen this tab."
                  : empty
                    ? "Add a course first"
                    : "Weekly classes from the first day, with breaks and holidays skipped"
            }
            tooltip="Download a file for Google Calendar, Apple Calendar or Outlook"
            disabled={empty || calendar.kind !== "ready" || notPublished}
            onClick={() => {
              if (calendar.kind !== "ready") return;
              downloadIcs({
                termId,
                termName,
                sections,
                calendar: calendar.calendar,
              });
            }}
          />
        </div>

        <PanelLabel>Registration checklist</PanelLabel>
        {empty ? (
          <p className="px-4 text-[12px] text-faint">
            Add a course to see the order to register in.
          </p>
        ) : (
          <>
            <p className="px-4 pb-2 text-[12px] text-muted">
              Register in this order: the sections most likely to fill go first.
              If one fills, try its backup.
            </p>
            <RegistrationChecklist
              planId={plan.id}
              sections={sections}
              seats={catalog?.seats?.seats ?? null}
              fit={fit}
              readOnly={readOnly}
            />
          </>
        )}

        <SeatAlertsList termId={termId} />
      </PanelBody>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  tooltip,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={tooltip} side="right">
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled}
        // aria-disabled, not disabled: the tooltip and hint still explain why.
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
          disabled ? "cursor-default" : "hover:bg-hover",
        )}
      >
        <span className={cn("text-muted", disabled && "opacity-50")}>
          {icon}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block font-medium text-[12.5px]",
              disabled && "text-muted",
            )}
          >
            {label}
          </span>
          <span className="block text-[11.5px] text-muted">{hint}</span>
        </span>
      </button>
    </WithTooltip>
  );
}
