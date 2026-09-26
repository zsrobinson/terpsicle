import { useEffect, useState } from "react";
import { HELD_SHARE_TARGET, heldShare } from "~/core/moderation/admin";
import { REASON_WORDS } from "~/core/moderation/policy-text";
import {
  type DecisionDay,
  type DecisionEntry,
  type DecisionStage,
  DecisionStageSchema,
  type ModerationKind,
  ModerationKindSchema,
  type StoredVerdict,
  StoredVerdictSchema,
} from "~/core/schema";
import { api } from "~/server/fns/api";
import { Button } from "~/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
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

export type DecisionsClient = Pick<typeof api.admin, "decisions">;

const PAGE = 50;

export function DecisionsPage({
  filters,
  onFilters,
  client = api.admin,
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

  return (
    <>
      <h1 className="mb-3 font-semibold text-lg">Decisions</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
      </div>

      {first.state === "failed" ? (
        <p role="status" className="mb-3 text-muted">
          Couldn't load decisions. {first.message}
        </p>
      ) : null}

      {first.data ? (
        <DayCounts days={first.data.days} surface={filters.surface} />
      ) : first.state === "loading" ? (
        <Skeleton className="mb-4 h-40 w-full" />
      ) : null}

      <h2 className="mb-2 font-medium text-base">Log</h2>
      {first.data === null && first.state === "loading" ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : decisions.length === 0 && first.data ? (
        <p className="text-muted">No decisions match these filters.</p>
      ) : (
        <ol
          aria-label="Decision log"
          className="divide-y divide-hairline rounded-lg border border-hairline bg-raised"
        >
          {decisions.map((d) => (
            <li key={d.id}>
              <DecisionRow decision={d} />
            </li>
          ))}
        </ol>
      )}

      {cursor ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WithTooltip label={`Show the next ${PAGE} decisions`}>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Show older"}
            </Button>
          </WithTooltip>
          {moreFailed ? (
            <span role="status" className="text-muted text-sm">
              {moreFailed}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

const ALL = "all";

function Filter<T extends string>({
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
      onValueChange={(v) => onChange(v === ALL ? undefined : (v as T))}
    >
      <WithTooltip label={hint}>
        <SelectTrigger aria-label={label}>
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

function DayCounts({
  days,
  surface,
}: {
  days: readonly DecisionDay[];
  surface: ModerationKind | undefined;
}) {
  const totals = days.reduce(
    (t, d) => ({
      day: "total",
      allowed: t.allowed + d.allowed,
      held: t.held + d.held,
      rejected: t.rejected + d.rejected,
    }),
    { day: "total", allowed: 0, held: 0, rejected: 0 },
  );
  const share = heldShare(totals);
  return (
    <section aria-labelledby="decision-days" className="mb-4">
      <h2 id="decision-days" className="mb-1 font-medium text-base">
        Automatic decisions, last {days.length} days
        {surface ? ` (${KIND_PLURAL[surface]})` : ""}
      </h2>
      <p className="mb-2 text-muted text-sm">
        {share === null
          ? "Nothing was checked in these days."
          : `${percent(share)} held for you, against a target under ${percent(HELD_SHARE_TARGET)}.`}{" "}
        Days are UTC.
      </p>
      <table className="w-full rounded-lg border border-hairline bg-raised text-sm tabular-nums">
        <thead className="text-muted">
          <tr className="border-hairline border-b">
            <th scope="col" className="px-2 py-1 text-left font-normal">
              Day
            </th>
            <th scope="col" className="px-2 py-1 text-right font-normal">
              Allowed
            </th>
            <th scope="col" className="px-2 py-1 text-right font-normal">
              Held
            </th>
            <th scope="col" className="px-2 py-1 text-right font-normal">
              Rejected
            </th>
            <th scope="col" className="px-2 py-1 text-right font-normal">
              Held share
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const dayShare = heldShare(d);
            const over = dayShare !== null && dayShare > HELD_SHARE_TARGET;
            return (
              <tr key={d.day}>
                <th scope="row" className="px-2 py-1 text-left font-normal">
                  {dayLabel(d.day)}
                </th>
                <td className="px-2 py-1 text-right">{count(d.allowed)}</td>
                <td className="px-2 py-1 text-right">{count(d.held)}</td>
                <td className="px-2 py-1 text-right">{count(d.rejected)}</td>
                <td
                  className={
                    over
                      ? "px-2 py-1 text-right text-warn"
                      : "px-2 py-1 text-right text-muted"
                  }
                >
                  {dayShare === null ? "–" : percent(dayShare)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
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
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{VERDICT_WORDS[d.verdict]}</span>
        <span>{KIND_WORDS[d.kind]}</span>
        <span className="text-muted text-sm">
          by{" "}
          {d.decidedBy === "admin" ? "you" : STAGE_WORDS[d.stage].toLowerCase()}
        </span>
        <span className="ml-auto text-muted text-sm">{when(d.createdAt)}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-muted text-sm">
        {why ? <span>{why}</span> : null}
        <span className="ident min-w-0 break-all">{d.targetId}</span>
      </div>
    </div>
  );
}
