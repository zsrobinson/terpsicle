import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { openTab } from "~/app/actions";
import { track } from "~/app/analytics";
import { MessageText } from "~/app/message-text";
import { PanelBody } from "~/app/panel";
import type { DrillViewProps } from "~/app/registry";
import { connectionFixes } from "~/core/problems";
import {
  type BuildingCode,
  type Connection,
  type ConnectionEnd,
  type Message,
  parseSectionKey,
} from "~/core/schema";
import { formatTime } from "~/core/time";
import { travelMath, VERDICT_WORDS, verdictMessage } from "~/core/travel";
import { useCampus } from "~/state/data-hooks";
import {
  useCurrentPlan,
  usePlanConnections,
  useTermCatalog,
  useTravel,
} from "~/state/hooks";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { FixList } from "./fix-list";
import { RouteMap } from "./route-map";
import { useBuildings } from "./use-buildings";
import { VERDICT_TEXT, VerdictDot } from "./verdict";
import {
  connectionDays,
  daysInWords,
  estimateLine,
  exactFeet,
  MODE_WORDS,
} from "./words";

// Connection details (SPEC §3.7): the verdict in a sentence, where and when
// you leave and arrive, the route on the campus map, the math, and the
// sections that would fix it. Calm even when there isn't enough time: the
// verdict is stated once, plainly, and the fixes are right there.

export function ConnectionDetails({ entry }: DrillViewProps<"connection">) {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const connections = usePlanConnections();
  const connection = connections.find((c) => c.id === entry.connectionId);

  if (!connection)
    return (
      <PanelBody className="px-4 py-4 text-[12.5px] text-muted">
        {catalog?.complete ? (
          "This connection isn't in the plan anymore. It changed when the plan did."
        ) : (
          <DetailsSkeleton />
        )}
      </PanelBody>
    );
  return <Details connection={connection} all={connections} />;
}

function Details({
  connection: c,
  all,
}: {
  connection: Connection;
  all: readonly Connection[];
}) {
  const { travel } = useTravel();
  const campusState = useCampus().state;
  const buildings = useBuildings();
  const routesLoading = campusState === "idle" || campusState === "loading";
  const from = parseSectionKey(c.from.sectionKey)?.courseCode ?? "";
  const to = parseSectionKey(c.to.sectionKey)?.courseCode ?? "";
  const days = connectionDays(c, all);
  const math = travelMath(c, travel);

  // Counted once per connection opened (from a pill, the list, Problems, or
  // a restored visit), once its verdict is known.
  const verdict = routesLoading ? null : c.verdict;
  useEffect(() => {
    if (verdict) track("connection_opened", { verdict });
  }, [verdict]);

  const nameOf = (code: BuildingCode) => buildings.get(code)?.name ?? code;

  return (
    <PanelBody className="px-4 pt-3 pb-6">
      <div className="text-[11px] text-muted">Every {daysInWords(days)}</div>
      <h2 className="mt-0.5 flex items-center gap-2 font-semibold text-[15px]">
        <span className="font-mono">{from}</span>
        <ArrowRight size={14} className="text-muted" aria-label="to" />
        <span className="font-mono">{to}</span>
      </h2>

      {routesLoading ? (
        <Skeleton className="mt-3 h-[58px] rounded-lg" />
      ) : (
        <div
          className="mt-3 rounded-lg border border-hairline bg-panel px-3 py-2.5"
          data-testid="verdict"
          data-verdict={c.verdict}
        >
          <div
            className={cn(
              "flex items-center gap-2 font-medium text-[12.5px]",
              VERDICT_TEXT[c.verdict],
              c.verdict === "ok" && "text-fg",
            )}
          >
            <VerdictDot verdict={c.verdict} />
            {VERDICT_WORDS[c.verdict]}
          </div>
          <p className="tnum mt-1 text-[12.5px] leading-snug">
            <MessageText message={verdictBody(c)} />
          </p>
        </div>
      )}

      {c.distanceFeet !== null ? (
        <div className="mt-3">
          <RouteMap connection={c} />
        </div>
      ) : null}

      <dl className="tnum mt-3 grid grid-cols-[76px_1fr] gap-x-2 gap-y-2 text-[12.5px]">
        <Row term="Leave">
          <Place end={c.from} name={nameOf(c.from.building)} verb="at" />
        </Row>
        <Row term="Arrive by">
          <Place end={c.to} name={nameOf(c.to.building)} verb="by" />
        </Row>
        {c.distanceFeet !== null ? (
          <Row term="Distance">
            {exactFeet(c.distanceFeet)}{" "}
            <span className="text-muted">
              · {MODE_WORDS[c.mode].toLowerCase()}
            </span>
          </Row>
        ) : null}
        {math ? (
          <Row term="Estimate">
            <span className="font-mono text-[11.5px]">
              {estimateLine(math)}
            </span>
          </Row>
        ) : null}
      </dl>

      <WithTooltip label="Open the Travel tab">
        <button
          type="button"
          onClick={() => openTab("travel", "click")}
          className="mt-3 text-[12px] text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
        >
          Change your pace or use accessible routes
        </button>
      </WithTooltip>

      {!routesLoading &&
      (c.verdict === "tight" || c.verdict === "insufficient") ? (
        <Fixes connection={c} />
      ) : null}
    </PanelBody>
  );
}

/**
 * The verdict sentence under its title. The title already says "Not enough
 * time", so the sentence starts after core's "Not enough time: ".
 */
function verdictBody(c: Connection): Message {
  if (c.verdict === "unknown")
    return [
      {
        kind: "text",
        text: "UMD's campus map hasn't measured the walk between these buildings yet, so there's no estimate.",
      },
    ];
  const [first, ...rest] = verdictMessage(c);
  if (first?.kind === "text" && first.text.endsWith(": ")) return rest;
  return first ? [first, ...rest] : [];
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Place({
  end,
  name,
  verb,
}: {
  end: ConnectionEnd;
  name: string;
  verb: "at" | "by";
}) {
  return (
    <>
      <span className="block">{name}</span>
      <span className="block text-[11.5px] text-muted">
        <span className="font-mono">
          {end.building}
          {end.room ? ` ${end.room}` : ""}
        </span>{" "}
        {verb} {formatTime(end.time)}
      </span>
    </>
  );
}

function Fixes({ connection }: { connection: Connection }) {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const { travel, campus } = useTravel();
  const [ready, setReady] = useState(false);
  // Trying every section of two courses takes a moment on big courses: let
  // the rest of the details paint first.
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const fixes = useMemo(
    () =>
      ready && current && catalog?.complete
        ? connectionFixes(
            {
              plan: current.plan,
              index: catalog.index,
              blocks: current.blocks,
              travel,
              campus,
              seats: catalog.seats?.seats ?? null,
              changes: catalog.changes?.changes ?? [],
            },
            connection,
          )
        : null,
    [ready, current, catalog, travel, campus, connection],
  );
  return (
    <section aria-label="Sections that fix this" className="mt-5">
      <h3 className="mb-1.5 font-medium text-[11px] text-muted">
        Sections that fix this
      </h3>
      {fixes === null ? (
        <Skeleton className="h-[52px] rounded-lg" />
      ) : (
        <FixList
          fixes={fixes}
          readOnly={current?.readOnly ?? true}
          courses={[
            parseSectionKey(connection.to.sectionKey)?.courseCode,
            parseSectionKey(connection.from.sectionKey)?.courseCode,
          ]}
        />
      )}
    </section>
  );
}

function DetailsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading connection"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-[58px] rounded-lg" />
      <Skeleton className="aspect-[8/5] w-full rounded-lg" />
    </div>
  );
}
