import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { TEXT } from "~/app/emphasis";
import { messageToText } from "~/app/message-text";
import {
  EmptyState,
  ListRow,
  MetaSep,
  PanelBody,
  PanelHeader,
  SectionHeader,
} from "~/app/panel";
import {
  type Connection,
  parseSectionKey,
  type TravelSettings,
} from "~/core/schema";
import { DAY_SHORT_NAMES, formatDuration } from "~/core/time";
import { verdictMessage } from "~/core/travel";
import { useCampus } from "~/state/data-hooks";
import {
  useCurrentPlan,
  usePlanConnections,
  useTermCatalog,
  useTravel,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { openConnection } from "./actions";
import {
  BACK_TO_BACK_MINUTES,
  type ConnectionGroup,
  groupConnections,
  isBackToBack,
  settingsSummary,
} from "./connection-list";
import { HowEstimate } from "./how-estimate";
import { useTravelSettingsOpen } from "./settings-store";
import { TravelSettingsForm } from "./travel-settings";
import { verdictText } from "./verdict";
import { daysInWords, verdictShort } from "./words";

// The Travel tab (SPEC §3.7, docs/UX-REVIEW.md §4.6): the connections come
// first, since which ones are tight is what people open it for; the settings
// are one line that opens in place.

export function TravelPanel() {
  const { travel } = useTravel();
  const connections = usePlanConnections();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Travel"
        sub="Time to get between back-to-back classes"
      />
      <PanelBody className="pb-6">
        <Settings travel={travel} connections={connections} />
        <Connections />
      </PanelBody>
    </div>
  );
}

/** "Typical pace · no extra time · standard routes  Change": opens in place. */
function Settings({
  travel,
  connections,
}: {
  travel: TravelSettings;
  connections: readonly Connection[];
}) {
  const open = useTravelSettingsOpen((s) => s.open);
  const setOpen = useTravelSettingsOpen((s) => s.setOpen);
  const id = useId();
  return (
    <div className="border-hairline border-b">
      <WithTooltip
        label={
          open ? "Hide the settings" : "Change your pace, extra time or routes"
        }
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-hover"
        >
          <span className={cn("min-w-0 flex-1 truncate", TEXT.secondary)}>
            {settingsSummary(travel)}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-medium">
            {open ? "Done" : "Change"}
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={cn(
                "text-muted transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </span>
        </button>
      </WithTooltip>
      {open ? (
        <div id={id} className="pb-3">
          <TravelSettingsForm travel={travel} />
          <HowEstimate connections={connections} travel={travel} />
        </div>
      ) : null}
    </div>
  );
}

function Connections() {
  const connections = usePlanConnections();
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const campusState = useCampus().state;
  const openId = useUi((s) => {
    const top = s.stack.at(-1);
    return top?.kind === "connection" ? top.connectionId : null;
  });
  const placed = current?.plan.courses.some((c) => c.sectionCode !== null);
  const loading =
    (placed && !catalog?.complete) ||
    (connections.length > 0 &&
      (campusState === "idle" || campusState === "loading"));

  if (loading) return <ListSkeleton />;
  if (connections.length === 0)
    return (
      <section aria-label="Connections">
        <EmptyState className="pt-4">
          {placed
            ? "No back-to-back classes in different buildings."
            : "Add classes to see how long it takes to get between them."}
        </EmptyState>
      </section>
    );

  const groups = groupConnections(connections);
  const near = groups.filter((g) => isBackToBack(g.connection));
  const apart = groups.filter((g) => !isBackToBack(g.connection));
  return (
    <section aria-label="Connections">
      {near.length > 0 ? (
        <section aria-label="Back to back">
          <SectionHeader
            title="Back to back"
            count={near.length}
            className="border-t-0"
          />
          <ConnectionRows groups={near} openId={openId} />
        </section>
      ) : null}
      {apart.length > 0 ? (
        <section aria-label="Longer breaks">
          <SectionHeader
            title="Longer breaks"
            count={apart.length}
            right={
              <WithTooltip
                label={`The calendar marks breaks of ${BACK_TO_BACK_MINUTES} min or less, and any that are tight`}
              >
                <span className="text-muted text-xs">
                  Over {BACK_TO_BACK_MINUTES} min · not on the calendar
                </span>
              </WithTooltip>
            }
            className={near.length === 0 ? "border-t-0" : undefined}
          />
          <ConnectionRows groups={apart} openId={openId} />
        </section>
      ) : null}
    </section>
  );
}

function ConnectionRows({
  groups,
  openId,
}: {
  groups: readonly ConnectionGroup[];
  openId: string | null;
}) {
  return (
    <ul>
      {groups.map((group) => (
        <ConnectionRow
          key={group.ids.join(",")}
          group={group}
          selected={openId !== null && group.ids.includes(openId)}
        />
      ))}
    </ul>
  );
}

function courseOf(key: string): string {
  return parseSectionKey(key)?.courseCode ?? key;
}

export function ConnectionRow({
  group,
  selected,
}: {
  group: ConnectionGroup;
  selected: boolean;
}) {
  const c = group.connection;
  const from = courseOf(c.from.sectionKey);
  const to = courseOf(c.to.sectionKey);
  const sentence = messageToText(verdictMessage(c));
  const days = group.days.map((d) => DAY_SHORT_NAMES[d]).join(", ");
  return (
    // The status sits at the end of the first line rather than in ListRow's
    // trail column, so the facts line gets the row's full width: the gap is
    // at its end and must not be the part that's cut off.
    <ListRow
      as="li"
      state={selected ? "current" : undefined}
      className="relative hover:bg-hover"
    >
      <WithTooltip label={`${sentence} Click for the route and details.`}>
        <button
          type="button"
          onClick={() => openConnection(c)}
          data-verdict={c.verdict}
          aria-label={`${from} to ${to}, ${daysInWords(group.days)}: ${sentence}`}
          // The whole row opens the connection.
          className="block w-full text-left after:absolute after:inset-0"
        >
          <span className="flex items-baseline gap-3 text-base">
            <span className="min-w-0 flex-1 truncate">
              <span className="ident font-semibold">{from}</span>
              <span className="text-muted"> → </span>
              <span className="ident font-semibold">{to}</span>
            </span>
            <span
              className={cn(
                "shrink-0 font-medium text-sm",
                verdictText(c.verdict),
              )}
            >
              {verdictShort(c)}
            </span>
          </span>
          <span className="tnum block truncate text-muted text-sm">
            {days}
            <MetaSep />
            <span className="ident">{c.from.building}</span> →{" "}
            <span className="ident">{c.to.building}</span>
            {c.walkMinutes !== null ? (
              <>
                <MetaSep />
                {c.walkMinutes} min walk
              </>
            ) : null}
            <MetaSep />
            {formatDuration(c.gapMinutes)} gap
          </span>
        </button>
      </WithTooltip>
    </ListRow>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Working out travel times">
      {[0.62, 0.5, 0.56].map((w) => (
        <div
          key={w}
          className="flex flex-col gap-1.5 border-hairline border-b px-4 py-2"
        >
          <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      ))}
    </div>
  );
}
