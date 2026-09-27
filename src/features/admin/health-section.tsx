import type { ReactNode } from "react";
import { waitedFor } from "~/core/moderation/admin";
import type { AdminHealth } from "~/core/schema/admin";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import { Skeleton } from "~/ui/skeleton";
import type { Loaded } from "./use-load";
import { count, percent } from "./words";

// The queue page's first section (V2 §10): the day's model calls against the
// cap, what's waiting for a retry, and what's waiting for you. Numbers only.
// The page header's Refresh loads these and the queue again.

export function HealthSection({
  health,
  now,
}: {
  health: Loaded<AdminHealth> & { reload: () => void };
  now: Date;
}) {
  const h = health.data;
  return (
    <PageSection title="Health">
      {h ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        </div>
      ) : health.state === "failed" ? null : (
        // The stats' shape: a label, a number and a note, three across.
        <div
          role="status"
          aria-label="Loading the numbers"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5 py-0.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4.5 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}
      {health.state === "failed" ? (
        <InlineError
          message={`Couldn't load the numbers. ${health.message}`}
          onRetry={health.reload}
          retryTooltip="Load the numbers again"
        />
      ) : null}
      <p className="text-muted text-sm">
        Retries run every 5 minutes. Past the cap, new posts wait and are
        checked again.
      </p>
    </PageSection>
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
      <div className="tnum font-semibold text-lg">{value}</div>
      <div className={warn ? "text-sm text-warn" : "text-muted text-sm"}>
        {note}
      </div>
    </div>
  );
}
