import { cn } from "cn";
import { CalendarDays, Copy } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelSkeleton,
  SectionHeader,
} from "~/app/panel";
import { planLabel } from "~/app/plan-label";
import type { TermId } from "~/core/schema";
import { WatchingList } from "~/features/alerts/watching-list";
import { useCatalog } from "~/state/catalog-store";
import { useAcademicCalendar } from "~/state/data-hooks";
import {
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  usePlacedSections,
  useTermCatalog,
} from "~/state/hooks";
import { useSeatWatches } from "~/state/seat-watches";
import { InlineError } from "~/ui/inline-error";
import { WithTooltip } from "~/ui/tooltip";
import { copySectionCodes, downloadIcs } from "./actions";
import { RegistrationChecklist } from "./registration-checklist";

// The Register tab (SPEC §3.10): registration day's checklist. What to
// register for, in order, with Testudo's codes, a Registered mark and a seat
// watch per section; then, once you're in, the .ics file. Sharing is the
// Share button over the calendar.

export function RegisterPanel() {
  const current = useCurrentPlan();
  const { term } = useActiveTerm();
  const catalog = useTermCatalog(current?.termId ?? null);
  const sections = usePlacedSections();
  const fit = useFitContext();
  // Cached and offline-safe; no file for the term reads as "not published".
  const calendar = useAcademicCalendar(current?.termId ?? null);
  const registeredKeys = current?.plan.registered;
  const registered = useMemo(
    () => new Set(registeredKeys ?? []),
    [registeredKeys],
  );

  if (!current) return <PanelSkeleton title="Register" />;
  const { plan, termId, readOnly } = current;
  const termName = term?.name ?? "This term";
  const empty = sections.length === 0;
  const done = sections.filter((s) => registered.has(s.key)).length;
  const calendarReady = calendar.state === "ready";
  const notPublished =
    calendarReady &&
    (calendar.calendar === null || calendar.calendar.status !== "published");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="Register" sub={planLabel(current)} />
      <PanelBody className="pb-4">
        {empty ? (
          <PanelNote className="text-faint">
            Add a course to see what to register for, and in what order.
          </PanelNote>
        ) : (
          <>
            <p className="px-4 py-2 text-muted text-sm">
              Register in this order: the sections most likely to fill go first.
              If one fills, try its backup, which also fits your plan.
            </p>
            <SectionHeader
              title="What to register for"
              count={
                readOnly
                  ? sections.length
                  : `${done} of ${sections.length} registered`
              }
            />
            <RegistrationChecklist
              planId={plan.id}
              termId={termId}
              sections={sections}
              registered={registered}
              seats={catalog?.seats?.seats ?? null}
              fit={fit}
              readOnly={readOnly}
            />
            <div className="border-hairline border-t">
              <ActionRow
                icon={<Copy size={15} />}
                label="Copy all course and section codes"
                hint="One per line, like CMSC351 0101"
                tooltip="Copy every section in this plan, for Testudo"
                onClick={() => void copySectionCodes(plan)}
              />
            </div>
          </>
        )}

        <Watching termId={termId} />

        <SectionHeader title="After you register" />
        <ActionRow
          icon={<CalendarDays size={15} />}
          label="Add to your calendar (.ics)"
          hint={
            notPublished
              ? `${termName}'s dates aren't published yet. Check back once the provost posts the academic calendar.`
              : calendar.state === "error"
                ? "The term's dates didn't load"
                : empty
                  ? "Add a course first"
                  : "Weekly classes from the first day, with breaks and holidays skipped"
          }
          tooltip="Download a file for Google Calendar, Apple Calendar or Outlook"
          disabled={empty || !calendarReady || notPublished}
          onClick={() => {
            if (!calendarReady) return;
            downloadIcs({
              termId,
              termName,
              sections,
              calendar: calendar.calendar,
            });
          }}
        />
        {calendar.state === "error" ? (
          <InlineError
            className="px-4"
            message="Couldn't load the term's dates, so there's no calendar file yet. Check your connection and try again."
            onRetry={() => void useCatalog.getState().ensureCalendar(termId)}
            retryTooltip="Load the term's dates again"
          />
        ) : null}
      </PanelBody>
    </div>
  );
}

/** The sections you're watching for a seat, when there are any. */
function Watching({ termId }: { termId: TermId }) {
  const count = useSeatWatches((s) => s.watches?.length ?? 0);
  if (count === 0) return null;
  return (
    <section aria-label="Watching for a seat">
      <SectionHeader title="Watching for a seat" count={count} />
      <WatchingList termId={termId} className="px-4 py-1" />
    </section>
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
          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
          disabled ? "cursor-default" : "hover:bg-hover",
        )}
      >
        <span className={cn("text-muted", disabled && "opacity-50")}>
          {icon}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block font-medium text-base",
              disabled && "text-muted",
            )}
          >
            {label}
          </span>
          <span className="block text-muted text-sm">{hint}</span>
        </span>
      </button>
    </WithTooltip>
  );
}
