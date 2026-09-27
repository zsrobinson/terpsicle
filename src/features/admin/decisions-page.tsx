import { cn } from "cn";
import { type ReactNode, useEffect, useState } from "react";
import { HELD_SHARE_TARGET, heldShare } from "~/core/moderation/admin";
import { REASON_WORDS } from "~/core/moderation/policy-text";
import {
  type DecisionStage,
  DecisionStageSchema,
  type ModerationKind,
  ModerationKindSchema,
  type StoredVerdict,
  StoredVerdictSchema,
} from "~/core/schema";
import type { DecisionDay, DecisionEntry } from "~/core/schema/admin";
import { adminApi } from "~/server/fns/admin-api";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { AdminNav, PAGE_ROW } from "./admin-frame";
import { failureWords, useLoad } from "./use-load";
import {
  ADMIN_REASON_WORDS,
  count,
  KIND_PLURAL,
  KIND_WORDS,
  percent,
  STAGE_WORDS,
  VERDICT_WORDS,
} from "./words";

// `/admin/decisions` (V2 §10): every decision, newest first, filterable by
// surface, stage and verdict (kept in the URL, so Back undoes a filter),
// and each day's automatic decisions with the held share against the 5%
// target. Text-free and author-free, like the table it reads.

export interface DecisionFilters {
  surface?: ModerationKind | undefined;
  stage?: DecisionStage | undefined;
  verdict?: StoredVerdict | undefined;
}

export type DecisionsClient = Pick<typeof adminApi, "decisions">;

const PAGE = 50;

export function DecisionsPage({
  filters,
  onFilters,
  client = adminApi,
}: {
  filters: DecisionFilters;
  onFilters: (next: DecisionFilters) => void;
  client?: DecisionsClient;
}) {
  const key = JSON.stringify([filters.surface, filters.stage, filters.verdict]);
  const first = useLoad(
    (signal) => client.decisions({ ...filters, limit: PAGE }, { signal }),
    key,
  );
  const [more, setMore] = useState<{
    decisions: DecisionEntry[];
    cursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState<string | null>(null);

  // A new filter starts over from the first page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the filter
  useEffect(() => {
    setMore(null);
    setMoreFailed(null);
  }, [key]);

  const decisions = [
    ...(first.data?.decisions ?? []),
    ...(more?.decisions ?? []),
  ];
  const cursor = more ? more.cursor : (first.data?.cursor ?? null);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreFailed(null);
    try {
      const page = await client.decisions({ ...filters, cursor, limit: PAGE });
      setMore((prev) => ({
        decisions: [...(prev?.decisions ?? []), ...page.decisions],
        cursor: page.cursor,
      }));
    } catch (error) {
      setMoreFailed(failureWords(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const set = (patch: DecisionFilters) => onFilters({ ...filters, ...patch });

  const days = first.data?.days;
  return (
    <>
      <PageHeader
        title="Decisions"
        status={
          days
            ? heldLine(days, filters.surface)
            : "Every decision, newest first"
        }
        views={<AdminNav current="decisions" />}
      />
      <Filters>
        <Filter
          label="Surface"
          hint="Reviews, chat, or both"
          value={filters.surface}
          options={ModerationKindSchema.options.map((k) => ({
            value: k,
            label: KIND_PLURAL[k],
          }))}
          onChange={(surface) => set({ surface })}
        />
        <Filter
          label="Stage"
          hint="Who decided: the rules, the automatic check, you, or reports"
          value={filters.stage}
          options={DecisionStageSchema.options.map((s) => ({
            value: s,
            label: STAGE_WORDS[s],
          }))}
          onChange={(stage) => set({ stage })}
        />
        <Filter
          label="Verdict"
          hint="What was decided"
          value={filters.verdict}
          options={StoredVerdictSchema.options.map((v) => ({
            value: v,
            label: VERDICT_WORDS[v],
          }))}
          onChange={(verdict) => set({ verdict })}
        />
      </Filters>

      {first.state === "failed" ? (
        <InlineError
          message={`Couldn't load decisions. ${first.message}`}
          onRetry={first.reload}
        />
      ) : null}

      {days ? (
        <DayCounts days={days} surface={filters.surface} />
      ) : first.state === "loading" ? (
        <RowSkeleton rows={4} inset={false} label="Loading the day counts" />
      ) : null}

      <PageSection title="Log">
        {first.data === null && first.state === "loading" ? (
          <RowSkeleton rows={3} inset={false} label="Loading decisions" />
        ) : decisions.length === 0 && first.data ? (
          <p className="py-2 text-muted">No decisions match these filters.</p>
        ) : (
          <ol aria-label="Decision log">
            {decisions.map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </ol>
        )}

        {moreFailed ? (
          <InlineError
            message={`Couldn't load older decisions. ${moreFailed}`}
            onRetry={() => void loadMore()}
          />
        ) : cursor ? (
          <WithTooltip label={`Show the next ${PAGE} decisions`}>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Show older"}
            </Button>
          </WithTooltip>
        ) : null}
      </PageSection>
    </>
  );
}

/** The row of filters under a page's header. */
export function Filters({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

const ALL = "all";

/** One filter: the kit's select, its name before the choice ("Stage: You"). */
export function Filter<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) =>
        onChange(options.find((o) => o.value === next)?.value)
      }
    >
      <WithTooltip label={hint}>
        <SelectTrigger aria-label={label} className="max-md:h-11">
          <span className="text-muted">{label}:</span>
          <SelectValue />
        </SelectTrigger>
      </WithTooltip>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "Sat, Jan 10" for a UTC day. */
function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "11% held for you, against a target under 5%", over the days shown. */
function heldLine(
  days: readonly DecisionDay[],
  surface: ModerationKind | undefined,
): string {
  const share = heldShare(
    days.reduce(
      (t, d) => ({
        day: "total",
        allowed: t.allowed + d.allowed,
        held: t.held + d.held,
        rejected: t.rejected + d.rejected,
      }),
      { day: "total", allowed: 0, held: 0, rejected: 0 },
    ),
  );
  const what = surface ? KIND_PLURAL[surface].toLowerCase() : "posts";
  return share === null
    ? `No ${what} were checked in the last ${days.length} days`
    : `${percent(share)} held for you, against a target under ${percent(HELD_SHARE_TARGET)}`;
}

const CELL = "px-2 py-1.5 text-right first:pl-0 last:pr-0";

function DayCounts({
  days,
  surface,
}: {
  days: readonly DecisionDay[];
  surface: ModerationKind | undefined;
}) {
  return (
    <PageSection
      title={`Automatic decisions, last ${days.length} days${
        surface ? ` (${KIND_PLURAL[surface]})` : ""
      }`}
      aside="Days are UTC"
    >
      <table className="tnum w-full text-sm">
        <thead className="text-muted">
          <tr className="border-hairline border-b">
            <th scope="col" className={cn(CELL, "text-left font-normal")}>
              Day
            </th>
            <th scope="col" className={cn(CELL, "font-normal")}>
              Allowed
            </th>
            <th scope="col" className={cn(CELL, "font-normal")}>
              Held
            </th>
            <th scope="col" className={cn(CELL, "font-normal")}>
              Rejected
            </th>
            <th scope="col" className={cn(CELL, "font-normal")}>
              Held share
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const dayShare = heldShare(d);
            const over = dayShare !== null && dayShare > HELD_SHARE_TARGET;
            return (
              <tr
                key={d.day}
                className="border-hairline border-b last:border-b-0"
              >
                <th scope="row" className={cn(CELL, "text-left font-normal")}>
                  {dayLabel(d.day)}
                </th>
                <td className={CELL}>{count(d.allowed)}</td>
                <td className={CELL}>{count(d.held)}</td>
                <td className={CELL}>{count(d.rejected)}</td>
                <td className={cn(CELL, over ? "text-warn" : "text-muted")}>
                  {dayShare === null ? "–" : percent(dayShare)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageSection>
  );
}

/** "Jan 10, 12:04 PM" in the reader's time zone. */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DecisionRow({ decision: d }: { decision: DecisionEntry }) {
  const why =
    d.decidedBy === "admin"
      ? d.reason
        ? ADMIN_REASON_WORDS[d.reason]
        : d.reasons.some((r) => r.code === "undo")
          ? REASON_WORDS.undo
          : null
      : d.reasons
          .filter((r) => r.action !== "flag")
          .map((r) => REASON_WORDS[r.code])
          .join(" · ") || null;
  return (
    <ListRow
      as="li"
      align="start"
      className={PAGE_ROW}
      secondary={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {why ? <span>{why}</span> : null}
          <span className="ident min-w-0 break-all">{d.targetId}</span>
        </span>
      }
      trail={<span className="text-muted">{when(d.createdAt)}</span>}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{VERDICT_WORDS[d.verdict]}</span>
        <span>{KIND_WORDS[d.kind]}</span>
        <span className="text-muted text-sm">
          by{" "}
          {d.decidedBy === "admin" ? "you" : STAGE_WORDS[d.stage].toLowerCase()}
        </span>
      </span>
    </ListRow>
  );
}
