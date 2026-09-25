import { cn } from "cn";
import { messageToText } from "~/app/message-text";
import { PanelBody, PanelHeader, PanelLabel } from "~/app/panel";
import { type Connection, parseSectionKey } from "~/core/schema";
import { DAY_LONG_NAMES } from "~/core/time";
import { connectionsByDay, verdictMessage } from "~/core/travel";
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
import { HowEstimate } from "./how-estimate";
import { TravelSettingsForm } from "./travel-settings";
import { VERDICT_TEXT, VerdictDot } from "./verdict";
import { verdictShort } from "./words";

// The Travel tab (SPEC §3.7): your pace and route settings, one line on how
// estimates work, and every connection in the plan by day.

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
        <TravelSettingsForm travel={travel} />
        <HowEstimate connections={connections} travel={travel} />
        <Connections connections={connections} />
      </PanelBody>
    </div>
  );
}

function Connections({ connections }: { connections: readonly Connection[] }) {
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

  const days = connectionsByDay(connections);
  return (
    <section aria-label="Connections">
      <PanelLabel
        right={
          connections.length > 0 && !loading ? (
            <span className="tnum">{connections.length}</span>
          ) : null
        }
      >
        Connections
      </PanelLabel>
      {loading ? (
        <ListSkeleton />
      ) : connections.length === 0 ? (
        <p className="px-4 py-2 text-[12.5px] text-muted">
          {placed
            ? "No back-to-back classes in different buildings."
            : "Add classes to see how long it takes to get between them."}
        </p>
      ) : (
        days.map(({ day, connections: list }) => (
          <div key={day} className="px-4 pb-2">
            <h3 className="pt-1 pb-1 font-medium text-[11.5px] text-muted">
              {DAY_LONG_NAMES[day]}
            </h3>
            <ul className="flex flex-col gap-1">
              {list.map((c) => (
                <li key={c.id}>
                  <ConnectionRow connection={c} selected={c.id === openId} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function courseOf(key: string): string {
  return parseSectionKey(key)?.courseCode ?? key;
}

export function ConnectionRow({
  connection: c,
  selected,
}: {
  connection: Connection;
  selected: boolean;
}) {
  const from = courseOf(c.from.sectionKey);
  const to = courseOf(c.to.sectionKey);
  const sentence = messageToText(verdictMessage(c));
  return (
    <WithTooltip label={`${sentence} Click for the route and details.`}>
      <button
        type="button"
        onClick={() => openConnection(c)}
        data-verdict={c.verdict}
        aria-label={`${from} to ${to}: ${sentence}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors",
          selected
            ? "border-hairline-strong bg-hover"
            : "border-hairline hover:border-hairline-strong",
        )}
      >
        <VerdictDot verdict={c.verdict} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px]">
            <span className="font-medium font-mono">{from}</span>
            <span className="text-muted"> → </span>
            <span className="font-medium font-mono">{to}</span>
          </span>
          <span className="tnum block truncate text-[11.5px] text-muted">
            <span className="font-mono">
              {c.from.building} → {c.to.building}
            </span>
            {c.walkMinutes !== null ? ` · ${c.walkMinutes} min walk` : ""}
            {` · ${c.gapMinutes} min gap`}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-[11.5px]",
            VERDICT_TEXT[c.verdict],
            c.verdict !== "ok" && "font-medium",
          )}
        >
          {verdictShort(c)}
        </span>
      </button>
    </WithTooltip>
  );
}

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Working out travel times"
      className="flex flex-col gap-1 px-4"
    >
      {[0.62, 0.5, 0.56].map((w) => (
        <div
          key={w}
          className="flex items-center gap-2.5 rounded-md border border-hairline px-2.5 py-2"
        >
          <Skeleton className="size-2 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
