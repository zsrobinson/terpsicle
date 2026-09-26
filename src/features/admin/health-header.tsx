import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { waitedFor } from "~/core/moderation/admin";
import type { AdminHealth } from "~/core/schema/admin";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import type { Loaded } from "./use-load";
import { count, percent } from "./words";

// The queue page's header (V2 §10): the day's model calls against the cap,
// what's waiting for a retry, and what's waiting for you. Numbers only.

export function HealthHeader({
  health,
  now,
  onRefresh,
}: {
  health: Loaded<AdminHealth>;
  now: Date;
  onRefresh: () => void;
}) {
  const h = health.data;
  return (
    <section
      aria-label="Health"
      className="mb-4 rounded-lg border border-hairline bg-raised p-3"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {h ? (
          <>
            <Stat
              label="AI calls today"
              value={`${count(h.aiCalls.today)} of ${count(h.aiCalls.cap)}`}
              note={
                h.aiCalls.today >= h.aiCalls.cap
                  ? "At the cap: new posts wait"
                  : `${percent(h.aiCalls.today / Math.max(1, h.aiCalls.cap))} used`
              }
              warn={h.aiCalls.today >= h.aiCalls.cap}
            />
            <Stat
              label="Waiting for a retry"
              value={count(h.retry.waiting)}
              note={
                h.retry.oldestAt
                  ? `Oldest ${waitedFor(h.retry.oldestAt, now)}`
                  : "None"
              }
              warn={h.retry.waiting > 0 && isOld(h.retry.oldestAt, now)}
            />
            <Stat
              label="Waiting for you"
              value={count(h.queue.open)}
              note={queueNote(h, now)}
            />
          </>
        ) : health.state === "failed" ? null : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)
        )}
      </div>
      {health.state === "failed" ? (
        <p role="status" className="mt-2 text-muted text-sm">
          Couldn't load the numbers. {health.message}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-muted text-sm">
          Retries run every 5 minutes. Past the cap, new posts wait and are
          checked again.
        </p>
        <WithTooltip label="Load the numbers and the queue again">
          <Button variant="ghost" size="row" onClick={onRefresh}>
            <RotateCw size={12} aria-hidden="true" />
            Refresh
          </Button>
        </WithTooltip>
      </div>
    </section>
  );
}

/** A retry older than two cron runs means the cron isn't keeping up. */
function isOld(iso: string | null, now: Date): boolean {
  return iso !== null && now.getTime() - new Date(iso).getTime() > 15 * 60_000;
}

function queueNote(h: AdminHealth, now: Date): string {
  if (h.queue.open === 0) return "All clear";
  const oldest = h.queue.oldestAt
    ? `oldest ${waitedFor(h.queue.oldestAt, now)}`
    : null;
  const urgent = h.queue.urgent > 0 ? `${count(h.queue.urgent)} urgent` : null;
  const note = [urgent, oldest].filter(Boolean).join(", ");
  return note.charAt(0).toUpperCase() + note.slice(1);
}

function Stat({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-muted text-sm">{label}</div>
      <div className="font-mono font-semibold text-lg tabular-nums">
        {value}
      </div>
      <div className={warn ? "text-sm text-warn" : "text-muted text-sm"}>
        {note}
      </div>
    </div>
  );
}
